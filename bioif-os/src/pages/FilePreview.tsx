import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Folder, HardDrive } from "lucide-react";
import { getBfsRoot, listBfs, readBfs } from "@/app/api";

type FsEntry = {
  name: string;
  path: string;
  kind: "file" | "dir";
  size?: string;
  modified: string;
  typeLabel: string;
};

export default function FilePreview() {
  const [root, setRoot] = useState("");
  const [path, setPath] = useState("");
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState<{ path: string; name: string; content: string } | null>(null);
  const [infoPopup, setInfoPopup] = useState<{ entry: FsEntry; x: number; y: number } | null>(null);
  const [openMenu, setOpenMenu] = useState<{ entry: FsEntry; x: number; y: number } | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const infoRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    getBfsRoot()
      .then((data) => {
        if (!active) return;
        const rootPath = data.root ?? "/";
        setRoot(rootPath);
        setPath(rootPath);
        return listBfs(rootPath);
      })
      .then((data) => {
        if (!active || !data) return;
        setEntries(data.entries ?? []);
        if (data.path) setPath(data.path);
      })
      .catch(() => {
        if (!active) return;
        setEntries([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!path) return;
    let active = true;
    listBfs(path)
      .then((data) => {
        if (!active) return;
        setEntries(data.entries ?? []);
        if (data.path) setPath(data.path);
      })
      .catch(() => {
        if (!active) return;
        setEntries([]);
      });
    return () => {
      active = false;
    };
  }, [path]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const inList = listRef.current?.contains(target);
      const inInfo = infoRef.current?.contains(target);
      const inMenu = menuRef.current?.contains(target);
      if (!inList && !inInfo && !inMenu) {
        setInfoPopup(null);
        setOpenMenu(null);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setInfoPopup(null);
        setOpenMenu(null);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onEsc);
    };
  }, []);

  const crumbs = useMemo(() => {
    const parts = path.split("/").filter(Boolean);
    const acc: { label: string; path: string }[] = [{ label: "根目录", path: root || "/" }];
    let current = "";
    for (const part of parts) {
      current += `/${part}`;
      acc.push({ label: part, path: current });
    }
    return acc;
  }, [path, root]);

  const openTextFile = (entry: FsEntry) => {
    setStatus("");
    readBfs(entry.path)
      .then((data) => {
        setPreview({ path: data.path, name: entry.name, content: data.content ?? "" });
      })
      .catch(() => {
        setStatus("读取文件失败，请稍后重试。");
      });
  };

  return (
    <div className="h-full">
      <div className="rounded-2xl border border-white/20 bg-gradient-to-br from-white/70 via-white/30 to-white/10 p-4 shadow-xl backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div className="text-lg font-semibold text-zinc-900">文件预览</div>
          <div className="text-xs text-zinc-500">{preview ? "已打开文件" : "未打开文件"}</div>
        </div>
        {status && <div className="mt-2 text-xs text-rose-600">{status}</div>}

        <div className="mt-3 flex flex-wrap items-center gap-1 rounded-lg border border-white/30 bg-white/60 px-3 py-2 text-xs text-zinc-600">
          <HardDrive className="h-3.5 w-3.5 text-zinc-500" />
          {crumbs.map((crumb, idx) => (
            <button
              key={crumb.path}
              onClick={() => setPath(crumb.path)}
              className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-white"
            >
              {idx > 0 && <span className="text-zinc-300">/</span>}
              <span>{crumb.label}</span>
            </button>
          ))}
          <span className="ml-auto rounded-full border border-white/50 bg-white/70 px-2 py-1 text-[10px] text-zinc-500">
            根目录：{root || "检测中..."}
          </span>
        </div>

        <div className="mt-4 grid min-h-0 grid-cols-[320px_1fr] gap-4">
          <div ref={listRef} className="relative flex min-h-0 flex-col rounded-xl border border-white/30 bg-white/40 p-3 shadow-sm">
            <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">文件目录</div>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
              {entries.length === 0 && <div className="text-xs text-zinc-500">该目录为空</div>}
              {entries.map((entry) => (
                <div
                  key={entry.path}
                  className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-zinc-700 hover:bg-white"
                  onClick={(e) => {
                    if (entry.kind === "file") {
                      setInfoPopup({ entry, x: e.clientX, y: e.clientY });
                    }
                  }}
                  onDoubleClick={() => {
                    if (entry.kind === "dir") setPath(entry.path);
                  }}
                  onContextMenu={(e) => {
                    if (entry.kind !== "file") return;
                    e.preventDefault();
                    setOpenMenu({ entry, x: e.clientX, y: e.clientY });
                  }}
                >
                  {entry.kind === "dir" ? (
                    <Folder className="h-4 w-4 text-sky-500" />
                  ) : (
                    <FileText className="h-4 w-4 text-amber-500" />
                  )}
                  <span className="truncate">{entry.name}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex min-h-0 flex-col rounded-xl border border-white/30 bg-white/60 p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between text-xs text-zinc-600">
              <div className="truncate">{preview?.path || "选择右侧文件进行预览"}</div>
              {preview && (
                <button
                  onClick={() => setPreview(null)}
                  className="rounded-full border border-white/60 bg-white/80 px-2 py-1 text-[10px] text-zinc-600 hover:bg-white"
                >
                  关闭
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-white/50 bg-white/80 p-3 text-xs text-zinc-700">
              {preview ? (
                <pre className="whitespace-pre-wrap">{preview.content || "空文件"}</pre>
              ) : (
                <div className="text-zinc-500">右键文件选择“文本模式打开”。</div>
              )}
            </div>
          </div>
        </div>

        {infoPopup && (
          <div
            ref={infoRef}
            className="fixed z-50 w-56 rounded-xl border border-white/30 bg-white/95 p-3 text-xs text-zinc-700 shadow-xl backdrop-blur"
            style={{ left: infoPopup.x, top: infoPopup.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 text-[11px] font-semibold text-zinc-800">文件属性</div>
            <div>名称：{infoPopup.entry.name}</div>
            <div>类型：{infoPopup.entry.typeLabel}</div>
            <div>大小：{infoPopup.entry.size ?? "-"}</div>
            <div>修改：{infoPopup.entry.modified}</div>
          </div>
        )}

        {openMenu && (
          <div
            ref={menuRef}
            className="fixed z-50 w-40 rounded-xl border border-white/30 bg-white/95 p-1 text-xs text-zinc-700 shadow-xl backdrop-blur"
            style={{ left: openMenu.x, top: openMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full rounded-md px-2 py-1 text-left hover:bg-white"
              onClick={() => {
                openTextFile(openMenu.entry);
                setOpenMenu(null);
              }}
            >
              文本模式打开
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
