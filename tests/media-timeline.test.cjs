const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readMediaTimeline, seekInMedia, mediaTime, timelineOptions } = require("../src/features/video/media-timeline.ts");
const ranges = (entries) => ({ length: entries.length, start: (i) => entries[i][0], end: (i) => entries[i][1] });

test("replay keeps the latest live edge reachable across disconnected ranges", () => {
  const media = { currentTime: 105, duration: Infinity, seekable: ranges([[50, 70], [100, 140]]), buffered: ranges([[100, 120]]) };
  assert.deepEqual(readMediaTimeline(media), { current: 105, start: 50, end: 140, bufferedEnd: 120, live: true });
  assert.equal(seekInMedia(media, 60), true); assert.equal(media.currentTime, 60);
  assert.equal(seekInMedia(media, 85), true); assert.ok(media.currentTime < 70 || media.currentTime > 100);
  media.currentTime = 60;
  assert.equal(readMediaTimeline(media).end, 140);
  assert.equal(seekInMedia(media, 200), true); assert.ok(media.currentTime < 140 && media.currentTime > 139);
});

test("platform and direct FLV live streams remain live with finite MSE durations", () => {
  const media = { currentTime: 220, duration: 685, seekable: ranges([[0, 685]]), buffered: ranges([[200, 300]]) };
  assert.equal(readMediaTimeline(media, timelineOptions("https://cdn/live.flv", "douyu")).live, true);
  assert.equal(readMediaTimeline(media, timelineOptions("https://cdn/live.flv", "direct")).live, true);
  assert.equal(readMediaTimeline(media, timelineOptions("https://cdn/live.m3u8", "huya")).live, true);
  assert.equal(readMediaTimeline(media, timelineOptions("https://cdn/video.mp4", "direct")).live, false);
  assert.equal(timelineOptions("https://cdn/live.M3U8?token=flv", "direct").bufferedOnly, false);
});

test("FLV replay never seeks into evicted history, gaps or an unbuffered live edge", () => {
  const options = timelineOptions("https://cdn/live.flv", "direct");
  const media = { currentTime: 60, duration: 800, seekable: ranges([[0, 800]]), buffered: ranges([[50, 70], [100, 140]]) };
  assert.deepEqual(readMediaTimeline(media, options), { current: 60, start: 50, end: 140, bufferedEnd: 70, live: true });
  assert.equal(seekInMedia(media, 0, options), true); assert.ok(media.currentTime > 50 && media.currentTime < 51);
  assert.equal(seekInMedia(media, 95, options), true); assert.ok(media.currentTime > 100 && media.currentTime < 101);
  assert.equal(seekInMedia(media, 139.8, options), true); assert.equal(media.currentTime, 139.8);
  media.buffered = ranges([]);
  assert.equal(readMediaTimeline(media, options).end, 0);
  assert.equal(seekInMedia(media, 20, options), false);
  assert.equal(seekInMedia(media, NaN, options), false);
  media.buffered = ranges([[10, 10.05]]);
  assert.equal(seekInMedia(media, 20, options), true); assert.ok(media.currentTime > 10 && media.currentTime < 10.05);
});

test("streams without a seekable range cannot pretend to support replay", () => {
  const media = { currentTime: 5, duration: Infinity, seekable: ranges([]), buffered: ranges([]) };
  assert.equal(seekInMedia(media, 0), false); assert.equal(readMediaTimeline(media).end, 0);
  assert.equal(mediaTime(3661), "1:01:01");
});
