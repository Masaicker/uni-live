import type flvjs from "flv.js";

// The bundled loader defers abort in Chromium until another chunk arrives.
// A room must release its request even when that stream has stopped sending.
export function createFlvHttpLoader(flv: typeof flvjs): flvjs.CustomLoaderConstructor {
  return class FlvHttpLoader extends flv.BaseLoader {
    private controller: AbortController | null = null;
    constructor(private seek: flvjs.SeekHandler, private config: flvjs.Config) {
      super("abortable-fetch-stream-loader");
      this._needStash = true;
    }

    abort() { this.controller?.abort(); this.controller = null; this._status = flv.LoaderStatus.kIdle; }
    destroy() { this.abort(); super.destroy(); }

    open(source: flvjs.MediaSegment, range: flvjs.Range) {
      this.abort();
      const controller = new AbortController();
      this.controller = controller;
      this._status = flv.LoaderStatus.kConnecting;
      void this.receive(source, range, controller);
    }

    private fail(kind: keyof flvjs.LoaderErrors, code: number, msg: string) {
      this._status = flv.LoaderStatus.kError;
      // flv.js declares this callback argument as the enum object instead of its value.
      this.onError?.(flv.LoaderErrors[kind] as unknown as flvjs.LoaderErrors, { code, msg });
    }

    private async receive(source: flvjs.MediaSegment & Partial<flvjs.MediaDataSource>, range: flvjs.Range, controller: AbortController) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let timedOut = false;
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      const active = () => this.controller === controller && !controller.signal.aborted;
      const deadline = (milliseconds: number) => {
        clearTimeout(timer);
        timer = setTimeout(() => { timedOut = true; controller.abort(); }, milliseconds);
      };
      try {
        const request = this.seek.getConfig(source.url, range);
        const headers = new Headers(request.headers as HeadersInit);
        for (const [name, value] of Object.entries(this.config.headers ?? {})) headers.set(name, String(value));
        deadline(15000);
        const response = await fetch(request.url, { headers, signal: controller.signal,
          mode: source.cors === false ? "same-origin" : "cors", credentials: source.withCredentials ? "include" : "same-origin",
          referrerPolicy: "no-referrer-when-downgrade" });
        if (!active()) return;
        if (!response.ok) { this.fail("HTTP_STATUS_CODE_INVALID", response.status, `HTTP ${response.status}`); controller.abort(); return; }
        if (!response.body) throw new Error("直播响应没有可读取的数据流");
        if (response.url && response.url !== request.url) this.onURLRedirect?.(this.seek.removeURLParameters(response.url));
        const lengthHeader = response.headers.get("content-length");
        const expected = lengthHeader === null ? NaN : Number(lengthHeader);
        if (Number.isFinite(expected) && expected > 0) this.onContentLengthKnown?.(expected);
        this._status = flv.LoaderStatus.kBuffering;
        reader = response.body.getReader();
        let received = 0;
        while (active()) {
          deadline(30000);
          const { done, value } = await reader.read();
          if (!active()) return;
          if (done) {
            clearTimeout(timer);
            if (Number.isFinite(expected) && received < expected) this.fail("EARLY_EOF", -1, "直播连接提前结束");
            else { this._status = flv.LoaderStatus.kComplete; this.onComplete?.(range.from, range.from + received - 1); }
            return;
          }
          const offset = range.from + received;
          received += value.byteLength;
          this.onDataArrival?.(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer, offset, received);
        }
      } catch (error) {
        if (this.controller !== controller || (controller.signal.aborted && !timedOut)) return;
        this.fail(timedOut ? "CONNECTING_TIMEOUT" : "EXCEPTION", -1, timedOut ? "直播连接或接收数据超时" : error instanceof Error ? error.message : "直播网络连接失败");
        controller.abort();
      } finally {
        clearTimeout(timer);
        reader?.releaseLock();
      }
    }
  };
}
