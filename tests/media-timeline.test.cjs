const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readMediaTimeline, seekInMedia, mediaTime } = require("../src/features/video/media-timeline.ts");
const ranges = (entries) => ({ length: entries.length, start: (i) => entries[i][0], end: (i) => entries[i][1] });

test("live buffer bounds clamp seeks, and disconnected buffer gaps are not offered", () => {
  const media = { currentTime: 105, duration: Infinity, seekable: ranges([[50, 70], [100, 140]]), buffered: ranges([[100, 120]]) };
  assert.deepEqual(readMediaTimeline(media), { current: 105, start: 100, end: 140, bufferedEnd: 120, live: true });
  assert.equal(seekInMedia(media, 60), true); assert.equal(media.currentTime, 100);
  assert.equal(seekInMedia(media, 200), true); assert.ok(media.currentTime < 140 && media.currentTime > 139);
});

test("streams without a seekable range cannot pretend to support replay", () => {
  const media = { currentTime: 5, duration: Infinity, seekable: ranges([]), buffered: ranges([]) };
  assert.equal(seekInMedia(media, 0), false); assert.equal(readMediaTimeline(media).end, 0);
  assert.equal(mediaTime(3661), "1:01:01");
});
