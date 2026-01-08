import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import {
  listWorkflows,
  getWorkflow,
  getToolMeta,
  updateToolMeta,
  createCommandScript,
  getBfsScriptsRoot,
  uploadBfsScript,
  type ToolMeta,
} from "@/app/api";

type NodeItem = {
  id: string;
  toolId: string;
  title: string;
  x: number;
  y: number;
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

type EditorMode = "note" | "curl" | "params";

type EditorState = {
  nodeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  mode: EditorMode;
  paramMode: boolean;
};

const SCRIPT_NAME_TOKEN = "__SCRIPT_NAME__";
const PARAM_PREFIX = "VariP:";

function safeLabel(value: string) {
  const cleaned = value
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "node";
}

function buildNodeOrder(nodes: NodeItem[], connections: Connection[], order: string[]) {
  if (nodes.length <= 1) return nodes;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const orderIndex = new Map(order.map((id, idx) => [id, idx]));
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  nodes.forEach((node) => {
    adjacency.set(node.id, []);
    indegree.set(node.id, 0);
  });

  connections.forEach((link) => {
    if (!byId.has(link.fromId) || !byId.has(link.toId)) return;
    adjacency.get(link.fromId)?.push(link.toId);
    indegree.set(link.toId, (indegree.get(link.toId) ?? 0) + 1);
  });

  const compare = (a: string, b: string) => {
    const ai = orderIndex.get(a) ?? Number.MAX_SAFE_INTEGER;
    const bi = orderIndex.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b);
  };

  const queue = nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id)
    .sort(compare);

  const result: string[] = [];
  while (queue.length) {
    const current = queue.shift();
    if (!current) break;
    result.push(current);
    const neighbors = adjacency.get(current) ?? [];
    neighbors.forEach((next) => {
      indegree.set(next, (indegree.get(next) ?? 0) - 1);
      if ((indegree.get(next) ?? 0) === 0) {
        queue.push(next);
        queue.sort(compare);
      }
    });
  }

  if (result.length !== nodes.length) {
    const inOrder = order.filter((id) => byId.has(id));
    const remaining = nodes.map((node) => node.id).filter((id) => !inOrder.includes(id)).sort(compare);
    return [...inOrder, ...remaining].map((id) => byId.get(id)!).filter(Boolean);
  }

  return result.map((id) => byId.get(id)!).filter(Boolean);
}

function buildCommandScript(options: {
  flow: SavedWorkflow;
  nodes: NodeItem[];
  connections: Connection[];
  toolMetaMap: Record<string, ToolMeta>;
  drafts: Record<string, { description: string; curlTemplate: string; paramDescription: string }>;
  paramValues: Record<string, Record<string, string>>;
}) {
  const { flow, nodes, connections, toolMetaMap, drafts, paramValues } = options;
  const orderedNodes = buildNodeOrder(nodes, connections, flow.order ?? []);
  const nodeIndex = new Map(orderedNodes.map((node, idx) => [node.id, idx + 1]));
  const titleCounts = new Map<string, number>();
  const displayNameMap = new Map<string, string>();
  const folderMap = new Map<string, string>();
  orderedNodes.forEach((node) => {
    const base = node.title || node.id;
    const count = (titleCounts.get(base) ?? 0) + 1;
    titleCounts.set(base, count);
    const displayName = count > 1 ? `${base}-${count}` : base;
    displayNameMap.set(node.id, displayName);
    const index = nodeIndex.get(node.id) ?? 0;
    folderMap.set(node.id, `${safeLabel(base)}${index}`);
  });

  const inputsByNode = new Map<string, string[]>();
  connections.forEach((link) => {
    if (!folderMap.has(link.fromId) || !folderMap.has(link.toId)) return;
    const list = inputsByNode.get(link.toId) ?? [];
    list.push(link.fromId);
    inputsByNode.set(link.toId, list);
  });

  const lines: string[] = [];
  lines.push("# BIOIFOS_COMMAND_SCRIPT v1");
  lines.push(`# Script Name: ${SCRIPT_NAME_TOKEN}`);
  lines.push(`# Generated At: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("# 1. Compiled curl commands");
  lines.push(`BASE_DIR="${SCRIPT_NAME_TOKEN}"`);
  lines.push("");

  orderedNodes.forEach((node) => {
    const index = nodeIndex.get(node.id) ?? 0;
    const folder = folderMap.get(node.id) ?? `${safeLabel(node.title || node.id)}${index}`;
    const inputIds = inputsByNode.get(node.id) ?? [];
    const inputFolders = inputIds.map((id) => folderMap.get(id)).filter(Boolean) as string[];
    const toolId = node.toolId;
    const meta = toolMetaMap[toolId];
    const draft = drafts[toolId];
    const template = (draft?.curlTemplate ?? meta?.curlTemplate ?? "").trim();
    const values = paramValues[node.id] ?? {};
    const params = meta?.params ?? [];
    const command = template
      ? params.reduce((acc, param) => {
          const value = values[param.key] ?? param.default ?? "";
          return acc
            .replaceAll(`{{${PARAM_PREFIX}${param.key}}}`, value)
            .replaceAll(`{{${param.key}}}`, value);
        }, template)
      : "curl \"\"";

    const displayName = displayNameMap.get(node.id) ?? (node.title || node.id);
    lines.push(`# Node ${index}: ${displayName} (${node.id})`);
    lines.push(`mkdir -p "$BASE_DIR"`);
    inputFolders.forEach((input) => {
      lines.push(`mkdir -p "$BASE_DIR/${input}"`);
    });
    lines.push(`mkdir -p "$BASE_DIR/${folder}"`);
    lines.push(`INPUT_DIRS="${inputFolders.map((input) => `$BASE_DIR/${input}`).join(",")}"`);
    lines.push(`OUTPUT_DIR="$BASE_DIR/${folder}"`);
    if (!template) {
      lines.push(`# WARNING: missing curl template for tool ${toolId}`);
    }
    lines.push(`# Command Source: ${displayName}`);
    lines.push(command);
    lines.push("");
  });

  lines.push("# 2. Logic chain");
  lines.push(
    `# Order: ${orderedNodes
      .map((node) => displayNameMap.get(node.id) ?? (node.title || node.id))
      .join(" -> ")}`
  );
  lines.push("# Connections:");
  connections.forEach((link) => {
    const from = nodes.find((node) => node.id === link.fromId);
    const to = nodes.find((node) => node.id === link.toId);
    if (!from || !to) return;
    const fromName = displayNameMap.get(from.id) ?? (from.title || from.id);
    const toName = displayNameMap.get(to.id) ?? (to.title || to.id);
    lines.push(`# ${fromName} -> ${toName}`);
  });
  lines.push("");

  lines.push("# 3. Folder checks happen before each curl command above.");
  lines.push("# 4. Execution order follows the logic chain and folder dependencies.");
  lines.push("");
  lines.push("# 5. Backup workflow payload");
  lines.push(JSON.stringify(flow, null, 2));
  lines.push("");

  return lines.join("\n");
}


function nextMode(mode: EditorMode): EditorMode {
  if (mode === "note") return "curl";
  if (mode === "curl") return "params";
  return "note";
}

export default function CurrentTasks() {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const scaleRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const clickRef = useRef<{ id: string; startX: number; startY: number; moved: boolean } | null>(null);
  const resizeRef = useRef<{
    nodeId: string;
    startX: number;
    startY: number;
    originW: number;
    originH: number;
  } | null>(null);
  const editorDragRef = useRef<{
    nodeId: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const workspaceResizeRef = useRef<{ startY: number; origin: number } | null>(null);

  const [workflows, setWorkflows] = useState<SavedWorkflow[]>([]);
  const [activeFlowId, setActiveFlowId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [editors, setEditors] = useState<Record<string, EditorState>>({});
  const [toolMetaMap, setToolMetaMap] = useState<Record<string, ToolMeta>>({});
  const [drafts, setDrafts] = useState<
    Record<string, { description: string; curlTemplate: string; paramDescription: string }>
  >({});
  const [paramValues, setParamValues] = useState<Record<string, Record<string, string>>>({});
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [workspaceHeight, setWorkspaceHeight] = useState(560);
  const [saveToBackend, setSaveToBackend] = useState(true);
  const [generateScript, setGenerateScript] = useState(true);
  const [runStatus, setRunStatus] = useState("");
  const [runPending, setRunPending] = useState(false);
  const [workflowQuery, setWorkflowQuery] = useState("");

  useEffect(() => {
    let active = true;
    listWorkflows()
      .then((data) => {
        if (!active) return;
        setWorkflows(data as SavedWorkflow[]);
        setActiveFlowId(data[0]?.id ?? null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!activeFlowId) {
      setNodes([]);
      setConnections([]);
      setEditors({});
      return;
    }
    let active = true;
    getWorkflow(activeFlowId)
      .then((flow) => {
        if (!active) return;
        setNodes((flow.nodes as NodeItem[]) ?? []);
        setConnections((flow.connections as Connection[]) ?? []);
        setEditors({});
        setPan({ x: 0, y: 0 });
        setZoom(1);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [activeFlowId]);

  useEffect(() => {
    const reload = () => {
      listWorkflows()
        .then((data) => {
          setWorkflows(data as SavedWorkflow[]);
          if (!activeFlowId && data[0]?.id) setActiveFlowId(data[0].id);
        })
        .catch(() => {});
    };
    const onFocus = () => reload();
    const timer = window.setInterval(() => reload(), 3000);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [activeFlowId]);

  const activeName = useMemo(() => {
    return workflows.find((flow) => flow.id === activeFlowId)?.name ?? "未选择节点图";
  }, [activeFlowId, workflows]);

  const activeFlow = useMemo(() => workflows.find((flow) => flow.id === activeFlowId) ?? null, [
    activeFlowId,
    workflows,
  ]);
  const filteredWorkflows = useMemo(() => {
    const query = workflowQuery.trim().toLowerCase();
    if (!query) return workflows;
    return workflows.filter((flow) => flow.name.toLowerCase().includes(query));
  }, [workflows, workflowQuery]);

  const canRun = Boolean(activeFlow && nodes.length);

  const handleRun = async () => {
    if (!activeFlow || !nodes.length) return;
    setRunStatus("");

    if (!saveToBackend && !generateScript) {
      setRunStatus("请至少选择一种输出方式。");
      return;
    }

    setRunPending(true);
    try {
      const toolIds = Array.from(new Set(nodes.map((node) => node.toolId)));
      const missingToolIds = toolIds.filter((id) => !toolMetaMap[id]);
      const fetched = await Promise.all(
        missingToolIds.map((id) =>
          getToolMeta(id)
            .then((meta) => ({ id, meta }))
            .catch(() => null),
        ),
      );
      const nextMetaMap = { ...toolMetaMap };
      const nextDrafts = { ...drafts };
      fetched.forEach((entry) => {
        if (!entry) return;
        nextMetaMap[entry.id] = entry.meta;
        if (!nextDrafts[entry.id]) {
          nextDrafts[entry.id] = {
            description: entry.meta.description ?? "",
            curlTemplate: entry.meta.curlTemplate ?? "",
            paramDescription: entry.meta.paramDescription ?? "",
          };
        }
      });
      setToolMetaMap(nextMetaMap);
      setDrafts(nextDrafts);

      const content = buildCommandScript({
        flow: activeFlow,
        nodes,
        connections,
        toolMetaMap: nextMetaMap,
        drafts: nextDrafts,
        paramValues,
      });

      const safeName = safeLabel(activeFlow.name || "workflow");
      let savedName = "";
      let savedPath = "";

      if (saveToBackend) {
        const saved = await createCommandScript(safeName, content);
        savedName = saved.name;
        savedPath = saved.path;
      }

      try {
        const scriptsRoot = await getBfsScriptsRoot();
        const scriptBase = savedName ? savedName.replace(/\.sh$/, "") : safeName;
        const resolved = content.replaceAll(SCRIPT_NAME_TOKEN, scriptBase);
        const blob = new Blob([resolved], { type: "text/plain;charset=utf-8" });
        const file = new File([blob], savedName || `${safeName}.sh`, { type: "text/plain;charset=utf-8" });
        await uploadBfsScript(scriptsRoot.root, file, file.name);
      } catch {
        setRunStatus("脚本已生成，但上传到服务器B失败。");
      }

      if (generateScript) {
        const scriptBase = savedName ? savedName.replace(/\.sh$/, "") : safeName;
        const resolved = content.replaceAll(SCRIPT_NAME_TOKEN, scriptBase);
        const blob = new Blob([resolved], { type: "text/plain;charset=utf-8" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = savedName || `${safeName}.sh`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(link.href);
      }

      if (saveToBackend) {
        setRunStatus(`已保存脚本：${savedName}。${savedPath ? `路径：${savedPath}` : ""}`);
      } else {
        setRunStatus("已生成脚本文件。");
      }
    } catch (error) {
      setRunStatus("脚本生成失败，请稍后重试。");
    } finally {
      setRunPending(false);
    }
  };

  const toWorld = (clientX: number, clientY: number) => {
    const scaleBounds = scaleRef.current?.getBoundingClientRect();
    if (!scaleBounds) return { x: 0, y: 0 };
    return {
      x: (clientX - scaleBounds.left) / zoom,
      y: (clientY - scaleBounds.top) / zoom,
    };
  };

  const toggleEditor = (nodeId: string) => {
    setEditors((prev) => {
      if (prev[nodeId]) {
        const next = { ...prev };
        delete next[nodeId];
        setActiveNodeId((current) => (current === nodeId ? null : current));
        return next;
      }
      const node = nodes.find((item) => item.id === nodeId);
      if (!node) return prev;
      const scaleBounds = scaleRef.current?.getBoundingClientRect();
      const canvasBounds = canvasRef.current?.getBoundingClientRect();
      if (!scaleBounds || !canvasBounds) return prev;
      const screenX = scaleBounds.left + node.x * zoom;
      const screenY = scaleBounds.top + node.y * zoom;
      const next: EditorState = {
        nodeId,
        x: screenX - canvasBounds.left + 24,
        y: screenY - canvasBounds.top + 24,
        width: 320,
        height: 220,
        mode: "note",
        paramMode: true,
      };
      setActiveNodeId(nodeId);
      return { ...prev, [nodeId]: next };
    });
  };

  useEffect(() => {
    const toolIds = Object.values(editors)
      .map((editor) => nodes.find((node) => node.id === editor.nodeId)?.toolId)
      .filter((id): id is string => Boolean(id));
    toolIds.forEach((toolId) => {
      if (drafts[toolId]) return;
      getToolMeta(toolId)
        .then((meta) => {
          setToolMetaMap((prev) => ({ ...prev, [toolId]: meta }));
          setDrafts((prev) => ({
            ...prev,
            [toolId]: {
              description: meta.description ?? "",
              curlTemplate: meta.curlTemplate ?? "",
              paramDescription: meta.paramDescription ?? "",
            },
          }));
        })
        .catch(() => {});
    });
  }, [editors, nodes, drafts]);

  useEffect(() => {
    const nodesInParamMode = Object.values(editors).filter((editor) => editor.paramMode);
    if (!nodesInParamMode.length) return;
    setParamValues((prev) => {
      let changed = false;
      const next = { ...prev };
      nodesInParamMode.forEach((editor) => {
        const toolId = nodes.find((node) => node.id === editor.nodeId)?.toolId;
        if (!toolId) return;
        const meta = toolMetaMap[toolId];
        if (!meta?.params?.length) return;
        const existing = next[editor.nodeId] ?? {};
        let touched = !next[editor.nodeId];
        const merged = { ...existing };
        meta.params.forEach((param) => {
          const currentValue = existing[param.key];
          if (currentValue === undefined || currentValue === "") {
            merged[param.key] = param.default ?? "";
            touched = true;
          }
        });
        if (touched) {
          next[editor.nodeId] = merged;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [editors, toolMetaMap, nodes]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      const panDrag = panRef.current;
      const resize = resizeRef.current;
      const click = clickRef.current;
      const editorDrag = editorDragRef.current;

      if (editorDrag) {
        setEditors((prev) => ({
          ...prev,
          [editorDrag.nodeId]: {
            ...prev[editorDrag.nodeId],
            x: editorDrag.originX + (e.clientX - editorDrag.startX),
            y: editorDrag.originY + (e.clientY - editorDrag.startY),
          },
        }));
        return;
      }

      if (panDrag) {
        setPan({
          x: panDrag.originX + (e.clientX - panDrag.startX),
          y: panDrag.originY + (e.clientY - panDrag.startY),
        });
        return;
      }

      if (resize) {
        const nextW = Math.max(240, resize.originW + (e.clientX - resize.startX));
        const nextH = Math.max(160, resize.originH + (e.clientY - resize.startY));
        setEditors((prev) => ({
          ...prev,
          [resize.nodeId]: { ...prev[resize.nodeId], width: nextW, height: nextH },
        }));
        return;
      }

      if (!drag) return;

      if (click) {
        const dx = e.clientX - click.startX;
        const dy = e.clientY - click.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          click.moved = true;
        }
      }

      const world = toWorld(e.clientX, e.clientY);
      const nextX = world.x - drag.offsetX;
      const nextY = world.y - drag.offsetY;
      setNodes((prev) => prev.map((node) => (node.id === drag.id ? { ...node, x: nextX, y: nextY } : node)));
    };

    const onUp = () => {
      if (clickRef.current && !clickRef.current.moved) {
        toggleEditor(clickRef.current.id);
      }
      dragRef.current = null;
      panRef.current = null;
      resizeRef.current = null;
      editorDragRef.current = null;
      clickRef.current = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [nodes, zoom]);

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

  const renderEditorBody = (nodeId: string, mode: EditorMode) => {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) return null;
    const toolId = node.toolId;
    const draft =
      drafts[toolId] ?? {
        description: toolMetaMap[toolId]?.description ?? "",
        curlTemplate: toolMetaMap[toolId]?.curlTemplate ?? "",
        paramDescription: toolMetaMap[toolId]?.paramDescription ?? "",
      };
    return (
      <textarea
        value={
          mode === "note" ? draft.description : mode === "curl" ? draft.curlTemplate : draft.paramDescription
        }
        onChange={(e) => {
          const value = e.target.value;
          setDrafts((prev) => ({
            ...prev,
            [toolId]: {
              description: mode === "note" ? value : draft.description,
              curlTemplate: mode === "curl" ? value : draft.curlTemplate,
              paramDescription: mode === "params" ? value : draft.paramDescription,
            },
          }));
        }}
        className="h-full w-full resize-none rounded-lg border border-zinc-200 bg-white p-2 text-xs text-zinc-700 outline-none"
      />
    );
  };

  const renderParamEditor = (nodeId: string) => {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) return null;
    const toolId = node.toolId;
    const meta = toolMetaMap[toolId];
    if (!meta) return <div className="text-xs text-zinc-500">未加载参数信息</div>;
    const values = paramValues[nodeId] ?? {};
    const inputs = meta.params ?? [];
    const command = meta.curlTemplate
      ? inputs.reduce((acc, param) => {
          const value = values[param.key] ?? param.default ?? "";
          return acc
            .replaceAll(`{{${PARAM_PREFIX}${param.key}}}`, value)
            .replaceAll(`{{${param.key}}}`, value);
        }, meta.curlTemplate)
      : "";
    return (
      <div className="flex h-full flex-col gap-3 text-xs text-zinc-600">
        <div className="flex flex-wrap gap-3">
          {inputs.length === 0 && <div className="text-zinc-500">当前工具暂无可调参数</div>}
          {inputs.map((param) => {
            const previewValue = values[param.key] ?? param.default ?? "";
            const widthCh = Math.max(6, previewValue.length || 1);
            return (
              <label key={param.key} className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-500">{param.label || param.key}</span>
                <input
                  type={param.type === "number" ? "number" : "text"}
                  value={previewValue}
                  onChange={(e) =>
                    setParamValues((prev) => ({
                      ...prev,
                      [nodeId]: { ...(prev[nodeId] ?? {}), [param.key]: e.target.value },
                    }))
                  }
                  size={widthCh}
                  style={{ width: `calc(${widthCh}ch + 16px)` }}
                  className="h-8 rounded-full border border-zinc-200 bg-white px-3 text-xs text-zinc-700 outline-none"
                />
              </label>
            );
          })}
        </div>
        <div className="flex-1">
          <div className="mb-1 text-[10px] text-zinc-500">完整 curl</div>
          <textarea
            value={command}
            readOnly
            className="h-full w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-700"
          />
        </div>
      </div>
    );
  };

  const saveEditor = (nodeId: string) => {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) return;
    const toolId = node.toolId;
    const draft = drafts[toolId] ?? { description: "", curlTemplate: "", paramDescription: "" };
    updateToolMeta(toolId, {
      description: draft.description.trim(),
      curlTemplate: draft.curlTemplate.trim(),
      paramDescription: draft.paramDescription.trim(),
    })
      .then((meta) => {
        setToolMetaMap((prev) => ({ ...prev, [toolId]: meta }));
      })
      .catch(() => {});
  };

  const CIRCLE_SIZE = 24;
  const LABEL_OFFSET = 20;
  const radius = CIRCLE_SIZE / 2;
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  return (
    <div className="h-full">
      <div className="rounded-2xl border border-white/20 bg-gradient-to-br from-white/70 via-white/30 to-white/10 p-4 shadow-xl backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-lg font-semibold text-zinc-900">当前任务</div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-zinc-600">
              <input
                type="checkbox"
                checked={saveToBackend}
                onChange={(e) => setSaveToBackend(e.target.checked)}
                className="h-3.5 w-3.5 rounded border border-zinc-300"
              />
              保存到后端文件夹
            </label>
            <label className="flex items-center gap-2 text-xs text-zinc-600">
              <input
                type="checkbox"
                checked={generateScript}
                onChange={(e) => setGenerateScript(e.target.checked)}
                className="h-3.5 w-3.5 rounded border border-zinc-300"
              />
              生成命令脚本
            </label>
            <button
              type="button"
              onClick={handleRun}
              disabled={!canRun || runPending}
              className={[
                "rounded-full px-4 py-2 text-xs font-semibold transition",
                canRun && !runPending
                  ? "bg-emerald-500 text-white shadow-sm hover:bg-emerald-400"
                  : "cursor-not-allowed bg-zinc-300 text-zinc-500",
              ].join(" ")}
            >
              {runPending ? "运行中..." : "运行"}
            </button>
          </div>
        </div>
        {runStatus && <div className="mt-2 text-xs text-zinc-600">{runStatus}</div>}

        <div className="mt-4 grid grid-cols-[280px_1fr] gap-4 items-stretch" style={{ height: workspaceHeight }}>
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-white/30 bg-white/40 p-3 shadow-sm backdrop-blur-md">
            <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">已保存节点图</div>
            <div className="mb-2">
              <input
                value={workflowQuery}
                onChange={(e) => setWorkflowQuery(e.target.value)}
                placeholder="搜索节点图"
                className="w-full rounded-full border border-white/60 bg-white/80 px-3 py-2 text-[11px] text-zinc-700 outline-none"
              />
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {workflows.length === 0 && <div className="text-xs text-zinc-500">暂无保存记录</div>}
              {filteredWorkflows.map((flow) => (
                <button
                  key={flow.id}
                  onClick={() => setActiveFlowId(flow.id)}
                  className={[
                    "w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                    activeFlowId === flow.id
                      ? "border-zinc-800 bg-zinc-900/90 text-white"
                      : "border-white/50 bg-white/70 text-zinc-700 hover:bg-white",
                  ].join(" ")}
                >
                  <div className="font-semibold">{flow.name}</div>
                  <div className="mt-1 text-[10px] text-zinc-400">
                    节点 {flow.nodes.length} · 连线 {flow.connections.length}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex h-full flex-col">
            <div className="mb-3 flex items-center rounded-full border border-white/50 bg-white/70 px-3 py-2 text-xs text-zinc-600 shadow-sm">
              {activeName}
            </div>
            <div
              ref={canvasRef}
              className="relative flex-1 overflow-hidden rounded-xl border border-dashed border-white/50 bg-gradient-to-br from-white/50 via-white/20 to-white/10 p-4 shadow-inner"
              onMouseDown={(e) => {
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
                className="absolute inset-0"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}
              >
                <div
                  ref={scaleRef}
                  className="absolute inset-0"
                  style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
                >
                  <svg className="pointer-events-none absolute inset-0 h-full w-full">
                    {connections.map((link) => {
                      const from = nodeMap.get(link.fromId);
                      const to = nodeMap.get(link.toId);
                      if (!from || !to) return null;
                      const fx = from.x + radius;
                      const fy = from.y + LABEL_OFFSET + radius;
                      const tx = to.x + radius;
                      const ty = to.y + LABEL_OFFSET + radius;
                      const dx = tx - fx;
                      const dy = ty - fy;
                      const len = Math.hypot(dx, dy) || 1;
                      const ux = dx / len;
                      const uy = dy / len;
                      const startX = fx + ux * radius;
                      const startY = fy + uy * radius;
                      const endX = tx - ux * radius;
                      const endY = ty - uy * radius;
                      return (
                        <path
                          key={link.id}
                          d={`M ${startX} ${startY} L ${endX} ${endY}`}
                          stroke="rgba(30, 41, 59, 0.7)"
                          strokeWidth="1.5"
                          fill="none"
                        />
                      );
                    })}
                  </svg>

                  {nodes.map((node) => {
                    const isActive = activeNodeId === node.id;
                    return (
                    <div
                      key={node.id}
                      className="absolute"
                      style={{ left: node.x, top: node.y }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        const world = toWorld(e.clientX, e.clientY);
                        dragRef.current = {
                          id: node.id,
                          offsetX: world.x - node.x,
                          offsetY: world.y - node.y,
                        };
                        clickRef.current = {
                          id: node.id,
                          startX: e.clientX,
                          startY: e.clientY,
                          moved: false,
                        };
                      }}
                    >
                      <div className="group relative">
                        <div className="mb-1 text-xs leading-4 text-zinc-600">{node.title}</div>
                        <div className="relative h-6 w-6">
                        <div
                          className={[
                            "absolute inset-0 rounded-full border bg-transparent transition-colors",
                            isActive ? "border-sky-600 border-[2.5px]" : "border-zinc-900/90 border-[2.5px]",
                          ].join(" ")}
                        />
                        <div
                          className={[
                            "absolute inset-[4px] rounded-full blur-[1px] transition-all",
                            isActive ? "bg-sky-400/90 opacity-100" : "bg-sky-300/70 opacity-70",
                            "group-hover:opacity-100",
                          ].join(" ")}
                        />
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>

              {Object.values(editors).map((editor) => {
                const node = nodes.find((item) => item.id === editor.nodeId);
                const title = node?.title ?? "节点";
                return (
                  <div
                    key={editor.nodeId}
                    className="absolute rounded-xl border border-white/50 bg-white/90 shadow-xl relative"
                    style={{
                      left: editor.x,
                      top: editor.y,
                      width: editor.width,
                      height: editor.height,
                    }}
                  >
                    <div
                      className="flex items-center justify-between border-b border-white/60 px-3 py-2 text-xs text-zinc-600 cursor-move"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        editorDragRef.current = {
                          nodeId: editor.nodeId,
                          startX: e.clientX,
                          startY: e.clientY,
                          originX: editor.x,
                          originY: editor.y,
                        };
                      }}
                    >
                      <div className="font-semibold text-zinc-800">{title}</div>
                      <div className="flex items-center gap-2">
                        <button
                          className="rounded-full border border-zinc-200 px-2 py-0.5 text-[10px] text-zinc-600 hover:bg-zinc-50"
                          onClick={() => saveEditor(editor.nodeId)}
                        >
                          保存
                        </button>
                        <button
                          className="rounded-full border border-zinc-200 px-2 py-0.5 text-[10px] text-zinc-600 hover:bg-zinc-50"
                          onClick={() =>
                            setEditors((prev) => {
                              const next = { ...prev };
                              delete next[editor.nodeId];
                              setActiveNodeId((current) => (current === editor.nodeId ? null : current));
                              return next;
                            })
                          }
                        >
                          关闭
                        </button>
                      </div>
                    </div>
                    <div className="h-[calc(100%-72px)] px-3 py-2">
                      {editor.paramMode
                        ? renderParamEditor(editor.nodeId)
                        : renderEditorBody(editor.nodeId, editor.mode)}
                    </div>
                    <div className="flex items-center justify-between border-t border-white/60 px-3 py-1 text-[10px] text-zinc-500">
                      <div>
                        {editor.paramMode
                          ? "参数编辑"
                          : editor.mode === "note"
                            ? "注释"
                            : editor.mode === "curl"
                              ? "curl 指令"
                              : "参数注解"}
                      </div>
                      {!editor.paramMode && (
                        <button
                          className="rounded-full border border-zinc-200 p-1 text-zinc-500 hover:bg-zinc-50"
                          onClick={() =>
                            setEditors((prev) => ({
                              ...prev,
                              [editor.nodeId]: { ...editor, mode: nextMode(editor.mode) },
                            }))
                          }
                          title="切换显示内容"
                        >
                          <RotateCw className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <button
                      className="absolute bottom-2 left-2 flex h-6 w-6 items-center justify-center rounded-full border border-rose-400/70 bg-rose-500/90 text-[10px] font-semibold text-white shadow-sm"
                      onClick={() =>
                        setEditors((prev) => ({
                          ...prev,
                          [editor.nodeId]: { ...editor, paramMode: !editor.paramMode },
                        }))
                      }
                      title="参数编辑模式"
                    >
                      #
                    </button>
                    <div
                      className="absolute bottom-1 right-1 h-3 w-3 cursor-nwse-resize rounded-sm border border-zinc-300 bg-zinc-200"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        resizeRef.current = {
                          nodeId: editor.nodeId,
                          startX: e.clientX,
                          startY: e.clientY,
                          originW: editor.width,
                          originH: editor.height,
                        };
                      }}
                    />
                  </div>
                );
              })}
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
