const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PlaybackWatchdog, DEFAULT_RECOVERY_PREFERENCES, normalizeRecoveryPreferences } = require("../src/features/video/playback-watchdog.ts");
const enabled = { ...DEFAULT_RECOVERY_PREFERENCES, enabled: true };
const sample = (time = 1, patch = {}) => ({ key: 1, time, blocked: false, ...patch });
const prime = (monitor, preferences = enabled) => { monitor.tick(0, sample(0), preferences); monitor.tick(1000, sample(), preferences); };

test("recovery defaults off and malformed persisted settings stay bounded", () => {
  assert.equal(DEFAULT_RECOVERY_PREFERENCES.enabled, false);
  assert.deepEqual(normalizeRecoveryPreferences(), DEFAULT_RECOVERY_PREFERENCES);
  assert.deepEqual(normalizeRecoveryPreferences({ enabled: "true", stallSeconds: NaN, retrySeconds: -1, maxAttempts: 100 }), { enabled: false, stallSeconds: 20, retrySeconds: 5, maxAttempts: 10 });
  const monitor = new PlaybackWatchdog();
  prime(monitor, DEFAULT_RECOVERY_PREFERENCES);
  assert.equal(monitor.tick(1000000, sample(), DEFAULT_RECOVERY_PREFERENCES), undefined);
});

test("normal playback and decoded-frame progress never cause periodic refreshes", () => {
  for (const frameOnly of [false, true]) {
    const monitor = new PlaybackWatchdog();
    for (let second = 0; second <= 600; second++) {
      assert.equal(monitor.tick(second * 1000, sample(frameOnly ? 1 : second, { frames: second * 25 }), enabled), undefined);
    }
  }
  const neverPlayed = new PlaybackWatchdog();
  neverPlayed.tick(0, sample(), enabled);
  assert.equal(neverPlayed.tick(1000000, sample(), enabled), undefined);
});

test("stalls observe the threshold, increasing intervals and the retry limit exactly once", () => {
  const monitor = new PlaybackWatchdog(); prime(monitor);
  assert.equal(monitor.tick(20999, sample(), enabled), undefined);
  assert.equal(monitor.tick(21000, sample(), enabled), "retry");
  assert.equal(monitor.tick(50999, sample(), enabled), undefined);
  assert.equal(monitor.tick(51000, sample(), enabled), "retry");
  assert.equal(monitor.tick(110999, sample(), enabled), undefined);
  assert.equal(monitor.tick(111000, sample(), enabled), "retry");
  assert.equal(monitor.tick(231000, sample(), enabled), "exhausted");
  assert.equal(monitor.tick(1000000, sample(), enabled), undefined);
});

test("paused, hidden, offline, seeking and busy periods get a fresh observation window", () => {
  const monitor = new PlaybackWatchdog(); prime(monitor);
  assert.equal(monitor.tick(300000, sample(1, { blocked: true }), enabled), undefined);
  assert.equal(monitor.tick(600000, sample(1, { blocked: true }), enabled), undefined);
  assert.equal(monitor.tick(600001, sample(), enabled), undefined);
  assert.equal(monitor.tick(619999, sample(), enabled), undefined);
  assert.equal(monitor.tick(620001, sample(), enabled), "retry");
});

test("reloading a player preserves the attempt limit and one play event cannot reset failures", () => {
  const preferences = { ...enabled, maxAttempts: 1 };
  const monitor = new PlaybackWatchdog(); prime(monitor, preferences);
  assert.equal(monitor.tick(21000, sample(), preferences), "retry");
  assert.equal(monitor.tick(22000, sample(0, { key: 2 }), preferences), undefined);
  assert.equal(monitor.tick(23000, sample(1, { key: 2 }), preferences), undefined);
  assert.equal(monitor.tick(51000, sample(1, { key: 2 }), preferences), "exhausted");
});

test("five seconds of real progress clears failures; manual reset starts a new cycle", () => {
  const monitor = new PlaybackWatchdog(); prime(monitor);
  assert.equal(monitor.tick(21000, sample(), enabled), "retry");
  for (let second = 22; second <= 27; second++) {
    assert.equal(monitor.tick(second * 1000, sample(second), enabled), second === 27 ? "recovered" : undefined);
  }
  assert.equal(monitor.tick(47000, sample(27), enabled), "retry");
  monitor.reset();
  prime(monitor);
  assert.equal(monitor.tick(21000, sample(), enabled), "retry");
  monitor.reset(true);
  monitor.tick(50000, sample(), enabled);
  assert.equal(monitor.tick(70000, sample(), enabled), "retry");
});
