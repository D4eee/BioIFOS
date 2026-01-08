export type AppPageType =
  | "fileManager"
  | "filePreview"
  | "toolSelect"
  | "currentTasks"
  | "scriptOps"
  | "workflowBuilder"
  | "resultsTerminal"
  | "toolBuilder"
  | "settings"
  | "account";

export type AppTab = {
  id: string;
  type: AppPageType;
  title: string;
  createdAt: number;
};

export type FloatingWindow = {
  id: string;
  tab: AppTab;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
};
