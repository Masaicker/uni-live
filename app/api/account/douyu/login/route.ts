import { NextResponse } from "next/server";
import { cancelDouyuLogin, readDouyuLogin, startDouyuLogin } from "@/lib/douyu-login";

export const runtime = "nodejs";

function isLocalRequest(request: Request, requireOrigin = false): boolean {
  try {
    const internalUrl = new URL(request.url);
    // Next.js may build request.url from its bind address (0.0.0.0), not the browser's Host.
    const url = new URL(`${internalUrl.protocol}//${request.headers.get("host") ?? internalUrl.host}`);
    const origin = request.headers.get("origin");
    return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash
      && (origin ? origin === url.origin : !requireOrigin)
      && request.headers.get("sec-fetch-site") !== "cross-site";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isLocalRequest(request, true)) {
    return NextResponse.json({ error: "自动获取登录请通过本机地址打开应用，或粘贴 Cookie" }, { status: 403 });
  }
  try {
    return NextResponse.json({ id: startDouyuLogin(request.headers.get("user-agent") ?? "") }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "无法启动登录" },
      { status: 409 }
    );
  }
}

export async function GET(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ error: "自动获取登录请通过本机地址打开应用，或粘贴 Cookie" }, { status: 403 });
  }
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const session = readDouyuLogin(id);
  if (!session) {
    return NextResponse.json({ error: "登录会话已结束，请重新登录" }, { status: 404 });
  }
  return NextResponse.json(session, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  if (!isLocalRequest(request, true)) {
    return NextResponse.json({ error: "无法取消登录" }, { status: 403 });
  }
  await cancelDouyuLogin(new URL(request.url).searchParams.get("id") ?? "");
  return NextResponse.json({ status: "cancelled" }, { headers: { "Cache-Control": "no-store" } });
}
