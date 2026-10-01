import type { IQnType, PlaybackResult, QualityOption } from "@/types";

export function parseDouyuQualities(value: unknown): QualityOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item.name !== "string" || item.rate === null || item.rate === "" || !Number.isInteger(Number(item.rate))) return [];
    const rate = Number(item.rate);
    if (rate < 0) return [];
    const bit = Number(item.bit);
    return [{ name: item.name, rate, ...(bit > 0 ? { bit } : {}) }];
  });
}

export function chooseDouyuQuality(qualities: QualityOption[], qn: IQnType, rate?: number): QualityOption | undefined {
  if (rate !== undefined) {
    const exact = qualities.find((item) => item.rate === rate);
    return exact ?? { name: `画质 ${rate}`, rate };
  }
  if (qn !== "原画" && rate === undefined) {
    const named = qualities.find((item) => item.name === qn) ?? qualities.find((item) => item.name.startsWith(qn));
    if (named) return named;
  }
  return [...qualities].sort((a, b) => (b.bit ?? 0) - (a.bit ?? 0))[0];
}

export function describeDouyuPlayback(data: Record<string, unknown>, qualities: QualityOption[], requestedRate: number, type: "hls" | "flv"): PlaybackResult {
  const actualRate = data.rate === undefined || data.rate === null ? undefined : Number(data.rate);
  const selectedQuality = qualities.find((item) => item.rate === actualRate) ?? (Number.isInteger(actualRate) ? { name: `画质 ${actualRate}`, rate: actualRate! } : undefined);
  const url = type === "hls" && data.hls_url && data.hls_live
    ? `${data.hls_url}/${data.hls_live}`
    : data.rtmp_url && data.rtmp_live ? `${data.rtmp_url}/${data.rtmp_live}` : "";
  if (!url) throw new Error("斗鱼未返回可播放地址");
  const downgraded = selectedQuality && selectedQuality.rate !== requestedRate;
  return {
    stream: url.replace(/&amp;/g, "&"), qualities, selectedQuality, requestedRate,
    ...(downgraded ? { warning: `请求 ${qualities.find((q) => q.rate === requestedRate)?.name ?? "所选画质"}，实际返回 ${selectedQuality.name}；请检查账号权限或重新登录。` } : !selectedQuality ? { warning: "斗鱼未报告实际画质，请刷新后重试。" } : {}),
  };
}
