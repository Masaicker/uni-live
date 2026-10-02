export class LiveBufferWatchdog {
  private lastEnd = 0;
  private lastProgressAt: number;
  private received = false;

  constructor(now: number) { this.lastProgressAt = now; }

  sample(now: number, end: number, current: number, blocked: boolean, complete: boolean): boolean {
    if (end > this.lastEnd + 0.01) {
      this.received = true;
      this.lastEnd = end;
      this.lastProgressAt = now;
    }
    // Deliberate pause/background and a large forward buffer are not network stalls.
    if (blocked || complete || end - current > 10) { this.lastProgressAt = now; return false; }
    return now - this.lastProgressAt >= (this.received ? 30000 : 15000);
  }
}

let workerSupport: boolean | undefined;
export function supportsPlaybackWorker(): boolean {
  if (workerSupport !== undefined) return workerSupport;
  if (typeof Worker === "undefined") return workerSupport = false;
  let worker: Worker | undefined, url: string | undefined;
  try {
    url = URL.createObjectURL(new Blob([""], { type: "text/javascript" }));
    worker = new Worker(url);
    return workerSupport = true;
  } catch { return workerSupport = false; }
  finally { worker?.terminate(); if (url) URL.revokeObjectURL(url); }
}
