import "server-only";
import { randomUUID } from "node:crypto";
import { chromium, type Browser } from "playwright-core";

type LoginSession = {
  status: "pending" | "completed" | "failed";
  expiresAt: number;
  cookie?: string;
  message?: string;
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

export function startDouyuLogin(): string {
  pruneSessions();
  if (process.platform !== "win32") {
    throw new Error("自动登录需要在 Windows 本机运行，也可以使用粘贴 Cookie");
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
  void collectCookie(session);
  return id;
}

export function readDouyuLogin(id: string): LoginSession | undefined {
  pruneSessions();
  const session = sessions.get(id);
  // 完成结果暂存一分钟，允许页面切换或开发模式下的重复轮询。
  return session;
}

async function collectCookie(session: LoginSession) {
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ channel: "msedge", headless: false, timeout: 20000 });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("https://www.douyu.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
    while (Date.now() < session.expiresAt) {
      const cookies = await context.cookies("https://www.douyu.com/");
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
    session.status = "failed";
    session.message = "登录等待超时，请重新登录";
    session.expiresAt = Date.now() + 60000;
  } catch {
    session.status = "failed";
    session.message = browser
      ? "登录窗口已关闭或斗鱼页面加载失败，请重试"
      : "无法打开登录窗口，请确认本机已安装 Microsoft Edge";
    session.expiresAt = Date.now() + 60000;
  } finally {
    await browser?.close().catch(() => {});
  }
}
