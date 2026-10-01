const { test } = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const { POST } = require("../app/api/room/info/route.ts");
const request = (platform, rid = "alias") => new Request("http://localhost/api/room/info", { method: "POST", body: JSON.stringify({ platform, rid }) });

test("offline room metadata validates the actual room identity instead of requiring a stream", async () => {
  const original = axios.get;
  axios.get = async (url) => ({ data: url.includes("wxapp") ? { data: { room_id: "123" } } : url.includes("betard")
    ? { room: { owner_name: "Offline Douyu", room_name: "Title", show_status: 2 } }
    : { data: { profileInfo: { profileRoom: 456, nick: "Offline Huya" }, liveStatus: "OFF" } } });
  try {
    for (const [platform, rid] of [["douyu", "123"], ["huya", "456"]]) {
      const response = await POST(request(platform));
      assert.equal(response.status, 200);
      const info = await response.json();
      assert.equal(info.rid, rid); assert.equal(info.liveStatus, false); assert.ok(info.anchorName);
    }
  } finally { axios.get = original; }
});

test("empty platform objects and invalid IDs cannot confirm a room; network failures remain unknown", async () => {
  const original = axios.get;
  try {
    for (const data of [{ data: {} }, { data: { profileInfo: { profileRoom: 0, nick: "Invalid" } } }]) {
      axios.get = async () => ({ data });
      assert.equal((await POST(request("huya"))).status, 502);
      assert.equal((await POST(request("douyu"))).status, 502);
    }
    axios.get = async () => { throw new Error("timeout"); };
    const response = await POST(request("douyu"));
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /暂时无法/);
  } finally { axios.get = original; }
});
