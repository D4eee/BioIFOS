# BioIFOS B Server

FastAPI service for executing scripts, tracking tasks, and exposing logs.

## Environment
- `BIOIFOS_B_SCRIPTS_ROOT` (default: `./data/scripts`)
- `BIOIFOS_B_LOGS_ROOT` (default: `./data/logs`)
- `BIOIFOS_B_TASKS_ROOT` (default: `./data/tasks`)
- `BIOIFOS_B_CONFIG_DIR` (default: `./data/config`)
- `BIOIFOS_B_INVITE_CODE` (default: `CHANGE_ME`)
- `BIOIFOS_B_BIND` (default: `0.0.0.0`)
- `BIOIFOS_B_PORT` (default: `9001`)

## Run
```
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 9001 --reload
```

## Auth
- Register: `POST /api/auth/register` with `{ "username", "password", "inviteCode" }`
- Login: `POST /api/auth/login`
- Include `Authorization: Bearer <token>` for all other endpoints.
