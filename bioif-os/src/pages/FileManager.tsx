import {
  ChevronRight,
  File,
  Folder,
  LayoutGrid,
  Search,
  ArrowUpDown,
  FolderPlus,
  HardDrive,
  Server,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getFsRoot, listFs, getBfsRoot, listBfs } from "@/app/api";

type FsEntry = {
  name: string;
  path: string;
  kind: "file" | "dir";
  size?: string;
  modified: string;
  typeLabel: string;
};

const NAV_ITEMS: Record<"A" | "B", { label: string; path: string }[]> = {
  A: [],
  B: [],
};

export default function FileManager() {
  const [host, setHost] = useState<"A" | "B">("A");
  const [paths, setPaths] = useState<Record<"A" | "B", string>>({
    A: "/",
    B: "/projects",
  });
  const currentPath = paths[host];
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [serverARoot, setServerARoot] = useState("");
  const [serverBRoot, setServerBRoot] = useState("");

  useEffect(() => {
    let active = true;
    if (host === "A") {
      listFs(currentPath)
        .then((data) => {
          if (!active) return;
          setEntries(data.entries ?? []);
          if (data.path) setPaths((prev) => ({ ...prev, A: data.path }));
        })
        .catch(() => {
          if (active) setEntries([]);
        });
    } else {
      listBfs(currentPath)
        .then((data) => {
          if (!active) return;
          setEntries(data.entries ?? []);
          if (data.path) setPaths((prev) => ({ ...prev, B: data.path }));
        })
        .catch(() => {
          if (active) setEntries([]);
        });
    }
    return () => {
      active = false;
    };
  }, [currentPath, host]);

  useEffect(() => {
    let active = true;
    getFsRoot()
      .then((data) => {
        if (!active) return;
        setServerARoot(data.root ?? "");
        setPaths((prev) => ({ ...prev, A: data.root ?? prev.A }));
      })
      .catch(() => {
        if (!active) return;
        setServerARoot("");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    getBfsRoot()
      .then((data) => {
        if (!active) return;
        setServerBRoot(data.root ?? "");
        setPaths((prev) => ({ ...prev, B: data.root ?? prev.B }));
      })
      .catch(() => {
        if (!active) return;
        setServerBRoot("");
      });
    return () => {
      active = false;
    };
  }, []);

  const crumbs = useMemo(() => {
    const parts = currentPath.split("/").filter(Boolean);
    const acc: { label: string; path: string }[] = [{ label: "根目录", path: "/" }];
    let current = "";
    for (const part of parts) {
      current += `/${part}`;
      acc.push({ label: part, path: current });
    }
    return acc;
  }, [currentPath]);

  const setCurrentPath = (path: string) => {
    setPaths((prev) => ({ ...prev, [host]: path }));
  };

  return (
    <div className="rounded-2xl border border-zinc-300/70 bg-gradient-to-br from-white via-white to-zinc-100 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-lg font-semibold text-zinc-900">文件资源管理器</div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600 shadow-sm hover:bg-zinc-50">
            <FolderPlus className="h-3.5 w-3.5" />
            新建
          </button>
          <button className="flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600 shadow-sm hover:bg-zinc-50">
            <ArrowUpDown className="h-3.5 w-3.5" />
            排序
          </button>
          <button className="flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600 shadow-sm hover:bg-zinc-50">
            <LayoutGrid className="h-3.5 w-3.5" />
            视图
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 shadow-sm">
        <HardDrive className="h-4 w-4 text-zinc-500" />
        <div className="flex flex-wrap items-center gap-1">
          {crumbs.map((crumb, idx) => (
            <button
              key={crumb.path}
              className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-zinc-100"
              onClick={() => setCurrentPath(crumb.path)}
            >
              {idx > 0 && <ChevronRight className="h-3 w-3 text-zinc-400" />}
              <span className="text-xs">{crumb.label}</span>
            </button>
          ))}
        </div>
        {(host === "A" || host === "B") && (
          <div className="ml-3 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] text-zinc-500">
            根目录：{host === "A" ? serverARoot || "检测中..." : serverBRoot || "检测中..."}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-500">
          <Search className="h-3.5 w-3.5" />
          搜索当前目录
        </div>
      </div>

      <div className="mt-4 flex gap-4">
        <div className="w-52 rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-600">
          <div className="text-xs font-semibold text-zinc-500">导航</div>
          <div className="mt-3 space-y-1">
            {NAV_ITEMS[host].map((item) => (
              <button
                key={item.path}
                onClick={() => setCurrentPath(item.path)}
                className={[
                  "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-zinc-100",
                  currentPath === item.path ? "bg-zinc-100 text-zinc-900" : "",
                ].join(" ")}
              >
                <Folder className="h-4 w-4 text-zinc-500" />
                {item.label}
              </button>
            ))}
          </div>
          <div className="mt-4 text-xs font-semibold text-zinc-500">此电脑</div>
          <div className="mt-2 flex items-center gap-2 rounded-md px-2 py-1 text-sm text-zinc-600">
            <HardDrive className="h-4 w-4 text-zinc-500" />
            Linux-Server {host}
          </div>
        </div>

        <div className="flex-1 rounded-xl border border-zinc-200 bg-white">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2 text-xs text-zinc-500">
            <div>名称</div>
            <button
              className="flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-1 text-[10px] text-zinc-600 shadow-sm hover:bg-zinc-50"
              onClick={() => {
                const nextHost = host === "A" ? "B" : "A";
                setHost(nextHost);
              }}
              title={`切换到服务器 ${host === "A" ? "B" : "A"}`}
            >
              <Server className="h-3.5 w-3.5 text-sky-500" />
              服务器{host}
            </button>
          </div>
          <div className="grid grid-cols-[1.8fr_0.9fr_0.8fr_0.6fr] gap-2 border-b border-zinc-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <div>名称</div>
            <div>修改日期</div>
            <div>类型</div>
            <div>大小</div>
          </div>
          <div className="max-h-[420px] overflow-auto">
            {entries.length === 0 ? (
              <div className="px-4 py-6 text-sm text-zinc-500">该目录为空</div>
            ) : (
              entries.map((entry) => (
                <div
                  key={entry.path}
                  draggable={entry.kind === "file"}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", entry.path);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onDoubleClick={() => {
                    if (entry.kind === "dir") setCurrentPath(entry.path);
                  }}
                  className={[
                    "grid grid-cols-[1.8fr_0.9fr_0.8fr_0.6fr] items-center gap-2 px-4 py-2 text-sm",
                    "border-b border-zinc-100 hover:bg-zinc-50",
                    entry.kind === "file" ? "cursor-grab" : "cursor-pointer",
                  ].join(" ")}
                  title={entry.path}
                >
                  <div className="flex items-center gap-2 text-zinc-700">
                    {entry.kind === "dir" ? (
                      <Folder className="h-4 w-4 text-amber-500" />
                    ) : (
                      <File className="h-4 w-4 text-sky-500" />
                    )}
                    <span className="truncate">{entry.name}</span>
                  </div>
                  <div className="text-xs text-zinc-500">{entry.modified}</div>
                  <div className="text-xs text-zinc-500">{entry.typeLabel}</div>
                  <div className="text-xs text-zinc-500">{entry.size ?? "-"}</div>
                </div>
              ))
            )}
          </div>
          <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-2 text-xs text-zinc-500">
            <div>{entries.length} 个项目</div>
            <div>拖拽文件到其他窗口可作为路径引用</div>
          </div>
        </div>
      </div>
    </div>
  );
}
