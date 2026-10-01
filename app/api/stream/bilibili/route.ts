import { NextResponse } from "next/server";
import { getRealLive_Bilibili } from "@/lib/reallive/bilibili/reallive";
import type { IQnType, IStreamType } from "@/types";
import { BILIBILI_DISABLED_MESSAGE, isPlatformEnabled } from "@/lib/platform-support";

export async function POST(request: Request) {
  if (!isPlatformEnabled("bilibili")) return NextResponse.json({ stream: "", error: BILIBILI_DISABLED_MESSAGE }, { status: 503 });
  try {
    const { rid, type, qn } = (await request.json()) as {
      rid: string;
      type?: IStreamType;
      qn?: IQnType;
    };
    if (typeof rid !== "string" || !/^\d+$/.test(rid) || (type !== undefined && !["flv", "hls"].includes(type)) || (qn !== undefined && !["原画", "蓝光", "超清", "高清", "流畅"].includes(qn))) {
      return NextResponse.json({ stream: "", error: "哔哩哔哩房间号或画质参数不正确" }, { status: 400 });
    }
    const stream = await getRealLive_Bilibili(rid, qn || "原画", type || "flv");
    return NextResponse.json({ stream });
  } catch (error) {
    return NextResponse.json({ stream: "", error: error instanceof Error && error.message.startsWith("哔哩哔哩") ? error.message : "哔哩哔哩取流失败，请稍后刷新" }, { status: 502 });
  }
}
