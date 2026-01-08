import { useState } from "react";
import { authLogin, authRegister, setAuthToken, type AuthUser } from "@/app/api";

const STATUS = {
  idle: "",
  loading: "处理中...",
} as const;

type Props = {
  onAuth: (user: AuthUser) => void;
};

export default function Auth({ onAuth }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [status, setStatus] = useState<string>(STATUS.idle);
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setStatus(STATUS.loading);
    const action =
      mode === "login"
        ? authLogin(username.trim(), password)
        : authRegister(username.trim(), password, inviteCode.trim());
    action
      .then((res) => {
        setAuthToken(res.token);
        onAuth(res.user);
      })
      .catch((err) => {
        setError(err?.message || "登录失败");
      })
      .finally(() => setStatus(STATUS.idle));
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.9),_rgba(2,6,23,0.98))] text-zinc-100">
      <div className="w-[420px] rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
        <div className="text-sm uppercase tracking-[0.3em] text-sky-200/70">BioIFOS</div>
        <div className="mt-2 text-3xl font-semibold text-white">欢迎回来</div>
        <p className="mt-1 text-xs text-slate-300/80">
          登录进入服务器控制台，或使用邀请码注册新账号。
        </p>

        <div className="mt-6 flex rounded-full border border-white/10 bg-white/5 p-1 text-xs">
          <button
            type="button"
            className={`flex-1 rounded-full px-3 py-2 transition ${
              mode === "login" ? "bg-sky-500/80 text-white" : "text-slate-300"
            }`}
            onClick={() => setMode("login")}
          >
            登录
          </button>
          <button
            type="button"
            className={`flex-1 rounded-full px-3 py-2 transition ${
              mode === "register" ? "bg-sky-500/80 text-white" : "text-slate-300"
            }`}
            onClick={() => setMode("register")}
          >
            注册
          </button>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4 text-sm">
          <div>
            <label className="mb-1 block text-[11px] text-slate-300">用户名</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none"
              placeholder="请输入用户名"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-300">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none"
              placeholder="请输入密码"
              required
            />
          </div>
          {mode === "register" && (
            <div>
              <label className="mb-1 block text-[11px] text-slate-300">邀请码</label>
              <input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none"
                placeholder="仅管理员可提供"
                required
              />
            </div>
          )}

          {error && <div className="text-xs text-rose-300">{error}</div>}

          <button
            type="submit"
            className="w-full rounded-full border border-sky-400/40 bg-sky-500/80 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500"
            disabled={status === STATUS.loading}
          >
            {status === STATUS.loading ? "处理中" : mode === "login" ? "登录" : "注册"}
          </button>
        </form>
      </div>
    </div>
  );
}
