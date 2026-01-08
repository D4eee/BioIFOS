import type { AppPageType } from "./types";

type Language = "zh" | "en";

const PAGE_TITLES: Record<Language, Record<AppPageType, string>> = {
  zh: {
    fileManager: "文件管理",
    filePreview: "文件预览",
    toolSelect: "流程逻辑",
    currentTasks: "当前任务",
    scriptOps: "脚本操作",
    workflowBuilder: "高级拓展",
    resultsTerminal: "运行终端",
    toolBuilder: "工具制作",
    settings: "设置",
    account: "账号",
  },
  en: {
    fileManager: "File Manager",
    filePreview: "File Preview",
    toolSelect: "Logic Flow",
    currentTasks: "Current Tasks",
    scriptOps: "Script Ops",
    workflowBuilder: "Advanced",
    resultsTerminal: "Run Terminal",
    toolBuilder: "Tool Builder",
    settings: "Settings",
    account: "Account",
  },
};

export function getPageTitles(language: Language) {
  return PAGE_TITLES[language] ?? PAGE_TITLES.zh;
}

export function getSidebarItems(language: Language) {
  const titles = getPageTitles(language);
  return [
    { type: "fileManager", label: titles.fileManager },
    { type: "toolBuilder", label: titles.toolBuilder },
    { type: "toolSelect", label: titles.toolSelect },
    { type: "currentTasks", label: titles.currentTasks },
    { type: "scriptOps", label: titles.scriptOps },
    { type: "workflowBuilder", label: titles.workflowBuilder },
    { type: "resultsTerminal", label: titles.resultsTerminal },
    { type: "filePreview", label: titles.filePreview },
    { type: "settings", label: titles.settings },
    { type: "account", label: titles.account },
  ];
}
