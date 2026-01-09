import type { AppPageType, AppTab } from "@/app/types";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Folder,
  Activity,
  Network,
  Hammer,
  Sparkles,
  FileText,
  TerminalSquare,
  Settings as SettingsIcon,
  User,
  FileSearch,
} from "lucide-react";

import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const TAB_ICONS: Record<AppPageType, React.FC<{ className?: string }>> = {
  fileManager: Folder,
  filePreview: FileSearch,
  toolBuilder: Hammer,
  toolSelect: Network,
  currentTasks: Activity,
  scriptOps: FileText,
  workflowBuilder: Sparkles,
  resultsTerminal: TerminalSquare,
  settings: SettingsIcon,
  account: User,
};

function SortableTab({
  tab,
  active,
  onActivate,
  onClose,
  showDivider,
}: {
  tab: AppTab;
  active: boolean;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  showDivider: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: tab.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        // relative + h-full：底部指示线贴住 TabBar 底边
        "group relative h-full flex items-center gap-2 px-3 text-sm",
        // 让 tab 自己不被压缩到 0；溢出时走横向滚动 + 更多菜单
        "flex-none",
        "w-40",
        "select-none",

        // 未激活：浅灰；激活：白
        active ? "text-white" : "text-zinc-400 hover:text-zinc-200",
      ].join(" ")}
      {...attributes}
      {...listeners}
      title={tab.title}
    >
      {TAB_ICONS[tab.type] && (
        <span className="flex h-4 w-4 items-center justify-center text-zinc-500 group-hover:text-zinc-300">
          {React.createElement(TAB_ICONS[tab.type], { className: "h-4 w-4" })}
        </span>
      )}
      <button
        className="min-w-0 flex-1 truncate text-left py-2"
        onClick={() => onActivate(tab.id)}
      >
        {tab.title}
      </button>

      <button
        className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-zinc-200"
        onClick={(e) => {
          e.stopPropagation();
          onClose(tab.id);
        }}
        aria-label="close tab"
        title="关闭"
      >
        <X className="h-4 w-4" />
      </button>

      {/* ✅ 激活指示线：贴在 TabBar 底边 */}
      {active && (
        <div className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-indigo-500" />
      )}

      {/* ✅ 右侧淡短虚线分割（只在需要时显示） */}
      {showDivider && (
        <div
          className="
            pointer-events-none
            absolute
            right-0
            top-1/2
            -translate-y-1/2
            h-4
            border-r
            border-dashed
            border-zinc-500/30
          "
        />
      )}
    </div>
  );
}

export default function TabBar({
  tabs,
  activeTabId,
  onActivate,
  onClose,
  onReorder,
  onDetach,
  outerRef,
}: {
  tabs: AppTab[];
  activeTabId: string | null;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onReorder: (tabs: AppTab[]) => void;
  onDetach: (id: string, point: { x: number; y: number }) => void;
  outerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const barRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const setRefs = (node: HTMLDivElement | null) => {
    barRef.current = node;
    if (outerRef) outerRef.current = node;
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    const pointer = pointerRef.current;
    const rect = barRef.current?.getBoundingClientRect();
    const threshold = 40;
    const isDetached =
      pointer &&
      rect &&
      (pointer.y < rect.top - threshold ||
        pointer.y > rect.bottom + threshold ||
        pointer.x < rect.left - threshold ||
        pointer.x > rect.right + threshold);

    if (isDetached && pointer) {
      onDetach(String(active.id), pointer);
      setDraggingId(null);
      return;
    }

    if (!over || active.id === over.id) {
      setDraggingId(null);
      return;
    }
    const oldIndex = tabs.findIndex((t) => t.id === active.id);
    const newIndex = tabs.findIndex((t) => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) {
      setDraggingId(null);
      return;
    }
    onReorder(arrayMove(tabs, oldIndex, newIndex));
    setDraggingId(null);
  };

  // ====== 溢出检测 + “更多”菜单 ======
  const listRef = useRef<HTMLDivElement | null>(null);
  const moreWrapRef = useRef<HTMLDivElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const check = () => {
      setIsOverflowing(el.scrollWidth > el.clientWidth + 1);
    };

    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);

    return () => ro.disconnect();
  }, [tabs.length]);

  // 点击外部关闭“更多”菜单
  useEffect(() => {
    if (!moreOpen) return;

    const onDown = (e: MouseEvent) => {
      const wrap = moreWrapRef.current;
      if (!wrap) return;
      if (wrap.contains(e.target as Node)) return;
      setMoreOpen(false);
    };

    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [moreOpen]);

  useEffect(() => {
    if (!draggingId) return;
    const onMove = (e: PointerEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [draggingId]);

  // 只在溢出时允许打开更多
  const toggleMore = () => {
    if (!isOverflowing) return;
    setMoreOpen((v) => !v);
  };

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId) ?? null, [tabs, activeTabId]);

  return (
    <div ref={setRefs} className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-950 px-2">
      <div className="min-w-0 flex-1">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(e) => {
            pointerRef.current = null;
            setDraggingId(String(e.active.id));
          }}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={tabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
            {/* ✅ 修复点：不要 overflow-hidden，改成 overflow-x-auto，tab 满了也不会“消失” */}
            <div
              ref={listRef}
              className="flex h-10 items-end gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap"
              style={{
                scrollbarWidth: "thin",
              }}
            >
              {tabs.map((tab, idx) => (
                <SortableTab
                  key={tab.id}
                  tab={tab}
                  active={tab.id === activeTabId}
                  onActivate={onActivate}
                  onClose={onClose}
                  // 最后一个不显示分割线
                  showDivider={idx !== tabs.length - 1}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* ✅ 真·更多菜单（只在溢出时可用） */}
      <div className="relative h-10 flex items-end" ref={moreWrapRef}>
        <Button
          variant="ghost"
          size="icon"
          title={isOverflowing ? "更多标签页" : "标签页未溢出"}
          onClick={toggleMore}
          // 未溢出时弱化按钮
          className={isOverflowing ? "" : "opacity-50 cursor-not-allowed"}
        >
          …
        </Button>

        {moreOpen && (
          <div className="absolute right-0 top-10 mt-2 w-72 rounded-xl border border-zinc-800 bg-zinc-950 shadow-lg overflow-hidden z-50">
            <div className="px-3 py-2 text-xs text-zinc-400 border-b border-zinc-800">
              {tabs.length} 个标签页
            </div>

            <div className="max-h-80 overflow-auto">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    onActivate(t.id);
                    setMoreOpen(false);
                  }}
                  className={[
                    "w-full px-3 py-2 text-left text-sm",
                    "hover:bg-zinc-900 transition-colors",
                    t.id === activeTabId ? "text-white bg-zinc-900/60" : "text-zinc-300",
                  ].join(" ")}
                  title={t.title}
                >
                  <span className="truncate block">{t.title}</span>
                </button>
              ))}
            </div>

            {activeTab && (
              <div className="border-t border-zinc-800 p-2">
                <button
                  className="w-full rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900"
                  onClick={() => {
                    onClose(activeTab.id);
                    setMoreOpen(false);
                  }}
                >
                  关闭当前
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
