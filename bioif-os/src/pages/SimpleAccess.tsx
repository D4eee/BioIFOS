import { useEffect, useRef, useState } from "react";
import { RefreshCw, TerminalSquare, Trash2 } from "lucide-react";
import { getAuthToken } from "@/app/api";

export default function SimpleAccess() {
  const [command, setCommand] = useState("");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("未连接");
  const [autoScroll, setAutoScroll] = useState(true);
  const [wsEpoch, setWsEpoch] = useState(0);
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (wsRef.current) return;
    const token = getAuthToken();
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${protocol}://${window.location.host}/api/bfs/terminal?token=${encodeURIComponent(
      token,
    )}`;
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;
    setStatus("连接中...");
    socket.onopen = () => {
      setStatus("已连接");
    };
    socket.onmessage = (event) => {
      setOutput((prev) => prev + event.data);
    };
    socket.onerror = () => {
      setStatus("连接出错");
    };
    socket.onclose = () => {
      setStatus("已断开");
      wsRef.current = null;
      setWsEpoch((value) => value + 1);
    };
    return () => {
      socket.close();
      wsRef.current = null;
    };
  }, [wsEpoch]);

  useEffect(() => {
    if (!autoScroll) return;
    const wrap = terminalRef.current;
    if (!wrap) return;
    wrap.scrollTop = wrap.scrollHeight;
  }, [output, autoScroll]);

  const sendCommand = () => {
    const trimmed = command.trim();
    if (!trimmed) return;
    wsRef.current?.send(`${trimmed}\n`);
    setCommand("");
  };

  return (
    <div className="h-full">
      <div className="rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(8,15,25,0.92),_rgba(2,6,18,0.98))] p-4 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
            <TerminalSquare className="h-5 w-5 text-emerald-400" />
            简单访问模式
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="rounded-full border border-emerald-400/40 bg-emerald-500/20 px-2 py-1">
              {status}
            </span>
            <button
              onClick={() => setWsEpoch((value) => value + 1)}
              className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 hover:bg-white/10"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              重连
            </button>
            <button
              onClick={() => setOutput("")}
              className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 hover:bg-white/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              清空
            </button>
          </div>
        </div>

        <div className="mt-4 flex h-[70vh] flex-col rounded-2xl border border-white/10 bg-black/60 shadow-inner">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-[10px] text-zinc-400">
            <span className="uppercase tracking-[0.3em]">B 端终端</span>
            <label className="flex items-center gap-2 text-[11px] text-zinc-400">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="h-3.5 w-3.5 rounded border border-white/20"
              />
              自动滚动
            </label>
          </div>
          <div className="flex-1 overflow-hidden p-4">
            <div ref={terminalRef} className="h-full overflow-auto text-xs leading-6 text-emerald-200">
              {output.split("\n").map((line, idx) => (
                <div key={`${idx}-${line}`} className="whitespace-pre-wrap font-mono">
                  {line}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-white/10 bg-black/40 px-4 py-3">
            <span className="text-xs text-emerald-300">$</span>
            <input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="输入指令并回车执行..."
              className="flex-1 bg-transparent text-xs text-zinc-100 outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  sendCommand();
                }
              }}
            />
            <button
              onClick={sendCommand}
              className="rounded-full border border-emerald-400/60 bg-emerald-500/20 px-3 py-1 text-xs text-emerald-100 hover:bg-emerald-500/30"
            >
              发送
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
