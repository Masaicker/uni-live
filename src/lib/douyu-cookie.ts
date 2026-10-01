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
