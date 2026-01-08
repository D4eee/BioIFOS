from __future__ import annotations

import json
import os
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

SCRIPTS_ROOT = Path(os.getenv("BIOIFOS_B_SCRIPTS_ROOT", "./data/scripts")).resolve()
LOGS_ROOT = Path(os.getenv("BIOIFOS_B_LOGS_ROOT", "./data/logs")).resolve()
TASKS_ROOT = Path(os.getenv("BIOIFOS_B_TASKS_ROOT", "./data/tasks")).resolve()


def ensure_dirs() -> None:
    SCRIPTS_ROOT.mkdir(parents=True, exist_ok=True)
    LOGS_ROOT.mkdir(parents=True, exist_ok=True)
    TASKS_ROOT.mkdir(parents=True, exist_ok=True)


def _safe_join(root: Path, path: Optional[str]) -> Path:
    target = Path(path or ".")
    if not target.is_absolute():
        target = root / target
    target = target.resolve()
    if not str(target).startswith(str(root)):
        return root
    return target


def list_dir(root: Path, path: Optional[str]) -> Dict[str, Any]:
    target = _safe_join(root, path)
    entries = []
    for entry in sorted(target.iterdir(), key=lambda item: (not item.is_dir(), item.name.lower())):
        try:
            stat = entry.stat()
        except OSError:
            continue
        modified = time.strftime("%Y-%m-%d %H:%M", time.localtime(stat.st_mtime))
        size = None
        if entry.is_file():
            size = f"{stat.st_size // 1024} KB"
        entries.append(
            {
                "name": entry.name,
                "path": str(entry),
                "kind": "dir" if entry.is_dir() else "file",
                "size": size,
                "modified": modified,
                "typeLabel": "文件夹" if entry.is_dir() else "文件",
            }
        )
    return {"path": str(target), "entries": entries}


def read_text(root: Path, path: str) -> Dict[str, Any]:
    target = _safe_join(root, path)
    with target.open("r", encoding="utf-8", errors="ignore") as handle:
        content = handle.read()
    return {"path": str(target), "content": content}


def write_text(root: Path, path: str, content: str) -> Dict[str, Any]:
    target = _safe_join(root, path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(content)
    return {"ok": True, "path": str(target)}


def mkdir(root: Path, path: str) -> Dict[str, Any]:
    target = _safe_join(root, path)
    target.mkdir(parents=True, exist_ok=True)
    return {"ok": True, "path": str(target)}


def delete_path(root: Path, path: str) -> Dict[str, Any]:
    target = _safe_join(root, path)
    if target.is_dir():
        target.rmdir()
    elif target.exists():
        target.unlink()
    return {"ok": True, "path": str(target)}


def rename_path(root: Path, path: str, name: str) -> Dict[str, Any]:
    target = _safe_join(root, path)
    next_name = name.strip() or target.name
    dest = target.with_name(next_name)
    dest = _safe_join(root, str(dest))
    target.rename(dest)
    return {"ok": True, "path": str(dest)}


def move_path(root: Path, src: str, dst: str) -> Dict[str, Any]:
    source = _safe_join(root, src)
    target = _safe_join(root, dst)
    target.parent.mkdir(parents=True, exist_ok=True)
    source.rename(target)
    return {"ok": True, "path": str(target)}


def save_task(payload: Dict[str, Any]) -> None:
    task_id = payload["id"]
    path = TASKS_ROOT / f"{task_id}.json"
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=True, indent=2)


def load_tasks() -> List[Dict[str, Any]]:
    tasks = []
    for path in TASKS_ROOT.glob("*.json"):
        try:
            with path.open("r", encoding="utf-8") as handle:
                tasks.append(json.load(handle))
        except Exception:
            continue
    return tasks


def get_task(task_id: str) -> Optional[Dict[str, Any]]:
    path = TASKS_ROOT / f"{task_id}.json"
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return None


def _run_process(task_id: str, script_path: str, log_path: Path, args: List[str]) -> None:
    import subprocess

    started_at = int(time.time() * 1000)
    task = get_task(task_id) or {}
    task.update({"status": "running", "startedAt": started_at})
    save_task(task)

    with log_path.open("ab") as log_handle:
        process = subprocess.Popen(
            ["/bin/bash", script_path, *args],
            stdout=log_handle,
            stderr=subprocess.STDOUT,
        )
        task.update({"pid": process.pid})
        save_task(task)
        exit_code = process.wait()

    finished_at = int(time.time() * 1000)
    task.update(
        {
            "status": "done" if exit_code == 0 else "failed",
            "exitCode": exit_code,
            "finishedAt": finished_at,
        }
    )
    save_task(task)


def run_script(path: str, args: Optional[List[str]] = None) -> Dict[str, Any]:
    script_path = _safe_join(SCRIPTS_ROOT, path)
    if not script_path.exists():
        raise FileNotFoundError("script_not_found")
    task_id = uuid.uuid4().hex
    log_path = LOGS_ROOT / f"{task_id}.log"
    payload = {
        "id": task_id,
        "script": str(script_path),
        "status": "queued",
        "pid": None,
        "createdAt": int(time.time() * 1000),
        "startedAt": None,
        "finishedAt": None,
        "exitCode": None,
        "logPath": str(log_path),
    }
    save_task(payload)
    thread = threading.Thread(target=_run_process, args=(task_id, str(script_path), log_path, args or []), daemon=True)
    thread.start()
    return payload
