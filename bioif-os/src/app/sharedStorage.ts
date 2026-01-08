export const STORAGE_KEYS = {
  toolNotes: "bioif_tool_descriptions_v1",
  toolCurl: "bioif_tool_curl_v1",
  toolParams: "bioif_tool_params_v1",
  savedWorkflows: "bioif_saved_workflows_v1",
  toolFavorites: "bioif_tool_favorites_v1",
  toolPaths: "bioif_tool_paths_v1",
} as const;

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
