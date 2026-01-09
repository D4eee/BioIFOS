import Sidebar from "@/components/Sidebar";
import TabBar from "@/components/TabBar";
import FloatingWindows from "@/components/FloatingWindows";
import { getPageTitles } from "@/app/tabRegistry";
import type { AppPageType, AppTab, FloatingWindow } from "@/app/types";
import { useLocalStorageState } from "@/app/useLocalStorageState";

import FileManager from "@/pages/FileManager";
import FilePreview from "@/pages/FilePreview";
import CurrentTasks from "@/pages/CurrentTasks";
import ScriptOps from "@/pages/ScriptOps";
import ToolSelect from "@/pages/ToolSelect";
import WorkflowBuilder from "@/pages/WorkflowBuilder";
import ToolBuilder from "@/pages/ToolBuilder";
import ResultsTerminal from "@/pages/ResultsTerminal";
import Settings from "@/pages/Settings";
import Account from "@/pages/Account";
import { useEffect, useRef, useState } from "react";
import Auth from "@/pages/Auth";
import { authMe, clearAuthToken, type AuthUser } from "@/app/api";
import { AppSettingsProvider, useAppSettings } from "@/app/useAppSettings";

const LS_KEY = "bioif_os_state_v1";

type Persisted = {
  tabs: AppTab[];
  activeTabId: string | null;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  floatingWindows?: FloatingWindow[];
  zCounter?: number;
  droppedRefs?: Record<string, string[]>;
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

const RENDER: Record<AppPageType, React.FC> = {
  fileManager: FileManager,
  filePreview: FilePreview,
  currentTasks: CurrentTasks,
  scriptOps: ScriptOps,
  toolSelect: ToolSelect,
  workflowBuilder: WorkflowBuilder,
  resultsTerminal: ResultsTerminal,
  toolBuilder: ToolBuilder,
  settings: Settings,
  account: Account,
};

export default function AppShell() {
  return (
    <AppSettingsProvider>
      <AppShellInner />
    </AppSettingsProvider>
  );
}

function AppShellInner() {
  const { settings, applySettings } = useAppSettings();
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [state, setState] = useLocalStorageState<Persisted>(LS_KEY, {
    tabs: [],
    activeTabId: null,
    sidebarWidth: 280,
    sidebarCollapsed: false,
    floatingWindows: [],
    zCounter: 1,
    droppedRefs: {},
  });
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const tabBarRef = useRef<HTMLDivElement | null>(null);

  const MIN_SIDEBAR_WIDTH = 220;
  const MAX_SIDEBAR_WIDTH = 440;
  const COLLAPSED_WIDTH = 72;

  const draggingRef = useRef(false);

  const onStartResizeDrag = (e: React.MouseEvent) => {
    draggingRef.current = true;
    e.preventDefault();
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const next = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, e.clientX));
      setState({ ...state, sidebarWidth: next });
    };
    const onUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [state, setState]);

  useEffect(() => {
    let active = true;
    authMe()
      .then((data) => {
        if (!active) return;
        setUser(data);
      })
      .catch(() => {
        clearAuthToken();
        setUser(null);
      })
      .finally(() => {
        if (active) setAuthChecked(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    applySettings();
  }, [settings, applySettings]);

  const makeTitle = (type: AppPageType) => {
    const base = getPageTitles(settings.language)[type];
    const count = state.tabs.filter((t) => t.type === type).length;
    return count === 0 ? base : `${base}-${count + 1}`;
  };

  const openTab = (type: AppPageType, forceNew = false) => {
    if (!forceNew) {
      for (let i = state.tabs.length - 1; i >= 0; i -= 1) {
        const tab = state.tabs[i];
        if (tab.type === type) {
          setState({ ...state, activeTabId: tab.id });
          return;
        }
      }
    }
    const tab: AppTab = { id: uid(), type, title: makeTitle(type), createdAt: Date.now() };
    setState({ ...state, tabs: [...state.tabs, tab], activeTabId: tab.id });
  };

  const closeTab = (id: string) => {
    const idx = state.tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;

    const nextTabs = state.tabs.filter((t) => t.id !== id);

    if (state.activeTabId !== id) {
      setState({ ...state, tabs: nextTabs });
      return;
    }

    const leftId = idx - 1 >= 0 ? state.tabs[idx - 1].id : nextTabs[0]?.id ?? null;
    setState({ ...state, tabs: nextTabs, activeTabId: leftId });
  };


  const detachTab = (id: string, point: { x: number; y: number }) => {
    const tab = state.tabs.find((t) => t.id === id);
    if (!tab) return;
    const nextTabs = state.tabs.filter((t) => t.id !== id);
    const nextActive = state.activeTabId === id ? nextTabs[0]?.id ?? null : state.activeTabId;
    const bounds = workspaceRef.current?.getBoundingClientRect();
    const width = 360;
    const height = 260;
    const x = bounds ? Math.max(0, Math.min(bounds.width - width, point.x - bounds.left - width / 2)) : 40;
    const y = bounds ? Math.max(0, Math.min(bounds.height - height, point.y - bounds.top - 24)) : 40;
    const z = state.zCounter ?? 1;
    const floating: FloatingWindow = {
      id: tab.id,
      tab,
      x,
      y,
      width,
      height,
      z,
    };
    setState({
      ...state,
      tabs: nextTabs,
      activeTabId: nextActive,
      floatingWindows: [...(state.floatingWindows ?? []), floating],
      zCounter: z + 1,
    });
  };

  const updateWindow = (id: string, patch: Partial<FloatingWindow>) => {
    setState((prev) => {
      const nextWindows = (prev.floatingWindows ?? []).map((w) => (w.id === id ? { ...w, ...patch } : w));
      return { ...prev, floatingWindows: nextWindows };
    });
  };

  const focusWindow = (id: string) => {
    const nextZ = (state.zCounter ?? 1) + 1;
    const nextWindows = (state.floatingWindows ?? []).map((w) => (w.id === id ? { ...w, z: nextZ } : w));
    setState({ ...state, floatingWindows: nextWindows, zCounter: nextZ });
  };

  const closeWindow = (id: string) => {
    const nextWindows = (state.floatingWindows ?? []).filter((w) => w.id !== id);
    const nextRefs = { ...(state.droppedRefs ?? {}) };
    delete nextRefs[id];
    setState({ ...state, floatingWindows: nextWindows, droppedRefs: nextRefs });
  };

  const dockWindow = (id: string) => {
    const win = (state.floatingWindows ?? []).find((w) => w.id === id);
    if (!win) return;
    const nextWindows = (state.floatingWindows ?? []).filter((w) => w.id !== id);
    const nextTabs = [...state.tabs, win.tab];
    setState({ ...state, floatingWindows: nextWindows, tabs: nextTabs, activeTabId: win.tab.id });
  };

  const dropFileRef = (id: string, path: string) => {
    const refs = state.droppedRefs ?? {};
    const next = [...(refs[id] ?? []), path].slice(-6);
    setState({ ...state, droppedRefs: { ...refs, [id]: next } });
  };

  if (!authChecked) {
    return <div className="h-screen w-screen bg-zinc-950" />;
  }

  if (!user) {
    return <Auth onAuth={(nextUser) => setUser(nextUser)} />;
  }

  return (
    <div className="h-screen w-screen bg-zinc-950 text-zinc-100">
      <div className="flex h-full w-full">
        <Sidebar
          collapsed={state.sidebarCollapsed}
          width={state.sidebarWidth}
          collapsedWidth={COLLAPSED_WIDTH}
          onToggleCollapsed={() => setState({ ...state, sidebarCollapsed: !state.sidebarCollapsed })}
          onStartResizeDrag={onStartResizeDrag}
          onOpenTab={openTab}
          username={user?.username ?? ""}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <TabBar
            tabs={state.tabs}
            activeTabId={state.activeTabId}
            onActivate={(id) => setState({ ...state, activeTabId: id })}
            onClose={closeTab}
            onReorder={(tabs) => setState({ ...state, tabs })}
            onDetach={detachTab}
            outerRef={tabBarRef}
          />

          {/* ✅ 工作区：浅灰背景 + 深色文字 */}
          <div ref={workspaceRef} className="relative min-h-0 flex-1 overflow-hidden bg-zinc-500 text-zinc-900">
            <div className="h-full overflow-auto p-4">
              {state.tabs.length === 0 && <div className="text-zinc-700">还没有打开任何页面。</div>}
              {state.tabs.map((tab) => {
                const Page = RENDER[tab.type];
                const isActive = tab.id === state.activeTabId;
                return (
                  <div key={tab.id} style={{ display: isActive ? "block" : "none" }}>
                    <Page />
                  </div>
                );
              })}
            </div>
            <FloatingWindows
              windows={state.floatingWindows ?? []}
              boundsRef={workspaceRef}
              dockRef={tabBarRef}
              droppedRefs={state.droppedRefs ?? {}}
              onFocus={focusWindow}
              onMove={(id, x, y) => updateWindow(id, { x, y })}
              onResize={(id, width, height) => updateWindow(id, { width, height })}
              onClose={closeWindow}
              onDock={dockWindow}
              onDropFile={dropFileRef}
              renderContent={(tab) => {
                const Page = RENDER[tab.type];
                return <Page />;
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
