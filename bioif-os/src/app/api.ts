const AUTH_TOKEN_KEY = "bioif_os_token_v1";

export type WorkflowFile = {
  id: string;
  name: string;
  createdAt: number;
  order: string[];
  nodes: unknown[];
  connections: unknown[];
};

export type ToolMeta = {
  id: string;
  name: string;
  paramCount: number;
  curlTemplate: string;
  description: string;
  paramDescription: string;
  params: {
    key: string;
    label: string;
    type: "text" | "number" | "boolean" | "path" | "file_in" | "file_out";
    color: string;
    default: string;
    required: boolean;
  }[];
  path: string;
};

export type AuthUser = {
  id: string;
  username: string;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};

export type ToolListItem = {
  id: string;
  name: string;
  group?: string;
  tags?: string[];
};

export type ToolListResponse = {
  tools: ToolListItem[];
};

export type StorageEntry = {
  type: "dir" | "file";
  name: string;
};

export type StorageListing = {
  path: string;
  actualPath: string;
  entries: StorageEntry[];
};

export type FsListing = {
  path: string;
  entries: { name: string; path: string; kind: "file" | "dir"; size?: string; modified: string; typeLabel: string }[];
};

export type CommandOutput = {
  stdout: string;
  stderr: string;
};

export type CommandScriptSummary = {
  name: string;
  updatedAt: number;
  size: number;
};

export type CommandScriptDetail = {
  name: string;
  content: string;
  updatedAt: number;
  size: number;
};
export function getAuthToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(AUTH_TOKEN_KEY) ?? "";
}

export function setAuthToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`/api${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export function authRegister(username: string, password: string, inviteCode: string) {
  return requestJson<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password, inviteCode }),
  });
}

export function authLogin(username: string, password: string) {
  return requestJson<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function authMe() {
  return requestJson<AuthUser>("/auth/me");
}

export function authUpdate(payload: { username?: string; currentPassword: string; newPassword?: string }) {
  return requestJson<AuthUser>("/auth/update", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getBfsCredentials() {
  return requestJson<{
    bfsAuthType: string;
    bfsHost: string;
    bfsPort: string;
    bfsRoot: string;
    bfsUser: string;
    bfsPass: string;
    bfsKey: string;
    bfsKeyPass: string;
  }>("/auth/bfs");
}

export function setBfsCredentials(payload: {
  bfsAuthType: string;
  bfsHost: string;
  bfsPort: string;
  bfsRoot?: string;
  bfsUser?: string;
  bfsPass?: string;
  bfsKey?: string;
  bfsKeyPass?: string;
}) {
  return requestJson<{ ok: true }>("/auth/bfs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listWorkflows() {
  return requestJson<WorkflowFile[]>("/workflows");
}

export function listTools() {
  return requestJson<ToolListResponse>("/tools");
}

export function listNodeStorage(path?: string) {
  const query = path ? `?path=${encodeURIComponent(path)}` : "";
  return requestJson<StorageListing>(`/storage/nodes${query}`);
}

export function getNodeMeta(toolId: string) {
  return requestJson<ToolMeta>(`/nodes/${encodeURIComponent(toolId)}`);
}

export function readNodeFile(path: string, name: string) {
  const query = `?path=${encodeURIComponent(path)}&name=${encodeURIComponent(name)}`;
  return requestJson<ToolMeta>(`/storage/nodes/file${query}`);
}

export function getStorageRoot() {
  return requestJson<{ root: string }>("/storage/root");
}

export function getFsRoot() {
  return requestJson<{ root: string }>("/fs/root");
}

export function listFs(path: string) {
  const query = `?path=${encodeURIComponent(path)}`;
  return requestJson<FsListing>(`/fs/list${query}`);
}

export function deleteFs(path: string) {
  return requestJson<{ ok: true; path: string }>("/fs/delete", {
    method: "POST",
    body: JSON.stringify({ path }),
  });
}

export function moveFs(src: string, dst: string) {
  return requestJson<{ ok: true; path: string }>("/fs/move", {
    method: "POST",
    body: JSON.stringify({ src, dst }),
  });
}

export function getBfsRoot() {
  return requestJson<{ root: string }>("/bfs/root");
}

export function listBfs(path: string) {
  const query = `?path=${encodeURIComponent(path)}`;
  return requestJson<FsListing>(`/bfs/list${query}`);
}

export function readBfs(path: string) {
  const query = `?path=${encodeURIComponent(path)}`;
  return requestJson<{ path: string; content: string }>(`/bfs/read${query}`);
}

export function mkdirBfs(path: string) {
  return requestJson<{ ok: true; path: string }>("/bfs/mkdir", {
    method: "POST",
    body: JSON.stringify({ path }),
  });
}

export function deleteBfs(path: string) {
  return requestJson<{ ok: true; path: string }>("/bfs/delete", {
    method: "POST",
    body: JSON.stringify({ path }),
  });
}

export function renameBfs(path: string, name: string) {
  return requestJson<{ ok: true; path: string }>("/bfs/rename", {
    method: "POST",
    body: JSON.stringify({ path, name }),
  });
}

export function moveBfs(src: string, dst: string) {
  return requestJson<{ ok: true; path: string }>("/bfs/move", {
    method: "POST",
    body: JSON.stringify({ src, dst }),
  });
}

export async function uploadBfs(path: string, file: File, filename?: string) {
  const token = getAuthToken();
  const form = new FormData();
  form.append("path", path);
  if (filename) form.append("filename", filename);
  form.append("file", file);
  const res = await fetch("/api/bfs/upload", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return (await res.json()) as { ok: true; path: string };
}

export function downloadBfs(path: string) {
  const query = `?path=${encodeURIComponent(path)}`;
  return `/api/bfs/download${query}`;
}

export function getBfsScriptsRoot() {
  return requestJson<{ root: string }>("/bfs/scripts/root");
}

export function listBfsScripts(path: string) {
  const query = `?path=${encodeURIComponent(path)}`;
  return requestJson<FsListing>(`/bfs/scripts/list${query}`);
}

export function readBfsScript(path: string) {
  const query = `?path=${encodeURIComponent(path)}`;
  return requestJson<{ path: string; content: string }>(`/bfs/scripts/read${query}`);
}

export function writeBfsScript(path: string, content: string) {
  return requestJson<{ ok: true; path: string }>("/bfs/scripts/write", {
    method: "POST",
    body: JSON.stringify({ path, content }),
  });
}

export function mkdirBfsScripts(path: string) {
  return requestJson<{ ok: true; path: string }>("/bfs/scripts/mkdir", {
    method: "POST",
    body: JSON.stringify({ path }),
  });
}

export function deleteBfsScripts(path: string) {
  return requestJson<{ ok: true; path: string }>("/bfs/scripts/delete", {
    method: "POST",
    body: JSON.stringify({ path }),
  });
}

export function renameBfsScripts(path: string, name: string) {
  return requestJson<{ ok: true; path: string }>("/bfs/scripts/rename", {
    method: "POST",
    body: JSON.stringify({ path, name }),
  });
}

export function moveBfsScripts(src: string, dst: string) {
  return requestJson<{ ok: true; path: string }>("/bfs/scripts/move", {
    method: "POST",
    body: JSON.stringify({ src, dst }),
  });
}

export async function uploadBfsScript(path: string, file: File, filename?: string) {
  const token = getAuthToken();
  const form = new FormData();
  form.append("path", path);
  if (filename) form.append("filename", filename);
  form.append("file", file);
  const res = await fetch("/api/bfs/scripts/upload", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return (await res.json()) as { ok: true; path: string };
}

export function getBfsLogsRoot() {
  return requestJson<{ root: string }>("/bfs/logs/root");
}

export function listBfsLogs(path: string) {
  const query = `?path=${encodeURIComponent(path)}`;
  return requestJson<FsListing>(`/bfs/logs/list${query}`);
}

export function readBfsLog(path: string) {
  const query = `?path=${encodeURIComponent(path)}`;
  return requestJson<{ path: string; content: string }>(`/bfs/logs/read${query}`);
}

export function getBfsSystem() {
  return requestJson<{ uptime: CommandOutput; memory: CommandOutput; disk: CommandOutput }>("/bfs/system");
}

export function getBfsRunningTasks() {
  return requestJson<CommandOutput>("/bfs/tasks/running");
}

export function getWorkflow(id: string) {
  return requestJson<WorkflowFile>(`/workflows/${encodeURIComponent(id)}`);
}

export function createWorkflow(payload: Omit<WorkflowFile, "id" | "createdAt">) {
  return requestJson<WorkflowFile>("/workflows", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateWorkflow(id: string, payload: Omit<WorkflowFile, "id" | "createdAt">) {
  return requestJson<WorkflowFile>(`/workflows/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteWorkflow(id: string) {
  return requestJson<{ ok: true }>(`/workflows/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function getToolMeta(id: string) {
  return requestJson<ToolMeta>(`/tools/${encodeURIComponent(id)}/meta`);
}

export function updateToolMeta(id: string, payload: Partial<ToolMeta>) {
  return requestJson<ToolMeta>(`/tools/${encodeURIComponent(id)}/meta`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function getFavorites() {
  return requestJson<{ ids: string[] }>("/tool-favorites");
}

export function updateFavorites(ids: string[]) {
  return requestJson<{ ids: string[] }>("/tool-favorites", {
    method: "PUT",
    body: JSON.stringify({ ids }),
  });
}

export function createCommandScript(name: string, content: string) {
  return requestJson<{ name: string; path: string }>("/commands", {
    method: "POST",
    body: JSON.stringify({ name, content }),
  });
}

export function listCommandScripts() {
  return requestJson<CommandScriptSummary[]>("/commands");
}

export function getCommandScript(name: string) {
  return requestJson<CommandScriptDetail>(`/commands/${encodeURIComponent(name)}`);
}

export function updateCommandScript(originalName: string, name: string, content: string) {
  return requestJson<{ name: string; path: string; updatedAt?: number; size?: number }>(
    `/commands/${encodeURIComponent(originalName)}`,
    {
      method: "PUT",
      body: JSON.stringify({ name, content }),
    },
  );
}

export function deleteCommandScript(name: string) {
  return requestJson<{ ok: true }>(`/commands/${encodeURIComponent(name)}`, { method: "DELETE" });
}
