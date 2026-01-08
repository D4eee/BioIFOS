from __future__ import annotations

import json
import os
import time
import uuid
import shutil
from pathlib import Path
import datetime
from typing import Any, Dict, List, Optional

DATA_DIR = Path(__file__).resolve().parent / "data"
CONFIG_DIR = DATA_DIR / "config"
SYSTEM_DIR = DATA_DIR / "system"
USERS_DIR = DATA_DIR / "users"
SHARED_DIR = DATA_DIR / "shared"
COMMANDS_DIR = SHARED_DIR / "commands"


def ensure_dirs() -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    SYSTEM_DIR.mkdir(parents=True, exist_ok=True)
    USERS_DIR.mkdir(parents=True, exist_ok=True)
    SHARED_DIR.mkdir(parents=True, exist_ok=True)
    COMMANDS_DIR.mkdir(parents=True, exist_ok=True)


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=True, indent=2)
    os.replace(tmp, path)


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(content)
    os.replace(tmp, path)


def user_root(user_id: str) -> Path:
    root = USERS_DIR / user_id
    root.mkdir(parents=True, exist_ok=True)
    return root


def shared_nodes_dir() -> Path:
    path = SHARED_DIR / "nodes"
    path.mkdir(parents=True, exist_ok=True)
    return path


def shared_flowcharts_dir() -> Path:
    path = SHARED_DIR / "flowcharts"
    path.mkdir(parents=True, exist_ok=True)
    return path


def command_scripts_dir() -> Path:
    path = COMMANDS_DIR
    path.mkdir(parents=True, exist_ok=True)
    return path


def _script_filename(name: str) -> str:
    cleaned = _safe_filename(name)
    if not cleaned.endswith(".sh"):
        cleaned = f"{cleaned}.sh"
    return cleaned


def user_favorites_path(user_id: str) -> Path:
    return user_root(user_id) / "favorites.json"


def system_tools_path() -> Path:
    return SYSTEM_DIR / "tools.json"


def _index_path(dir_path: Path) -> Path:
    return dir_path / "index.json"


def _load_index(dir_path: Path) -> Dict[str, Any]:
    return read_json(_index_path(dir_path), {"items": []})


def _save_index(dir_path: Path, payload: Dict[str, Any]) -> None:
    write_json(_index_path(dir_path), payload)


def _safe_filename(name: str) -> str:
    cleaned = name.replace("/", "_").replace("\\", "_").strip()
    return cleaned or "unnamed"


def _unique_name(existing: List[str], base: str) -> str:
    if base not in existing:
        return base
    index = 1
    while f"{base}-{index}" in existing:
        index += 1
    return f"{base}-{index}"


def _find_index_item(index: Dict[str, Any], item_id: str) -> Optional[Dict[str, Any]]:
    for item in index.get("items", []):
        if item.get("id") == item_id:
            return item
    return None


def _sync_index_from_files(dir_path: Path) -> Dict[str, Any]:
    items = []
    for file in dir_path.glob("*.json"):
        if file.name == "index.json":
            continue
        data = read_json(file, {})
        item_id = data.get("id") or file.stem
        name = data.get("name") or file.stem
        created_at = data.get("createdAt")
        items.append({"id": item_id, "name": name, "filename": file.name, "createdAt": created_at})
    payload = {"items": items}
    _save_index(dir_path, payload)
    return payload


# Flowcharts (node graphs)

def list_workflows(user_id: str) -> List[Dict[str, Any]]:
    dir_path = shared_flowcharts_dir()
    index = _load_index(dir_path)
    if not index.get("items"):
        index = _sync_index_from_files(dir_path)
    workflows: List[Dict[str, Any]] = []
    for item in index.get("items", []):
        file_path = dir_path / item.get("filename", "")
        if not file_path.exists():
            continue
        workflows.append(read_json(file_path, {}))
    return sorted(workflows, key=lambda item: item.get("createdAt", 0), reverse=True)


def get_workflow(user_id: str, workflow_id: str) -> Dict[str, Any] | None:
    dir_path = shared_flowcharts_dir()
    index = _load_index(dir_path)
    item = _find_index_item(index, workflow_id)
    if not item:
        index = _sync_index_from_files(dir_path)
        item = _find_index_item(index, workflow_id)
    if not item:
        return None
    path = dir_path / item.get("filename", "")
    if not path.exists():
        return None
    return read_json(path, {})


def create_workflow(user_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    dir_path = shared_flowcharts_dir()
    index = _load_index(dir_path)
    existing_names = [item.get("name") for item in index.get("items", []) if item.get("name")]
    base_name = _safe_filename(payload.get("name") or "Untitled")
    name = _unique_name(existing_names, base_name)
    filename = f"{name}.json"

    workflow_id = str(uuid.uuid4())
    created_at = int(time.time() * 1000)
    record = {
        "id": workflow_id,
        "name": name,
        "createdAt": created_at,
        "order": payload.get("order", []),
        "nodes": payload.get("nodes", []),
        "connections": payload.get("connections", []),
    }
    write_json(dir_path / filename, record)
    index["items"].append(
        {"id": workflow_id, "name": name, "filename": filename, "createdAt": created_at}
    )
    _save_index(dir_path, index)
    return record


def update_workflow(user_id: str, workflow_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    dir_path = shared_flowcharts_dir()
    index = _load_index(dir_path)
    item = _find_index_item(index, workflow_id)
    if not item:
        index = _sync_index_from_files(dir_path)
        item = _find_index_item(index, workflow_id)

    current = None
    if item:
        current = read_json(dir_path / item.get("filename", ""), {})

    existing_names = [i.get("name") for i in index.get("items", []) if i.get("name") and i.get("id") != workflow_id]
    base_name = _safe_filename(payload.get("name") or current.get("name") if current else "Untitled")
    name = _unique_name(existing_names, base_name)
    filename = f"{name}.json"
    created_at = current.get("createdAt") if current else int(time.time() * 1000)

    record = {
        "id": workflow_id,
        "name": name,
        "createdAt": created_at,
        "order": payload.get("order", current.get("order", []) if current else []),
        "nodes": payload.get("nodes", current.get("nodes", []) if current else []),
        "connections": payload.get("connections", current.get("connections", []) if current else []),
    }

    if item and item.get("filename") and item.get("filename") != filename:
        old_path = dir_path / item.get("filename")
        if old_path.exists():
            old_path.unlink()
    write_json(dir_path / filename, record)

    if not item:
        index["items"].append(
            {"id": workflow_id, "name": name, "filename": filename, "createdAt": created_at}
        )
    else:
        item.update({"name": name, "filename": filename, "createdAt": created_at})
    _save_index(dir_path, index)
    return record


def delete_workflow(user_id: str, workflow_id: str) -> None:
    dir_path = shared_flowcharts_dir()
    index = _load_index(dir_path)
    item = _find_index_item(index, workflow_id)
    if item:
        path = dir_path / item.get("filename", "")
        if path.exists():
            path.unlink()
    index["items"] = [item for item in index.get("items", []) if item.get("id") != workflow_id]
    _save_index(dir_path, index)


# Nodes (tools)

def get_tool_meta(user_id: str, tool_id: str) -> Dict[str, Any]:
    dir_path = shared_nodes_dir()
    index = _load_index(dir_path)
    item = _find_index_item(index, tool_id)
    if not item:
        index = _sync_index_from_files(dir_path)
        item = _find_index_item(index, tool_id)
    if item:
        path = dir_path / item.get("filename", "")
        if path.exists():
            return read_json(path, {})
    record = {
        "id": tool_id,
        "name": tool_id,
        "paramCount": 0,
        "curlTemplate": "",
        "description": "",
        "paramDescription": "",
        "params": [],
        "path": "",
    }
    filename = f"{_safe_filename(tool_id)}.json"
    write_json(dir_path / filename, record)
    index["items"].append({"id": tool_id, "name": tool_id, "filename": filename})
    _save_index(dir_path, index)
    return record


def update_tool_meta(user_id: str, tool_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    dir_path = shared_nodes_dir()
    index = _load_index(dir_path)
    item = _find_index_item(index, tool_id)
    current = {}
    if item:
        path = dir_path / item.get("filename", "")
        if path.exists():
            current = read_json(path, {})
    name_input = payload.get("name") or current.get("name") or tool_id
    existing_names = [i.get("name") for i in index.get("items", []) if i.get("name") and i.get("id") != tool_id]
    name = _unique_name(existing_names, _safe_filename(name_input))
    filename = f"{name}.json"

    record = {**current, **payload, "id": tool_id, "name": name}
    if item and item.get("filename") and item.get("filename") != filename:
        old_path = dir_path / item.get("filename")
        if old_path.exists():
            old_path.unlink()
    write_json(dir_path / filename, record)

    if not item:
        index["items"].append({"id": tool_id, "name": name, "filename": filename})
    else:
        item.update({"name": name, "filename": filename})
    _save_index(dir_path, index)
    return record


def get_favorites(user_id: str) -> Dict[str, Any]:
    path = user_favorites_path(user_id)
    return read_json(path, {"ids": []})


def update_favorites(user_id: str, ids: List[str]) -> Dict[str, Any]:
    payload = {"ids": ids}
    write_json(user_favorites_path(user_id), payload)
    return payload


def ensure_system_tools() -> None:
    if system_tools_path().exists():
        return
    payload = {
        "tools": [
            {"id": "fastqc", "name": "FastQC", "group": "QC", "tags": ["qc"]},
            {"id": "multiqc", "name": "MultiQC", "group": "QC", "tags": ["qc"]},
            {"id": "plink", "name": "PLINK", "group": "Genetics", "tags": ["genetics"]},
            {"id": "bwa", "name": "BWA", "group": "Alignment", "tags": ["alignment"]},
            {"id": "gatk", "name": "GATK", "group": "Variant", "tags": ["variant"]},
        ]
    }
    write_json(system_tools_path(), payload)


def list_tools(user_id: str) -> Dict[str, Any]:
    ensure_system_tools()
    system_tools = read_json(system_tools_path(), {"tools": []}).get("tools", [])
    node_index = _load_index(shared_nodes_dir())
    user_tools = [
        {"id": item.get("id"), "name": item.get("name"), "group": "Custom", "tags": []}
        for item in node_index.get("items", [])
        if item.get("id")
    ]
    combined: Dict[str, Dict[str, Any]] = {}
    for item in system_tools:
        combined[item.get("id")] = item
    for item in user_tools:
        combined[item.get("id")] = item
    return {"tools": [tool for tool in combined.values() if tool.get("id")]}


def create_command_script(base_name: str, content: str) -> Dict[str, Any]:
    dir_path = command_scripts_dir()
    safe_base = _safe_filename(base_name) or "workflow"
    existing = [path.stem for path in dir_path.glob("*.sh")]
    script_base = _unique_name(existing, safe_base)
    filename = f"{script_base}.sh"
    resolved_content = content.replace("__SCRIPT_NAME__", script_base)
    write_text(dir_path / filename, resolved_content)
    return {"name": filename, "path": str((dir_path / filename).resolve())}


def list_command_scripts() -> List[Dict[str, Any]]:
    dir_path = command_scripts_dir()
    def _mtime(path: Path) -> float:
        try:
            return path.stat().st_mtime
        except OSError:
            return 0.0
    entries = []
    for path in sorted(dir_path.glob("*.sh"), key=_mtime, reverse=True):
        try:
            stat = path.stat()
        except OSError:
            continue
        entries.append(
            {"name": path.name, "updatedAt": int(stat.st_mtime * 1000), "size": stat.st_size}
        )
    return entries


def read_command_script(name: str) -> Dict[str, Any] | None:
    dir_path = command_scripts_dir()
    filename = _script_filename(name)
    path = (dir_path / filename).resolve()
    if not str(path).startswith(str(dir_path.resolve())):
        return None
    if not path.exists() or not path.is_file():
        return None
    try:
        stat = path.stat()
    except OSError:
        return None
    with path.open("r", encoding="utf-8") as handle:
        content = handle.read()
    return {
        "name": path.name,
        "content": content,
        "updatedAt": int(stat.st_mtime * 1000),
        "size": stat.st_size,
    }


def update_command_script(original_name: str, new_name: str, content: str) -> Dict[str, Any] | None:
    dir_path = command_scripts_dir()
    current_filename = _script_filename(original_name)
    current_path = (dir_path / current_filename).resolve()
    if not str(current_path).startswith(str(dir_path.resolve())):
        return None
    if not current_path.exists() or not current_path.is_file():
        return None

    trimmed_name = (new_name or "").strip()
    if trimmed_name.lower().endswith(".sh"):
        trimmed_name = trimmed_name[:-3]
    base_name = _safe_filename(trimmed_name) or _safe_filename(current_filename.replace(".sh", "")) or "workflow"
    existing = [path.stem for path in dir_path.glob("*.sh") if path.name != current_filename]
    script_base = _unique_name(existing, base_name)
    target_filename = f"{script_base}.sh"
    target_path = (dir_path / target_filename).resolve()
    if not str(target_path).startswith(str(dir_path.resolve())):
        return None

    resolved_content = content.replace("__SCRIPT_NAME__", script_base)
    write_text(target_path, resolved_content)
    if target_path != current_path and current_path.exists():
        current_path.unlink()

    try:
        stat = target_path.stat()
    except OSError:
        stat = None
    return {
        "name": target_filename,
        "path": str(target_path),
        "updatedAt": int(stat.st_mtime * 1000) if stat else None,
        "size": stat.st_size if stat else None,
    }


def delete_command_script(name: str) -> Dict[str, Any] | None:
    dir_path = command_scripts_dir()
    filename = _script_filename(name)
    path = (dir_path / filename).resolve()
    if not str(path).startswith(str(dir_path.resolve())):
        return None
    if not path.exists() or not path.is_file():
        return None
    try:
        path.unlink()
    except OSError:
        return None
    return {"ok": True}


def list_node_storage(path: str | None) -> Dict[str, Any]:
    root = shared_nodes_dir()
    virtual_root = "/data/shared/nodes"
    if not path or path == virtual_root:
        target = root
        rel = ""
    elif path.startswith(virtual_root + "/"):
        rel = path[len(virtual_root) + 1 :]
        target = (root / rel).resolve()
    else:
        target = root
        rel = ""

    root_resolved = root.resolve()
    if not str(target).startswith(str(root_resolved)):
        target = root_resolved
        rel = ""

    entries = []
    for entry in sorted(target.iterdir(), key=lambda item: (not item.is_dir(), item.name.lower())):
        if entry.name == "index.json":
            continue
        entries.append({"type": "dir" if entry.is_dir() else "file", "name": entry.name})

    current_path = virtual_root if not rel else f"{virtual_root}/{rel}"
    actual_path = str(target)
    return {"path": current_path, "actualPath": actual_path, "entries": entries}


def get_node_by_name(name: str) -> Dict[str, Any] | None:
    dir_path = shared_nodes_dir()
    file_path = dir_path / f"{_safe_filename(name)}.json"
    if not file_path.exists():
        return None
    return read_json(file_path, {})


def read_node_file(path: str | None, name: str) -> Dict[str, Any] | None:
    root = shared_nodes_dir()
    virtual_root = "/data/shared/nodes"
    if not path or path == virtual_root:
        target = root
        rel = ""
    elif path.startswith(virtual_root + "/"):
        rel = path[len(virtual_root) + 1 :]
        target = (root / rel).resolve()
    else:
        target = root
        rel = ""

    root_resolved = root.resolve()
    if not str(target).startswith(str(root_resolved)):
        target = root_resolved

    file_path = (target / name).resolve()
    if not str(file_path).startswith(str(root_resolved)):
        return None
    if not file_path.exists() or not file_path.is_file():
        return None
    return read_json(file_path, {})


def get_storage_root() -> str:
    return str(DATA_DIR.resolve())


def get_fs_root() -> str:
    return os.getenv("BIOIFOS_FS_ROOT", str(SHARED_DIR.resolve()))


def list_fs(path: str | None) -> Dict[str, Any]:
    root = Path(get_fs_root()).resolve()
    target = Path(path or root).resolve()
    if not str(target).startswith(str(root)):
        target = root
    entries = []
    for entry in sorted(target.iterdir(), key=lambda item: (not item.is_dir(), item.name.lower())):
        try:
            stat = entry.stat()
        except OSError:
            continue
        modified = datetime.datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M")
        size = None
        type_label = "文件夹" if entry.is_dir() else "文件"
        if entry.is_file():
            size = f"{stat.st_size // 1024} KB"
        entries.append(
            {
                "name": entry.name,
                "path": str(entry),
                "kind": "dir" if entry.is_dir() else "file",
                "size": size,
                "modified": modified,
                "typeLabel": type_label,
            }
        )
    return {"path": str(target), "entries": entries}


def _normalize_fs_path(path: str | None) -> Path | None:
    if not path:
        return None
    root = Path(get_fs_root()).resolve()
    target = Path(path).resolve()
    if not str(target).startswith(str(root)):
        return None
    return target


def _unique_fs_path(target: Path) -> Path:
    if not target.exists():
        return target
    stem = target.stem or target.name
    suffix = target.suffix if target.is_file() else ""
    parent = target.parent
    counter = 1
    while True:
        candidate = parent / f"{stem}-{counter}{suffix}"
        if not candidate.exists():
            return candidate
        counter += 1


def delete_fs(path: str) -> Dict[str, Any] | None:
    target = _normalize_fs_path(path)
    if not target or not target.exists():
        return None
    try:
        if target.is_dir():
            shutil.rmtree(target)
        else:
            target.unlink()
    except OSError:
        return None
    return {"ok": True, "path": str(target)}


def move_fs(src: str, dst: str) -> Dict[str, Any] | None:
    source = _normalize_fs_path(src)
    target = _normalize_fs_path(dst)
    if not source or not source.exists() or not target:
        return None
    try:
        if target.exists() and target.is_dir():
            target = target / source.name
        target = _unique_fs_path(target)
        shutil.move(str(source), str(target))
    except OSError:
        return None
    return {"ok": True, "path": str(target)}
