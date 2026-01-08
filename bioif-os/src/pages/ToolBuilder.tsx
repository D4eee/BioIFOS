import { useEffect, useRef, useState } from "react";
import { Folder, FileText, Plus } from "lucide-react";
import { readNodeFile, listNodeStorage, updateToolMeta } from "@/app/api";

const ROOT_PATH = "/data/shared/nodes";
const PARAM_PREFIX = "VariP:";

type ResizeMode = "vertical" | "horizontal" | "param";
type CurlSegment = {
  id: string;
  type: "text" | "param";
  value: string;
  color?: string;
  inputType?: "text" | "number" | "boolean" | "path";
  defaultValue?: string;
};

const BG_OPTIONS = [
  { label: "雾白", value: "bg-white/40" },
  { label: "浅灰", value: "bg-zinc-100/60" },
  { label: "冷蓝", value: "bg-sky-100/50" },
  { label: "暖米", value: "bg-amber-100/50" },
];

export default function ToolBuilder() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resizeRef = useRef<{ mode: ResizeMode; startX: number; startY: number; origin: number } | null>(null);
  const workspaceResizeRef = useRef<{ startY: number; origin: number } | null>(null);

  const [leftWidth, setLeftWidth] = useState(360);
  const [topHeight, setTopHeight] = useState(260);
  const [paramHeight, setParamHeight] = useState(220);

  const [toolId, setToolId] = useState("");
  const [toolName, setToolName] = useState("");
  const [toolDesc, setToolDesc] = useState("");
  const [toolParams, setToolParams] = useState("");
  const [currentDir, setCurrentDir] = useState(ROOT_PATH);
  const [entries, setEntries] = useState<{ type: "dir" | "file"; name: string }[]>([]);
  const [actualDir, setActualDir] = useState("");
  const [paramBg, setParamBg] = useState(BG_OPTIONS[0].value);
  const [toolBg, setToolBg] = useState(BG_OPTIONS[1].value);
  const [curlSegments, setCurlSegments] = useState<CurlSegment[]>([
    { id: "text-0", type: "text", value: "" },
  ]);
  const [activeTextId, setActiveTextId] = useState<string | null>(null);
  const [caretPos, setCaretPos] = useState(0);
  const [paramCount, setParamCount] = useState(1);
  const [editingParam, setEditingParam] = useState<CurlSegment | null>(null);
  const [paramLabelDraft, setParamLabelDraft] = useState("");
  const [paramTypeDraft, setParamTypeDraft] = useState<"text" | "number" | "boolean" | "path">("text");
  const [workspaceHeight, setWorkspaceHeight] = useState(560);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const state = resizeRef.current;
      if (!state) return;
      if (state.mode === "vertical") {
        const next = Math.max(260, Math.min(520, state.origin + (e.clientX - state.startX)));
        setLeftWidth(next);
      } else if (state.mode === "horizontal") {
        const next = Math.max(160, Math.min(420, state.origin + (e.clientY - state.startY)));
        setTopHeight(next);
      } else {
        const containerHeight = containerRef.current?.getBoundingClientRect().height ?? 560;
        const maxParam = Math.max(160, containerHeight - topHeight - 12);
        const next = Math.max(160, Math.min(maxParam, state.origin + (e.clientY - state.startY)));
        setParamHeight(next);
      }
    };
    const onUp = () => {
      resizeRef.current = null;
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

  useEffect(() => {
    let active = true;
    listNodeStorage(currentDir)
      .then((data) => {
        if (!active) return;
        setEntries(data.entries ?? []);
        if (data.path) setCurrentDir(data.path);
        setActualDir(data.actualPath ?? "");
      })
      .catch(() => {
        if (!active) return;
        setEntries([]);
        setActualDir("");
      });
    return () => {
      active = false;
    };
  }, [currentDir]);

  const saveTool = () => {
    const missing = new Set<string>();
    if (!toolName.trim()) missing.add("toolName");
    if (!toolDesc.trim()) missing.add("toolDesc");
    if (!toolParams.trim()) missing.add("toolParams");
    const paramSegments = curlSegments.filter((segment) => segment.type === "param");
    if (!paramSegments.length) missing.add("params");
    paramSegments.forEach((segment) => {
      if (!segment.value.trim()) missing.add(`paramLabel:${segment.id}`);
      if (!segment.inputType) missing.add(`paramType:${segment.id}`);
    });

    if (missing.size > 0) {
      setInvalidFields(missing);
      setTimeout(() => {
        setInvalidFields(new Set());
      }, 3000);
      return;
    }

    const resolvedId =
      toolId.trim() ||
      toolName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");
    if (!resolvedId) return;
    const serializedCurl = curlSegments
      .map((segment) =>
        segment.type === "text" ? segment.value : `{{${PARAM_PREFIX}${segment.value}}}`,
      )
      .join("");
    updateToolMeta(resolvedId, {
      name: toolName.trim() || resolvedId,
      paramCount: paramSegments.length,
      curlTemplate: serializedCurl.trim(),
      description: toolDesc.trim(),
      paramDescription: toolParams.trim(),
      params: paramSegments.map((segment) => ({
        key: segment.value,
        label: segment.value,
        type: segment.inputType ?? "text",
        color: segment.color ?? "#64748b",
        default: paramValues[segment.value] ?? segment.defaultValue ?? "",
        required: false,
      })),
      path: currentDir,
    })
      .then(() => {
        setToolId("");
        setToolName("");
        setToolDesc("");
        setToolParams("");
        setCurlSegments([{ id: "text-0", type: "text", value: "" }]);
        setActiveTextId(null);
        setCaretPos(0);
        setParamCount(1);
        setParamValues({});
      })
      .catch(() => {});
  };

  const handleAddParam = () => {
    const activeIndex = activeTextId
      ? curlSegments.findIndex((segment) => segment.id === activeTextId)
      : -1;
    const fallbackId = curlSegments.find((segment) => segment.type === "text")?.id ?? "text-0";
    const targetId = activeIndex >= 0 ? activeTextId! : fallbackId;
    const targetIndex = curlSegments.findIndex((segment) => segment.id === targetId);
    if (targetIndex < 0) return;
    const target = curlSegments[targetIndex];
    if (target.type !== "text") return;
    const before = target.value.slice(0, caretPos);
    const after = target.value.slice(caretPos);
    const newParamId = `param-${paramCount}`;
    const nextSegments: CurlSegment[] = [
      ...curlSegments.slice(0, targetIndex),
      { ...target, value: before },
      {
        id: newParamId,
        type: "param",
        value: `Va${paramCount}`,
        color: "#64748b",
        inputType: "text",
      },
      { id: `text-${paramCount}`, type: "text", value: after },
      ...curlSegments.slice(targetIndex + 1),
    ];
    setCurlSegments(nextSegments);
    setParamCount((count) => count + 1);
    setActiveTextId(`text-${paramCount}`);
    setCaretPos(0);
  };

  const updateTextSegment = (id: string, value: string) => {
    setCurlSegments((segments) =>
      segments.map((segment) => (segment.id === id ? { ...segment, value } : segment)),
    );
  };

  const updateParamColor = (id: string, color: string) => {
    setCurlSegments((segments) =>
      segments.map((segment) => (segment.id === id ? { ...segment, color } : segment)),
    );
  };

  const removeParam = (id: string) => {
    setCurlSegments((segments) => {
      const index = segments.findIndex((segment) => segment.id === id);
      if (index < 0) return segments;
      const next = segments.filter((segment) => segment.id !== id);
      const prev = next[index - 1];
      const curr = next[index];
      if (prev && curr && prev.type === "text" && curr.type === "text") {
        const merged: CurlSegment = {
          id: prev.id,
          type: "text",
          value: `${prev.value}${curr.value}`,
        };
        return [...next.slice(0, index - 1), merged, ...next.slice(index + 1)];
      }
      return next;
    });
  };

  const openParamEditor = (segment: CurlSegment) => {
    setEditingParam(segment);
    setParamLabelDraft(segment.value);
    setParamTypeDraft(segment.inputType ?? "text");
  };

  const saveParamEditor = () => {
    if (!editingParam) return;
    const oldKey = editingParam.value;
    const nextKey = paramLabelDraft.trim() || editingParam.value;
    setCurlSegments((segments) =>
      segments.map((segment) =>
        segment.id === editingParam.id
          ? {
              ...segment,
              value: nextKey,
              inputType: paramTypeDraft,
            }
          : segment,
      ),
    );
    if (oldKey !== nextKey) {
      setParamValues((prev) => {
        if (!(oldKey in prev)) return prev;
        const next = { ...prev };
        next[nextKey] = prev[oldKey];
        delete next[oldKey];
        return next;
      });
    }
    setEditingParam(null);
  };

  return (
    <div className="h-full">
      <div className="rounded-2xl border border-white/20 bg-gradient-to-br from-white/70 via-white/30 to-white/10 p-4 shadow-xl backdrop-blur-xl">
        <div className="text-lg font-semibold text-zinc-900">工具制作</div>

        <div ref={containerRef} className="mt-4 flex items-stretch gap-3" style={{ height: workspaceHeight }}>
          <div className="relative flex h-full flex-col" style={{ width: leftWidth }}>
            <div
              className="flex flex-col rounded-xl border border-white/30 bg-white/40 p-3 shadow-sm backdrop-blur-md"
              style={{ height: topHeight }}
            >
              <div className="mb-3 flex items-center text-xs text-zinc-600">
                <div className="font-semibold uppercase tracking-widest text-zinc-500">文件浏览</div>
                <div className="ml-3 text-[10px] text-zinc-500">新建的工具将会保存在这个目录下</div>
              </div>
              <div className="mb-1 rounded-lg border border-white/60 bg-white/70 px-2 py-1 text-[10px] text-zinc-500">
                {currentDir}
              </div>
              <div className="mb-2 rounded-lg border border-white/50 bg-white/60 px-2 py-1 text-[10px] text-zinc-500">
                {actualDir || "未找到实际路径"}
              </div>
              <div className="flex-1 overflow-auto rounded-lg border border-white/50 bg-white/70 p-2 text-sm text-zinc-700">
                {currentDir !== ROOT_PATH && (
                  <button
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-white"
                    onClick={() => {
                      const parent = currentDir.split("/").slice(0, -1).join("/") || ROOT_PATH;
                      setCurrentDir(parent.startsWith(ROOT_PATH) ? parent : ROOT_PATH);
                    }}
                  >
                    <Folder className="h-4 w-4 text-zinc-400" />
                    <span>..</span>
                  </button>
                )}
                {entries.map((item) => (
                  <button
                    key={item.name}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-white"
                    onClick={() => {
                      if (item.type === "dir") {
                        setCurrentDir(`${currentDir}/${item.name}`.replace("//", "/"));
                      }
                    }}
                    onDoubleClick={() => {
                      if (item.type !== "file") return;
                      readNodeFile(currentDir, item.name)
                        .then((meta) => {
                          setToolId(meta.id ?? "");
                          setToolName(meta.name ?? "");
                          setToolDesc(meta.description ?? "");
                          setToolParams(meta.paramDescription ?? "");
                          setCurlSegments(() => {
                            const segments: CurlSegment[] = [];
                            const template = meta.curlTemplate ?? "";
                            const matches = template.split(/(\{\{[^}]+\}\})/g).filter(Boolean);
                            if (!matches.length) {
                              segments.push({ id: "text-0", type: "text", value: template });
                              return segments;
                            }
                            let textIndex = 0;
                            let paramIndex = 0;
                            matches.forEach((part) => {
                              const match = part.match(/^\{\{(.+)\}\}$/);
                              if (match) {
                                const rawKey = match[1].trim();
                                const key = rawKey.startsWith(PARAM_PREFIX)
                                  ? rawKey.slice(PARAM_PREFIX.length)
                                  : rawKey;
                                const param = meta.params?.find((p) => p.key === key);
                                segments.push({
                                  id: `param-${paramIndex++}`,
                                  type: "param",
                                  value: key,
                                  color: param?.color ?? "#64748b",
                                  inputType: param?.type ?? "text",
                                  defaultValue: param?.default ?? "",
                                });
                              } else {
                                segments.push({ id: `text-${textIndex++}`, type: "text", value: part });
                              }
                            });
                            return segments;
                          });
                          setParamCount((meta.params?.length ?? 0) + 1);
                          setParamValues(
                            (meta.params ?? []).reduce<Record<string, string>>((acc, param) => {
                              acc[param.key] = param.default ?? "";
                              return acc;
                            }, {}),
                          );
                          setInvalidFields(new Set());
                        })
                        .catch(() => {});
                    }}
                  >
                    {item.type === "dir" ? (
                      <Folder className="h-4 w-4 text-amber-500" />
                    ) : (
                      <FileText className="h-4 w-4 text-sky-500" />
                    )}
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div
              className="my-2 h-1 cursor-row-resize rounded-full bg-zinc-300/60"
              onMouseDown={(e) => {
                resizeRef.current = { mode: "horizontal", startX: e.clientX, startY: e.clientY, origin: topHeight };
              }}
            />

            <div
              className={`flex flex-col overflow-hidden rounded-xl border border-white/30 p-3 shadow-sm backdrop-blur-md ${toolBg}`}
              style={{ height: paramHeight }}
            >
              <div className="mb-2 flex items-center justify-between text-xs text-zinc-600">
                <div className="font-semibold uppercase tracking-widest text-zinc-500">工具制作区</div>
                <select
                  value={toolBg}
                  onChange={(e) => setToolBg(e.target.value)}
                  className="rounded-md border border-white/60 bg-white/70 px-2 py-0.5 text-[10px] text-zinc-600 outline-none"
                >
                  {BG_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                <div className="grid gap-3 text-sm text-zinc-700">
                  <div>
                    <div className="mb-1 text-[10px] text-zinc-500">工具名称</div>
                    <input
                      value={toolName}
                      onChange={(e) => setToolName(e.target.value)}
                      className={[
                        "w-full rounded-lg border px-3 py-2 text-sm text-zinc-700 outline-none",
                        invalidFields.has("toolName")
                          ? "border-rose-400 bg-rose-50/70"
                          : "border-white/60 bg-white/80",
                      ].join(" ")}
                      placeholder="如：FastQC"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] text-zinc-500">描述</div>
                    <textarea
                      value={toolDesc}
                      onChange={(e) => setToolDesc(e.target.value)}
                      className={[
                        "h-20 w-full rounded-lg border p-3 text-xs text-zinc-700 outline-none",
                        invalidFields.has("toolDesc")
                          ? "border-rose-400 bg-rose-50/70"
                          : "border-white/60 bg-white/80",
                      ].join(" ")}
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] text-zinc-500">参数调用描述</div>
                    <textarea
                      value={toolParams}
                      onChange={(e) => setToolParams(e.target.value)}
                      className={[
                        "h-20 w-full rounded-lg border p-3 text-xs text-zinc-700 outline-none",
                        invalidFields.has("toolParams")
                          ? "border-rose-400 bg-rose-50/70"
                          : "border-white/60 bg-white/80",
                      ].join(" ")}
                    />
                  </div>
                </div>
              </div>

            </div>

            <div
              className="my-2 h-1 cursor-row-resize rounded-full bg-zinc-300/60"
              onMouseDown={(e) => {
                resizeRef.current = { mode: "param", startX: e.clientX, startY: e.clientY, origin: paramHeight };
              }}
            />

            <div className="flex-1" />
          </div>

          <div
            className="w-1 cursor-col-resize rounded-full bg-zinc-300/60"
            onMouseDown={(e) => {
              resizeRef.current = { mode: "vertical", startX: e.clientX, startY: e.clientY, origin: leftWidth };
            }}
          />

          <div className={`flex flex-1 flex-col overflow-hidden rounded-xl border border-white/30 p-4 shadow-sm backdrop-blur-md ${paramBg}`}>
            <div className="mb-3 flex items-center justify-between text-xs text-zinc-600">
              <div className="font-semibold uppercase tracking-widest text-zinc-500">参数编辑区</div>
              <select
                value={paramBg}
                onChange={(e) => setParamBg(e.target.value)}
                className="rounded-md border border-white/60 bg-white/70 px-2 py-0.5 text-[10px] text-zinc-600 outline-none"
              >
                {BG_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="relative min-h-0 flex-1 rounded-lg border border-dashed border-white/60 bg-white/60 p-3 text-xs text-zinc-500">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex-1">
                  <div className="flex min-h-[40px] flex-wrap items-center gap-2 rounded-lg border border-white/60 bg-zinc-100/80 px-2 py-1">
                    {curlSegments.map((segment) => {
                      if (segment.type === "param") {
                        return (
                          <div
                            key={segment.id}
                            className={[
                              "relative flex h-9 items-center gap-2 rounded-full border px-3 text-xs text-zinc-700",
                              invalidFields.has(`paramLabel:${segment.id}`) ||
                              invalidFields.has(`paramType:${segment.id}`)
                                ? "border-rose-400 bg-rose-50/70"
                                : "border-white/60 bg-zinc-100/90",
                            ].join(" ")}
                            style={{
                              borderColor: segment.color,
                              boxShadow: `0 0 6px ${segment.color}55`,
                            }}
                          >
                            <button
                              onClick={() => removeParam(segment.id)}
                              className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full border border-rose-400/70 bg-rose-400/90 text-[10px] text-white"
                              aria-label="删除参数"
                            >
                              ×
                            </button>
                            <button
                              onClick={() => openParamEditor(segment)}
                              className="flex items-center gap-2 text-left"
                              aria-label="编辑参数"
                            >
                              <label
                                className="relative h-3 w-3 cursor-pointer"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <span
                                  className="absolute inset-0 rounded-full"
                                  style={{ backgroundColor: segment.color }}
                                />
                                <input
                                  type="color"
                                  value={segment.color}
                                  onChange={(e) => updateParamColor(segment.id, e.target.value)}
                                  onClick={(event) => event.stopPropagation()}
                                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                  aria-label="参数颜色"
                                />
                              </label>
                              <span>{segment.value}</span>
                            </button>
                          </div>
                        );
                      }
                      return (
                        <input
                          key={segment.id}
                          value={segment.value}
                          onChange={(e) => updateTextSegment(segment.id, e.target.value)}
                          onFocus={(e) => {
                            setActiveTextId(segment.id);
                            setCaretPos(e.currentTarget.selectionStart ?? e.currentTarget.value.length);
                          }}
                          onSelect={(e) => {
                            setActiveTextId(segment.id);
                            setCaretPos(e.currentTarget.selectionStart ?? e.currentTarget.value.length);
                          }}
                          onKeyUp={(e) => {
                            setActiveTextId(segment.id);
                            setCaretPos(e.currentTarget.selectionStart ?? e.currentTarget.value.length);
                          }}
                          onClick={(e) => {
                            setActiveTextId(segment.id);
                            setCaretPos(e.currentTarget.selectionStart ?? e.currentTarget.value.length);
                          }}
                          className="h-9 min-w-[120px] flex-1 rounded-md border border-white/60 bg-white/85 px-2 text-xs text-zinc-700 outline-none"
                          placeholder="请输入 CURL 指令"
                        />
                      );
                    })}
                  </div>
                </div>
                <button
                  onClick={handleAddParam}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-400/60 bg-amber-400/80 text-white shadow-sm hover:bg-amber-400"
                  aria-label="添加参数"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 rounded-lg border border-white/60 bg-white/70 p-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                  curl 预览
                </div>
                <div className="flex flex-wrap gap-3">
                  {curlSegments.filter((segment) => segment.type === "param").length === 0 && (
                    <div className="text-[11px] text-zinc-500">暂无可调参数</div>
                  )}
                  {curlSegments
                    .filter((segment) => segment.type === "param")
                    .map((segment) => {
                      const previewValue = paramValues[segment.value] ?? segment.defaultValue ?? "";
                      const widthCh = Math.max(6, previewValue.length || 1);
                      return (
                        <label key={segment.id} className="flex items-center gap-2 text-[11px] text-zinc-500">
                          <span className="whitespace-nowrap">{segment.value}</span>
                          <span className="text-[10px] text-zinc-400">必填默认值</span>
                          <input
                            type={segment.inputType === "number" ? "number" : "text"}
                            value={previewValue}
                            onChange={(e) =>
                              setParamValues((prev) => ({ ...prev, [segment.value]: e.target.value }))
                            }
                            size={widthCh}
                            style={{ width: `calc(${widthCh}ch + 16px)` }}
                            className="h-9 rounded-full border border-white/70 bg-white/90 px-3 text-xs text-zinc-700 outline-none"
                          />
                        </label>
                      );
                    })}
                </div>
                <textarea
                  readOnly
                  value={curlSegments
                    .map((segment) =>
                      segment.type === "text"
                        ? segment.value
                        : paramValues[segment.value] ??
                          segment.defaultValue ??
                          `{{${PARAM_PREFIX}${segment.value}}}`,
                    )
                    .join("")}
                  className="mt-3 h-20 w-full resize-none rounded-md border border-white/70 bg-zinc-50 p-2 text-xs text-zinc-700 outline-none"
                />
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => {
                    setToolId("");
                    setToolName("");
                    setToolDesc("");
                    setToolParams("");
                    setCurlSegments([{ id: "text-0", type: "text", value: "" }]);
                    setActiveTextId(null);
                    setCaretPos(0);
                    setParamCount(1);
                    setParamValues({});
                    setInvalidFields(new Set());
                  }}
                  className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-600 shadow-sm hover:bg-zinc-50"
                >
                  清空
                </button>
                <button
                  onClick={saveTool}
                  className="rounded-full border border-blue-500/40 bg-blue-500/80 px-4 py-2 text-sm text-white shadow-sm hover:bg-blue-500"
                >
                  保存
                </button>
              </div>
            </div>
            {editingParam && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-zinc-900/20">
                <div className="w-[320px] rounded-2xl border border-white/40 bg-white/90 p-4 shadow-xl backdrop-blur-md">
                  <div className="mb-3 text-sm font-semibold text-zinc-700">参数设置</div>
                  <div className="space-y-3 text-xs text-zinc-600">
                    <div>
                      <div className="mb-1 text-[10px] text-zinc-500">参数名称</div>
                      <input
                        value={paramLabelDraft}
                        onChange={(e) => setParamLabelDraft(e.target.value)}
                        className="w-full rounded-lg border border-white/70 bg-white/90 px-3 py-2 text-xs text-zinc-700 outline-none"
                      />
                    </div>
                    <div>
                      <div className="mb-1 text-[10px] text-zinc-500">参数类型</div>
                      <select
                        value={paramTypeDraft}
                        onChange={(e) =>
                          setParamTypeDraft(e.target.value as "text" | "number" | "boolean" | "path")
                        }
                        className="w-full rounded-lg border border-white/70 bg-white/90 px-3 py-2 text-xs text-zinc-700 outline-none"
                      >
                        <option value="text">文本</option>
                        <option value="number">数字</option>
                        <option value="boolean">布尔</option>
                        <option value="path">文件目录</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      onClick={() => setEditingParam(null)}
                      className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-600"
                    >
                      取消
                    </button>
                    <button
                      onClick={saveParamEditor}
                      className="rounded-full border border-blue-500/40 bg-blue-500/80 px-3 py-1 text-xs text-white"
                    >
                      保存
                    </button>
                  </div>
                </div>
              </div>
            )}
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
