import { NextResponse } from "next/server";
import { getRealRid_Bilibili } from "@/lib/reallive/bilibili/realrid";
import { BILIBILI_DISABLED_MESSAGE, isPlatformEnabled } from "@/lib/platform-support";

export async function POST(request: Request) {
  if (!isPlatformEnabled("bilibili")) return NextResponse.json({ rid: "", error: BILIBILI_DISABLED_MESSAGE }, { status: 503 });
  try {
    const { rid } = (await request.json()) as { rid: string };
    if (typeof rid !== "string" || !/^\d+$/.test(rid)) return NextResponse.json({ rid: "", error: "哔哩哔哩房间号不正确" }, { status: 400 });
    const realRid = await getRealRid_Bilibili(rid);
    return NextResponse.json({ rid: realRid });
  } catch (error) {
    return NextResponse.json({ rid: "", error: error instanceof Error ? error.message : "哔哩哔哩房间解析失败" }, { status: 502 });
  }
}
