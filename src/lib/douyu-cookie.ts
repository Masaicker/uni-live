const STORAGE_KEY = "uni-live.douyu-cookie";
export const DOUYU_COOKIE_EVENT = "uni-live:douyu-cookie-changed";

export function normalizeDouyuCookie(input: string): string {
  const text = input.trim();
  const header = text.match(/^\s*cookie\s*:\s*(.+)$/im);
  const cookie = (header?.[1] ?? text).trim();
  if (!cookie) return "";
  if (
    cookie.length > 16000 ||
    /[\u0000-\u001f\u007f]/.test(cookie) ||
    !cookie.split(";").every((part) => !part.trim() || /^[^=;\s]+=.*/.test(part.trim()))
  ) {
    throw new Error("Cookie 格式不正确，请粘贴斗鱼请求中的完整 Cookie");
  }
  return cookie;
}

export function normalizeDouyuLoginCookie(input: string): string {
  const cookie = normalizeDouyuCookie(input);
  if (!cookie) throw new Error("请先粘贴完整 Cookie");
  const parts = cookie.split(";").map((part) => part.trim());
  const values = (name: string) => parts.filter((part) => part.startsWith(`${name}=`)).map((part) => part.slice(name.length + 1));
  const uid = values("acf_uid"), auth = values("acf_auth");
  if (uid.length > 1 || auth.length > 1) throw new Error("Cookie 登录信息重复，请重新复制完整 Cookie");
  if (!uid[0] || !/^\d+$/.test(uid[0]) || Number(uid[0]) <= 0 || !auth[0]) {
    throw new Error("Cookie 缺少有效登录信息，请登录斗鱼后重新复制");
  }
  return cookie;
}

export function readDouyuCookie(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

export function saveDouyuCookie(input: string): string {
  const cookie = normalizeDouyuCookie(input);
  if (cookie) localStorage.setItem(STORAGE_KEY, cookie);
  else localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(DOUYU_COOKIE_EVENT));
  return cookie;
}
