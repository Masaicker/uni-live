import axios from "axios";
import type { IHuyaChannelInfo, IQnType, IStreamType, PlaybackResult, Platform, RoomInfo } from "@/types";
import { readDouyuCookie } from "@/lib/douyu-cookie";

export function apiGetDouyuRealRid(rid: string, signal?: AbortSignal): Promise<string> {
  return axios
    .post("/api/rid/douyu", { rid }, { signal, timeout: 20000 })
    .then((ret) => ret.data.rid as string);
}

export function apiGetDouyuStream(
  rid: string,
  qn: IQnType,
  type: IStreamType
): Promise<string> {
  return axios
    .post("/api/stream/douyu", {
      rid,
      qn: qn || "原画",
      type: type || "flv",
      cookie: readDouyuCookie(),
    })
    .then((ret) => ret.data.stream as string);
}

export async function apiGetDouyuPlayback(rid: string, qn: IQnType, type: IStreamType, rate?: number, signal?: AbortSignal): Promise<PlaybackResult> {
  const response = await axios.post("/api/stream/douyu", { rid, qn, type, rate, cookie: readDouyuCookie() }, { signal, timeout: 120000 });
  return response.data;
}

export async function apiGetRoomInfo(platform: Platform, rid: string, signal?: AbortSignal): Promise<RoomInfo> {
  const response = await axios.post("/api/room/info", { platform, rid }, { signal, timeout: 45000 });
  return response.data;
}

export function apiGetHuyaStream(rid: string, signal?: AbortSignal, type: IStreamType = "flv"): Promise<string> {
  return axios
    .post("/api/stream/huya", { rid, type }, { signal, timeout: 30000 })
    .then((ret) => ret.data.stream as string);
}

export function apiGetBilibiliStream(
  rid: string,
  qn: IQnType,
  type: IStreamType,
  signal?: AbortSignal
): Promise<string> {
  return axios
    .post("/api/stream/bilibili", {
      rid,
      type: type || "flv",
      qn: qn || "原画",
    }, { signal, timeout: 30000 })
    .then((ret) => ret.data.stream as string);
}

export function apiGetBilibiliRealRid(rid: string, signal?: AbortSignal): Promise<string> {
  return axios
    .post("/api/rid/bilibili", { rid }, { signal, timeout: 20000 })
    .then((ret) => ret.data.rid as string);
}

export function apiGetHuyaChannelInfo(rid: string, signal?: AbortSignal): Promise<IHuyaChannelInfo> {
  return axios
    .post("/api/rid/huyaChannelInfo", { rid }, { signal, timeout: 15000 })
    .then((ret) => ret.data as IHuyaChannelInfo);
}
