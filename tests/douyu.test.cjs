const { test } = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const { parseDouyuQualities, chooseDouyuQuality, describeDouyuPlayback } = require("../src/lib/reallive/douyu/quality.ts");
const { signDouyuScript } = require("../src/lib/reallive/douyu/dart-playback.ts");
const { getDouyuPlayback } = require("../src/lib/reallive/douyu/reallive.ts");
const { POST } = require("../app/api/stream/douyu/route.ts");

const rates = [{ name: "原画2K120", rate: 0, bit: 18000 }, { name: "蓝光4M", rate: 4, bit: 4000 }, { name: "超清", rate: 3, bit: 2000 }];
const play = (rate) => ({ rate, multirates: rates, rtmp_url: "https://media.example", rtmp_live: "live.flv?a=1&amp;b=2" });
const encryption = { data: { error: 0, data: { enc_data: "fixture", key: "key", rand_str: "rand", enc_time: 2, is_special: 0 } } };
const script = 'function ub98484234(rid,did,ts){return "rid="+rid+"&did="+did+"&tt="+ts+"&sign="+CryptoJS.MD5(rid).toString();}';

test("dynamic names/bitrates and exact rates override legacy fixed mappings", () => {
  const qualities = parseDouyuQualities([...rates, { rate: null, name: "bad" }, null]);
  assert.deepEqual(qualities, rates);
  assert.equal(chooseDouyuQuality(qualities, "原画").rate, 0);
  assert.equal(chooseDouyuQuality(qualities, "蓝光").rate, 4);
  assert.equal(chooseDouyuQuality(qualities, "原画", 3).rate, 3);
  assert.equal(chooseDouyuQuality(qualities, "原画", 99).rate, 99);
});

test("actual returned quality and missing-quality warnings never label a downgraded stream as 2K120", () => {
  const result = describeDouyuPlayback(play(4), rates, 0, "flv");
  assert.equal(result.selectedQuality.name, "蓝光4M"); assert.ok(result.warning.includes("原画2K120"));
  assert.ok(result.stream.endsWith("a=1&b=2"));
  assert.ok(describeDouyuPlayback({ ...play(0), rate: undefined }, rates, 0, "flv").warning);
});

test("isolated fresh signer exposes only MD5 and interrupts runaway scripts", async () => {
  assert.ok((await signDouyuScript(script, "71415")).includes("rid=71415&did="));
  assert.equal(await signDouyuScript('function ub98484234(){return typeof process+","+typeof require+","+typeof fetch;}', "71415"), "undefined,undefined,undefined");
  const start = Date.now();
  await assert.rejects(signDouyuScript("while(true){}", "71415"));
  assert.ok(Date.now() - start < 5000);
});

test("V1 forwards Cookie, disables environment proxy and requests the precise selected rate", async (t) => {
  const requests = [];
  t.mock.method(axios, "get", async (_url, options) => { assert.equal(options.headers.Cookie, "test=fixture"); assert.equal(options.proxy, false); assert.ok(options.timeout > 0); return encryption; });
  t.mock.method(axios, "post", async (url, body, options) => {
    assert.equal(options.headers.Cookie, "test=fixture");
    requests.push({ url, params: new URLSearchParams(body) });
    return { data: { error: 0, data: play(requests.length === 1 ? 4 : 3) } };
  });
  const result = await getDouyuPlayback("71415", "原画", "flv", "test=fixture", 3);
  assert.equal(requests.length, 2); assert.equal(requests[1].params.get("rate"), "3");
  assert.equal(result.selectedQuality.rate, 3); assert.equal(result.warning, undefined);
});

test("V1 failure falls back to Dart flags and obtains a new signature for each request", async (t) => {
  let signatures = 0;
  const params = [];
  t.mock.method(axios, "get", async (url, options) => {
    if (url.includes("getEncryption")) throw new Error("fixture unavailable");
    assert.equal(options.headers.Cookie, "test=fixture"); signatures++;
    return { data: { data: { room71415: script } } };
  });
  t.mock.method(axios, "post", async (url, body, options) => {
    assert.ok(url.includes("/getH5Play/")); assert.equal(options.headers.Cookie, "test=fixture");
    const request = new URLSearchParams(body); params.push(request);
    return { data: { error: 0, data: { ...play(params.length === 1 ? 4 : 0), cdnsWithName: [{ cdn: "scdn" }, { cdn: "fixture" }] } } };
  });
  const result = await getDouyuPlayback("71415", "原画", "flv", "test=fixture");
  assert.equal(signatures, 2); assert.equal(params[0].get("rate"), "-1");
  assert.equal(params[1].get("rate"), "0"); assert.equal(params[1].get("cdn"), "fixture");
  assert.equal(params[1].get("ive"), "1"); assert.equal(params[1].get("iar"), "1");
  assert.equal(result.selectedQuality.name, "原画2K120");
});

test("logged-in downgrade uses Dart fallback, but retains a working V1 stream on fallback failure", async (t) => {
  let fallback = false;
  t.mock.method(axios, "get", async (url) => {
    if (url.includes("getEncryption")) return encryption;
    fallback = true; throw new Error("fixture unavailable");
  });
  t.mock.method(axios, "post", async () => ({ data: { error: 0, data: play(4) } }));
  const result = await getDouyuPlayback("71415", "原画", "flv", "test=fixture");
  assert.equal(fallback, true); assert.ok(result.stream); assert.equal(result.selectedQuality.rate, 4); assert.ok(result.warning);
});

test("playback route rejects invalid room/rate/cookie before any remote request", async (t) => {
  t.mock.method(axios, "get", () => { throw new Error("Should not request network"); });
  for (const body of [{ rid: "bad" }, { rid: "71415", rate: -1 }, { rid: "71415", cookie: "not-a-cookie" }, { rid: "71415", type: "mp4" }]) {
    const response = await POST(new Request("http://localhost/api/stream/douyu", { method: "POST", body: JSON.stringify(body) }));
    assert.equal(response.status, 400);
  }
});
