import type { Platform } from "@/types";

// Keep disabled platform data and adapters available for a future reactivation.
export const BILIBILI_ENABLED = false;
export const BILIBILI_DISABLED_MESSAGE = "暂不支持哔哩哔哩直播";
export const HUYA_ENABLED = false;
export const HUYA_DISABLED_MESSAGE = "暂不支持虎牙直播";

export function isPlatformEnabled(platform: Platform): boolean {
  if (platform === "bilibili") return BILIBILI_ENABLED;
  if (platform === "huya") return HUYA_ENABLED;
  return true;
}

export function assertPlatformEnabled(platform: Platform): void {
  if (!isPlatformEnabled(platform)) throw new Error(platform === "huya" ? HUYA_DISABLED_MESSAGE : BILIBILI_DISABLED_MESSAGE);
}
