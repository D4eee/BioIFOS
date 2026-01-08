import { useState } from "react";
import { useAppSettings, type AppSettings, type Language, type Theme } from "@/app/useAppSettings";

const LABELS: Record<Language, Record<string, string>> = {
  zh: {
    title: "设置",
    theme: "界面主题",
    font: "字体大小",
    language: "语言",
    bApi: "服务器B地址",
    bApiHint: "输入服务器B的访问地址，例如 http://10.0.0.5:9001",
    bApiTest: "连接测试",
    bApiOk: "连接成功",
    bApiFail: "连接失败",
    themeNoir: "夜色",
    themeMist: "雾白",
    themeAmber: "暖米",
    fontSmall: "小",
    fontMedium: "中",
    fontLarge: "大",
    langZh: "中文",
    langEn: "English",
  },
  en: {
    title: "Settings",
    theme: "Theme",
    font: "Font Size",
    language: "Language",
    bApi: "Server B Address",
    bApiHint: "Enter Server B address, e.g. http://10.0.0.5:9001",
    bApiTest: "Test Connection",
    bApiOk: "Connected",
    bApiFail: "Connection failed",
    themeNoir: "Noir",
    themeMist: "Mist",
    themeAmber: "Amber",
    fontSmall: "Small",
    fontMedium: "Medium",
    fontLarge: "Large",
    langZh: "Chinese",
    langEn: "English",
  },
};

export default function Settings() {
  const { settings, setSettings } = useAppSettings();
  const labels = LABELS[settings.language];
  const [bStatus, setBStatus] = useState("");

  const updateSettings = (patch: Partial<AppSettings>) => {
    setSettings({ ...settings, ...patch });
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6 text-zinc-100 shadow-2xl backdrop-blur">
      <div className="text-lg font-semibold">{labels.title}</div>

      <div className="mt-6 grid gap-6">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">
            {labels.theme}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {([
              ["noir", labels.themeNoir],
              ["mist", labels.themeMist],
              ["amber", labels.themeAmber],
            ] as [Theme, string][]).map(([value, label]) => (
              <button
                key={value}
                onClick={() => updateSettings({ theme: value })}
                className={[
                  "rounded-full border px-3 py-1 transition",
                  settings.theme === value
                    ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-100"
                    : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">
            {labels.font}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {([
              [14, labels.fontSmall],
              [16, labels.fontMedium],
              [18, labels.fontLarge],
            ] as [number, string][]).map(([value, label]) => (
              <button
                key={value}
                onClick={() => updateSettings({ fontSize: value })}
                className={[
                  "rounded-full border px-3 py-1 transition",
                  settings.fontSize === value
                    ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-100"
                    : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">
            {labels.language}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {([
              ["zh", labels.langZh],
              ["en", labels.langEn],
            ] as [Language, string][]).map(([value, label]) => (
              <button
                key={value}
                onClick={() => updateSettings({ language: value })}
                className={[
                  "rounded-full border px-3 py-1 transition",
                  settings.language === value
                    ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-100"
                    : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">
            {labels.bApi}
          </div>
          <div className="flex flex-col gap-2 text-xs text-zinc-300">
            <input
              value={settings.bApiBase}
              onChange={(e) => updateSettings({ bApiBase: e.target.value })}
              placeholder={labels.bApiHint}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-100 outline-none"
            />
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-zinc-400">{bStatus}</div>
              <button
                onClick={() => {
                  setBStatus("");
                  const base = settings.bApiBase.trim();
                  if (!base) return;
                  fetch(`${base.replace(/\/$/, "")}/api/health`)
                    .then((res) => {
                      if (!res.ok) throw new Error();
                      setBStatus(labels.bApiOk);
                    })
                    .catch(() => setBStatus(labels.bApiFail));
                }}
                className="rounded-full border border-sky-400/60 bg-sky-500/20 px-3 py-1 text-xs text-sky-100 hover:bg-sky-500/30"
              >
                {labels.bApiTest}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
