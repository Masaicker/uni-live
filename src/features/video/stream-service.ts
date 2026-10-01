import type { IQnType, IStreamType, Platform, PlaybackResult } from "@/types";
import {
  apiGetBilibiliRealRid,
  apiGetBilibiliStream,
  apiGetDouyuRealRid,
  apiGetDouyuPlayback,
  apiGetHuyaStream,
} from "@/apis";
import { getLastField, isRid, parseUrlParams } from "@/lib/utils";
import { parseRoomAddress } from "@/lib/room-identity";
import { assertPlatformEnabled } from "@/lib/platform-support";

export async function resolveStreamUrl(
  url: string,
  qnName: IQnType,
  streamType: IStreamType,
  rate?: number,
  signal?: AbortSignal,
  resolvedRid?: string
): Promise<PlaybackResult & { rid: string; platform: Platform }> {
  const address = parseRoomAddress(url);
  const platform = address.platform;
  assertPlatformEnabled(platform);
  if (platform === "direct") return { stream: address.url, rid: "", platform };

  let rid = resolvedRid || address.rid || getLastField(url);
  if (!isRid(rid)) {
    const queryObj = parseUrlParams(url);
    if (queryObj.rid) rid = queryObj.rid;
  }

  let stream = "";

  if (platform === "douyu") {
    const realRid = resolvedRid || await apiGetDouyuRealRid(rid, signal);
    rid = String(realRid);
    return { ...await apiGetDouyuPlayback(rid, qnName, streamType, rate, signal), rid, platform };
  } else if (platform === "bilibili") {
    const realRid = resolvedRid || await apiGetBilibiliRealRid(rid, signal);
    rid = String(realRid);
    stream = await apiGetBilibiliStream(rid, qnName, streamType, signal);
  } else if (platform === "huya") {
    stream = await apiGetHuyaStream(rid, signal, streamType);
  } else {
    stream = url;
  }

  return { stream, rid, platform };
}

export function getStreamErrorMessage(stream: string, platform: Platform): string | null {
  if (!stream || stream.length < 10) {
    if (platform === "douyu" || platform === "bilibili") {
      return "获取直播流失败，可能未开播或清晰度不可用";
    }
    if (platform === "huya") {
      return "获取虎牙直播流失败，请确认房间号正确";
    }
    return "无法解析直播流地址";
  }
  return null;
}
