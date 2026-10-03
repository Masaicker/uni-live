const { test } = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const { getRealRid_Douyu } = require("../src/lib/reallive/douyu/realrid.ts");
const { POST: resolveRoom } = require("../app/api/rid/douyu/route.ts");
const { POST: getRoomInfo } = require("../app/api/room/info/route.ts");

test("a valid mini-app response resolves aliases without a website request", async (t) => {
  const requests = [];
  t.mock.method(axios, "get", async (url, options) => {
    requests.push(url);
    assert.equal(options.proxy, false);
    assert.ok(options.timeout > 0);
    return { data: { code: 0, data: { room_id: 12345 } } };
  });
  assert.equal(await getRealRid_Douyu("alias"), "12345");
  assert.deepEqual(requests, ["https://wxapp.douyucdn.cn/Live/Room/info/alias"]);
});

test("320155 resolves and reports live metadata when the mini-app returns malformed error text", async (t) => {
  const requests = [];
  t.mock.method(axios, "get", async (url, options) => {
    requests.push({ url, timeout: options.timeout });
    assert.equal(options.proxy, false);
    if (url.includes("wxapp")) return { data: '服务器开小差了,请稍后再试{"code":999999,"msg":"系统异常"}' };
    assert.equal(url, "https://www.douyu.com/betard/320155");
    assert.ok(options.headers["User-Agent"]);
    assert.equal(options.headers.Referer, "https://www.douyu.com/");
    return { data: { room: { room_id: 320155, owner_name: "主播阿郎", room_name: "【CSTG】郎团S1-Day6", show_status: 1, videoLoop: 0 } } };
  });
  const request = (path, body) => new Request(`http://localhost${path}`, { method: "POST", body: JSON.stringify(body) });
  const resolved = await resolveRoom(request("/api/rid/douyu", { rid: "320155" }));
  assert.equal(resolved.status, 200);
  assert.deepEqual(await resolved.json(), { rid: "320155" });
  assert.ok(requests[0].timeout + requests[1].timeout < 20000);
  const metadata = await getRoomInfo(request("/api/room/info", { platform: "douyu", rid: "320155" }));
  assert.equal(metadata.status, 200);
  const info = await metadata.json();
  assert.equal(info.rid, "320155");
  assert.equal(info.anchorName, "主播阿郎");
  assert.equal(info.liveStatus, true);
});

test("network failures and empty mini-app responses use the verified website room ID", async (t) => {
  for (const failure of [new Error("timeout"), { data: {} }, { code: 70007, data: [] }]) {
    const requests = [];
    const mock = t.mock.method(axios, "get", async (url) => {
      requests.push(url);
      if (url.includes("wxapp")) {
        if (failure instanceof Error) throw failure;
        return { data: failure };
      }
      return { data: { room: { room_id: "12345", show_status: 2 } } };
    });
    assert.equal(await getRealRid_Douyu("alias"), "12345");
    assert.deepEqual(requests, ["https://wxapp.douyucdn.cn/Live/Room/info/alias", "https://www.douyu.com/betard/alias"]);
    mock.mock.restore();
  }
});

test("unverified rooms never fall back to the input ID", async (t) => {
  for (const room of [undefined, {}, { room_id: 0 }, { room_id: "invalid" }]) {
    const mock = t.mock.method(axios, "get", async (url) => ({ data: url.includes("wxapp") ? { data: {} } : { room } }));
    await assert.rejects(getRealRid_Douyu("320155"), /暂时无法验证斗鱼房间/);
    mock.mock.restore();
  }
});

test("failure of both room endpoints remains a failure", async (t) => {
  t.mock.method(axios, "get", async () => { throw new Error("timeout"); });
  await assert.rejects(getRealRid_Douyu("320155"), /timeout/);
});
