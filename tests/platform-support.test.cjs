const { test } = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const { POST: resolveBilibiliRoom } = require("../app/api/rid/bilibili/route.ts");
const { POST: resolveBilibiliStream } = require("../app/api/stream/bilibili/route.ts");
const { POST: loadRoomInfo } = require("../app/api/room/info/route.ts");
const { monitorReducer, initialMonitorState, workspaceSnapshot } = require("../src/features/monitor/state.ts");
const { createRoom, normalizeSnapshot, restoreWorkspace, shareWorkspace, WORKSPACE_KEY } = require("../src/features/monitor/storage.ts");
const { defaultLayout } = require("../src/features/monitor/geometry.ts");
const { isPlatformEnabled } = require("../src/lib/platform-support.ts");

test("disabled Bilibili API routes reject requests before any platform networking", async () => {
  const original = axios.get;
  let requests = 0;
  axios.get = async () => { requests++; throw new Error("Unexpected network request"); };
  const request = (body) => new Request("http://localhost/api/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  try {
    for (const response of [await resolveBilibiliRoom(request({ rid: "732" })), await resolveBilibiliStream(request({ rid: "732" })), await loadRoomInfo(request({ platform: "bilibili", rid: "732" }))]) {
      assert.equal(response.status, 503);
      assert.match((await response.json()).error, /暂不支持哔哩哔哩直播/);
    }
    assert.equal(requests, 0);
  } finally { axios.get = original; }
});

test("hidden Bilibili rooms survive storage, history cleanup and share import without opening", () => {
  const savedBili = { ...createRoom("https://live.bilibili.com/732", "bili"), followed: true, followOrder: 2, lastWatchedAt: 10, layout: defaultLayout };
  const temporaryBili = { ...createRoom("https://live.bilibili.com/5050", "bili-temp"), layout: defaultLayout };
  const douyu = { ...createRoom("https://www.douyu.com/71415", "douyu"), followed: true, lastWatchedAt: 20 };
  const snapshot = normalizeSnapshot({ version: 3, rooms: [savedBili, temporaryBili, douyu], openIds: ["bili", "bili-temp", "douyu"], manual: false });
  let state = monitorReducer(initialMonitorState, { type: "hydrate", snapshot });
  assert.deepEqual(state.videos.map((video) => video.id), ["douyu"]);
  assert.equal(monitorReducer(state, { type: "open", id: "bili", layout: defaultLayout }), state);
  assert.equal(monitorReducer(initialMonitorState, { type: "add", room: savedBili }), initialMonitorState);
  assert.deepEqual(state.rooms.filter((room) => isPlatformEnabled(room.platform)).map((room) => room.id), ["douyu"]);
  state = monitorReducer(state, { type: "clear-history" });
  const saved = workspaceSnapshot(state);
  assert.equal(saved.rooms.find((room) => room.id === "bili").lastWatchedAt, 10);
  assert.ok(saved.rooms.some((room) => room.id === "bili-temp"));
  const storage = { getItem: (key) => key === WORKSPACE_KEY ? JSON.stringify(saved) : null };
  const restored = restoreWorkspace(storage, {});
  assert.equal(restored.rooms.length, 3);
  const link = new URL(shareWorkspace("http://localhost", snapshot));
  const imported = restoreWorkspace(storage, { shareVideo: link.searchParams.get("video"), shareLayoutMode: "auto" });
  const opened = monitorReducer(initialMonitorState, { type: "hydrate", snapshot: imported });
  assert.deepEqual(opened.videos.map((video) => video.id), ["douyu"]);
});
