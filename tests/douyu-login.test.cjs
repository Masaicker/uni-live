const { test } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright-core");
const { startDouyuLogin, readDouyuLogin, cancelDouyuLogin } = require("../src/lib/douyu-login.ts");
const { POST, GET, DELETE } = require("../app/api/account/douyu/login/route.ts");

const authCookies = [
  { name: "acf_uid", value: "123" },
  { name: "acf_auth", value: "fixture" },
];
function fakeBrowser(cookies = authCookies) {
  let closed = false;
  return {
    newContext: async () => ({
      newPage: async () => ({ goto: async () => {} }),
      cookies: async () => cookies,
    }),
    isConnected: () => !closed,
    close: async () => { closed = true; },
  };
}
async function waitForStatus(id, expected) {
  for (let i = 0; i < 20; i++) {
    const session = readDouyuLogin(id);
    if (session?.status === expected) return session;
    await new Promise(setImmediate);
  }
  assert.fail(`Login did not reach ${expected}`);
}
function localRequest(method, host = "localhost:3000", origin = `http://${host}`, query = "") {
  return new Request(`http://0.0.0.0:3000/api/account/douyu/login${query}`, {
    method,
    headers: { host, ...(origin ? { origin } : {}), "user-agent": "Chrome/154.0" },
  });
}

test("production bind address permits loopback Host with the matching browser Origin", async (t) => {
  t.mock.method(chromium, "launch", async () => fakeBrowser());
  for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"]) {
    const response = await POST(localRequest("POST", host));
    assert.equal(response.status, 200);
    const { id } = await response.json();
    await waitForStatus(id, "completed");
    const poll = await GET(localRequest("GET", host, null, `?id=${id}`));
    assert.equal(poll.status, 200);
    assert.equal((await poll.json()).cookie, "acf_uid=123; acf_auth=fixture");
  }
});

test("remote Host, cross-origin and missing Origin cannot launch or cancel a browser", async (t) => {
  t.mock.method(chromium, "launch", () => assert.fail("Must not launch a browser"));
  for (const [host, origin] of [
    ["192.168.1.2:3000", "http://192.168.1.2:3000"],
    ["localhost:3000", "https://other.example"],
    ["localhost:3000", "http://localhost:3001"],
    ["localhost:3000", null],
    ["localhost:3000/path", "http://localhost:3000"],
    ["user@localhost:3000", "http://localhost:3000"],
  ]) {
    assert.equal((await POST(localRequest("POST", host, origin))).status, 403);
    assert.equal((await DELETE(localRequest("DELETE", host, origin))).status, 403);
  }
  assert.equal((await GET(localRequest("GET", "remote.example", null, "?id=fixture"))).status, 403);
});

test("current browser type is preferred, and launch failures fall back without dropping login", async (t) => {
  const attempts = [];
  t.mock.method(chromium, "launch", async (options) => {
    attempts.push(options.channel);
    if (options.channel === "chrome") throw new Error("Chrome not installed");
    return fakeBrowser();
  });
  const chromeId = startDouyuLogin("Chrome/154.0");
  const session = await waitForStatus(chromeId, "completed");
  assert.deepEqual(attempts, ["chrome", "msedge"]);
  assert.equal(session.browser, undefined);
  attempts.length = 0;
  const edgeId = startDouyuLogin("Chrome/154.0 Edg/154.0");
  await waitForStatus(edgeId, "completed");
  assert.deepEqual(attempts, ["msedge"]);
});

test("cancelling a pending launch closes it when it opens and permits another login", async (t) => {
  let resolveLaunch;
  const browser = fakeBrowser();
  t.mock.method(chromium, "launch", () => new Promise(resolve => { resolveLaunch = resolve; }));
  const id = startDouyuLogin();
  assert.throws(() => startDouyuLogin(), /已有斗鱼登录窗口/);
  const response = await DELETE(localRequest("DELETE", "localhost:3000", "http://localhost:3000", `?id=${id}`));
  assert.equal(response.status, 200);
  resolveLaunch(browser);
  await new Promise(setImmediate);
  assert.equal(readDouyuLogin(id).status, "failed");
  assert.equal(browser.isConnected(), false);
  t.mock.method(chromium, "launch", async () => fakeBrowser());
  await waitForStatus(startDouyuLogin(), "completed");
});

test("closing a login window reports failure and releases the pending login", async (t) => {
  const browser = fakeBrowser();
  browser.newContext = async () => {
    await browser.close();
    throw new Error("Target closed");
  };
  t.mock.method(chromium, "launch", async () => browser);
  const session = await waitForStatus(startDouyuLogin(), "failed");
  assert.match(session.message, /登录窗口已关闭/);
  t.mock.method(chromium, "launch", async () => fakeBrowser());
  const id = startDouyuLogin();
  await waitForStatus(id, "completed");
  await cancelDouyuLogin(id);
  assert.equal(readDouyuLogin(id).status, "completed");
});

test("cancelling while cookies are being read cannot overwrite cancellation with a completed login", async (t) => {
  let resolveCookies;
  const browser = fakeBrowser();
  browser.newContext = async () => ({
    newPage: async () => ({ goto: async () => {} }),
    cookies: () => new Promise(resolve => { resolveCookies = resolve; }),
  });
  t.mock.method(chromium, "launch", async () => browser);
  const id = startDouyuLogin();
  await new Promise(setImmediate);
  assert.ok(resolveCookies);
  await cancelDouyuLogin(id);
  resolveCookies(authCookies);
  await new Promise(setImmediate);
  assert.equal(readDouyuLogin(id).status, "failed");
  assert.equal(readDouyuLogin(id).cookie, undefined);
});
