import { NextResponse } from "next/server";
import { readDouyuLogin, startDouyuLogin } from "@/lib/douyu-login";

export const runtime = "nodejs";

function isLocalRequest(request: Request): boolean {
  const url = new URL(request.url);
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

export async function POST(request: Request) {
  if (!isLocalRequest(request) || request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "自动登录仅支持在本机地址打开应用" }, { status: 403 });
  }
  try {
    return NextResponse.json({ id: startDouyuLogin() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "无法启动登录" },
      { status: 409 }
    );
  }
}

export async function GET(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ error: "自动登录仅支持在本机地址打开应用" }, { status: 403 });
  }
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const session = readDouyuLogin(id);
  if (!session) {
    return NextResponse.json({ error: "登录会话已结束，请重新登录" }, { status: 404 });
  }
  return NextResponse.json(session, { headers: { "Cache-Control": "no-store" } });
}
