import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Package, Link2, Network, Star } from "lucide-react";
import {
  listWorkflows,
  getWorkflow,
  createWorkflow,
  deleteWorkflow,
  listTools,
  getFavorites,
  updateFavorites,
  getToolMeta,
  updateToolMeta,
  type WorkflowFile,
  type ToolListItem,
} from "@/app/api";

type ToolDef = {
  id: string;
  name: string;
  group: string;
  tags: string[];
  defaultDesc: string;
};

type NodeItem = {
  id: string;
  toolId: string;
  title: string;
  x: number;
  y: number;
  color: string;
  inputFolder?: string;
  outputFolder?: string;
  collapsed?: boolean;
};

type Connection = {
  id: string;
  fromId: string;
  toId: string;
};

type SavedWorkflow = {
  id: string;
  name: string;
  createdAt: number;
  order: string[];
  nodes: NodeItem[];
  connections: Connection[];
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export default function ToolSelect() {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const panRefEl = useRef<HTMLDivElement | null>(null);
  const scaleRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const dragScreenRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const workspaceResizeRef = useRef<{ startY: number; origin: number } | null>(null);
  const panRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const inputRefs = useRef(new Map<string, HTMLDivElement>());
  const outputRefs = useRef(new Map<string, HTMLDivElement>());
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const inspectorRef = useRef<HTMLDivElement | null>(null);
  const [search, setSearch] = useState("");
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [activeDescId, setActiveDescId] = useState<string | null>(null);
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [pendingLink, setPendingLink] = useState<{ fromId: string; x: number; y: number } | null>(null);
  const [spaceName, setSpaceName] = useState("QC Workflow");
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [anchorMap, setAnchorMap] = useState<
    Record<string, { input?: { x: number; y: number }; output?: { x: number; y: number } }>
  >({});
  const [savedWorkflows, setSavedWorkflows] = useState<SavedWorkflow[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [toolPaths, setToolPaths] = useState<Record<string, string>>({});
  const [toolInspector, setToolInspector] = useState<{ toolId: string; x: number; y: number } | null>(null);
  const [inspectorDraft, setInspectorDraft] = useState({ desc: "", path: "" });
  const [tools, setTools] = useState<ToolListItem[]>([]);
  const [workspaceHeight, setWorkspaceHeight] = useState(560);

  const toolsView = useMemo<ToolDef[]>(
    () =>
      tools.map((tool) => ({
        id: tool.id,
        name: tool.name,
        group: tool.group ?? "",
        tags: tool.tags ?? [],
        defaultDesc: "",
      })),
    [tools],
  );

  useEffect(() => {
    let active = true;
    listWorkflows()
      .then((data) => {
        if (!active) return;
        setSavedWorkflows(data as SavedWorkflow[]);
        if (!data.length) {
          setActiveWorkflowId(null);
          setNodes([]);
          setConnections([]);
          setSpaceName("未命名节点图");
          return;
        }
        if (!activeWorkflowId && data[0]?.id) setActiveWorkflowId(data[0].id);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [activeWorkflowId]);

  useEffect(() => {
    let active = true;
    getFavorites()
      .then((data) => {
        if (!active) return;
        setFavorites(data.ids ?? []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    listTools()
      .then((data) => {
        if (!active) return;
        setTools(data.tools ?? []);
      })
      .catch(() => {
        setTools([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const wrap = searchWrapRef.current;
      if (!wrap) return;
      if (!wrap.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    if (!toolInspector) return;
    const toolId = toolInspector.toolId;
    getToolMeta(toolId)
      .then((meta) => {
        setDescriptions((prev) => ({ ...prev, [toolId]: meta.description ?? "" }));
        setToolPaths((prev) => ({ ...prev, [toolId]: meta.path ?? "" }));
        setInspectorDraft({
          desc: meta.description ?? "",
          path: meta.path ?? "",
        });
      })
      .catch(() => {
        setInspectorDraft({
          desc: "",
          path: "",
        });
      });
  }, [toolInspector, descriptions, toolPaths]);

  useEffect(() => {
    if (!activeDescId) return;
    const node = nodes.find((item) => item.id === activeDescId);
    if (!node) return;
    const toolId = node.toolId;
    getToolMeta(toolId)
      .then((meta) => {
        setDescriptions((prev) => ({ ...prev, [toolId]: meta.description ?? "" }));
      })
      .catch(() => {});
  }, [activeDescId, nodes]);

  useEffect(() => {
    if (!activeWorkflowId) return;
    getWorkflow(activeWorkflowId)
      .then((data) => {
        setNodes((data.nodes as NodeItem[]) ?? []);
        setConnections((data.connections as Connection[]) ?? []);
        setSpaceName(data.name);
      })
      .catch(() => {});
  }, [activeWorkflowId]);

  useEffect(() => {
    if (!toolInspector) return;
    const onDown = (e: MouseEvent) => {
      const panel = inspectorRef.current;
      if (!panel) return;
      if (!panel.contains(e.target as Node)) {
        setToolInspector(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setToolInspector(null);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [toolInspector]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return toolsView;
    return toolsView.filter((tool) => {
      return (
        tool.name.toLowerCase().includes(keyword) ||
        tool.group.toLowerCase().includes(keyword) ||
        tool.tags.some((tag) => tag.toLowerCase().includes(keyword))
      );
    });
  }, [search, toolsView]);

  const favoriteTools = useMemo(() => {
    return favorites
      .map((id) => toolsView.find((tool) => tool.id === id))
      .filter((tool): tool is ToolDef => Boolean(tool));
  }, [favorites, toolsView]);

  const filteredWorkflows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return savedWorkflows;
    return savedWorkflows.filter((flow) => {
      const nameMatch = flow.name.toLowerCase().includes(keyword);
      const orderMatch = flow.order
        .map((id) => flow.nodes.find((n) => n.id === id)?.title ?? "")
        .join(" ")
        .toLowerCase()
        .includes(keyword);
      return nameMatch || orderMatch;
    });
  }, [savedWorkflows, search]);

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      updateFavorites(next).catch(() => {});
      return next;
    });
  };

  const toWorld = (clientX: number, clientY: number) => {
    const scaleBounds = scaleRef.current?.getBoundingClientRect();
    if (scaleBounds) {
      return {
        x: (clientX - scaleBounds.left) / zoom,
        y: (clientY - scaleBounds.top) / zoom,
      };
    }
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: (clientX - bounds.left) / zoom,
      y: (clientY - bounds.top) / zoom,
    };
  };

  const addNode = (tool: ToolDef, position?: { x: number; y: number }) => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    const centerX = bounds ? (bounds.width / 2 - 140 - pan.x) / zoom : 80;
    const centerY = bounds ? (bounds.height / 2 - 70 - pan.y) / zoom : 80;
    const x = position ? position.x : centerX;
    const y = position ? position.y : centerY;
    setNodes((prev) => [
      ...prev,
      {
        id: uid(),
        toolId: tool.id,
        title: tool.name,
        x,
        y,
        color: "#7dd3fc",
        collapsed: false,
      },
    ]);
  };

  const buildOrder = () => {
    if (nodes.length === 0) return [];
    const adj = new Map<string, string[]>();
    connections.forEach((link) => {
      if (!adj.has(link.fromId)) adj.set(link.fromId, []);
      adj.get(link.fromId)?.push(link.toId);
    });
    const visited = new Set<string>();
    const order: string[] = [];
    const startId = nodes[0]?.id;
    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      order.push(id);
      const next = adj.get(id) ?? [];
      next.forEach(visit);
    };
    if (startId) visit(startId);
    nodes.forEach((node) => {
      if (!visited.has(node.id)) order.push(node.id);
    });
    return order;
  };

  const ensureUniqueName = (name: string, existing: SavedWorkflow[], currentId: string | null) => {
    const base = name.trim() || "workflow";
    const names = new Set(
      existing.filter((item) => item.id !== currentId).map((item) => item.name.toLowerCase())
    );
    if (!names.has(base.toLowerCase())) return base;
    let idx = 2;
    while (names.has(`${base}-${idx}`.toLowerCase())) idx += 1;
    return `${base}-${idx}`;
  };

  const saveWorkflow = () => {
    if (nodes.length === 0) return;
    const order = buildOrder();
    const nextName = ensureUniqueName(spaceName, savedWorkflows, activeWorkflowId);
    const payload = {
      name: nextName,
      order,
      nodes: nodes.map((node) => ({ ...node })),
      connections: connections.map((link) => ({ ...link })),
    };
    createWorkflow(payload as Omit<WorkflowFile, "id" | "createdAt">)
      .then((saved) => {
        setSavedWorkflows((prev) => {
          const rest = prev.filter((item) => item.id !== saved.id);
          return [saved as SavedWorkflow, ...rest];
        });
        setActiveWorkflowId(saved.id);
        setSpaceName(saved.name);
      })
      .catch(() => {});
  };

  const updateAnchors = () => {
    const next: Record<string, { input?: { x: number; y: number }; output?: { x: number; y: number } }> = {};
    const bounds = scaleRef.current?.getBoundingClientRect();
    if (!bounds) return;
    inputRefs.current.forEach((el, id) => {
      const rect = el.getBoundingClientRect();
      next[id] = next[id] ?? {};
      next[id].input = {
        x: (rect.left - bounds.left + rect.width / 2) / zoom,
        y: (rect.top - bounds.top + rect.height / 2) / zoom,
      };
    });
    outputRefs.current.forEach((el, id) => {
      const rect = el.getBoundingClientRect();
      next[id] = next[id] ?? {};
      next[id].output = {
        x: (rect.left - bounds.left + rect.width / 2) / zoom,
        y: (rect.top - bounds.top + rect.height / 2) / zoom,
      };
    });
    setAnchorMap(next);
  };

  useEffect(() => {
    const raf = requestAnimationFrame(updateAnchors);
    return () => cancelAnimationFrame(raf);
  }, [nodes, connections, pan, zoom]);

  useEffect(() => {
    const onResize = () => updateAnchors();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      const dragScreen = dragScreenRef.current;
      const panDrag = panRef.current;
      if (!drag && !panDrag && !dragScreen) return;
      if (panDrag) {
        setPan({
          x: panDrag.originX + (e.clientX - panDrag.startX),
          y: panDrag.originY + (e.clientY - panDrag.startY),
        });
        return;
      }
      if (dragScreen) {
        const nextX = dragScreen.originX + (e.clientX - dragScreen.startX) / zoom;
        const nextY = dragScreen.originY + (e.clientY - dragScreen.startY) / zoom;
        setNodes((prev) =>
          prev.map((node) => (node.id === dragScreen.id ? { ...node, x: nextX, y: nextY } : node))
        );
        return;
      }
      if (!drag) return;
      const world = toWorld(e.clientX, e.clientY);
      const nextX = world.x - drag.offsetX;
      const nextY = world.y - drag.offsetY;
      setNodes((prev) => prev.map((node) => (node.id === drag.id ? { ...node, x: nextX, y: nextY } : node)));
    };
    const onUp = () => {
      dragRef.current = null;
      dragScreenRef.current = null;
      panRef.current = null;
      setIsPanning(false);
      setPendingLink((prev) => (prev ? null : prev));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!pendingLink) return;
      const world = toWorld(e.clientX, e.clientY);
      setPendingLink((prev) => (prev ? { ...prev, x: world.x, y: world.y } : prev));
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
    };
  }, [pendingLink]);

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

  return (
    <div className="h-full">
      <div className="rounded-2xl border border-white/20 bg-gradient-to-br from-white/70 via-white/30 to-white/10 p-4 shadow-xl backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-lg font-semibold text-zinc-900">工具选择</div>
          <div className="flex items-center gap-2">
            <div
              ref={searchWrapRef}
              className="relative z-[60] flex items-center gap-2 rounded-full border border-white/40 bg-white/40 px-3 py-2 text-sm text-zinc-700 shadow-sm backdrop-blur-lg"
            >
              <Search className="h-4 w-4 text-zinc-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setSearchOpen(true)}
                onClick={() => setSearchOpen(true)}
                placeholder="搜索工具"
                className="w-72 bg-transparent text-sm text-zinc-700 placeholder:text-zinc-400 focus:outline-none"
              />
              {searchOpen && (
                <div className="absolute left-0 top-[calc(100%+8px)] z-[9999] w-[360px] rounded-xl border border-white/40 bg-white p-2 text-xs text-zinc-700 shadow-xl">
                  <div className="mb-2 px-2 text-[10px] uppercase tracking-widest text-zinc-500">全部工具</div>
                  <div className="min-h-[140px] max-h-[420px] resize-y space-y-1 overflow-auto rounded-lg border border-zinc-200/70 bg-white">
                    {filtered.map((tool) => {
                      const isFav = favorites.includes(tool.id);
                      return (
                        <div
                          key={tool.id}
                          className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-white"
                          onDoubleClick={() => addNode(tool)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setToolInspector({ toolId: tool.id, x: e.clientX, y: e.clientY });
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <Package className="h-3.5 w-3.5 text-sky-500" />
                            <div>
                              <div className="text-xs font-medium">{tool.name}</div>
                            </div>
                          </div>
                          <button
                            className={[
                              "rounded-full border px-1 text-[10px]",
                              isFav
                                ? "border-yellow-400/70 text-yellow-500 bg-yellow-50/70"
                                : "border-yellow-200/60 text-yellow-500 bg-yellow-50/30",
                            ].join(" ")}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(tool.id);
                            }}
                            title={isFav ? "移出快捷工具库" : "添加到快捷工具库"}
                          >
                            <Star className={isFav ? "h-4 w-4 fill-yellow-400" : "h-4 w-4"} />
                          </button>
                        </div>
                      );
                    })}
                    {filtered.length === 0 && <div className="px-2 py-1 text-xs text-zinc-500">没有匹配的工具</div>}
                  </div>
                  <div className="mt-3 mb-2 px-2 text-[10px] uppercase tracking-widest text-zinc-500">
                    已保存节点图
                  </div>
                  <div className="min-h-[80px] max-h-[260px] resize-y space-y-1 overflow-auto rounded-lg border border-zinc-200/70 bg-white">
                    {filteredWorkflows.map((flow) => (
                      <div
                        key={flow.id}
                        className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white"
                        onDoubleClick={() => {
                          setActiveWorkflowId(flow.id);
                          setSearchOpen(false);
                        }}
                      >
                        <Network className="h-3.5 w-3.5 text-red-500" />
                        <div>
                          <div className="text-xs font-medium">{flow.name}</div>
                        </div>
                      </div>
                    ))}
                    {filteredWorkflows.length === 0 && (
                      <div className="px-2 py-1 text-xs text-zinc-500">没有匹配的节点图</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={saveWorkflow}
              className="rounded-full border border-blue-500/40 bg-blue-500/80 px-4 py-2 text-sm text-white shadow-sm hover:bg-blue-500"
              title="保存当前工作流"
            >
              保存
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-[280px_1fr] gap-4 items-stretch" style={{ height: workspaceHeight }}>
          <div className="rounded-xl border border-white/30 bg-white/40 p-3 shadow-sm backdrop-blur-md h-full">
            <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">工具库</div>
            <div className="h-full space-y-3 overflow-y-auto pr-1">
              <div className="space-y-2">
                {favoriteTools.map((tool) => {
                  const isFav = favorites.includes(tool.id);
                  return (
                    <div
                      key={tool.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", tool.id);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onDoubleClick={() => addNode(tool)}
                      className="group flex items-center justify-between gap-2 rounded-lg border border-white/50 bg-white/60 px-3 py-2 text-sm text-zinc-700 shadow-sm hover:bg-white/80"
                    >
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-sky-500" />
                        <div>
                          <div className="font-medium">{tool.name}</div>
                        </div>
                      </div>
                      <button
                        className={[
                          "rounded-full border px-1 text-[10px]",
                          isFav
                            ? "border-yellow-400/70 text-yellow-500 bg-yellow-50/70"
                            : "border-transparent text-zinc-300 opacity-0 group-hover:opacity-100",
                        ].join(" ")}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(tool.id);
                        }}
                        title={isFav ? "移出快捷工具库" : "添加到快捷工具库"}
                      >
                        <Star className={isFav ? "h-4 w-4 fill-yellow-400" : "h-4 w-4"} />
                      </button>
                    </div>
                  );
                })}
                {favoriteTools.length === 0 && <div className="text-xs text-zinc-500">暂无收藏工具</div>}
              </div>

              <div className="border-t border-white/40 pt-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">已保存节点图</div>
                <div className="space-y-2">
                  {filteredWorkflows.length === 0 && <div className="text-xs text-zinc-500">暂无保存记录</div>}
                  {filteredWorkflows.map((flow) => (
                    <div
                      key={flow.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setActiveWorkflowId(flow.id);
                        getWorkflow(flow.id)
                          .then((data) => {
                            setNodes((data.nodes as NodeItem[]) ?? []);
                            setConnections((data.connections as Connection[]) ?? []);
                            setSpaceName(data.name);
                          })
                          .catch(() => {});
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setActiveWorkflowId(flow.id);
                          getWorkflow(flow.id)
                            .then((data) => {
                              setNodes((data.nodes as NodeItem[]) ?? []);
                              setConnections((data.connections as Connection[]) ?? []);
                              setSpaceName(data.name);
                            })
                            .catch(() => {});
                        }
                      }}
                      className={[
                        "w-full rounded-lg border px-3 py-2 text-left text-xs shadow-sm",
                        activeWorkflowId === flow.id
                          ? "border-zinc-800 bg-zinc-900/90 text-white"
                          : "border-white/50 bg-white/60 text-zinc-700",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between gap-2 font-semibold text-zinc-800">
                        <div className="flex items-center gap-2">
                          <Network className="h-4 w-4 text-red-500" />
                          <span className={activeWorkflowId === flow.id ? "text-white" : ""}>{flow.name}</span>
                        </div>
                        <button
                          className="rounded-full border border-red-400/50 px-1 text-[10px] text-red-500 hover:bg-red-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteWorkflow(flow.id)
                              .then(() => {
                                setSavedWorkflows((prev) => prev.filter((item) => item.id !== flow.id));
                                if (activeWorkflowId === flow.id) {
                                  setActiveWorkflowId(null);
                                  setNodes([]);
                                  setConnections([]);
                                }
                              })
                              .catch(() => {});
                          }}
                          title="删除保存记录"
                        >
                          ×
                        </button>
                      </div>
                      <div className="mt-1 text-[11px] text-zinc-500">
                        节点 {flow.nodes.length} · 连线 {flow.connections.length}
                      </div>
                      <div className="mt-1 text-[10px] text-zinc-400">
                        顺序：{flow.order.map((id) => flow.nodes.find((n) => n.id === id)?.title ?? id).join(" → ")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="relative h-full">
            <div className="absolute -top-3 left-3 z-10 rounded-lg border border-white/60 bg-zinc-100/80 px-2 py-1 text-xs text-zinc-600 shadow-sm backdrop-blur">
              <input
                value={spaceName}
                onChange={(e) => setSpaceName(e.target.value)}
                className="w-40 bg-transparent text-xs text-zinc-600 placeholder:text-zinc-400 focus:outline-none"
                placeholder="工作空间命名"
              />
            </div>
            <div
              ref={canvasRef}
              className={[
                "relative h-full min-h-0 overflow-hidden rounded-xl border border-dashed border-white/50",
                "bg-gradient-to-br from-white/50 via-white/20 to-white/10 p-4 shadow-inner backdrop-blur-lg",
                isPanning ? "cursor-grabbing" : "cursor-grab",
              ].join(" ")}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const toolId = e.dataTransfer.getData("text/plain");
                const tool = toolsView.find((t) => t.id === toolId);
                if (!tool) return;
                const world = toWorld(e.clientX, e.clientY);
                addNode(tool, { x: world.x - 120, y: world.y - 40 });
              }}
              onMouseUp={() => {
                if (pendingLink) setPendingLink(null);
              }}
              onMouseLeave={() => {
                dragRef.current = null;
                panRef.current = null;
                setIsPanning(false);
              }}
              onMouseDown={(e) => {
                setIsPanning(true);
                panRef.current = {
                  startX: e.clientX,
                  startY: e.clientY,
                  originX: pan.x,
                  originY: pan.y,
                };
              }}
              onWheel={(e) => {
                if (!e.ctrlKey) return;
                e.preventDefault();
                const next = Math.max(0.5, Math.min(2, Number((zoom - e.deltaY * 0.001).toFixed(2))));
                setZoom(next);
              }}
            >
              <div
                ref={panRefEl}
                className="absolute inset-0"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}
              >
                <div
                  ref={scaleRef}
                  className="absolute inset-0"
                  style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
                >
                  <svg className="pointer-events-none absolute inset-0 z-30 h-full w-full">
                  {connections.map((link) => {
                    const from = anchorMap[link.fromId]?.output;
                    const to = anchorMap[link.toId]?.input;
                    if (!from || !to) return null;
                    return (
                      <path
                        key={link.id}
                        d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`}
                        stroke="rgb(30, 41, 59)"
                        strokeWidth="2"
                        fill="none"
                      />
                    );
                  })}
                  {pendingLink && anchorMap[pendingLink.fromId]?.output && (
                    <path
                      d={`M ${anchorMap[pendingLink.fromId]?.output?.x} ${anchorMap[pendingLink.fromId]?.output?.y} L ${pendingLink.x} ${pendingLink.y}`}
                      stroke="rgb(59, 130, 246)"
                      strokeWidth="2"
                      fill="none"
                    />
                  )}
                </svg>

                  {nodes.map((node) => {
                    const tool = toolsView.find((t) => t.id === node.toolId);
                    const desc = tool ? descriptions[tool.id] ?? tool.defaultDesc : "";
                    return (
                      <div
                        key={node.id}
                        className="absolute z-20"
                        style={{ left: node.x, top: node.y }}
                        onMouseEnter={() => setActiveDescId(node.id)}
                        onMouseLeave={() => {
                          if (activeDescId === node.id) setActiveDescId(null);
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                        }}
                      >
                    <div
                      className={[
                        "w-[190px] rounded-2xl border border-white/40 bg-white/25 shadow-lg backdrop-blur-xl",
                        node.collapsed ? "p-1" : "p-2",
                      ].join(" ")}
                      style={{ boxShadow: `0 16px 28px -20px ${node.color}` }}
                    >
                      <div
                        className="flex items-center justify-between gap-2 rounded-xl bg-zinc-800/90 px-2 py-1 text-sm text-zinc-100"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          dragScreenRef.current = {
                            id: node.id,
                            startX: e.clientX,
                            startY: e.clientY,
                            originX: node.x,
                            originY: node.y,
                          };
                        }}
                      >
                        <div className="flex min-w-0 items-center gap-2 font-semibold text-zinc-100">
                          <label
                            className="relative h-3 w-3 cursor-pointer rounded-full"
                            style={{ backgroundColor: node.color }}
                            title="调整节点颜色"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="color"
                              value={node.color}
                              onChange={(e) =>
                                setNodes((prev) =>
                                  prev.map((item) => (item.id === node.id ? { ...item, color: e.target.value } : item))
                                )
                              }
                              className="absolute inset-0 cursor-pointer opacity-0"
                            />
                          </label>
                          <span className="truncate">{node.title}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            className="rounded-full border border-white/30 px-1 text-xs text-white/80 hover:bg-white/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              setNodes((prev) =>
                                prev.map((item) =>
                                  item.id === node.id ? { ...item, collapsed: !item.collapsed } : item
                                )
                              );
                            }}
                            title={node.collapsed ? "展开" : "最小化"}
                          >
                            {node.collapsed ? "▢" : "–"}
                          </button>
                          <button
                            className="rounded-full border border-white/30 px-1 text-xs text-white/80 hover:bg-white/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              setNodes((prev) => prev.filter((item) => item.id !== node.id));
                              setConnections((prev) =>
                                prev.filter((link) => link.fromId !== node.id && link.toId !== node.id)
                              );
                            }}
                            title="删除节点"
                          >
                            ×
                          </button>
                        </div>
                      </div>

                      {!node.collapsed && (
                        <div className="mt-2 space-y-2 text-[11px] text-zinc-500">
                          <div>
                            <div className="mb-1 text-[10px] text-zinc-500">命名输入文件夹</div>
                            <input
                              value={node.inputFolder ?? ""}
                              onChange={(e) => {
                                const value = e.target.value;
                                setNodes((prev) =>
                                  prev.map((item) =>
                                    item.id === node.id
                                      ? { ...item, inputFolder: value.trim() ? value : undefined }
                                      : item
                                  )
                                );
                              }}
                              placeholder="例如 raw_data"
                              className="w-full rounded-md border border-white/60 bg-white/70 px-2 py-1 text-[11px] text-zinc-600 outline-none"
                            />
                          </div>
                          <div>
                            <div className="mb-1 text-[10px] text-zinc-500">命名输出文件夹</div>
                            <input
                              value={node.outputFolder ?? ""}
                              onChange={(e) => {
                                const value = e.target.value;
                                setNodes((prev) =>
                                  prev.map((item) =>
                                    item.id === node.id
                                      ? { ...item, outputFolder: value.trim() ? value : undefined }
                                      : item
                                  )
                                );
                              }}
                              placeholder="例如 qc_output"
                              className="w-full rounded-md border border-white/60 bg-white/70 px-2 py-1 text-[11px] text-zinc-600 outline-none"
                            />
                          </div>
                        </div>
                      )}

                      <div className={node.collapsed ? "mt-1 flex items-center justify-between" : "mt-3 flex items-center justify-between"}>
                        <div
                          ref={(el) => {
                            if (el) inputRefs.current.set(node.id, el);
                          }}
                          className={
                            node.collapsed
                              ? "h-2 w-2 rounded-sm border border-white/60 bg-white/60 shadow-sm"
                              : "h-3 w-3 rounded-sm border border-white/70 bg-white/70 shadow-sm"
                          }
                          title="输入"
                          onMouseUp={() => {
                            if (!pendingLink) return;
                            setConnections((prev) => [
                              ...prev,
                              { id: uid(), fromId: pendingLink.fromId, toId: node.id },
                            ]);
                            setPendingLink(null);
                          }}
                        />
                        {!node.collapsed && (
                          <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                            <Link2 className="h-3 w-3" />
                            输出
                          </div>
                        )}
                        <div
                          ref={(el) => {
                            if (el) outputRefs.current.set(node.id, el);
                          }}
                          className={
                            node.collapsed
                              ? "h-2 w-2 rounded-sm border border-sky-200 bg-sky-200 shadow-sm"
                              : "h-3 w-3 rounded-sm border border-sky-200 bg-sky-200 shadow-sm"
                          }
                          title="输出"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            const start = anchorMap[node.id]?.output;
                            if (!start) return;
                            setPendingLink({ fromId: node.id, x: start.x, y: start.y });
                          }}
                        />
                      </div>
                    </div>

                    {activeDescId === node.id && tool && (
                      <div
                        className="absolute left-0 top-[calc(100%+8px)] w-[280px] rounded-xl border border-white/50 bg-white/80 p-3 text-xs text-zinc-600 shadow-lg backdrop-blur"
                        onMouseEnter={() => setActiveDescId(node.id)}
                        onMouseLeave={() => setActiveDescId(null)}
                      >
                        <div className="mb-2 text-[10px] uppercase tracking-widest text-zinc-400">节点介绍</div>
                        <textarea
                          value={desc}
                          onChange={(e) =>
                            setDescriptions((prev) => ({
                              ...prev,
                              [tool.id]: e.target.value,
                            }))
                          }
                          onBlur={(e) => {
                            const next = e.currentTarget.value.trim();
                            updateToolMeta(tool.id, { description: next })
                              .then((meta) => {
                                setDescriptions((prev) => ({ ...prev, [tool.id]: meta.description ?? "" }));
                              })
                              .catch(() => {});
                          }}
                          className="h-20 w-full rounded-md border border-white/70 bg-white/70 p-2 text-xs text-zinc-700 outline-none"
                        />
                        <div className="mt-2 text-[10px] text-zinc-400">离开输入框后自动保存</div>
                      </div>
                    )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="absolute bottom-3 right-3 z-40 flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-2 py-1 text-xs text-zinc-600 shadow-sm backdrop-blur">
                <button
                  className="rounded-full px-2 py-0.5 hover:bg-white"
                  onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(2))))}
                >
                  −
                </button>
                <button
                  className="rounded-full px-2 py-0.5 hover:bg-white"
                  onClick={() => setZoom(1)}
                  title="重置缩放"
                >
                  {(zoom * 100).toFixed(0)}%
                </button>
                <button
                  className="rounded-full px-2 py-0.5 hover:bg-white"
                  onClick={() => setZoom((z) => Math.min(2, Number((z + 0.1).toFixed(2))))}
                >
                  +
                </button>
              </div>
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
      {toolInspector && (
        <div
          ref={inspectorRef}
          className="fixed z-[10000] w-[280px] rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-600 shadow-xl"
          style={{ left: toolInspector.x, top: toolInspector.y }}
        >
          <div className="mb-2 text-[10px] uppercase tracking-widest text-zinc-400">工具属性</div>
          <div className="mb-2 text-xs font-semibold text-zinc-800">
            {toolsView.find((t) => t.id === toolInspector.toolId)?.name ?? "工具"}
          </div>
          <div className="space-y-2">
            <div>
              <div className="mb-1 text-[10px] text-zinc-500">文件位置</div>
              <input
                value={inspectorDraft.path}
                onChange={(e) => setInspectorDraft((prev) => ({ ...prev, path: e.target.value }))}
                className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-700 outline-none"
                placeholder="/usr/local/bin/..."
              />
            </div>
            <div>
              <div className="mb-1 text-[10px] text-zinc-500">描述</div>
              <textarea
                value={inspectorDraft.desc}
                onChange={(e) => setInspectorDraft((prev) => ({ ...prev, desc: e.target.value }))}
                className="h-20 w-full rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-700 outline-none"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
              onClick={() => setToolInspector(null)}
            >
              取消
            </button>
            <button
              className="rounded-md border border-blue-500/40 bg-blue-500/80 px-2 py-1 text-xs text-white hover:bg-blue-500"
              onClick={() => {
                const id = toolInspector.toolId;
                const payload = {
                  path: inspectorDraft.path.trim(),
                  description: inspectorDraft.desc.trim(),
                };
                updateToolMeta(id, payload)
                  .then((meta) => {
                    setToolPaths((prev) => ({ ...prev, [id]: meta.path ?? "" }));
                    setDescriptions((prev) => ({ ...prev, [id]: meta.description ?? "" }));
                  })
                  .finally(() => {
                    setToolInspector(null);
                  });
              }}
            >
              保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
