from __future__ import annotations

import datetime
import os
import posixpath
import stat
from contextlib import contextmanager
from typing import Any, Dict, Iterable, List, Optional, Tuple
import io

import paramiko


def _config(auth: Optional[Dict[str, str]] = None) -> Tuple[str, int, str, str, str, str, str]:
    host = os.getenv("BIOIFOS_B_HOST", "")
    user = os.getenv("BIOIFOS_B_USER", "")
    password = os.getenv("BIOIFOS_B_PASS", "")
    port = int(os.getenv("BIOIFOS_B_PORT", "22"))
    root = os.getenv("BIOIFOS_B_ROOT", "/")
    if not root.startswith("/"):
        root = f"/{root}"
    key = ""
    key_pass = ""
    if auth:
        user = auth.get("user") or user
        password = auth.get("pass") or password
        key = auth.get("key", "")
        key_pass = auth.get("keyPass", "")
    if not host or not user:
        raise RuntimeError("bfs_not_configured")
    if not key and not password:
        raise RuntimeError("bfs_not_configured")
    return host, port, user, password, root, key, key_pass


def get_root() -> str:
    return _config()[4]


def get_scripts_root() -> str:
    root = os.getenv("BIOIFOS_B_SCRIPTS_ROOT", "")
    if not root:
        raise RuntimeError("bfs_scripts_root_not_set")
    if not root.startswith("/"):
        root = f"/{root}"
    return root


def get_logs_root() -> str:
    root = os.getenv("BIOIFOS_B_LOGS_ROOT", "")
    if not root:
        raise RuntimeError("bfs_logs_root_not_set")
    if not root.startswith("/"):
        root = f"/{root}"
    return root


@contextmanager
def _sftp_client(auth: Optional[Dict[str, str]] = None) -> Iterable[paramiko.SFTPClient]:
    host, port, user, password, _root, key, key_pass = _config(auth)
    transport = paramiko.Transport((host, port))
    if key:
        pkey = paramiko.RSAKey.from_private_key(io.StringIO(key), password=key_pass or None)
        transport.connect(username=user, pkey=pkey)
    else:
        transport.connect(username=user, password=password)
    sftp = paramiko.SFTPClient.from_transport(transport)
    try:
        yield sftp
    finally:
        sftp.close()
        transport.close()


def _normalize(path: Optional[str]) -> str:
    _root = get_root()
    if not path:
        return _root
    if path.startswith(_root):
        rel = path[len(_root) :]
    elif path.startswith("/"):
        rel = path
    else:
        rel = f"/{path}"
    target = posixpath.normpath(posixpath.join(_root, rel.lstrip("/")))
    if not _within_root(target, _root):
        return _root
    return target


def _within_root(path: str, root: str) -> bool:
    root_norm = root.rstrip("/") or "/"
    path_norm = path.rstrip("/") or "/"
    try:
        common = posixpath.commonpath([root_norm, path_norm])
    except ValueError:
        return False
    return common == root_norm


def _normalize_under(root: str, path: Optional[str]) -> str:
    if not root.startswith("/"):
        root = f"/{root}"
    if not path:
        return root
    if path.startswith(root):
        rel = path[len(root) :]
    elif path.startswith("/"):
        rel = path
    else:
        rel = f"/{path}"
    target = posixpath.normpath(posixpath.join(root, rel.lstrip("/")))
    if not _within_root(target, root):
        return root
    return target


@contextmanager
def _ssh_client(auth: Optional[Dict[str, str]] = None) -> Iterable[paramiko.SSHClient]:
    host, port, user, password, _root, key, key_pass = _config(auth)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    if key:
        pkey = paramiko.RSAKey.from_private_key(io.StringIO(key), password=key_pass or None)
        client.connect(hostname=host, port=port, username=user, pkey=pkey)
    else:
        client.connect(hostname=host, port=port, username=user, password=password)
    try:
        yield client
    finally:
        client.close()


def _format_entry(path: str, attrs: paramiko.SFTPAttributes) -> Dict[str, Any]:
    is_dir = stat.S_ISDIR(attrs.st_mode)
    modified = datetime.datetime.fromtimestamp(attrs.st_mtime).strftime("%Y-%m-%d %H:%M")
    size = None
    if not is_dir:
        size = f"{attrs.st_size // 1024} KB"
    return {
        "name": posixpath.basename(path),
        "path": path,
        "kind": "dir" if is_dir else "file",
        "size": size,
        "modified": modified,
        "typeLabel": "文件夹" if is_dir else "文件",
    }


def _exists(sftp: paramiko.SFTPClient, path: str) -> bool:
    try:
        sftp.stat(path)
        return True
    except FileNotFoundError:
        return False


def _unique_path(sftp: paramiko.SFTPClient, target: str) -> str:
    if not _exists(sftp, target):
        return target
    directory = posixpath.dirname(target)
    name = posixpath.basename(target)
    stem, ext = posixpath.splitext(name)
    if not stem:
        stem = name
        ext = ""
    counter = 1
    while True:
        candidate = posixpath.join(directory, f"{stem}-{counter}{ext}")
        if not _exists(sftp, candidate):
            return candidate
        counter += 1


def list_dir(path: Optional[str], auth: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    target = _normalize(path)
    with _sftp_client(auth) as sftp:
        entries = []
        for attr in sftp.listdir_attr(target):
            name = attr.filename
            if name in {".", ".."}:
                continue
            entry_path = posixpath.join(target, name)
            entries.append(_format_entry(entry_path, attr))
    entries.sort(key=lambda item: (item["kind"] != "dir", item["name"].lower()))
    return {"path": target, "entries": entries}


def list_dir_under(root: str, path: Optional[str], auth: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    target = _normalize_under(root, path)
    with _sftp_client(auth) as sftp:
        entries = []
        for attr in sftp.listdir_attr(target):
            name = attr.filename
            if name in {".", ".."}:
                continue
            entry_path = posixpath.join(target, name)
            entries.append(_format_entry(entry_path, attr))
    entries.sort(key=lambda item: (item["kind"] != "dir", item["name"].lower()))
    return {"path": target, "entries": entries}


def make_dir(path: str, auth: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    target = _normalize(path)
    with _sftp_client(auth) as sftp:
        target = _unique_path(sftp, target)
        sftp.mkdir(target)
    return {"ok": True, "path": target}


def make_dir_under(root: str, path: str, auth: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    target = _normalize_under(root, path)
    with _sftp_client(auth) as sftp:
        target = _unique_path(sftp, target)
        sftp.mkdir(target)
    return {"ok": True, "path": target}


def delete_path(path: str, auth: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    target = _normalize(path)
    with _sftp_client(auth) as sftp:
        attrs = sftp.stat(target)
        if stat.S_ISDIR(attrs.st_mode):
            sftp.rmdir(target)
        else:
            sftp.remove(target)
    return {"ok": True, "path": target}


def delete_path_under(root: str, path: str, auth: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    target = _normalize_under(root, path)
    with _sftp_client(auth) as sftp:
        attrs = sftp.stat(target)
        if stat.S_ISDIR(attrs.st_mode):
            sftp.rmdir(target)
        else:
            sftp.remove(target)
    return {"ok": True, "path": target}


def rename_path(path: str, name: str, auth: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    target = _normalize(path)
    base = posixpath.basename(target)
    parent = posixpath.dirname(target)
    next_name = name.strip() or base
    next_path = _normalize(posixpath.join(parent, next_name))
    with _sftp_client(auth) as sftp:
        if next_path != target:
            next_path = _unique_path(sftp, next_path)
            sftp.rename(target, next_path)
    return {"ok": True, "path": next_path}


def rename_path_under(root: str, path: str, name: str, auth: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    target = _normalize_under(root, path)
    base = posixpath.basename(target)
    parent = posixpath.dirname(target)
    next_name = name.strip() or base
    next_path = _normalize_under(root, posixpath.join(parent, next_name))
    with _sftp_client(auth) as sftp:
        if next_path != target:
            next_path = _unique_path(sftp, next_path)
            sftp.rename(target, next_path)
    return {"ok": True, "path": next_path}


def move_path(src: str, dst: str, auth: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    source = _normalize(src)
    target = _normalize(dst)
    with _sftp_client(auth) as sftp:
        if source != target:
            try:
                attrs = sftp.stat(target)
                if stat.S_ISDIR(attrs.st_mode):
                    target = posixpath.join(target, posixpath.basename(source))
            except FileNotFoundError:
                pass
            target = _unique_path(sftp, target)
            sftp.rename(source, target)
    return {"ok": True, "path": target}


def move_path_under(root: str, src: str, dst: str, auth: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    source = _normalize_under(root, src)
    target = _normalize_under(root, dst)
    with _sftp_client(auth) as sftp:
        if source != target:
            try:
                attrs = sftp.stat(target)
                if stat.S_ISDIR(attrs.st_mode):
                    target = posixpath.join(target, posixpath.basename(source))
            except FileNotFoundError:
                pass
            target = _unique_path(sftp, target)
            sftp.rename(source, target)
    return {"ok": True, "path": target}


def upload_file(path: str, filename: str, data: Any, auth: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    target = _normalize(path)
    with _sftp_client(auth) as sftp:
        try:
            attrs = sftp.stat(target)
            if stat.S_ISDIR(attrs.st_mode):
                target = posixpath.join(target, filename)
        except FileNotFoundError:
            target = posixpath.join(target, filename)
        target = _unique_path(sftp, target)
        sftp.putfo(data, target)
    return {"ok": True, "path": target}


def upload_file_under(
    root: str, path: str, filename: str, data: Any, auth: Optional[Dict[str, str]] = None
) -> Dict[str, Any]:
    target = _normalize_under(root, path)
    with _sftp_client(auth) as sftp:
        try:
            attrs = sftp.stat(target)
            if stat.S_ISDIR(attrs.st_mode):
                target = posixpath.join(target, filename)
        except FileNotFoundError:
            target = posixpath.join(target, filename)
        target = _unique_path(sftp, target)
        sftp.putfo(data, target)
    return {"ok": True, "path": target}


def read_text_under(root: str, path: str, auth: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    target = _normalize_under(root, path)
    with _sftp_client(auth) as sftp:
        with sftp.open(target, "r") as handle:
            content = handle.read().decode("utf-8", errors="ignore")
    return {"path": target, "content": content}


def read_text(path: str, auth: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    target = _normalize(path)
    with _sftp_client(auth) as sftp:
        with sftp.open(target, "r") as handle:
            content = handle.read().decode("utf-8", errors="ignore")
    return {"path": target, "content": content}


def write_text_under(root: str, path: str, content: str, auth: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    target = _normalize_under(root, path)
    with _sftp_client(auth) as sftp:
        with sftp.open(target, "w") as handle:
            handle.write(content)
    return {"ok": True, "path": target}


def exec_command(command: str, timeout: int = 15, auth: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    with _ssh_client(auth) as client:
        stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
        out = stdout.read().decode("utf-8", errors="ignore")
        err = stderr.read().decode("utf-8", errors="ignore")
    return {"stdout": out, "stderr": err}


def open_shell(
    term: str = "xterm",
    width: int = 120,
    height: int = 30,
    auth: Optional[Dict[str, str]] = None,
) -> Tuple[paramiko.SSHClient, paramiko.Channel]:
    host, port, user, password, _root, key, key_pass = _config(auth)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    if key:
        pkey = paramiko.RSAKey.from_private_key(io.StringIO(key), password=key_pass or None)
        client.connect(hostname=host, port=port, username=user, pkey=pkey)
    else:
        client.connect(hostname=host, port=port, username=user, password=password)
    channel = client.invoke_shell(term=term, width=width, height=height)
    return client, channel


@contextmanager
def open_file(path: str, auth: Optional[Dict[str, str]] = None) -> Iterable[paramiko.SFTPFile]:
    target = _normalize(path)
    with _sftp_client(auth) as sftp:
        handle = sftp.open(target, "rb")
        try:
            yield handle
        finally:
            handle.close()
