from __future__ import annotations

import base64
import hashlib
import os
import secrets
import time
from pathlib import Path
from typing import Any, Dict, Optional

CONFIG_DIR = Path(os.getenv("BIOIFOS_B_CONFIG_DIR", "./data/config")).resolve()
USERS_PATH = CONFIG_DIR / "users.json"
SESSIONS_PATH = CONFIG_DIR / "sessions.json"
INVITE_PATH = CONFIG_DIR / "invite.json"


def _pbkdf2(password: str, salt: bytes, iterations: int = 120_000) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)


def hash_password(password: str) -> Dict[str, str]:
    salt = secrets.token_bytes(16)
    digest = _pbkdf2(password, salt)
    return {
        "salt": base64.b64encode(salt).decode("ascii"),
        "hash": base64.b64encode(digest).decode("ascii"),
        "iterations": "120000",
    }


def verify_password(password: str, stored: Dict[str, str]) -> bool:
    if not isinstance(stored, dict):
        return False
    try:
        salt = base64.b64decode(stored.get("salt", ""))
        digest = base64.b64decode(stored.get("hash", ""))
        iterations = int(stored.get("iterations", "120000"))
    except Exception:
        return False
    return secrets.compare_digest(_pbkdf2(password, salt, iterations), digest)


def _read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json_load(handle)
    except Exception:
        return default


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as handle:
        json_dump(payload, handle)
    os.replace(tmp, path)


def json_load(handle):
    import json

    return json.load(handle)


def json_dump(payload, handle):
    import json

    json.dump(payload, handle, ensure_ascii=True, indent=2)


def ensure_config() -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)


def load_users() -> Dict[str, Any]:
    ensure_config()
    return _read_json(USERS_PATH, {"users": []})


def save_users(payload: Dict[str, Any]) -> None:
    _write_json(USERS_PATH, payload)


def get_user_by_username(username: str) -> Optional[Dict[str, Any]]:
    data = load_users()
    for user in data.get("users", []):
        if user.get("username") == username:
            return user
    return None


def create_user(username: str, password: str) -> Dict[str, Any]:
    data = load_users()
    if any(user.get("username") == username for user in data.get("users", [])):
        raise ValueError("username_exists")
    user_id = secrets.token_hex(12)
    record = {
        "id": user_id,
        "username": username,
        "password": hash_password(password),
        "createdAt": int(time.time() * 1000),
    }
    data["users"].append(record)
    save_users(data)
    return record


def load_sessions() -> Dict[str, Any]:
    ensure_config()
    return _read_json(SESSIONS_PATH, {"sessions": []})


def save_sessions(payload: Dict[str, Any]) -> None:
    _write_json(SESSIONS_PATH, payload)


def create_session(user_id: str, hours: int = 24) -> str:
    token = secrets.token_urlsafe(32)
    payload = load_sessions()
    payload["sessions"].append(
        {
            "token": token,
            "userId": user_id,
            "expiresAt": int(time.time() * 1000) + hours * 3600 * 1000,
        }
    )
    save_sessions(payload)
    return token


def get_user_for_token(token: str) -> Optional[Dict[str, Any]]:
    sessions = load_sessions().get("sessions", [])
    now = int(time.time() * 1000)
    active = [s for s in sessions if s.get("expiresAt", 0) > now]
    if len(active) != len(sessions):
        save_sessions({"sessions": active})
    for session in active:
        if session.get("token") == token:
            user_id = session.get("userId")
            for user in load_users().get("users", []):
                if user.get("id") == user_id:
                    return user
    return None


def ensure_invite_code() -> None:
    if INVITE_PATH.exists():
        return
    _write_json(INVITE_PATH, {"code": os.getenv("BIOIFOS_B_INVITE_CODE", "CHANGE_ME")})


def get_invite_code() -> str:
    ensure_invite_code()
    payload = _read_json(INVITE_PATH, {"code": "CHANGE_ME"})
    return payload.get("code", "CHANGE_ME")
