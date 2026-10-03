"use client";

import { useCallback, useEffect, useState } from "react";
import { Browser, ClipboardText, ArrowSquareOut, CheckCircle, WarningCircle, ArrowsClockwise, CaretDown, Trash } from "@phosphor-icons/react";
import { normalizeDouyuLoginCookie, readDouyuCookie, saveDouyuCookie } from "@/lib/douyu-cookie";
import { RoomAvatar } from "./RoomAvatar";

const LOGIN_ID_KEY = "uni-live.douyu-login-id";

export function DouyuAccountPanel() {
  const [hasCookie, setHasCookie] = useState(false);
  const [input, setInput] = useState("");
  const [showCookieInput, setShowCookieInput] = useState(false);
  const [loginId, setLoginId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"info" | "success" | "error">("info");
  const [checking, setChecking] = useState(false);
  const [validation, setValidation] = useState<"unchecked" | "valid" | "invalid">("unchecked");

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

  const checkCookie = useCallback(async (value: string, save: boolean, signal?: AbortSignal) => {
    setChecking(true);
    setMessage("");
    setMessageKind("info");
    if (!save) setValidation("unchecked");
    try {
      const cookie = normalizeDouyuLoginCookie(value);
      const response = await fetch("/api/account/douyu/cookie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (signal?.aborted) return;
      if (!response.ok || result.valid !== true) {
        if (!save && result.valid === false) setValidation("invalid");
        throw new Error(result.error || "检测失败，请稍后重试");
      }
      if (save) {
        saveDouyuCookie(cookie);
        setHasCookie(true);
        setInput("");
        setShowCookieInput(false);
      }
      setValidation("valid");
      setMessage(save ? "Cookie 已保存，斗鱼画面正在重新加载" : "");
      setMessageKind("success");
    } catch (error) {
      if (signal?.aborted) return;
      setMessage(error instanceof Error && error.name !== "TimeoutError" && error.name !== "TypeError" ? error.message : "暂时无法检测，请稍后重试");
      setMessageKind("error");
    } finally {
      if (!signal?.aborted) setChecking(false);
    }
  }, []);

  useEffect(() => {
    const cookie = readDouyuCookie();
    const pendingLogin = sessionStorage.getItem(LOGIN_ID_KEY);
    setHasCookie(Boolean(cookie));
    setLoginId(pendingLogin);
    if (!cookie || pendingLogin) return;
    const controller = new AbortController();
    void checkCookie(cookie, false, controller.signal);
    return () => controller.abort();
  }, [checkCookie]);

  const busy = starting || Boolean(loginId) || checking;
  const statusState = busy ? "pending" : hasCookie ? validation === "unchecked" ? "saved" : validation : "unchecked";
  const status = starting || loginId ? "等待登录" : checking ? "正在验证" : hasCookie ? validation === "valid" ? "已登录 · Cookie 有效" : validation === "invalid" ? "登录已失效" : "Cookie 已保存 · 待验证" : "未登录";

  return (
    <section className="account-platform" aria-labelledby="douyu-account-title">
      <div className="account-platform-heading">
        <div className="account-platform-name"><RoomAvatar platform="douyu" /><h3 id="douyu-account-title">斗鱼</h3></div>
        <span className="account-platform-status" role="status" data-state={statusState}>
          {busy ? <ArrowsClockwise size={15} className="animate-spin" /> : hasCookie && validation === "valid" ? <CheckCircle size={16} weight="fill" /> : <WarningCircle size={16} />}
          {status}
        </span>
      </div>
      <p className="account-benefits">登录可避免匿名观看约 300 秒后断流，并解锁账号可用的最高画质。</p>
      {hasCookie && <div className="account-cookie-tools">
        <span>已保存 Cookie</span>
        <button type="button" disabled={busy} onClick={() => void checkCookie(readDouyuCookie(), false)}><ArrowsClockwise size={14} />重新检测</button>
        <button
          type="button"
          disabled={busy}
          onClick={() => { saveDouyuCookie(""); setHasCookie(false); setValidation("unchecked"); setMessage("Cookie 已清除，恢复匿名播放"); setMessageKind("info"); }}
          className="account-clear-cookie"
        ><Trash size={14} />清除</button>
      </div>}
      <div className="account-login-methods">
        <button type="button" aria-label="打开浏览器登录斗鱼" onClick={() => void startLogin()} disabled={busy} className="account-login-choice">
          <Browser size={21} />
          <span><strong>{starting ? "正在打开..." : loginId ? "等待登录..." : hasCookie ? "重新登录" : "浏览器登录"}</strong><small>本机登录后自动保存</small></span>
        </button>
        <button type="button" onClick={() => setShowCookieInput(!showCookieInput)} disabled={busy} aria-expanded={showCookieInput} aria-controls="douyu-cookie-input" className="account-login-choice">
          <ClipboardText size={21} />
          <span><strong>粘贴 Cookie</strong><small>手动导入，适合远程部署</small></span>
          <CaretDown size={15} className={showCookieInput ? "is-expanded" : ""} />
        </button>
      </div>
      {loginId && <div className="account-method-actions"><button type="button" onClick={() => void cancelLogin()} className="subtle-button">取消登录</button></div>}
      {showCookieInput && <div id="douyu-cookie-input" className="account-cookie-input">
        <div className="account-method-heading"><label htmlFor="douyu-cookie-value">手动导入 Cookie</label><a href="https://www.douyu.com/" target="_blank" rel="noreferrer" aria-label="在当前浏览器打开斗鱼">打开斗鱼<ArrowSquareOut size={13} /></a></div>
        <p>登录后，从 F12 → 网络 → 请求标头复制 Cookie。</p>
        <textarea
          id="douyu-cookie-value"
          aria-label="斗鱼 Cookie"
          value={input}
          disabled={busy}
          onChange={(event) => setInput(event.target.value)}
          placeholder="完整 Cookie（可含 Cookie: 前缀）"
          rows={4}
          spellCheck={false}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-accent"
        />
        <div className="account-method-actions">
          <button type="button" onClick={() => void checkCookie(input, true)} disabled={busy || !input.trim()} className="primary-button">
            {checking ? "正在检测..." : "检测并保存"}
          </button>
        </div>
      </div>}
      {message && <p role="status" className="account-feedback" data-kind={messageKind}>{message}</p>}
      <p className="account-storage-note">登录信息仅保存在当前浏览器，失效后需重新登录。</p>
    </section>
  );
}
