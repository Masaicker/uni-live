const { test } = require("node:test");
const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");
const { createRoom, normalizeSnapshot, restoreWorkspace, WORKSPACE_KEY } = require("../src/features/monitor/storage.ts");
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("room addition and restored/shared IDs work without secure-context randomUUID", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  try {
    for (const cryptoApi of [{ getRandomValues: (bytes) => webcrypto.getRandomValues(bytes) }, undefined]) {
      Object.defineProperty(globalThis, "crypto", { configurable: true, value: cryptoApi });
      const ids = new Set(Array.from({ length: 100 }, (_, index) => createRoom(`https://www.douyu.com/${index + 1}`).id));
      assert.equal(ids.size, 100);
      for (const id of ids) assert.match(id, uuidPattern);
      assert.equal(createRoom("https://www.douyu.com/1", "existing-id").id, "existing-id");
      const recovered = normalizeSnapshot({ version: 3, rooms: [{ url: "https://www.douyu.com/1", followed: true }], openIds: [], manual: false });
      assert.equal(recovered.rooms.length, 1);
      assert.match(recovered.rooms[0].id, uuidPattern);
      const local = { version: 3, rooms: [{ ...createRoom("https://www.douyu.com/1", "shared-id"), followed: true }], openIds: [], manual: false };
      const storage = { getItem: (key) => key === WORKSPACE_KEY ? JSON.stringify(local) : null };
      const imported = restoreWorkspace(storage, { shareVideo: btoa(encodeURIComponent(JSON.stringify([{ id: "shared-id", url: "https://www.douyu.com/2" }]))), shareLayoutMode: "auto" });
      assert.equal(imported.rooms.length, 2);
      assert.equal(imported.rooms.find((room) => room.rid === "1").id, "shared-id");
      assert.match(imported.rooms.find((room) => room.rid === "2").id, uuidPattern);
      assert.deepEqual(imported.openIds, [imported.rooms.find((room) => room.rid === "2").id]);
    }
  } finally { Object.defineProperty(globalThis, "crypto", descriptor); }
});
