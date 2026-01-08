from __future__ import annotations

import base64
import hashlib
import os
import secrets
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional

from .storage import CONFIG_DIR, read_json, write_json

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


def load_users() -> Dict[str, Any]:
    return read_json(USERS_PATH, {"users": []})


def save_users(payload: Dict[str, Any]) -> None:
    write_json(USERS_PATH, payload)


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


def update_username(user_id: str, username: str) -> Dict[str, Any]:
    data = load_users()
    if any(user.get("username") == username for user in data.get("users", []) if user.get("id") != user_id):
        raise ValueError("username_exists")
    for user in data.get("users", []):
        if user.get("id") == user_id:
            user["username"] = username
            save_users(data)
            return user
    raise ValueError("user_not_found")


def update_password(user_id: str, password: str) -> Dict[str, Any]:
    data = load_users()
    for user in data.get("users", []):
        if user.get("id") == user_id:
            user["password"] = hash_password(password)
            save_users(data)
            return user
    raise ValueError("user_not_found")


def update_bfs_credentials(
    user_id: str,
    bfs_auth_type: str,
    bfs_user: str,
    bfs_pass: str,
    bfs_key: str,
    bfs_key_pass: str,
) -> Dict[str, Any]:
    data = load_users()
    for user in data.get("users", []):
        if user.get("id") == user_id:
            user["bfsAuthType"] = bfs_auth_type
            user["bfsUser"] = bfs_user
            user["bfsPass"] = bfs_pass
            user["bfsKey"] = bfs_key
            user["bfsKeyPass"] = bfs_key_pass
            save_users(data)
            return user
    raise ValueError("user_not_found")


def clear_bfs_credentials(user_id: str) -> None:
    data = load_users()
    for user in data.get("users", []):
        if user.get("id") == user_id:
            user["bfsAuthType"] = "password"
            user["bfsUser"] = ""
            user["bfsPass"] = ""
            user["bfsKey"] = ""
            user["bfsKeyPass"] = ""
            save_users(data)
            return


def load_sessions() -> Dict[str, Any]:
    return read_json(SESSIONS_PATH, {"sessions": []})


def save_sessions(payload: Dict[str, Any]) -> None:
    write_json(SESSIONS_PATH, payload)


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
    active_sessions = [s for s in sessions if s.get("expiresAt", 0) > now]
    if len(active_sessions) != len(sessions):
        save_sessions({"sessions": active_sessions})
    for session in active_sessions:
        if session.get("token") == token:
            user_id = session.get("userId")
            users = load_users().get("users", [])
            for user in users:
                if user.get("id") == user_id:
                    return user
    return None


def ensure_invite_code() -> None:
    if INVITE_PATH.exists():
        return
    write_json(INVITE_PATH, {"code": "CHANGE_ME"})


def get_invite_code() -> str:
    ensure_invite_code()
    payload = read_json(INVITE_PATH, {"code": "CHANGE_ME"})
    return payload.get("code", "CHANGE_ME")


def set_invite_code(code: str) -> None:
    write_json(INVITE_PATH, {"code": code})


def get_admin_secret() -> Optional[str]:
    env_secret = os.getenv("BIOIFOS_ADMIN_SECRET")
    if env_secret:
        return env_secret
    admin_path = CONFIG_DIR / "admin.json"
    if admin_path.exists():
        payload = read_json(admin_path, {})
        return payload.get("secret")
    return None


@dataclass
class AuthResult:
    user: Dict[str, Any]
    token: str
