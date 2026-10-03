const { test } = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const { normalizeDouyuCookie, normalizeDouyuLoginCookie } = require("../src/lib/douyu-cookie.ts");
const { POST } = require("../app/api/account/douyu/cookie/route.ts");

const cookie = "acf_uid=123; acf_auth=fixture%2Ftoken; PHPSESSID=fixture";
const request = (body) => new Request("http://localhost/api/account/douyu/cookie", {
  method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
});

test("login Cookie accepts values and copied request headers, but rejects incomplete login fields", () => {
  assert.equal(normalizeDouyuLoginCookie(`Cookie: ${cookie}`), cookie);
  assert.equal(normalizeDouyuLoginCookie(`Accept: */*\nCookie: ${cookie}\nUser-Agent: fixture`), cookie);
  assert.equal(normalizeDouyuCookie("test=fixture"), "test=fixture");
  for (const input of ["", "wrong", "acf_uid=123", "acf_auth=fixture", "acf_uid=0; acf_auth=fixture", "acf_uid=wrong; acf_auth=fixture", "acf_uid=123; acf_auth=", `${cookie}; acf_auth=other`, `${cookie}; invalid`, "acf_uid=123; acf_auth=fi\nxture"]) {
    assert.throws(() => normalizeDouyuLoginCookie(input));
  }
});

test("invalid input is rejected before any platform request", async (t) => {
  t.mock.method(axios, "get", () => assert.fail("Must not request the platform"));
  for (const body of [null, {}, { cookie: 123 }, { cookie: "wrong" }, { cookie: "acf_uid=123" }]) {
    const response = await POST(request(body));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).valid, false);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
  assert.equal((await POST(new Request("http://localhost/api/account/douyu/cookie", { method: "POST", body: "invalid json" }))).status, 400);
});

test("login is verified against Douyu and returns no credential or account details", async (t) => {
  t.mock.method(axios, "get", async (url, options) => {
    assert.equal(url, "https://www.douyu.com/wgapi/livenc/liveweb/follow/list");
    assert.equal(options.headers.Cookie, cookie);
    assert.equal(options.proxy, false);
    assert.equal(options.maxRedirects, 0);
    assert.ok(options.timeout > 0);
    return { data: { error: 0, data: { private: "fixture account data" } } };
  });
  const response = await POST(request({ cookie: `Cookie: ${cookie}` }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { valid: true });
});

test("platform rejection identifies expired or incorrect credentials", async (t) => {
  t.mock.method(axios, "get", async () => ({ data: { error: -1, msg: "用户未登陆或token已过期" } }));
  const response = await POST(request({ cookie }));
  assert.equal(response.status, 401);
  const result = await response.json();
  assert.equal(result.valid, false);
  assert.match(result.error, /无效或已过期/);
});

test("network, timeout, rate limit and malformed responses do not label the Cookie invalid", async (t) => {
  for (const failure of [
    new axios.AxiosError(`secret Cookie ${cookie}`, "ETIMEDOUT"),
    new axios.AxiosError(`secret Cookie ${cookie}`, "ECONNREFUSED"),
    new axios.AxiosError(`secret Cookie ${cookie}`, "ERR_BAD_REQUEST", undefined, undefined, { status: 403 }),
    { data: "<html>challenge</html>" },
    { data: { error: 429 } },
    { data: null },
  ]) {
    t.mock.method(axios, "get", async () => {
      if (failure instanceof Error) throw failure;
      return failure;
    });
    const response = await POST(request({ cookie }));
    assert.equal(response.status, 502);
    const result = await response.json();
    assert.equal(result.valid, undefined);
    assert.ok(result.error);
    assert.equal(result.error.includes("fixture"), false);
  }
});
