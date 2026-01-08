import { useEffect, useMemo, useRef, useState } from "react";
import {
  createCommandScript,
  deleteCommandScript,
  getCommandScript,
  listCommandScripts,
  updateCommandScript,
  type CommandScriptDetail,
  type CommandScriptSummary,
} from "@/app/api";

export default function ScriptOps() {
  const workspaceResizeRef = useRef<{ startY: number; origin: number } | null>(null);
  const [scripts, setScripts] = useState<CommandScriptSummary[]>([]);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [scriptContent, setScriptContent] = useState("");
  const [scriptName, setScriptName] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [workspaceHeight, setWorkspaceHeight] = useState(560);
  const [refreshToken, setRefreshToken] = useState(0);
  const [initialLoad, setInitialLoad] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let active = true;
    listCommandScripts()
      .then((data) => {
        if (!active) return;
        setScripts(data);
        if (initialLoad && !activeName && data[0]?.name) {
          setActiveName(data[0].name);
        }
        if (initialLoad) {
          setInitialLoad(false);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [activeName, initialLoad, refreshToken]);

  useEffect(() => {
    if (!activeName) {
      setScriptContent("");
      setScriptName("");
      return;
    }
    let active = true;
    getCommandScript(activeName)
      .then((data: CommandScriptDetail) => {
        if (!active) return;
        setScriptContent(data.content ?? "");
        setScriptName(data.name ?? activeName);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [activeName]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const state = workspaceResizeRef.current;
      if (!state) return;
      const next = Math.max(520, Math.min(1400, state.origin + (e.clientY - state.startY)));
      setWorkspaceHeight(next);
    };
    const onUp = () => {
      workspaceResizeRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const activeSummary = useMemo(
    () => scripts.find((script) => script.name === activeName) ?? null,
    [activeName, scripts],
  );
  const filteredScripts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return scripts;
    return scripts.filter((script) => script.name.toLowerCase().includes(query));
  }, [scripts, searchQuery]);

  const saveScript = async () => {
    const nextName = scriptName.trim();
    if (!nextName) {
      setStatus("脚本名称不能为空。");
      return;
    }
    setStatus("");
    setSaving(true);
    try {
      const saved = activeName
        ? await updateCommandScript(activeName, nextName, scriptContent)
        : await createCommandScript(nextName, scriptContent);
      setActiveName(saved.name);
      setScriptName(saved.name);
      setRefreshToken((value) => value + 1);
      setStatus("已保存脚本。");
    } catch (error) {
      setStatus("保存失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  };

  const deleteScript = async (name: string) => {
    if (!window.confirm(`确定删除脚本 ${name} 吗？`)) return;
    setStatus("");
    try {
      await deleteCommandScript(name);
      if (activeName === name) {
        setActiveName(null);
        setScriptName("");
        setScriptContent("");
      }
      setRefreshToken((value) => value + 1);
      setStatus("脚本已删除。");
    } catch {
      setStatus("删除失败，请稍后重试。");
    }
  };

  return (
    <div className="h-full">
      <div className="rounded-2xl border border-white/20 bg-gradient-to-br from-white/70 via-white/30 to-white/10 p-4 shadow-xl backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-lg font-semibold text-zinc-900">脚本操作</div>
          <div className="text-xs text-zinc-500">{activeSummary ? "已载入脚本" : "新建脚本"}</div>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-zinc-600">
          <div>{status}</div>
          <button
            type="button"
            onClick={() => setRefreshToken((v) => v + 1)}
            className="rounded-full border border-zinc-200 bg-white/80 px-3 py-1 text-[11px] text-zinc-600 hover:bg-white"
          >
            刷新列表
          </button>
        </div>

        <div
          className="mt-4 grid min-h-0 grid-cols-[280px_1fr] items-stretch gap-4"
          style={{ height: workspaceHeight }}
        >
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-white/30 bg-white/40 p-3 shadow-sm backdrop-blur-md">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-zinc-500">
              <span>已保存脚本</span>
              <button
                type="button"
                onClick={() => {
                  setActiveName(null);
                  setScriptName("");
                  setScriptContent("");
                  setStatus("");
                }}
                className="rounded-full border border-white/60 bg-white/80 px-2 py-1 text-[10px] text-zinc-600 transition hover:bg-white"
              >
                新建
              </button>
            </div>
            <div className="mb-2">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索脚本"
                className="w-full rounded-full border border-white/60 bg-white/80 px-3 py-2 text-[11px] text-zinc-700 outline-none"
              />
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {scripts.length === 0 && <div className="text-xs text-zinc-500">暂无保存记录</div>}
              {scripts.length === 0 && <div className="text-xs text-zinc-500">暂无保存记录</div>}
              {filteredScripts.map((script) => {
                const isActive = activeName === script.name;
                return (
                  <div
                    key={script.name}
                    className={[
                      "flex items-start gap-2 rounded-xl border px-3 py-2 transition-colors",
                      isActive
                        ? "border-zinc-800 bg-zinc-900/90 text-white"
                        : "border-white/50 bg-white/70 text-zinc-700 hover:bg-white",
                    ].join(" ")}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveName(script.name)}
                      className="flex-1 text-left"
                    >
                      <div className="font-semibold">{script.name}</div>
                      <div className="mt-1 text-[10px] text-zinc-400">
                        {new Date(script.updatedAt).toLocaleString()} · {(script.size / 1024).toFixed(1)} KB
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteScript(script.name)}
                      className={[
                        "mt-1 h-5 w-5 rounded-full border text-[10px] leading-5 transition",
                        isActive
                          ? "border-white/40 text-white/80 hover:bg-white/20"
                          : "border-zinc-300 text-zinc-500 hover:bg-white",
                      ].join(" ")}
                      title="删除脚本"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex h-full min-h-0 flex-col">
            <div className="mb-3 flex items-center gap-2 rounded-full border border-white/50 bg-white/70 px-3 py-2 text-xs text-zinc-600 shadow-sm">
              <input
                value={scriptName}
                onChange={(e) => setScriptName(e.target.value)}
                placeholder="脚本文件名"
                className="flex-1 bg-transparent text-xs text-zinc-700 outline-none"
              />
              <button
                type="button"
                onClick={saveScript}
                disabled={saving || !scriptName.trim()}
                className={[
                  "rounded-full border px-3 py-1 text-xs font-semibold transition",
                  !saving && scriptName.trim()
                    ? "border-emerald-400/70 bg-emerald-500/90 text-white hover:bg-emerald-500"
                    : "cursor-not-allowed border-zinc-300 bg-zinc-200 text-zinc-500",
                ].join(" ")}
              >
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
            <div className="flex-1 rounded-xl border border-dashed border-white/50 bg-gradient-to-br from-white/50 via-white/20 to-white/10 p-4 shadow-inner">
              <textarea
                value={scriptContent}
                onChange={(e) => setScriptContent(e.target.value)}
                placeholder="这里是脚本内容编辑区..."
                className="h-full w-full resize-none rounded-lg border border-white/60 bg-white/80 p-3 text-xs text-zinc-700 outline-none"
              />
            </div>
          </div>
        </div>

        <div
          className="mt-2 h-1 cursor-row-resize rounded-full bg-white/40"
          onMouseDown={(e) => {
            workspaceResizeRef.current = { startY: e.clientY, origin: workspaceHeight };
          }}
        />
      </div>
    </div>
  );
}
