from __future__ import annotations

import asyncio
import os
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from . import bfs
from . import storage
from .auth import get_user_for_token
from .auth import (
    create_session,
    create_user,
    get_admin_secret,
    get_invite_code,
    get_user_by_username,
    get_user_for_token,
    set_invite_code,
    update_password,
    update_username,
    update_bfs_credentials,
    clear_bfs_credentials,
    verify_password,
)


def _auth_from_user(user: Dict[str, Any]) -> Dict[str, str]:
    return {
        "type": user.get("bfsAuthType", "password"),
        "user": user.get("bfsUser", ""),
        "pass": user.get("bfsPass", ""),
        "key": user.get("bfsKey", ""),
        "keyPass": user.get("bfsKeyPass", ""),
    }

storage.ensure_dirs()

app = FastAPI(title="BioIFOS API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AuthRegister(BaseModel):
    username: str
    password: str
    inviteCode: str


class AuthLogin(BaseModel):
    username: str
    password: str


class AuthUpdate(BaseModel):
    username: Optional[str] = None
    currentPassword: str
    newPassword: Optional[str] = None


class BfsCredentialsPayload(BaseModel):
    bfsAuthType: str
    bfsUser: Optional[str] = None
    bfsPass: Optional[str] = None
    bfsKey: Optional[str] = None
    bfsKeyPass: Optional[str] = None


class WorkflowPayload(BaseModel):
    name: str
    order: List[str]
    nodes: List[Dict[str, Any]]
    connections: List[Dict[str, Any]]


class FavoritesPayload(BaseModel):
    ids: List[str]


class InvitePayload(BaseModel):
    inviteCode: str


class CommandScriptPayload(BaseModel):
    name: str
    content: str


class CommandScriptUpdatePayload(BaseModel):
    name: str
    content: str


class BfsPathPayload(BaseModel):
    path: str


class BfsRenamePayload(BaseModel):
    path: str
    name: str


class BfsMovePayload(BaseModel):
    src: str
    dst: str


class BfsWritePayload(BaseModel):
    path: str
    content: str


async def require_user(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing_token")
    token = authorization.split("Bearer ")[-1].strip()
    user = get_user_for_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="invalid_token")
    return user


@app.post("/api/auth/register")
async def register(payload: AuthRegister):
    if payload.inviteCode != get_invite_code():
        raise HTTPException(status_code=403, detail="invalid_invite")
    try:
        user = create_user(payload.username, payload.password)
    except ValueError as exc:
        if str(exc) == "username_exists":
            raise HTTPException(status_code=409, detail="username_exists") from exc
        raise
    token = create_session(user["id"])
    return {"token": token, "user": {"id": user["id"], "username": user["username"]}}


@app.post("/api/auth/login")
async def login(payload: AuthLogin):
    user = get_user_by_username(payload.username)
    if not user or not verify_password(payload.password, user.get("password", {})):
        raise HTTPException(status_code=401, detail="invalid_credentials")
    token = create_session(user["id"])
    return {"token": token, "user": {"id": user["id"], "username": user["username"]}}


@app.get("/api/auth/me")
async def me(current_user: Dict[str, Any] = Depends(require_user)):
    return {"id": current_user["id"], "username": current_user["username"]}


@app.post("/api/auth/update")
async def update_auth(payload: AuthUpdate, current_user: Dict[str, Any] = Depends(require_user)):
    if not verify_password(payload.currentPassword, current_user.get("password", {})):
        raise HTTPException(status_code=401, detail="invalid_credentials")
    user = current_user
    if payload.username and payload.username != current_user.get("username"):
        try:
            user = update_username(current_user["id"], payload.username)
        except ValueError as exc:
            if str(exc) == "username_exists":
                raise HTTPException(status_code=409, detail="username_exists") from exc
            raise HTTPException(status_code=400, detail="user_not_found") from exc
    if payload.newPassword:
        try:
            user = update_password(current_user["id"], payload.newPassword)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="user_not_found") from exc
    return {"id": user["id"], "username": user["username"]}


@app.get("/api/auth/bfs")
async def get_bfs_credentials(current_user: Dict[str, Any] = Depends(require_user)):
    return {
        "bfsAuthType": current_user.get("bfsAuthType", "password"),
        "bfsUser": current_user.get("bfsUser", ""),
        "bfsPass": current_user.get("bfsPass", ""),
        "bfsKey": current_user.get("bfsKey", ""),
        "bfsKeyPass": current_user.get("bfsKeyPass", ""),
    }


@app.post("/api/auth/bfs")
async def set_bfs_credentials(
    payload: BfsCredentialsPayload, current_user: Dict[str, Any] = Depends(require_user)
):
    if payload.bfsAuthType == "password":
        if not payload.bfsUser or not payload.bfsPass:
            raise HTTPException(status_code=400, detail="missing_bfs_credentials")
    elif payload.bfsAuthType == "key":
        if not payload.bfsUser or not payload.bfsKey:
            raise HTTPException(status_code=400, detail="missing_bfs_credentials")
    else:
        raise HTTPException(status_code=400, detail="invalid_bfs_auth_type")
    try:
        update_bfs_credentials(
            current_user["id"],
            payload.bfsAuthType,
            payload.bfsUser or "",
            payload.bfsPass or "",
            payload.bfsKey or "",
            payload.bfsKeyPass or "",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="user_not_found") from exc
    return {"ok": True}


@app.put("/api/admin/invite")
async def update_invite(payload: InvitePayload, request: Request):
    secret = get_admin_secret()
    if not secret:
        raise HTTPException(status_code=403, detail="admin_secret_not_set")
    header_secret = request.headers.get("X-Admin-Secret")
    if header_secret != secret:
        raise HTTPException(status_code=403, detail="invalid_admin_secret")
    set_invite_code(payload.inviteCode)
    return {"code": payload.inviteCode}


@app.get("/api/workflows")
async def list_workflows(current_user: Dict[str, Any] = Depends(require_user)):
    return storage.list_workflows(current_user["id"])


@app.post("/api/workflows")
async def create_workflow(payload: WorkflowPayload, current_user: Dict[str, Any] = Depends(require_user)):
    return storage.create_workflow(current_user["id"], payload.model_dump())


@app.get("/api/workflows/{workflow_id}")
async def get_workflow(workflow_id: str, current_user: Dict[str, Any] = Depends(require_user)):
    data = storage.get_workflow(current_user["id"], workflow_id)
    if not data:
        raise HTTPException(status_code=404, detail="not_found")
    return data


@app.put("/api/workflows/{workflow_id}")
async def update_workflow(
    workflow_id: str, payload: WorkflowPayload, current_user: Dict[str, Any] = Depends(require_user)
):
    return storage.update_workflow(current_user["id"], workflow_id, payload.model_dump())


@app.delete("/api/workflows/{workflow_id}")
async def delete_workflow(workflow_id: str, current_user: Dict[str, Any] = Depends(require_user)):
    storage.delete_workflow(current_user["id"], workflow_id)
    return {"ok": True}


@app.get("/api/tools/{tool_id}/meta")
async def get_tool_meta(tool_id: str, current_user: Dict[str, Any] = Depends(require_user)):
    return storage.get_tool_meta(current_user["id"], tool_id)


@app.put("/api/tools/{tool_id}/meta")
async def update_tool_meta(
    tool_id: str, payload: Dict[str, Any], current_user: Dict[str, Any] = Depends(require_user)
):
    return storage.update_tool_meta(current_user["id"], tool_id, payload)


@app.get("/api/tool-favorites")
async def get_favorites(current_user: Dict[str, Any] = Depends(require_user)):
    return storage.get_favorites(current_user["id"])


@app.put("/api/tool-favorites")
async def update_favorites(payload: FavoritesPayload, current_user: Dict[str, Any] = Depends(require_user)):
    return storage.update_favorites(current_user["id"], payload.ids)


@app.get("/api/tools")
async def list_tools(current_user: Dict[str, Any] = Depends(require_user)):
    return storage.list_tools(current_user["id"])


@app.get("/api/storage/nodes")
async def list_node_storage(path: Optional[str] = None, current_user: Dict[str, Any] = Depends(require_user)):
    return storage.list_node_storage(path)


@app.get("/api/nodes/{node_name}")
async def get_node_by_name(node_name: str, current_user: Dict[str, Any] = Depends(require_user)):
    data = storage.get_node_by_name(node_name)
    if not data:
        raise HTTPException(status_code=404, detail="not_found")
    return data


@app.get("/api/storage/nodes/file")
async def read_node_file(
    path: Optional[str] = None,
    name: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(require_user),
):
    if not name:
        raise HTTPException(status_code=400, detail="missing_name")
    data = storage.read_node_file(path, name)
    if not data:
        raise HTTPException(status_code=404, detail="not_found")
    return data


@app.get("/api/storage/root")
async def get_storage_root(current_user: Dict[str, Any] = Depends(require_user)):
    return {"root": storage.get_storage_root()}


@app.get("/api/fs/root")
async def get_fs_root(current_user: Dict[str, Any] = Depends(require_user)):
    return {"root": storage.get_fs_root()}


@app.get("/api/fs/list")
async def list_fs(path: Optional[str] = None, current_user: Dict[str, Any] = Depends(require_user)):
    return storage.list_fs(path)


@app.post("/api/commands")
async def create_command_script(
    payload: CommandScriptPayload, current_user: Dict[str, Any] = Depends(require_user)
):
    return storage.create_command_script(payload.name, payload.content)


@app.get("/api/commands")
async def list_command_scripts(current_user: Dict[str, Any] = Depends(require_user)):
    return storage.list_command_scripts()


@app.get("/api/commands/{script_name}")
async def get_command_script(script_name: str, current_user: Dict[str, Any] = Depends(require_user)):
    data = storage.read_command_script(script_name)
    if not data:
        raise HTTPException(status_code=404, detail="not_found")
    return data


@app.put("/api/commands/{script_name}")
async def update_command_script(
    script_name: str,
    payload: CommandScriptUpdatePayload,
    current_user: Dict[str, Any] = Depends(require_user),
):
    data = storage.update_command_script(script_name, payload.name, payload.content)
    if not data:
        raise HTTPException(status_code=404, detail="not_found")
    return data


@app.delete("/api/commands/{script_name}")
async def delete_command_script(script_name: str, current_user: Dict[str, Any] = Depends(require_user)):
    data = storage.delete_command_script(script_name)
    if not data:
        raise HTTPException(status_code=404, detail="not_found")
    return data


@app.get("/api/bfs/root")
async def get_bfs_root(current_user: Dict[str, Any] = Depends(require_user)):
    try:
        return {"root": bfs.get_root()}
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/bfs/list")
async def list_bfs(path: Optional[str] = None, current_user: Dict[str, Any] = Depends(require_user)):
    try:
        data = bfs.list_dir(path, auth=_auth_from_user(current_user))
        clear_bfs_credentials(current_user["id"])
        return data
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/bfs/mkdir")
async def mkdir_bfs(payload: BfsPathPayload, current_user: Dict[str, Any] = Depends(require_user)):
    try:
        data = bfs.make_dir(payload.path, auth=_auth_from_user(current_user))
        clear_bfs_credentials(current_user["id"])
        return data
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/bfs/delete")
async def delete_bfs(payload: BfsPathPayload, current_user: Dict[str, Any] = Depends(require_user)):
    try:
        data = bfs.delete_path(payload.path, auth=_auth_from_user(current_user))
        clear_bfs_credentials(current_user["id"])
        return data
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/bfs/rename")
async def rename_bfs(payload: BfsRenamePayload, current_user: Dict[str, Any] = Depends(require_user)):
    try:
        data = bfs.rename_path(payload.path, payload.name, auth=_auth_from_user(current_user))
        clear_bfs_credentials(current_user["id"])
        return data
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/bfs/move")
async def move_bfs(payload: BfsMovePayload, current_user: Dict[str, Any] = Depends(require_user)):
    try:
        data = bfs.move_path(payload.src, payload.dst, auth=_auth_from_user(current_user))
        clear_bfs_credentials(current_user["id"])
        return data
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/bfs/upload")
async def upload_bfs(
    path: str = Form(...),
    file: UploadFile = File(...),
    filename: Optional[str] = Form(None),
    current_user: Dict[str, Any] = Depends(require_user),
):
    target_name = filename or file.filename
    if not target_name:
        raise HTTPException(status_code=400, detail="missing_filename")
    try:
        data = bfs.upload_file(path, target_name, file.file, auth=_auth_from_user(current_user))
        clear_bfs_credentials(current_user["id"])
        return data
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/bfs/read")
async def read_bfs(path: str, current_user: Dict[str, Any] = Depends(require_user)):
    try:
        data = bfs.read_text(path, auth=_auth_from_user(current_user))
        clear_bfs_credentials(current_user["id"])
        return data
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/bfs/download")
async def download_bfs(path: str, current_user: Dict[str, Any] = Depends(require_user)):
    try:
        filename = path.split("/")[-1] or "download"
        def stream():
            with bfs.open_file(path, auth=_auth_from_user(current_user)) as handle:
                while True:
                    chunk = handle.read(1024 * 1024)
                    if not chunk:
                        break
                    yield chunk
        return StreamingResponse(
            stream(),
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/bfs/scripts/root")
async def get_bfs_scripts_root(current_user: Dict[str, Any] = Depends(require_user)):
    try:
        return {"root": bfs.get_scripts_root()}
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/bfs/scripts/list")
async def list_bfs_scripts(path: Optional[str] = None, current_user: Dict[str, Any] = Depends(require_user)):
    try:
        data = bfs.list_dir_under(bfs.get_scripts_root(), path, auth=_auth_from_user(current_user))
        clear_bfs_credentials(current_user["id"])
        return data
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/bfs/scripts/read")
async def read_bfs_script(path: str, current_user: Dict[str, Any] = Depends(require_user)):
    try:
        data = bfs.read_text_under(bfs.get_scripts_root(), path, auth=_auth_from_user(current_user))
        clear_bfs_credentials(current_user["id"])
        return data
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/bfs/scripts/write")
async def write_bfs_script(payload: BfsWritePayload, current_user: Dict[str, Any] = Depends(require_user)):
    try:
        data = bfs.write_text_under(
            bfs.get_scripts_root(), payload.path, payload.content, auth=_auth_from_user(current_user)
        )
        clear_bfs_credentials(current_user["id"])
        return data
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/bfs/scripts/mkdir")
async def mkdir_bfs_scripts(payload: BfsPathPayload, current_user: Dict[str, Any] = Depends(require_user)):
    try:
        data = bfs.make_dir_under(bfs.get_scripts_root(), payload.path, auth=_auth_from_user(current_user))
        clear_bfs_credentials(current_user["id"])
        return data
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/bfs/scripts/delete")
async def delete_bfs_scripts(payload: BfsPathPayload, current_user: Dict[str, Any] = Depends(require_user)):
    try:
        data = bfs.delete_path_under(bfs.get_scripts_root(), payload.path, auth=_auth_from_user(current_user))
        clear_bfs_credentials(current_user["id"])
        return data
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/bfs/scripts/rename")
async def rename_bfs_scripts(payload: BfsRenamePayload, current_user: Dict[str, Any] = Depends(require_user)):
    try:
        data = bfs.rename_path_under(
            bfs.get_scripts_root(), payload.path, payload.name, auth=_auth_from_user(current_user)
        )
        clear_bfs_credentials(current_user["id"])
        return data
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/bfs/scripts/move")
async def move_bfs_scripts(payload: BfsMovePayload, current_user: Dict[str, Any] = Depends(require_user)):
    try:
        data = bfs.move_path_under(bfs.get_scripts_root(), payload.src, payload.dst, auth=_auth_from_user(current_user))
        clear_bfs_credentials(current_user["id"])
        return data
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/bfs/scripts/upload")
async def upload_bfs_script(
    path: str = Form(...),
    file: UploadFile = File(...),
    filename: Optional[str] = Form(None),
    current_user: Dict[str, Any] = Depends(require_user),
):
    target_name = filename or file.filename
    if not target_name:
        raise HTTPException(status_code=400, detail="missing_filename")
    try:
        data = bfs.upload_file_under(
            bfs.get_scripts_root(), path, target_name, file.file, auth=_auth_from_user(current_user)
        )
        clear_bfs_credentials(current_user["id"])
        return data
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/bfs/logs/root")
async def get_bfs_logs_root(current_user: Dict[str, Any] = Depends(require_user)):
    try:
        return {"root": bfs.get_logs_root()}
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/bfs/logs/list")
async def list_bfs_logs(path: Optional[str] = None, current_user: Dict[str, Any] = Depends(require_user)):
    try:
        data = bfs.list_dir_under(bfs.get_logs_root(), path, auth=_auth_from_user(current_user))
        clear_bfs_credentials(current_user["id"])
        return data
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/bfs/logs/read")
async def read_bfs_log(path: str, current_user: Dict[str, Any] = Depends(require_user)):
    try:
        data = bfs.read_text_under(bfs.get_logs_root(), path, auth=_auth_from_user(current_user))
        clear_bfs_credentials(current_user["id"])
        return data
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/bfs/system")
async def bfs_system(current_user: Dict[str, Any] = Depends(require_user)):
    try:
        auth = _auth_from_user(current_user)
        uptime = bfs.exec_command("uptime", auth=auth)
        mem = bfs.exec_command("free -m", auth=auth)
        disk = bfs.exec_command("df -h", auth=auth)
        clear_bfs_credentials(current_user["id"])
        return {"uptime": uptime, "memory": mem, "disk": disk}
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/bfs/tasks/running")
async def bfs_running_tasks(current_user: Dict[str, Any] = Depends(require_user)):
    try:
        data = bfs.exec_command(
            "ps -eo pid,pcpu,pmem,comm,args --sort=-pcpu | head -n 50", auth=_auth_from_user(current_user)
        )
        clear_bfs_credentials(current_user["id"])
        return data
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.websocket("/api/bfs/terminal")
async def bfs_terminal(websocket: WebSocket):
    auth = websocket.headers.get("authorization", "")
    token = ""
    if auth.startswith("Bearer "):
        token = auth.split("Bearer ")[-1].strip()
    if not token:
        token = websocket.query_params.get("token", "")
    if not token or not get_user_for_token(token):
        await websocket.close(code=1008)
        return
    await websocket.accept()
    user = get_user_for_token(token) or {}
    try:
        client, channel = bfs.open_shell(auth=_auth_from_user(user))
    except RuntimeError:
        await websocket.close(code=1011)
        return

    loop = asyncio.get_running_loop()

    async def reader():
        while True:
            data = await loop.run_in_executor(None, channel.recv, 1024)
            if not data:
                break
            await websocket.send_text(data.decode("utf-8", errors="ignore"))

    read_task = asyncio.create_task(reader())
    try:
        while True:
            data = await websocket.receive_text()
            channel.send(data)
    except WebSocketDisconnect:
        pass
    finally:
        try:
            channel.close()
        except Exception:
            pass
        try:
            client.close()
        except Exception:
            pass
        if user.get("id"):
            clear_bfs_credentials(user["id"])
        read_task.cancel()


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
