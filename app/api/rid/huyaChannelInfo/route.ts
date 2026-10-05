import { NextResponse } from "next/server";
import { getChannelInfo_Huya } from "@/lib/reallive/huya/channel";
import { HUYA_DISABLED_MESSAGE, isPlatformEnabled } from "@/lib/platform-support";

export async function POST(request: Request) {
  if (!isPlatformEnabled("huya")) return NextResponse.json({ channelId: "", subChannelId: "", error: HUYA_DISABLED_MESSAGE }, { status: 503 });
  try {
    const { rid } = (await request.json()) as { rid: string };
    const { channelId, subChannelId } = await getChannelInfo_Huya(rid);
    return NextResponse.json({ channelId, subChannelId });
  } catch {
    return NextResponse.json({ channelId: "", subChannelId: "" }, { status: 500 });
  }
}
