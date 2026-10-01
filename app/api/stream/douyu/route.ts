import { NextResponse } from "next/server";
import { getDouyuPlayback } from "@/lib/reallive/douyu/reallive";
import type { IQnType, IStreamType } from "@/types";
import { normalizeDouyuCookie } from "@/lib/douyu-cookie";

export async function POST(request: Request) {
  try {
    const { rid, qn, type, cookie, rate } = (await request.json()) as {
      rid: string;
      qn?: IQnType;
      type?: IStreamType;
      cookie?: string;
      rate?: number;
    };
    if (typeof rid !== "string" || !/^\d+$/.test(rid) || (cookie !== undefined && typeof cookie !== "string")) {
      return NextResponse.json({ stream: "", error: "房间号或 Cookie 格式不正确" }, { status: 400 });
    }
    if ((rate !== undefined && (!Number.isInteger(rate) || rate < 0)) || (qn !== undefined && !["原画", "蓝光", "超清", "高清", "流畅"].includes(qn)) || (type !== undefined && type !== "flv" && type !== "hls")) {
      return NextResponse.json({ stream: "", error: "画质参数不正确" }, { status: 400 });
    }
    let normalizedCookie: string;
    try {
      normalizedCookie = normalizeDouyuCookie(cookie ?? "");
    } catch {
      return NextResponse.json({ stream: "", error: "Cookie 格式不正确" }, { status: 400 });
    }
    const playback = await getDouyuPlayback(rid, qn || "原画", type || "flv", normalizedCookie, rate);
    return NextResponse.json(playback);
  } catch (error) {
    console.error("Failed to resolve Douyu stream:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ stream: "", error: "斗鱼取流失败，请确认房间已开播或重新登录" }, { status: 502 });
  }
}
