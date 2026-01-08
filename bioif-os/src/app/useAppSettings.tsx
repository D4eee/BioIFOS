import { createContext, useCallback, useContext, useMemo } from "react";
import { useLocalStorageState } from "@/app/useLocalStorageState";

export type Language = "zh" | "en";
export type Theme = "noir" | "mist" | "amber";

export type AppSettings = {
  theme: Theme;
  fontSize: number;
  language: Language;
  bApiBase: string;
  frpUseMapping: boolean;
  frpPublicAddr: string;
  frpExposeFromB: boolean;
  frpPublicPort: string;
};

const DEFAULT_SETTINGS: AppSettings = {
  theme: "noir",
  fontSize: 16,
  language: "zh",
  bApiBase: "",
  frpUseMapping: false,
  frpPublicAddr: "",
  frpExposeFromB: false,
  frpPublicPort: "",
};

const SETTINGS_KEY = "bioif_os_settings_v1";

type SettingsContextValue = {
  settings: AppSettings;
  setSettings: (next: AppSettings) => void;
  applySettings: () => void;
};

const AppSettingsContext = createContext<SettingsContextValue | null>(null);

export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useLocalStorageState<AppSettings>(SETTINGS_KEY, DEFAULT_SETTINGS);

  const applySettings = useCallback(() => {
    const root = document.documentElement;
    root.style.fontSize = `${settings.fontSize}px`;
    root.dataset.theme = settings.theme;
    root.dataset.lang = settings.language;
  }, [settings.fontSize, settings.language, settings.theme]);

  const value = useMemo(
    () => ({
      settings,
      setSettings,
      applySettings,
    }),
    [settings, setSettings, applySettings],
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings() {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) {
    throw new Error("useAppSettings must be used within AppSettingsProvider");
  }
  return ctx;
}
