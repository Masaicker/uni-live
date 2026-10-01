const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const { resolveStreamUrl } = require("../src/features/video/stream-service.ts");
const { getRealLive_Bilibili, selectBilibiliStream } = require("../src/lib/reallive/bilibili/reallive.ts");
const { getRealLive_Huya } = require("../src/lib/reallive/huya/reallive.ts");

const format = (name, codec = "avc") => ({ format_name: name, codec: [{ codec_name: codec, base_url: "/video", url_info: [{ host: "https://fixture.invalid", extra: `?format=${name}&codec=${codec}` }] }] });
const playResponse = { code: 0, data: { live_status: 1, playurl_info: { playurl: { stream: [{ format: [format("flv", "hevc"), format("flv"), format("ts"), format("fmp4")] }] } } } };

test("disabled Bilibili addresses never request a stream; Huya and direct streams still work", async () => {
  const original = axios.post, calls = [];
  axios.post = async (url, body) => { calls.push({ url, body }); return { data: url.includes("/rid/") ? { rid: "123456" } : { stream: "https://fixture.invalid/live.m3u8" } }; };
  try {
    await assert.rejects(resolveStreamUrl("https://live.bilibili.com/5050", "原画", "hls"), /暂不支持哔哩哔哩直播/);
    assert.equal(calls.length, 0);
    const huya = await resolveStreamUrl("https://www.huya.com/room-alias", "原画", "hls");
    assert.equal(huya.platform, "huya"); assert.equal(calls[0].url, "/api/stream/huya");
    assert.equal(calls[0].body.type, "hls");
    calls.length = 0;
    await resolveStreamUrl("https://fixture.invalid/live.m3u8", "原画", "hls");
    assert.equal(calls.length, 0);
  } finally { axios.post = original; }
});

test("Bilibili selects H.264 and honors the requested format, including safe legacy and missing responses", () => {
  assert.match(selectBilibiliStream(playResponse, "flv"), /format=flv&codec=avc/);
  assert.match(selectBilibiliStream(playResponse, "hls"), /format=ts&codec=avc/);
  assert.equal(selectBilibiliStream({ code: 0, data: { durl: [{ url: "https://fixture.invalid/legacy.flv" }] } }, "flv"), "https://fixture.invalid/legacy.flv");
  assert.equal(selectBilibiliStream({ code: 0, data: {} }, "flv"), "");
  assert.equal(selectBilibiliStream({ data: { playurl_info: { playurl: { stream: [{ format: [format("flv", "hevc")] }] } } } }, "flv"), "");
});

test("platform adapters bound requests, bypass environment proxies, and report offline or missing streams deliberately", async () => {
  const original = axios.get;
  let response = playResponse, options;
  axios.get = async (_url, config) => { options = config; return { data: response }; };
  try {
    await getRealLive_Bilibili("123456", "原画", "flv");
    assert.equal(options.proxy, false); assert.equal(options.timeout, 15000); assert.equal(options.params.codec, "0");
    response = { code: 0, data: { live_status: 0 } };
    await assert.rejects(getRealLive_Bilibili("123456", "原画", "flv"), /哔哩哔哩房间尚未开播/);
    response = { code: -352 };
    await assert.rejects(getRealLive_Bilibili("123456", "原画", "flv"), /哔哩哔哩播放接口拒绝请求/);
    response = { data: {} };
    await assert.rejects(getRealLive_Huya("example"), /虎牙未返回可播放/);
    response = { data: { liveStatus: "OFF" } };
    await assert.rejects(getRealLive_Huya("example"), /虎牙房间尚未开播/);
    response = { data: { liveStatus: "ON", stream: { hls: { multiLine: [{ url: "https://fixture.invalid/live.m3u8" }] } } } };
    assert.equal(await getRealLive_Huya("example", "hls"), "https://fixture.invalid/live.m3u8");
    assert.equal(options.proxy, false); assert.equal(options.timeout, 15000);
  } finally { axios.get = original; }
});
