"use client";
import { useEffect, useRef, useState } from "react";
import { deserialize, DouyuDanmu } from "douyu-danmu-ws";
import { LiveWS } from "bilibili-live-ws/browser";
import type { DanmakuStatus, Platform } from "@/types";
import { isPlatformEnabled } from "@/lib/platform-support";
import { apiGetHuyaChannelInfo } from "@/apis";
import { initHuyaDanmaku } from "@/lib/danmaku/huya";
import { getDouyuDanmakuColor, type DanmakuLayerHandle } from "./DanmakuLayer";

type Connection = { close: () => void; addListener?: (name: string, listener: () => void) => void };

function nonNegativeInteger(value: string | number | undefined): number | null {
  if (!/^\d+$/.test(String(value ?? ""))) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

export function useRoomDanmaku(platform: Platform, rid: string, enabled: boolean, layer: React.RefObject<DanmakuLayerHandle | null>, douyuMinLevel = 0) {
  const [status, setStatus] = useState<DanmakuStatus>("disabled");
  const [nobles, setNobles] = useState<{ rid: string; count: number } | null>(null);
  const [retry, setRetry] = useState(0);
  const layerRef = useRef(layer);
  layerRef.current = layer;
  const preferences = useRef({ enabled, douyuMinLevel });
  preferences.current = { enabled, douyuMinLevel };
  // Douyu broadcasts VIP counts on the same connection, even with danmaku hidden.
  const needsConnection = platform === "douyu" || enabled;
  useEffect(() => {
    setNobles(null);
    if (!isPlatformEnabled(platform) || platform === "direct" || platform === "unknown") { setStatus("unsupported"); return; }
    if (!needsConnection) { setStatus("disabled"); return; }
    if (!rid) { setStatus("connecting"); return; }
    let disposed = false, attempt = 0;
    let connection: Connection | null = null;
    let stopCurrent = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    let connectTimer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const push = (text: string, color?: string) => { if (!disposed && preferences.current.enabled && text) layerRef.current.current?.push(text, { color }); };
    const connect = async () => {
      if (disposed) return;
      setNobles(null);
      setStatus("connecting");
      let finished = false;
      let connected = false;
      const ready = () => { if (!disposed && !finished && !connected) { connected = true; clearTimeout(connectTimer); setStatus("connected"); } };
      const fail = () => {
        if (disposed || finished) return;
        finished = true;
        clearTimeout(connectTimer);
        stopCurrent();
        connection = null;
        setNobles(null);
        setStatus("error");
        const delay = [1000, 3000, 10000][attempt++];
        if (delay !== undefined) timer = setTimeout(() => void connect(), delay);
      };
      connectTimer = setTimeout(fail, 15000);
      try {
        if (platform === "douyu") {
          const client = new DouyuDanmu(rid, (raw: string) => {
            if (disposed || finished) return;
            // The client retains the binary packet header in the decoded text.
            const start = raw.indexOf("type@=");
            if (start < 0) return;
            const data = deserialize(raw.slice(start)) as { type?: string; txt?: string; col?: string | number; vn?: string | number; level?: string | number };
            if (data.type === "loginres") ready();
            if (data.type === "oni") {
              const count = nonNegativeInteger(data.vn);
              if (count !== null) { ready(); setNobles((previous) => previous?.rid === rid && previous.count === count ? previous : { rid, count }); }
            }
            if (data.type === "chatmsg" && data.txt) {
              ready();
              const level = nonNegativeInteger(data.level);
              // Missing levels cannot be classified as below the user's threshold.
              if (level === null || level >= preferences.current.douyuMinLevel) push(data.txt, getDouyuDanmakuColor(data.col));
            }
          }, fail);
          connection = client;
          stopCurrent = () => client.close();
        } else if (platform === "bilibili") {
          const client = new LiveWS(Number(rid));
          client.on("live", ready);
          client.on("error", fail);
          client.on("e", fail);
          client.on("close", fail);
          client.on("timeout", fail);
          client.on("DANMU_MSG", (data: { info: [unknown[], string] }) => {
            if (finished) return;
            ready();
            const color = Number(data.info?.[0]?.[3]);
            push(String(data.info?.[1] ?? ""), Number.isFinite(color) ? `#${color.toString(16).padStart(6, "0")}` : "#ffffff");
          });
          connection = client;
          stopCurrent = () => client.close();
        } else {
          if (!window.HuYaListener) initHuyaDanmaku();
          const { channelId, subChannelId } = await apiGetHuyaChannelInfo(rid, controller.signal);
          if (disposed || finished) return;
          const client = window.HuYaListener(channelId, subChannelId, (data) => {
            if (finished) return;
            ready();
            push(data.sContent, data.tBulletFormat.iFontColor > 0 ? `#${data.tBulletFormat.iFontColor.toString(16).padStart(6, "0")}` : "#ffffff");
          }) as Connection;
          connection = client;
          stopCurrent = () => client.close();
          client.addListener?.("WSRegisterRsp", ready);
          client.addListener?.("WEBSOCKET_CLOSED", fail);
          client.addListener?.("WEBSOCKET_ERROR", fail);
        }
      } catch { fail(); }
    };
    void connect();
    return () => { disposed = true; controller.abort(); clearTimeout(timer); clearTimeout(connectTimer); connection?.close(); };
  }, [platform, rid, needsConnection, retry]);
  return { status: !enabled && status !== "unsupported" ? "disabled" : status, connectionStatus: status,
    nobleCount: platform === "douyu" && nobles?.rid === rid ? nobles.count : null, retry: () => setRetry((value) => value + 1) };
}
