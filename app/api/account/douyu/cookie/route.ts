import { NextResponse } from "next/server";
import { normalizeDouyuLoginCookie } from "@/lib/douyu-cookie";
import { verifyDouyuCookie } from "@/lib/douyu-account";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let cookie: string;
  try {
    const body = await request.json();
    if (typeof body?.cookie !== "string") throw new Error("请粘贴完整 Cookie");
    cookie = normalizeDouyuLoginCookie(body.cookie);
  } catch (error) {
    return NextResponse.json({ valid: false, error: error instanceof SyntaxError ? "请求格式不正确" : error instanceof Error ? error.message : "Cookie 格式不正确" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result = await verifyDouyuCookie(cookie);
    return NextResponse.json(result, { status: result.valid ? 200 : 401, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "检测失败，请稍后重试" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
