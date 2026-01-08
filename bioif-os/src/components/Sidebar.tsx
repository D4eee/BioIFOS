import { getSidebarItems } from "@/app/tabRegistry";
import type { AppPageType } from "@/app/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppSettings } from "@/app/useAppSettings";
import {
  Folder,
  Activity,
  Network,
  Hammer,
  Sparkles,
  TerminalSquare,
  FileText,
  FileSearch,
  Settings as SettingsIcon,
  User,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

const ICONS: Record<AppPageType, React.FC<{ className?: string }>> = {
  fileManager: Folder,
  filePreview: FileSearch,
  currentTasks: Activity,
  scriptOps: FileText,
  toolSelect: Network,
  workflowBuilder: Sparkles,
  resultsTerminal: TerminalSquare,
  toolBuilder: Hammer,
  settings: SettingsIcon,
  account: User,
};

export default function Sidebar({
  collapsed,
  width,
  collapsedWidth,
  onToggleCollapsed,
  onStartResizeDrag,
  onOpenTab,
  username,
}: {
  collapsed: boolean;
  width: number;
  collapsedWidth: number;
  onToggleCollapsed: () => void;
  onStartResizeDrag: (e: React.MouseEvent) => void;
  onOpenTab: (t: AppPageType) => void;
  username: string;
}) {
  const { settings } = useAppSettings();
  const sidebarWidth = collapsed ? collapsedWidth : width;

  return (
    <div
      className="relative h-full border-r border-zinc-800 bg-zinc-950 text-zinc-100"
      style={{ width: sidebarWidth }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-zinc-800">
        <div className="h-8 w-8 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-semibold">
          BIO
        </div>

        {!collapsed && (
          <div className="text-sm font-semibold truncate">
            BioIF OS
            {username ? (
              <div className="text-[10px] text-zinc-400">👤 {username}</div>
            ) : null}
          </div>
        )}

        <div className="ml-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "展开菜单栏" : "折叠菜单栏"}
            title={collapsed ? "展开菜单栏" : "折叠菜单栏"}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Nav */}
      <div className="p-2 space-y-1">
        {getSidebarItems(settings.language).map((it) => {
          const Icon = ICONS[it.type];

          return (
            <button
              key={it.type}
              title={collapsed ? it.label : undefined}
              onClick={() => onOpenTab(it.type)}
              className={cn(
                "w-full rounded-xl px-3 py-2 text-left text-sm",
                "text-zinc-200 hover:bg-zinc-900 hover:text-white transition-colors",
                "flex items-center gap-3"
              )}
            >
              <Icon className="h-4 w-4 shrink-0 text-zinc-300" />
              {!collapsed && <span className="truncate">{it.label}</span>}
            </button>
          );
        })}
      </div>

      {/* Resize Handle (only when expanded) */}
      {!collapsed && (
        <div
          className="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-zinc-700/50"
          onMouseDown={onStartResizeDrag}
          role="separator"
          aria-orientation="vertical"
          aria-label="调整侧边栏宽度"
        />
      )}
    </div>
  );
}
