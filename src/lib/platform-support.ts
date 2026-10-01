import type { Platform } from "@/types";

// Keep saved Bilibili data and adapters available for a future reactivation.
export const BILIBILI_ENABLED = false;
export const BILIBILI_DISABLED_MESSAGE = "暂不支持哔哩哔哩直播";

export function isPlatformEnabled(platform: Platform): boolean {
  return platform !== "bilibili" || BILIBILI_ENABLED;
}

export function assertPlatformEnabled(platform: Platform): void {
  if (!isPlatformEnabled(platform)) throw new Error(BILIBILI_DISABLED_MESSAGE);
}
