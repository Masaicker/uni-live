"use client";

import { useEffect, useState } from "react";
import { Browser, ClipboardText, ArrowSquareOut } from "@phosphor-icons/react";
import { normalizeDouyuLoginCookie, readDouyuCookie, saveDouyuCookie } from "@/lib/douyu-cookie";
import { RoomAvatar } from "./RoomAvatar";

const LOGIN_ID_KEY = "uni-live.douyu-login-id";

export function DouyuAccountPanel() {
  const [hasCookie, setHasCookie] = useState(false);
  const [input, setInput] = useState("");
  const [loginId, setLoginId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"info" | "success" | "error">("info");
  const [checking, setChecking] = useState(false);
  const [validation, setValidation] = useState<"unchecked" | "valid" | "invalid">("unchecked");

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
          setValidation("valid");
          setLoginId(null);
          setMessage("登录已保存，斗鱼画面正在重新加载");
          setMessageKind("success");
          return;
        }
        if (disposed) return;
        if (result.status === "failed") throw new Error(result.message || "登录失败");
        if (result.message) setMessage(result.message);
        timer = setTimeout(poll, 1500);
      } catch (error) {
        if (disposed) return;
        void fetch(`/api/account/douyu/login?id=${encodeURIComponent(loginId)}`, {
          method: "DELETE",
          signal: AbortSignal.timeout(10000),
        }).catch(() => {});
        sessionStorage.removeItem(LOGIN_ID_KEY);
        setLoginId(null);
        setMessage(error instanceof Error ? error.message : "登录失败，请重试");
        setMessageKind("error");
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
    setMessageKind("info");
    try {
      const response = await fetch("/api/account/douyu/login", {
        method: "POST",
        signal: AbortSignal.timeout(10000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "无法启动登录");
      sessionStorage.setItem(LOGIN_ID_KEY, result.id);
      setLoginId(result.id);
      setMessage("正在打开登录窗口...");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法启动登录");
      setMessageKind("error");
    } finally {
      setStarting(false);
    }
  };

  const cancelLogin = async () => {
    if (!loginId) return;
    try {
      const response = await fetch(`/api/account/douyu/login?id=${encodeURIComponent(loginId)}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("取消登录失败，请重试");
      sessionStorage.removeItem(LOGIN_ID_KEY);
      setLoginId(null);
      setMessage("登录已取消");
      setMessageKind("info");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "取消登录失败，请重试");
      setMessageKind("error");
    }
  };

  const checkCookie = async (save: boolean) => {
    setChecking(true);
    setMessage("正在检测 Cookie...");
    setMessageKind("info");
    try {
      const cookie = normalizeDouyuLoginCookie(save ? input : readDouyuCookie());
      const response = await fetch("/api/account/douyu/cookie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie }),
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok || result.valid !== true) {
        if (!save && result.valid === false) setValidation("invalid");
        throw new Error(result.error || "检测失败，请稍后重试");
      }
      if (save) {
        saveDouyuCookie(cookie);
        setHasCookie(true);
        setInput("");
      }
      setValidation("valid");
      setMessage(save ? "Cookie 有效，已保存，斗鱼画面正在重新加载" : "Cookie 有效");
      setMessageKind("success");
    } catch (error) {
      setMessage(error instanceof Error && error.name !== "TimeoutError" && error.name !== "TypeError" ? error.message : "暂时无法检测，请稍后重试");
      setMessageKind("error");
    } finally {
      setChecking(false);
    }
  };

  const busy = starting || Boolean(loginId) || checking;
  const status = starting || loginId ? "等待登录" : checking ? "检测中" : hasCookie ? validation === "valid" ? "登录有效" : validation === "invalid" ? "登录无效" : "已保存 Cookie" : "未登录 · 匿名播放";

  return (
    <section className="account-platform" aria-labelledby="douyu-account-title">
      <div className="account-platform-heading">
        <div className="account-platform-name"><RoomAvatar platform="douyu" /><h3 id="douyu-account-title">斗鱼</h3></div>
        <span className="account-platform-status" data-state={hasCookie ? validation : "unchecked"}>{status}</span>
      </div>
      <p>登录后可获取账号可用画质。</p>
      <div className="account-login-methods">
        <section className="account-login-method" aria-labelledby="douyu-browser-login">
          <h4 id="douyu-browser-login"><Browser size={17} />浏览器登录</h4>
          <p>在登录窗口完成后自动保存 Cookie。</p>
          <div className="account-method-actions">
            <button type="button" aria-label="打开浏览器登录斗鱼" onClick={() => void startLogin()} disabled={busy} className="primary-button">
              {starting ? "正在打开..." : loginId ? "等待登录..." : "打开浏览器登录"}
            </button>
            {loginId && <button type="button" onClick={() => void cancelLogin()} className="subtle-button">取消登录</button>}
          </div>
        </section>
        <section className="account-login-method" aria-labelledby="douyu-cookie-login">
          <div className="account-method-heading">
            <h4 id="douyu-cookie-login"><ClipboardText size={17} />粘贴 Cookie</h4>
            <a href="https://www.douyu.com/" target="_blank" rel="noreferrer" aria-label="在当前浏览器打开斗鱼">打开斗鱼<ArrowSquareOut size={13} /></a>
          </div>
          <p>登录后，从 F12 → 网络 → 请求标头复制 Cookie。</p>
          <textarea
            aria-label="斗鱼 Cookie"
            value={input}
            disabled={checking}
            onChange={(event) => setInput(event.target.value)}
            placeholder="完整 Cookie（可含 Cookie: 前缀）"
            rows={4}
            spellCheck={false}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-accent"
          />
          <div className="account-method-actions">
            <button type="button" onClick={() => void checkCookie(true)} disabled={busy || !input.trim()} className="primary-button">
              {checking ? "正在检测..." : "检测并保存"}
            </button>
          </div>
        </section>
      </div>
      {hasCookie && (
        <div className="account-platform-actions">
          <button type="button" disabled={busy} onClick={() => void checkCookie(false)} className="subtle-button">检测已保存 Cookie</button>
          <button
            type="button"
            disabled={busy}
            onClick={() => { saveDouyuCookie(""); setHasCookie(false); setValidation("unchecked"); setMessage("Cookie 已清除，恢复匿名播放"); setMessageKind("info"); }}
            className="text-xs text-danger disabled:opacity-50"
          >
            清除 Cookie
          </button>
        </div>
      )}
      {message && <p role="status" className="account-feedback" data-kind={messageKind}>{message}</p>}
      <p className="account-storage-note">Cookie 保存在当前浏览器，经本应用后端用于取流；失效后需重新登录。</p>
    </section>
  );
}
