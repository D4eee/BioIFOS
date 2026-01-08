import { useEffect, useMemo, useRef, useState } from "react";
import {
  Layers,
  RefreshCw,
  TerminalSquare,
  Folder,
  FileText,
  Trash2,
  Plus,
  Save,
  Upload,
} from "lucide-react";
import {
  getAuthToken,
  getBfsLogsRoot,
  getBfsRunningTasks,
  getBfsScriptsRoot,
  getBfsSystem,
  listBfsLogs,
  listBfsScripts,
  readBfsLog,
  readBfsScript,
  writeBfsScript,
  deleteBfsScripts,
  mkdirBfsScripts,
  uploadBfsScript,
  renameBfsScripts,
  moveBfsScripts,
} from "@/app/api";

type SourceType = "实时终端" | "系统任务" | "全部任务" | "运行任务" | "我的脚本";

type ProcessItem = {
  pid: string;
  cpu: number;
  mem: number;
  command: string;
  args: string;
};

type FsEntry = {
  name: string;
  path: string;
  kind: "file" | "dir";
  size?: string;
  modified: string;
  typeLabel: string;
};

function parseProcesses(stdout: string): ProcessItem[] {
  const lines = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 1) return [];
  return lines.slice(1).map((line) => {
    const parts = line.split(/\s+/);
    const [pid = "", cpu = "0", mem = "0", command = "", ...rest] = parts;
    return {
      pid,
      cpu: Number(cpu) || 0,
      mem: Number(mem) || 0,
      command,
      args: rest.join(" "),
    };
  });
}

function usageColor(value: number) {
  if (value >= 50) return "bg-rose-500";
  if (value >= 20) return "bg-amber-400";
  if (value >= 5) return "bg-lime-400";
  return "bg-emerald-400";
}

export default function ResultsTerminal() {
  const [source, setSource] = useState<SourceType>("实时终端");
  const [autoScroll, setAutoScroll] = useState(true);
  const [command, setCommand] = useState("");
  const [terminalOutput, setTerminalOutput] = useState("");
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [terminalStatus, setTerminalStatus] = useState("");
  const [wsEpoch, setWsEpoch] = useState(0);

  const [systemInfo, setSystemInfo] = useState({ uptime: "", memory: "", disk: "" });
  const [runningTasks, setRunningTasks] = useState<ProcessItem[]>([]);
  const [logsRoot, setLogsRoot] = useState("");
  const [logsPath, setLogsPath] = useState("");
  const [logsEntries, setLogsEntries] = useState<FsEntry[]>([]);
  const [logContent, setLogContent] = useState("");

  const [scriptsRoot, setScriptsRoot] = useState("");
  const [scriptsPath, setScriptsPath] = useState("");
  const [scriptsEntries, setScriptsEntries] = useState<FsEntry[]>([]);
  const [scriptContent, setScriptContent] = useState("");
  const [scriptPath, setScriptPath] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [scriptMenu, setScriptMenu] = useState<{ x: number; y: number; entry: FsEntry } | null>(null);
  const [renameDialog, setRenameDialog] = useState<{ entry: FsEntry; name: string } | null>(null);
  const [moveDialog, setMoveDialog] = useState<{ entry: FsEntry; target: string } | null>(null);

  const filteredScripts = useMemo(() => {
    if (!command.trim()) return scriptsEntries;
    const needle = command.trim().toLowerCase();
    return scriptsEntries.filter((entry) => entry.name.toLowerCase().includes(needle));
  }, [command, scriptsEntries]);

  const refreshSystem = async () => {
    const [system, tasks] = await Promise.all([getBfsSystem(), getBfsRunningTasks()]);
    setSystemInfo({
      uptime: system.uptime.stdout.trim(),
      memory: system.memory.stdout.trim(),
      disk: system.disk.stdout.trim(),
    });
    setRunningTasks(parseProcesses(tasks.stdout));
  };

  const refreshLogs = async () => {
    const root = logsRoot || (await getBfsLogsRoot()).root;
    if (!logsRoot) setLogsRoot(root);
    const data = await listBfsLogs(logsPath || root);
    setLogsEntries(data.entries ?? []);
    if (!logsPath) setLogsPath(data.path ?? root);
  };

  const refreshScripts = async () => {
    const root = scriptsRoot || (await getBfsScriptsRoot()).root;
    if (!scriptsRoot) setScriptsRoot(root);
    const data = await listBfsScripts(scriptsPath || root);
    setScriptsEntries(data.entries ?? []);
    if (!scriptsPath) setScriptsPath(data.path ?? root);
  };

  useEffect(() => {
    if (source === "系统任务") {
      refreshSystem().catch(() => {});
      const timer = window.setInterval(() => refreshSystem().catch(() => {}), 5000);
      return () => window.clearInterval(timer);
    }
    if (source === "运行任务" || source === "全部任务") {
      getBfsRunningTasks()
        .then((tasks) => setRunningTasks(parseProcesses(tasks.stdout)))
        .catch(() => {});
    }
    if (source === "全部任务") {
      refreshLogs().catch(() => {});
    }
    if (source === "我的脚本") {
      refreshScripts().catch(() => {});
    }
    return undefined;
  }, [source]);

  useEffect(() => {
    if (source !== "实时终端") return;
    if (wsRef.current) return;
    const token = getAuthToken();
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${protocol}://${window.location.host}/api/bfs/terminal?token=${encodeURIComponent(
      token,
    )}`;
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;
    setTerminalStatus("连接中...");
    socket.onopen = () => {
      setTerminalStatus("已连接");
    };
    socket.onmessage = (event) => {
      setTerminalOutput((prev) => prev + event.data);
    };
    socket.onerror = () => {
      setTerminalStatus("连接出错");
    };
    socket.onclose = () => {
      setTerminalStatus("已断开");
      wsRef.current = null;
      setWsEpoch((value) => value + 1);
    };
    return () => {
      socket.close();
      wsRef.current = null;
    };
  }, [source, wsEpoch]);

  useEffect(() => {
    if (!autoScroll) return;
    const wrap = terminalRef.current;
    if (!wrap) return;
    wrap.scrollTop = wrap.scrollHeight;
  }, [terminalOutput, autoScroll]);

  useEffect(() => {
    if (!scriptMenu) return;
    const onDown = () => setScriptMenu(null);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("mousedown", onDown);
    };
  }, [scriptMenu]);

  const handleRefresh = () => {
    if (source === "系统任务") {
      refreshSystem().catch(() => {});
      return;
    }
    if (source === "运行任务") {
      getBfsRunningTasks()
        .then((tasks) => setRunningTasks(parseProcesses(tasks.stdout)))
        .catch(() => {});
      return;
    }
    if (source === "全部任务") {
      Promise.all([getBfsRunningTasks(), refreshLogs()])
        .then(([tasks]) => {
          setRunningTasks(parseProcesses(tasks.stdout));
        })
        .catch(() => {});
      return;
    }
    if (source === "我的脚本") {
      refreshScripts().catch(() => {});
    }
  };

  const sendCommand = () => {
    if (source !== "实时终端") return;
    if (!command.trim()) return;
    wsRef.current?.send(`${command}\n`);
    setCommand("");
  };

  const openLog = (entry: FsEntry) => {
    if (entry.kind === "dir") {
      setLogsPath(entry.path);
      listBfsLogs(entry.path)
        .then((data) => setLogsEntries(data.entries ?? []))
        .catch(() => {});
      return;
    }
    readBfsLog(entry.path)
      .then((data) => {
        setLogContent(data.content ?? "");
      })
      .catch(() => {});
  };

  const openScript = (entry: FsEntry) => {
    if (entry.kind === "dir") {
      setScriptsPath(entry.path);
      listBfsScripts(entry.path)
        .then((data) => setScriptsEntries(data.entries ?? []))
        .catch(() => {});
      return;
    }
    readBfsScript(entry.path)
      .then((data) => {
        setScriptPath(data.path);
        setScriptContent(data.content ?? "");
      })
      .catch(() => {});
  };

  const saveScript = () => {
    if (!scriptPath) return;
    writeBfsScript(scriptPath, scriptContent)
      .then(() => refreshScripts())
      .catch(() => {});
  };

  const createScript = () => {
    if (!scriptsPath) return;
    const filename = `new-script-${Date.now()}.sh`;
    const path = `${scriptsPath}/${filename}`.replace("//", "/");
    writeBfsScript(path, "#!/usr/bin/env bash\n")
      .then(() => {
        setScriptPath(path);
        setScriptContent("#!/usr/bin/env bash\n");
        refreshScripts();
      })
      .catch(() => {});
  };

  const deleteScript = () => {
    if (!scriptPath) return;
    deleteBfsScripts(scriptPath)
      .then(() => {
        setScriptPath("");
        setScriptContent("");
        refreshScripts();
      })
      .catch(() => {});
  };

  const uploadScript = (file: File) => {
    if (!scriptsPath) return;
    uploadBfsScript(scriptsPath, file)
      .then(() => refreshScripts())
      .catch(() => {});
  };

  const renameScript = (entry: FsEntry, next: string) => {
    if (!next) return;
    renameBfsScripts(entry.path, next)
      .then(() => refreshScripts())
      .catch(() => {});
  };

  const moveScript = (entry: FsEntry, next: string) => {
    if (!next) return;
    moveBfsScripts(entry.path, next)
      .then(() => refreshScripts())
      .catch(() => {});
  };

  const removeScriptEntry = (entry: FsEntry) => {
    deleteBfsScripts(entry.path)
      .then(() => {
        if (scriptPath === entry.path) {
          setScriptPath("");
          setScriptContent("");
        }
        refreshScripts();
      })
      .catch(() => {});
  };

  const renderRightPanel = () => {
    if (source === "实时终端") {
      return (
        <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-white/5 shadow-inner backdrop-blur">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-[10px] text-zinc-400">
            <span className="uppercase tracking-[0.3em]">实时终端</span>
            <span className="rounded-full border border-emerald-400/40 bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-200">
              {terminalStatus || "未连接"}
            </span>
          </div>
          <div className="flex-1 overflow-hidden rounded-2xl bg-gradient-to-br from-black/60 via-slate-950/60 to-slate-900/80 p-4">
            <div ref={terminalRef} className="h-full overflow-auto text-xs leading-6 text-emerald-200">
              {terminalOutput.split("\n").map((line, idx) => (
                <div key={`${idx}-${line}`} className="font-mono whitespace-pre-wrap">
                  {line}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (source === "系统任务") {
      return (
        <div className="flex h-full flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-zinc-200 shadow-inner">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/40 p-3">
              <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-400">Uptime / Load</div>
              <pre className="mt-2 whitespace-pre-wrap text-emerald-200">{systemInfo.uptime || "加载中..."}</pre>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/40 p-3">
              <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-400">Memory</div>
              <pre className="mt-2 whitespace-pre-wrap text-emerald-200">{systemInfo.memory || "加载中..."}</pre>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/40 p-3 md:col-span-2">
              <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-400">Disk</div>
              <pre className="mt-2 whitespace-pre-wrap text-emerald-200">{systemInfo.disk || "加载中..."}</pre>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/40 p-3">
            <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-400">运行任务</div>
            <div className="mt-2 space-y-2">
              {runningTasks.length === 0 && <div className="text-zinc-400">暂无运行任务</div>}
              {runningTasks.map((task) => (
                <div key={`${task.pid}-${task.command}`} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${usageColor(task.cpu)}`} />
                    <span className="text-zinc-200">{task.command}</span>
                  </div>
                  <div className="text-[10px] text-zinc-400">
                    CPU {task.cpu.toFixed(1)}% · MEM {task.mem.toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (source === "运行任务") {
      return (
        <div className="flex h-full flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-zinc-200 shadow-inner">
          <div className="rounded-xl border border-white/10 bg-black/40 p-3">
            <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-400">运行任务</div>
            <div className="mt-2 space-y-2">
              {runningTasks.length === 0 && <div className="text-zinc-400">暂无运行任务</div>}
              {runningTasks.map((task) => (
                <div key={`${task.pid}-${task.command}`} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${usageColor(task.cpu)}`} />
                    <div>
                      <div className="text-zinc-200">{task.command}</div>
                      <div className="text-[10px] text-zinc-400">{task.args}</div>
                    </div>
                  </div>
                  <div className="text-[10px] text-zinc-400">
                    CPU {task.cpu.toFixed(1)}% · MEM {task.mem.toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (source === "全部任务") {
      return (
        <div className="grid h-full grid-cols-[320px_1fr] gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-zinc-200 shadow-inner">
          <div className="rounded-xl border border-white/10 bg-black/40 p-3">
            <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-400">日志文件</div>
            <div className="mt-2 space-y-2">
              {logsEntries.length === 0 && <div className="text-zinc-400">暂无日志</div>}
              {logsEntries.map((entry) => (
                <button
                  key={entry.path}
                  onClick={() => openLog(entry)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-zinc-200 hover:bg-white/10"
                >
                  {entry.kind === "dir" ? (
                    <Folder className="h-4 w-4 text-emerald-300" />
                  ) : (
                    <FileText className="h-4 w-4 text-emerald-300" />
                  )}
                  <span className="truncate">{entry.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-white/10 bg-black/40 p-3">
              <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-400">运行任务</div>
              <div className="mt-2 space-y-2">
                {runningTasks.length === 0 && <div className="text-zinc-400">暂无运行任务</div>}
                {runningTasks.map((task) => (
                  <div key={`${task.pid}-${task.command}`} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${usageColor(task.cpu)}`} />
                      <span className="text-zinc-200">{task.command}</span>
                    </div>
                    <div className="text-[10px] text-zinc-400">
                      CPU {task.cpu.toFixed(1)}% · MEM {task.mem.toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-1 rounded-xl border border-white/10 bg-black/40 p-3">
              <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-400">历史日志</div>
              <pre className="mt-2 h-full whitespace-pre-wrap text-emerald-200">{logContent || "选择左侧日志文件查看"}</pre>
            </div>
          </div>
        </div>
      );
    }

    if (source === "我的脚本") {
      return (
        <div className="grid h-full grid-cols-[320px_1fr] gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-zinc-200 shadow-inner">
          <div className="rounded-xl border border-white/10 bg-black/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-400">脚本目录</div>
              <div className="flex items-center gap-1">
                <button
                  onClick={createScript}
                  className="rounded-full border border-emerald-400/50 bg-emerald-500/20 p-1 text-emerald-200 hover:bg-emerald-500/30"
                  title="新建脚本"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-full border border-emerald-400/50 bg-emerald-500/20 p-1 text-emerald-200 hover:bg-emerald-500/30"
                  title="上传脚本"
                >
                  <Upload className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => mkdirBfsScripts(`${scriptsPath}/new-folder`.replace("//", "/"))}
                  className="rounded-full border border-emerald-400/50 bg-emerald-500/20 p-1 text-emerald-200 hover:bg-emerald-500/30"
                  title="新建文件夹"
                >
                  <Folder className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".sh,.txt"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadScript(file);
              }}
              className="hidden"
            />
            <div className="space-y-2">
              {filteredScripts.length === 0 && <div className="text-zinc-400">暂无脚本</div>}
              {filteredScripts.map((entry) => (
                <div
                  key={entry.path}
                  role="button"
                  tabIndex={0}
                  onClick={() => openScript(entry)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openScript(entry);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setScriptMenu({ x: e.clientX, y: e.clientY, entry });
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-zinc-200 hover:bg-white/10"
                >
                  {entry.kind === "dir" ? (
                    <Folder className="h-4 w-4 text-emerald-300" />
                  ) : (
                    <FileText className="h-4 w-4 text-emerald-300" />
                  )}
                  <span className="truncate">{entry.name}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/40 px-3 py-2">
              <div className="text-[10px] text-zinc-400">{scriptPath || "未选择脚本"}</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={saveScript}
                  className="rounded-full border border-emerald-400/50 bg-emerald-500/20 p-1 text-emerald-200 hover:bg-emerald-500/30"
                  title="保存脚本"
                >
                  <Save className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={deleteScript}
                  className="rounded-full border border-rose-400/50 bg-rose-500/20 p-1 text-rose-200 hover:bg-rose-500/30"
                  title="删除脚本"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <textarea
              value={scriptContent}
              onChange={(e) => setScriptContent(e.target.value)}
              className="flex-1 rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-xs text-emerald-200 outline-none"
              placeholder="脚本内容..."
            />
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="h-full">
      <div className="rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.9),_rgba(2,6,23,0.98))] p-4 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
            <TerminalSquare className="h-5 w-5 text-emerald-400" />
            运行终端
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="rounded-full border border-emerald-400/40 bg-emerald-500/20 px-2 py-1">
              监听中
            </span>
            <button
              onClick={handleRefresh}
              className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 hover:bg-white/10"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              刷新
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-[280px_1fr] gap-4">
          <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-zinc-300 shadow-inner backdrop-blur">
            <div>
              <div className="mb-2 text-[10px] uppercase tracking-[0.3em] text-zinc-500">任务来源</div>
              <div className="space-y-2">
                {(["实时终端", "系统任务", "全部任务", "运行任务", "我的脚本"] as SourceType[]).map((item) => (
                  <button
                    key={item}
                    onClick={() => setSource(item)}
                    className={[
                      "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition",
                      source === item
                        ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-100"
                        : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10",
                    ].join(" ")}
                  >
                    <Layers className="h-3.5 w-3.5 text-emerald-400" />
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-[11px] text-zinc-400">
              <div className="mb-2 text-[10px] uppercase tracking-[0.3em] text-zinc-500">终端模式</div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border border-white/20"
                />
                自动滚动
              </label>
            </div>
          </div>

          <div className="flex h-[70vh] flex-col gap-3">{renderRightPanel()}</div>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-4 py-3">
          <span className="text-xs text-emerald-300">$</span>
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder={source === "我的脚本" ? "搜索脚本名称..." : "输入指令或过滤关键字..."}
            className="flex-1 bg-transparent text-xs text-zinc-100 outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (source === "实时终端") sendCommand();
              }
            }}
          />
          <button
            className="rounded-full border border-emerald-400/60 bg-emerald-500/20 px-3 py-1 text-xs text-emerald-100 hover:bg-emerald-500/30"
            onClick={() => {
              if (source === "实时终端") {
                sendCommand();
              }
            }}
          >
            发送
          </button>
        </div>
        {scriptMenu && (
          <div
            className="fixed z-50 w-40 rounded-xl border border-white/20 bg-zinc-950/90 p-1 text-xs text-zinc-200 shadow-xl backdrop-blur"
            style={{ left: scriptMenu.x, top: scriptMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full rounded-md px-2 py-1 text-left hover:bg-white/10"
              onClick={() => {
                setRenameDialog({ entry: scriptMenu.entry, name: scriptMenu.entry.name });
                setScriptMenu(null);
              }}
            >
              重命名
            </button>
            <button
              className="w-full rounded-md px-2 py-1 text-left hover:bg-white/10"
              onClick={() => {
                setMoveDialog({ entry: scriptMenu.entry, target: scriptsPath });
                setScriptMenu(null);
              }}
            >
              移动
            </button>
            <button
              className="w-full rounded-md px-2 py-1 text-left text-rose-300 hover:bg-rose-500/20"
              onClick={() => {
                removeScriptEntry(scriptMenu.entry);
                setScriptMenu(null);
              }}
            >
              删除
            </button>
          </div>
        )}
        {renameDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-[320px] rounded-2xl border border-white/10 bg-zinc-950/90 p-4 text-xs text-zinc-200 shadow-xl backdrop-blur">
              <div className="mb-3 text-sm font-semibold">重命名</div>
              <input
                value={renameDialog.name}
                onChange={(e) => setRenameDialog({ ...renameDialog, name: e.target.value })}
                className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs text-zinc-100 outline-none"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setRenameDialog(null)}
                  className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-300 hover:bg-white/10"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    renameScript(renameDialog.entry, renameDialog.name.trim());
                    setRenameDialog(null);
                  }}
                  className="rounded-full border border-emerald-400/50 bg-emerald-500/20 px-3 py-1 text-xs text-emerald-100 hover:bg-emerald-500/30"
                >
                  确认
                </button>
              </div>
            </div>
          </div>
        )}
        {moveDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-[360px] rounded-2xl border border-white/10 bg-zinc-950/90 p-4 text-xs text-zinc-200 shadow-xl backdrop-blur">
              <div className="mb-2 text-sm font-semibold">移动到</div>
              <input
                value={moveDialog.target}
                onChange={(e) => setMoveDialog({ ...moveDialog, target: e.target.value })}
                className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs text-zinc-100 outline-none"
              />
              <div className="mt-3 rounded-lg border border-white/10 bg-black/40 p-2">
                <div className="mb-2 text-[10px] uppercase tracking-widest text-zinc-400">当前目录</div>
                <div className="max-h-40 space-y-1 overflow-auto">
                  {scriptsEntries
                    .filter((entry) => entry.kind === "dir")
                    .map((entry) => (
                      <button
                        key={entry.path}
                        onClick={() => setMoveDialog({ ...moveDialog, target: entry.path })}
                        className="w-full rounded-md px-2 py-1 text-left text-xs text-zinc-200 hover:bg-white/10"
                      >
                        {entry.name}
                      </button>
                    ))}
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setMoveDialog(null)}
                  className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-300 hover:bg-white/10"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    moveScript(moveDialog.entry, moveDialog.target.trim());
                    setMoveDialog(null);
                  }}
                  className="rounded-full border border-emerald-400/50 bg-emerald-500/20 px-3 py-1 text-xs text-emerald-100 hover:bg-emerald-500/30"
                >
                  确认
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
