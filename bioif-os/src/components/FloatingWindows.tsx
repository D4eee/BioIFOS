import type { AppTab, FloatingWindow } from "@/app/types";
import { X } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { useEffect, useRef, useState } from "react";

type DragAction =
  | {
      id: string;
      type: "move";
      startX: number;
      startY: number;
      originX: number;
      originY: number;
    }
  | {
      id: string;
      type: "resize";
      startX: number;
      startY: number;
      originW: number;
      originH: number;
    };

export default function FloatingWindows({
  windows,
  boundsRef,
  dockRef,
  droppedRefs,
  onFocus,
  onMove,
  onResize,
  onClose,
  onDock,
  onDropFile,
  renderContent,
}: {
  windows: FloatingWindow[];
  boundsRef: RefObject<HTMLDivElement>;
  dockRef: RefObject<HTMLDivElement>;
  droppedRefs: Record<string, string[]>;
  onFocus: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, width: number, height: number) => void;
  onClose: (id: string) => void;
  onDock: (id: string) => void;
  onDropFile: (id: string, path: string) => void;
  renderContent: (tab: AppTab) => ReactNode;
}) {
  const actionRef = useRef<DragAction | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const [dockCandidateId, setDockCandidateId] = useState<string | null>(null);

  const startMove = (id: string, clientX: number, clientY: number) => {
    actionRef.current = {
      id,
      type: "move",
      startX: clientX,
      startY: clientY,
      originX: windows.find((w) => w.id === id)?.x ?? 0,
      originY: windows.find((w) => w.id === id)?.y ?? 0,
    };
  };

  const startResize = (id: string, clientX: number, clientY: number) => {
    actionRef.current = {
      id,
      type: "resize",
      startX: clientX,
      startY: clientY,
      originW: windows.find((w) => w.id === id)?.width ?? 300,
      originH: windows.find((w) => w.id === id)?.height ?? 200,
    };
  };

  useEffect(() => {
    const handleMove = (e: PointerEvent | MouseEvent) => {
      const action = actionRef.current;
      if (!action) return;
      pointerRef.current = { x: e.clientX, y: e.clientY };

      const bounds = boundsRef.current?.getBoundingClientRect();
      if (!bounds) return;

      if (action.type === "move") {
        const dx = e.clientX - action.startX;
        const dy = e.clientY - action.startY;
        const nextX = Math.max(0, Math.min(bounds.width - 240, action.originX + dx));
        const nextY = Math.max(0, Math.min(bounds.height - 120, action.originY + dy));
        onMove(action.id, nextX, nextY);

        const dock = dockRef.current?.getBoundingClientRect();
        if (dock) {
          const threshold = 24;
          const inDock =
            e.clientX >= dock.left &&
            e.clientX <= dock.right &&
            e.clientY >= dock.top - threshold &&
            e.clientY <= dock.bottom + threshold;
          setDockCandidateId(inDock ? action.id : null);
        }
      } else {
        const dx = e.clientX - action.startX;
        const dy = e.clientY - action.startY;
        const nextW = Math.max(240, action.originW + dx);
        const nextH = Math.max(160, action.originH + dy);
        onResize(action.id, nextW, nextH);
      }
    };

    const onUp = () => {
      const action = actionRef.current;
      if (action?.type === "move") {
        const dock = dockRef.current?.getBoundingClientRect();
        const pointer = pointerRef.current;
        if (dock && pointer) {
          const threshold = 24;
          const inDock =
            pointer.x >= dock.left &&
            pointer.x <= dock.right &&
            pointer.y >= dock.top - threshold &&
            pointer.y <= dock.bottom + threshold;
          if (inDock) onDock(action.id);
        }
      }
      actionRef.current = null;
      setDockCandidateId(null);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [boundsRef, dockRef, onDock, onMove, onResize]);

  if (windows.length === 0) return null;

  return (
    <>
      {windows.map((win) => {
        const dropped = droppedRefs[win.id] ?? [];
        const isDockCandidate = dockCandidateId === win.id;
        return (
          <div
            key={win.id}
            className={[
              "absolute rounded-lg border bg-zinc-950 text-zinc-100 shadow-xl transition-shadow",
              isDockCandidate ? "border-indigo-400 shadow-indigo-500/40" : "border-zinc-800",
            ].join(" ")}
            style={{
              left: win.x,
              top: win.y,
              width: win.width,
              height: win.height,
              zIndex: win.z,
            }}
            onPointerDown={() => onFocus(win.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const text = e.dataTransfer.getData("text/plain");
              if (text) onDropFile(win.id, text);
            }}
          >
            <div
              className={[
                "flex items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900 px-3 py-2 text-sm",
                isDockCandidate ? "bg-indigo-900/40" : "",
              ].join(" ")}
              style={{ touchAction: "none" }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onFocus(win.id);
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                startMove(win.id, e.clientX, e.clientY);
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onFocus(win.id);
                startMove(win.id, e.clientX, e.clientY);
              }}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className="rounded-full border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-300">
                  Tab
                </div>
                <div className="min-w-0 flex-1 truncate font-medium cursor-grab">{win.tab.title}</div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  className="rounded px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDock(win.id);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  title="回到标签栏"
                >
                  收回
                </button>
                <button
                  className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(win.id);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  aria-label="close floating window"
                  title="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="h-[calc(100%-40px)] overflow-auto p-3 text-sm">
              {renderContent(win.tab)}
              <div className="mt-3 rounded-md border border-dashed border-zinc-700/70 bg-zinc-900/40 p-2 text-xs text-zinc-400">
                {dropped.length === 0 ? "拖拽文件到这里作为路径引用" : `已引用：${dropped[dropped.length - 1]}`}
              </div>
            </div>

            <div
              className="absolute bottom-1 right-1 h-3 w-3 cursor-nwse-resize rounded-sm border border-zinc-700 bg-zinc-800"
              style={{ touchAction: "none" }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                startResize(win.id, e.clientX, e.clientY);
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                startResize(win.id, e.clientX, e.clientY);
              }}
            />
          </div>
        );
      })}
    </>
  );
}
