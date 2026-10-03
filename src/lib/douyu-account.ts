import "server-only";
import axios from "axios";

export async function verifyDouyuCookie(cookie: string): Promise<{ valid: boolean; error?: string }> {
  let data: { error?: unknown };
  try {
    const response = await axios.get("https://www.douyu.com/wgapi/livenc/liveweb/follow/list", {
      proxy: false,
      timeout: 10000,
      maxRedirects: 0,
      maxContentLength: 1024 * 1024,
      headers: {
        Cookie: cookie,
        Referer: "https://www.douyu.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
      },
    });
    data = response.data;
  } catch (error) {
    // Never forward Axios errors: they include the Cookie request header.
    if (axios.isAxiosError(error) && ["ECONNABORTED", "ETIMEDOUT"].includes(error.code ?? "")) {
      throw new Error("检测超时，请稍后重试");
    }
    throw new Error("暂时无法连接斗鱼检测登录，请稍后重试");
  }
  if (data?.error === 0) return { valid: true };
  if (data?.error === -1) return { valid: false, error: "Cookie 无效或已过期，请登录斗鱼后重新复制" };
  throw new Error("斗鱼登录检测暂不可用，请稍后重试");
}
