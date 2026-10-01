"use client";

import { useEffect, useState } from "react";
import { readDouyuCookie, saveDouyuCookie } from "@/lib/douyu-cookie";

const LOGIN_ID_KEY = "uni-live.douyu-login-id";

export function DouyuAccountPanel() {
  const [hasCookie, setHasCookie] = useState(false);
  const [input, setInput] = useState("");
  const [loginId, setLoginId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setHasCookie(Boolean(readDouyuCookie()));
    setLoginId(sessionStorage.getItem(LOGIN_ID_KEY));
  }, []);

  useEffect(() => {
    if (!loginId) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch(`/api/account/douyu/login?id=${encodeURIComponent(loginId)}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "获取登录状态失败");
        if (result.status === "completed") {
          if (disposed) return;
          saveDouyuCookie(result.cookie);
          sessionStorage.removeItem(LOGIN_ID_KEY);
          if (disposed) return;
          setHasCookie(true);
          setLoginId(null);
          setMessage("斗鱼 Cookie 已保存，正在观看的斗鱼房间会自动更新画质");
          return;
        }
        if (disposed) return;
        if (result.status === "failed") throw new Error(result.message || "登录失败");
        timer = setTimeout(poll, 1500);
      } catch (error) {
        if (disposed) return;
        sessionStorage.removeItem(LOGIN_ID_KEY);
        setLoginId(null);
        setMessage(error instanceof Error ? error.message : "登录失败，请重试");
      }
    };
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [loginId]);

  const startLogin = async () => {
    setStarting(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/douyu/login", {
        method: "POST",
        signal: AbortSignal.timeout(10000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "无法启动登录");
      sessionStorage.setItem(LOGIN_ID_KEY, result.id);
      setLoginId(result.id);
      setMessage("请在新打开的 Edge 窗口中登录斗鱼，完成后会自动保存并关闭窗口。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法启动登录");
    } finally {
      setStarting(false);
    }
  };

  const save = () => {
    try {
      const cookie = saveDouyuCookie(input);
      setHasCookie(Boolean(cookie));
      setInput("");
      setMessage(cookie ? "Cookie 已保存，正在观看的斗鱼房间会自动更新画质" : "Cookie 已清除，正在切换为匿名播放");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">斗鱼账号</h3>
        <p className="text-xs text-muted">{hasCookie ? "已配置登录 Cookie" : "未配置，当前使用匿名播放"}</p>
      </div>
      <p className="text-xs text-muted">
        登录后可获取账号对应的直播画质。Cookie 保存在当前浏览器，取流时会发送给本应用后端，不会写入分享链接。
      </p>
      <button
        type="button"
        onClick={() => void startLogin()}
        disabled={starting || Boolean(loginId)}
        className="primary-button disabled:opacity-50"
      >
        {starting ? "正在打开..." : loginId ? "等待斗鱼登录..." : "打开浏览器登录斗鱼"}
      </button>
      <p className="text-xs text-muted">便捷登录需要在 Windows 本机运行并安装 Microsoft Edge，也可在下方粘贴 Cookie。</p>
      <details className="space-y-3 rounded-lg border border-border p-3">
        <summary className="cursor-pointer text-sm">粘贴 Cookie</summary>
        <p className="mt-3 text-xs text-muted">
          在 www.douyu.com 登录后，按 F12 打开网络面板，从斗鱼请求标头中复制完整 Cookie。支持直接粘贴 Cookie 值或 Cookie: 请求头。
        </p>
        <textarea
          aria-label="斗鱼 Cookie"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="粘贴完整 Cookie"
          rows={4}
          spellCheck={false}
          className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-xs outline-none focus:border-accent"
        />
        <button type="button" onClick={save} disabled={Boolean(loginId)} className="primary-button disabled:opacity-50">
          保存 Cookie
        </button>
      </details>
      {hasCookie && (
        <button
          type="button"
          disabled={Boolean(loginId)}
          onClick={() => { saveDouyuCookie(""); setHasCookie(false); setMessage("Cookie 已清除，正在切换为匿名播放"); }}
          className="text-xs text-danger disabled:opacity-50"
        >
          清除 Cookie
        </button>
      )}
      {message && <p role="status" className="text-xs text-muted">{message}</p>}
    </div>
  );
}
