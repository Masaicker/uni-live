import { NextResponse } from "next/server";
import { getRealLive_Huya } from "@/lib/reallive/huya/reallive";
import type { IStreamType } from "@/types";

export async function POST(request: Request) {
  try {
    const { rid, type } = (await request.json()) as { rid: string; type?: IStreamType };
    if (typeof rid !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(rid) || (type !== undefined && !["flv", "hls"].includes(type))) return NextResponse.json({ stream: "", error: "虎牙房间号或播放格式不正确" }, { status: 400 });
    const stream = await getRealLive_Huya(rid, type);
    return NextResponse.json({ stream });
  } catch (error) {
    return NextResponse.json({ stream: "", error: error instanceof Error && error.message.startsWith("虎牙") ? error.message : "虎牙取流失败，请稍后刷新" }, { status: 502 });
  }
}
