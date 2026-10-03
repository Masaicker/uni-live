import "server-only";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser } from "playwright-core";

type LoginSession = {
  status: "pending" | "completed" | "failed";
  expiresAt: number;
  cookie?: string;
  message?: string;
  browser?: Browser;
};

// 开发热更新期间保留登录任务，避免轮询请求丢失对应会话。
const loginGlobal = globalThis as typeof globalThis & {
  douyuLoginSessions?: Map<string, LoginSession>;
};
const sessions = loginGlobal.douyuLoginSessions ??= new Map<string, LoginSession>();
const LOGIN_TIMEOUT = 5 * 60 * 1000;

function pruneSessions() {
  for (const [id, session] of sessions) {
    if (session.expiresAt <= Date.now()) sessions.delete(id);
  }
}

export function startDouyuLogin(userAgent = ""): string {
  pruneSessions();
  if (process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    throw new Error("当前环境无法显示登录窗口，请粘贴 Cookie");
  }
  if ([...sessions.values()].some((session) => session.status === "pending")) {
    throw new Error("已有斗鱼登录窗口，请先完成或关闭该窗口");
  }
  const id = randomUUID();
  const session: LoginSession = {
    status: "pending",
    expiresAt: Date.now() + LOGIN_TIMEOUT,
  };
  sessions.set(id, session);
  void collectCookie(session, userAgent);
  return id;
}

export function readDouyuLogin(id: string): LoginSession | undefined {
  pruneSessions();
  const session = sessions.get(id);
  // 完成结果暂存一分钟，允许页面切换或开发模式下的重复轮询。
  if (!session) return undefined;
  return { status: session.status, expiresAt: session.expiresAt, cookie: session.cookie, message: session.message };
}

export async function cancelDouyuLogin(id: string) {
  const session = sessions.get(id);
  if (!session || session.status !== "pending") return;
  session.status = "failed";
  session.message = "登录已取消";
  session.expiresAt = Date.now() + 60000;
  await session.browser?.close().catch(() => {});
}

async function launchLoginBrowser(userAgent: string) {
  const channels = /Edg\//.test(userAgent) ? ["msedge", "chrome"] : ["chrome", "msedge"];
  let lastError: unknown;
  for (const channel of channels) {
    try {
      const browser = await chromium.launch({ channel, headless: false, timeout: 15000 });
      return { browser, name: channel === "msedge" ? "Edge" : "Chrome" };
    } catch (error) {
      lastError = error;
    }
  }
  const paths = [
    chromium.executablePath(),
    ...(process.platform === "linux" ? ["/usr/bin/chromium", "/usr/bin/chromium-browser"] : []),
    ...(process.platform === "darwin" ? ["/Applications/Chromium.app/Contents/MacOS/Chromium"] : []),
    ...(process.platform === "win32" && process.env.LOCALAPPDATA ? [join(process.env.LOCALAPPDATA, "Chromium", "Application", "chrome.exe")] : []),
  ];
  for (const executablePath of paths.filter(existsSync)) {
    try {
      const browser = await chromium.launch({ executablePath, headless: false, timeout: 15000 });
      return { browser, name: "Chromium" };
    } catch (error) {
      lastError = error;
    }
  }
  console.error("Failed to open Douyu login browser:", lastError);
  throw new Error("无法打开登录窗口，请确认本机已安装 Chrome、Edge 或 Chromium，并可显示桌面窗口");
}

async function collectCookie(session: LoginSession, userAgent: string) {
  let browser: Browser | undefined;
  try {
    const launched = await launchLoginBrowser(userAgent);
    browser = launched.browser;
    session.browser = browser;
    if (session.status !== "pending") return;
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("https://www.douyu.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
    if (session.status !== "pending") return;
    session.message = `请在新打开的 ${launched.name} 窗口登录斗鱼`;
    while (session.status === "pending" && Date.now() < session.expiresAt) {
      const cookies = await context.cookies("https://www.douyu.com/");
      if (session.status !== "pending") return;
      const uid = cookies.find((cookie) => cookie.name === "acf_uid")?.value;
      const auth = cookies.find((cookie) => cookie.name === "acf_auth")?.value;
      if (uid && /^\d+$/.test(uid) && Number(uid) > 0 && auth) {
        session.cookie = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
        session.status = "completed";
        session.expiresAt = Date.now() + 60000;
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (session.status !== "pending") return;
    session.status = "failed";
    session.message = "登录等待超时，请重新登录";
    session.expiresAt = Date.now() + 60000;
  } catch (error) {
    if (session.status !== "pending") return;
    session.status = "failed";
    session.message = browser
      ? browser.isConnected() ? "斗鱼页面加载失败，请检查网络后重试" : "登录窗口已关闭，请重试"
      : error instanceof Error ? error.message : "无法打开登录窗口，请重试";
    if (browser?.isConnected()) console.error("Failed to load Douyu login page:", error);
    session.expiresAt = Date.now() + 60000;
  } finally {
    await browser?.close().catch(() => {});
    delete session.browser;
  }
}
