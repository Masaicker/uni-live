"use client";
import { useState } from "react";
import { Broadcast } from "@phosphor-icons/react";
import type { Platform } from "@/types";

export function RoomAvatar({ url, platform }: { url?: string; platform: Platform }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return <span className={`platform-avatar platform-${platform}`}>
    {url && failedUrl !== url
      // Platform CDNs vary by room; images are loaded directly with an icon fallback.
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} />
      : <Broadcast size={17} />}
  </span>;
}
