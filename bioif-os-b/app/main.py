from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import storage
from .auth import create_session, create_user, get_user_by_username, get_user_for_token, get_invite_code, verify_password

storage.ensure_dirs()

app = FastAPI(title="BioIFOS B API")

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


class PathPayload(BaseModel):
    path: str


class RenamePayload(BaseModel):
    path: str
    name: str


class MovePayload(BaseModel):
    src: str
    dst: str


class WritePayload(BaseModel):
    path: str
    content: str


class RunPayload(BaseModel):
    path: str
    args: Optional[List[str]] = None


async def require_user(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing_token")
    token = authorization.split("Bearer ")[-1].strip()
    user = get_user_for_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="invalid_token")
    return user


@app.get("/api/health")
async def health():
    return {"ok": True}


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


@app.get("/api/scripts/root")
async def scripts_root(current_user: Dict[str, Any] = Depends(require_user)):
    return {"root": str(storage.SCRIPTS_ROOT)}


@app.get("/api/scripts/list")
async def scripts_list(path: Optional[str] = None, current_user: Dict[str, Any] = Depends(require_user)):
    return storage.list_dir(storage.SCRIPTS_ROOT, path)


@app.get("/api/scripts/read")
async def scripts_read(path: str, current_user: Dict[str, Any] = Depends(require_user)):
    return storage.read_text(storage.SCRIPTS_ROOT, path)


@app.post("/api/scripts/write")
async def scripts_write(payload: WritePayload, current_user: Dict[str, Any] = Depends(require_user)):
    return storage.write_text(storage.SCRIPTS_ROOT, payload.path, payload.content)


@app.post("/api/scripts/mkdir")
async def scripts_mkdir(payload: PathPayload, current_user: Dict[str, Any] = Depends(require_user)):
    return storage.mkdir(storage.SCRIPTS_ROOT, payload.path)


@app.post("/api/scripts/delete")
async def scripts_delete(payload: PathPayload, current_user: Dict[str, Any] = Depends(require_user)):
    return storage.delete_path(storage.SCRIPTS_ROOT, payload.path)


@app.post("/api/scripts/rename")
async def scripts_rename(payload: RenamePayload, current_user: Dict[str, Any] = Depends(require_user)):
    return storage.rename_path(storage.SCRIPTS_ROOT, payload.path, payload.name)


@app.post("/api/scripts/move")
async def scripts_move(payload: MovePayload, current_user: Dict[str, Any] = Depends(require_user)):
    return storage.move_path(storage.SCRIPTS_ROOT, payload.src, payload.dst)


@app.post("/api/scripts/upload")
async def scripts_upload(
    path: str = Form(...),
    file: UploadFile = File(...),
    filename: Optional[str] = Form(None),
    current_user: Dict[str, Any] = Depends(require_user),
):
    target_name = filename or file.filename
    if not target_name:
        raise HTTPException(status_code=400, detail="missing_filename")
    content = await file.read()
    return storage.write_text(storage.SCRIPTS_ROOT, os.path.join(path, target_name), content.decode("utf-8", errors="ignore"))


@app.get("/api/logs/root")
async def logs_root(current_user: Dict[str, Any] = Depends(require_user)):
    return {"root": str(storage.LOGS_ROOT)}


@app.get("/api/logs/list")
async def logs_list(path: Optional[str] = None, current_user: Dict[str, Any] = Depends(require_user)):
    return storage.list_dir(storage.LOGS_ROOT, path)


@app.get("/api/logs/read")
async def logs_read(path: str, current_user: Dict[str, Any] = Depends(require_user)):
    return storage.read_text(storage.LOGS_ROOT, path)


@app.post("/api/tasks/run")
async def tasks_run(payload: RunPayload, current_user: Dict[str, Any] = Depends(require_user)):
    try:
        return storage.run_script(payload.path, payload.args)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/tasks/running")
async def tasks_running(current_user: Dict[str, Any] = Depends(require_user)):
    tasks = storage.load_tasks()
    return [task for task in tasks if task.get("status") in {"queued", "running"}]


@app.get("/api/tasks/all")
async def tasks_all(current_user: Dict[str, Any] = Depends(require_user)):
    return storage.load_tasks()


@app.get("/api/tasks/{task_id}")
async def task_detail(task_id: str, current_user: Dict[str, Any] = Depends(require_user)):
    task = storage.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="not_found")
    return task
