const { test } = require("node:test");
const assert = require("node:assert/strict");
const { KeyboardRoomTarget } = require("../src/features/monitor/keyboard-target.ts");

test("normal layout requires explicit selection and retains it across unrelated updates", () => {
  const target = new KeyboardRoomTarget();
  assert.equal(target.update(["a", "b"], null, null), null);
  target.select("b");
  assert.equal(target.update(["a", "b", "c"], null, null), "b");
});

test("focus defaults to main room, permits thumbnails, then restores the normal target", () => {
  const target = new KeyboardRoomTarget();
  target.select("b");
  assert.equal(target.update(["a", "b", "c"], "a", null), "a");
  target.select("c");
  assert.equal(target.update(["a", "b", "c"], "a", null), "c");
  assert.equal(target.update(["a", "b", "c"], null, null), "b");
});

test("fullscreen always controls its room even if another component receives focus", () => {
  const target = new KeyboardRoomTarget();
  target.select("b");
  assert.equal(target.update(["a", "b", "c"], null, "a"), "a");
  target.select("c");
  assert.equal(target.update(["a", "b", "c"], null, "a"), "a");
  assert.equal(target.update(["a", "b", "c"], null, null), "b");
});

test("closing selected rooms clears invalid targets without guessing a replacement", () => {
  const target = new KeyboardRoomTarget();
  target.select("b");
  target.update(["a", "b", "c"], "a", null);
  target.select("c");
  assert.equal(target.update(["a", "b"], "a", null), null);
  assert.equal(target.update(["a"], null, null), null);
});

test("switching viewing modes resets to the new main room and preserves normal ownership", () => {
  const target = new KeyboardRoomTarget();
  target.select("b");
  target.update(["a", "b", "c"], "a", null);
  target.select("c");
  assert.equal(target.update(["a", "b", "c"], null, "a"), "a");
  assert.equal(target.update(["a", "b", "c"], "c", null), "c");
  assert.equal(target.update(["a", "b", "c"], "a", null), "a");
  assert.equal(target.update(["a", "b", "c"], null, null), "b");
});
