import axios from "axios";
import { createHash } from "node:crypto";
import { getQuickJS } from "quickjs-emscripten";
import type { IQnType, IStreamType, PlaybackResult } from "@/types";
import { chooseDouyuQuality, describeDouyuPlayback, parseDouyuQualities } from "./quality";

const DID = "10000000000000000000000000001501";

export async function signDouyuScript(script: string, rid: string): Promise<string> {
  if (script.length > 1024 * 1024 || !/^\d+$/.test(rid)) throw new Error("斗鱼签名数据不正确");
  const engine = await getQuickJS();
  const runtime = engine.newRuntime();
  runtime.setMemoryLimit(8 * 1024 * 1024);
  runtime.setMaxStackSize(256 * 1024);
  const deadline = Date.now() + 1000;
  runtime.setInterruptHandler(() => Date.now() > deadline);
  const context = runtime.newContext();
  try {
    const md5 = context.newFunction("md5", (value) => context.newString(createHash("md5").update(context.getString(value)).digest("hex")));
    context.setProp(context.global, "__md5", md5);
    md5.dispose();
    context.unwrapResult(context.evalCode("var CryptoJS = {MD5: function(s) {return {toString: function() {return __md5(String(s));}}}}; var window = {};")).dispose();
    context.unwrapResult(context.evalCode(script)).dispose();
    const result = context.unwrapResult(context.evalCode(`ub98484234(${JSON.stringify(rid)},${JSON.stringify(DID)},${JSON.stringify(String(Math.round(Date.now() / 1000)))})`));
    try {
      const value = context.getString(result);
      if (!value || value.length > 16000) throw new Error("斗鱼签名生成失败");
      return value;
    } finally { result.dispose(); }
  } finally {
    context.dispose();
    runtime.dispose();
  }
}

export async function getDouyuDartPlayback(rid: string, qn: IQnType, type: IStreamType, cookie: string, rate?: number): Promise<PlaybackResult> {
  const headers = {
    Referer: `https://www.douyu.com/${rid}`,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    ...(cookie ? { Cookie: cookie } : {}),
  };
  const freshArgs = async () => {
    const response = await axios.get(`https://www.douyu.com/swf_api/homeH5Enc?rids=${rid}`, { headers, proxy: false, timeout: 15000 });
    const script = response.data?.data?.[`room${rid}`];
    if (typeof script !== "string") throw new Error("斗鱼签名获取失败");
    return new URLSearchParams(await signDouyuScript(script, rid));
  };
  const play = async (selectedRate: number, cdn = "") => {
    const params = await freshArgs();
    for (const [key, value] of Object.entries({ cdn, rate: String(selectedRate), ver: "Douyu_223061205", iar: "1", ive: "1", hevc: "0", fa: "0" })) params.set(key, value);
    const response = await axios.post(`https://www.douyu.com/lapi/live/getH5Play/${rid}`, params.toString(), {
      headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" }, proxy: false, timeout: 15000,
    });
    if (Number(response.data?.error) !== 0 || !response.data?.data) throw new Error("斗鱼播放请求失败，房间可能未开播或账号需要重新登录");
    return response.data.data;
  };
  const initial = await play(-1);
  const qualities = parseDouyuQualities(initial.multirates);
  const selected = chooseDouyuQuality(qualities, qn, rate);
  if (!selected) throw new Error("斗鱼未返回画质列表");
  const cdns: string[] = Array.isArray(initial.cdnsWithName)
    ? initial.cdnsWithName.map((item: { cdn?: string }) => item.cdn).filter((cdn: unknown): cdn is string => typeof cdn === "string") : [];
  cdns.sort((a, b) => Number(a.startsWith("scdn")) - Number(b.startsWith("scdn")));
  let lastError: unknown;
  for (const cdn of (cdns.length ? cdns.slice(0, 2) : [""])) {
    try {
      const data = await play(selected.rate, cdn);
      return describeDouyuPlayback(data, parseDouyuQualities(data.multirates).length ? parseDouyuQualities(data.multirates) : qualities, selected.rate, type);
    } catch (error) { lastError = error; }
  }
  throw lastError;
}
