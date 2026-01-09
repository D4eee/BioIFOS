import { useEffect, useState } from "react";
import { authMe, authUpdate, clearAuthToken, getBfsCredentials, setBfsCredentials } from "@/app/api";
import { useAppSettings } from "@/app/useAppSettings";

export default function Account() {
  const { settings } = useAppSettings();
  const [username, setUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState("");
  const [currentUser, setCurrentUser] = useState("");
  const [bfsHost, setBfsHost] = useState("");
  const [bfsPort, setBfsPort] = useState("");
  const [bfsRoot, setBfsRoot] = useState("");
  const [bfsUser, setBfsUser] = useState("");
  const [bfsPass, setBfsPass] = useState("");
  const [bfsAuthType, setBfsAuthType] = useState<"password" | "key">("password");
  const [bfsKey, setBfsKey] = useState("");
  const [bfsKeyPass, setBfsKeyPass] = useState("");
  const [bfsStatus, setBfsStatus] = useState("");

  useEffect(() => {
    authMe()
      .then((user) => setCurrentUser(user.username))
      .catch(() => setCurrentUser(""));
    getBfsCredentials()
      .then((data) => {
        setBfsHost(data.bfsHost || "");
        setBfsPort(data.bfsPort || "");
        setBfsRoot(data.bfsRoot || "");
        setBfsUser(data.bfsUser || "");
        setBfsPass(data.bfsPass || "");
        setBfsAuthType((data.bfsAuthType as "password" | "key") || "password");
        setBfsKey(data.bfsKey || "");
        setBfsKeyPass(data.bfsKeyPass || "");
      })
      .catch(() => {
        setBfsHost("");
        setBfsPort("");
        setBfsRoot("");
        setBfsUser("");
        setBfsPass("");
        setBfsAuthType("password");
        setBfsKey("");
        setBfsKeyPass("");
      });
  }, []);

  const submit = () => {
    setStatus("");
    if (!currentPassword.trim()) {
      setStatus(settings.language === "en" ? "Current password is required." : "需要填写当前密码。");
      return;
    }
    authUpdate({
      username: username.trim() || undefined,
      currentPassword: currentPassword.trim(),
      newPassword: newPassword.trim() || undefined,
    })
      .then((user) => {
        setStatus(
          settings.language === "en"
            ? `Updated. Current user: ${user.username}`
            : `已更新。当前用户：${user.username}`,
        );
        setCurrentPassword("");
        setNewPassword("");
      })
      .catch((error) => {
        const message =
          error?.message === "username_exists"
            ? settings.language === "en"
              ? "Username already exists."
              : "用户名已存在。"
            : settings.language === "en"
              ? "Update failed. Check your password."
              : "更新失败，请检查密码。";
        setStatus(message);
      });
  };

  const saveBfs = () => {
    setBfsStatus("");
    if (!bfsHost.trim() || !bfsPort.trim()) {
      setBfsStatus(settings.language === "en" ? "Host and port are required." : "需要填写服务器B地址与端口。");
      return;
    }
    if (bfsAuthType === "password") {
      if (!bfsUser.trim() || !bfsPass.trim()) {
        setBfsStatus(settings.language === "en" ? "B credentials are required." : "需要填写服务器B账号与密码。");
        return;
      }
    }
    if (bfsAuthType === "key") {
      if (!bfsUser.trim() || !bfsKey.trim()) {
        setBfsStatus(settings.language === "en" ? "Key credentials are required." : "需要填写服务器B账号与私钥。");
        return;
      }
    }
    setBfsCredentials({
      bfsAuthType,
      bfsHost: bfsHost.trim(),
      bfsPort: bfsPort.trim(),
      bfsRoot: bfsRoot.trim(),
      bfsUser: bfsUser.trim(),
      bfsPass: bfsPass.trim(),
      bfsKey: bfsKey.trim(),
      bfsKeyPass: bfsKeyPass.trim(),
    })
      .then(() => {
        setBfsStatus(settings.language === "en" ? "Saved." : "已保存。");
      })
      .catch(() => {
        setBfsStatus(settings.language === "en" ? "Save failed." : "保存失败。");
      });
  };

  const handleLogout = () => {
    clearAuthToken();
    window.location.reload();
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6 text-zinc-100 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div className="text-lg font-semibold">{settings.language === "en" ? "Account" : "账号"}</div>
        <button
          onClick={handleLogout}
          className="rounded-full border border-rose-400/60 bg-rose-500/20 px-4 py-2 text-xs text-rose-100 hover:bg-rose-500/30"
        >
          {settings.language === "en" ? "Log Out" : "退出账号"}
        </button>
      </div>

      <div className="mt-6 grid gap-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-zinc-300">
          <div className="mb-2 text-[10px] uppercase tracking-widest text-zinc-500">
            {settings.language === "en" ? "Username" : "用户名"}
          </div>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={
              settings.language === "en"
                ? `New username (current: ${currentUser || "-"})`
                : `新用户名（当前：${currentUser || "-"}）`
            }
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-100 outline-none"
          />
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-zinc-300">
          <div className="mb-2 text-[10px] uppercase tracking-widest text-zinc-500">
            {settings.language === "en" ? "Password" : "密码"}
          </div>
          <div className="text-[11px] text-zinc-400">
            {settings.language === "en"
              ? "Passwords are encrypted and cannot be viewed."
              : "密码已加密，无法查看。"}
          </div>
          <div className="mt-3 grid gap-2">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder={settings.language === "en" ? "Current password" : "当前密码"}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-100 outline-none"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={settings.language === "en" ? "New password" : "新密码"}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-100 outline-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-zinc-400">
          <div>{status}</div>
          <button
            onClick={submit}
            className="rounded-full border border-emerald-400/60 bg-emerald-500/20 px-4 py-2 text-xs text-emerald-100 hover:bg-emerald-500/30"
          >
            {settings.language === "en" ? "Save" : "保存"}
          </button>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-zinc-300">
          <div className="mb-2 text-[10px] uppercase tracking-widest text-zinc-500">
            {settings.language === "en" ? "Server B Credentials" : "服务器B账号"}
          </div>
          <div className="grid gap-2">
            <input
              value={bfsHost}
              onChange={(e) => setBfsHost(e.target.value)}
              placeholder={settings.language === "en" ? "Server B host" : "服务器B地址"}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-100 outline-none"
            />
            <input
              value={bfsPort}
              onChange={(e) => setBfsPort(e.target.value)}
              placeholder={settings.language === "en" ? "Server B port" : "服务器B端口"}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-100 outline-none"
            />
            <input
              value={bfsRoot}
              onChange={(e) => setBfsRoot(e.target.value)}
              placeholder={settings.language === "en" ? "Server B root (optional)" : "服务器B根目录（可选）"}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-100 outline-none"
            />
          </div>
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            {(["password", "key"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setBfsAuthType(type)}
                className={[
                  "rounded-full border px-3 py-1 transition",
                  bfsAuthType === type
                    ? "border-sky-400/60 bg-sky-500/20 text-sky-100"
                    : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10",
                ].join(" ")}
              >
                {type === "password"
                  ? settings.language === "en"
                    ? "Password"
                    : "账号密码"
                  : settings.language === "en"
                    ? "Key"
                    : "私钥"}
              </button>
            ))}
          </div>
          <div className="grid gap-2">
            <input
              value={bfsUser}
              onChange={(e) => setBfsUser(e.target.value)}
              placeholder={settings.language === "en" ? "Server B username" : "服务器B用户名"}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-100 outline-none"
            />
            {bfsAuthType === "password" ? (
              <input
                type="password"
                value={bfsPass}
                onChange={(e) => setBfsPass(e.target.value)}
                placeholder={settings.language === "en" ? "Server B password" : "服务器B密码"}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-100 outline-none"
              />
            ) : (
              <>
                <textarea
                  value={bfsKey}
                  onChange={(e) => setBfsKey(e.target.value)}
                  placeholder={settings.language === "en" ? "Private key" : "服务器B私钥内容"}
                  className="h-20 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-100 outline-none"
                />
                <input
                  type="password"
                  value={bfsKeyPass}
                  onChange={(e) => setBfsKeyPass(e.target.value)}
                  placeholder={settings.language === "en" ? "Key passphrase (optional)" : "私钥密码（可选）"}
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-100 outline-none"
                />
              </>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
            <div>{bfsStatus}</div>
            <button
              onClick={saveBfs}
              className="rounded-full border border-sky-400/60 bg-sky-500/20 px-4 py-2 text-xs text-sky-100 hover:bg-sky-500/30"
            >
              {settings.language === "en" ? "Save B" : "保存B账号"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
