const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bindLiveReplayWindow, restoreReplayPosition } = require('../src/features/video/live-replay-window.ts');
const { readMediaTimeline, seekWindow, seekInMedia } = require('../src/features/video/media-timeline.ts');
const ranges = entries => ({ length: entries.length, start: i => entries[i][0], end: i => entries[i][1] });

function fixture({ current = 50, paused = true, start = 0, end = 400, legacy = false } = {}) {
  const video = { currentTime: current, paused, seeking: false, readyState: 4, duration: Infinity,
    buffered: ranges([[start, end]]), seekable: ranges([[0, end]]), method() { return this; } };
  const proxy = { getCurrentTime: () => video.currentTime };
  let pending = false, cleanups = 0, resumes = 0, appendPending = false;
  const listeners = new Map();
  const config = { autoCleanupMaxBackwardDuration: 185, autoCleanupMinBackwardDuration: 180 };
  const sourceBuffer = { updating: false };
  const controller = {
    _config: config, _sourceBuffers: { video: sourceBuffer }, _isBufferFull: false,
    _hasPendingSegments: () => appendPending,
    on: (event, listener) => listeners.set(event, listener), off: event => listeners.delete(event),
    ...(legacy ? { _mediaElement: video } : { _mediaElementProxy: proxy }),
    _hasPendingRemoveRanges: () => pending,
    _needCleanupSourceBuffer() { const clock = legacy ? this._mediaElement.currentTime : proxy.getCurrentTime(); return clock - video.buffered.start(0) >= config.autoCleanupMaxBackwardDuration; },
    _doCleanupSourceBuffer() { const clock = legacy ? this._mediaElement.currentTime : proxy.getCurrentTime(); video.buffered = ranges([[clock - config.autoCleanupMinBackwardDuration, end]]); cleanups++; },
  };
  return { video, controller, proxy, config, sourceBuffer, listeners,
    player: legacy ? { _msectl: controller, _transmuxer: { resume: () => resumes++ } }
      : { _player_engine: { _mse_controller: controller, _loading_controller: { resumeTransmuxer: () => resumes++ } } },
    quota: () => { controller._isBufferFull = true; listeners.get('buffer_full')(); },
    appendPending: value => { appendPending = value; },
    pending: value => { pending = value; }, cleanups: () => cleanups, resumes: () => resumes };
}

test('paused replay cleans against the latest buffered edge, restores the instance clock and never changes the paused frame', () => {
  const f = fixture(), original = f.proxy.getCurrentTime;
  const window = bindLiveReplayWindow(f.player, f.video, () => assert.fail('paused must not jump'));
  assert.equal(f.proxy.getCurrentTime(), 400); assert.equal(f.video.currentTime, 50);
  f.pending(true); window.maintain(); assert.equal(f.cleanups(), 0);
  f.pending(false); window.maintain(); assert.equal(f.cleanups(), 1); assert.equal(f.video.buffered.start(0), 220);
  assert.equal(f.video.currentTime, 50); window.maintain(); assert.equal(f.cleanups(), 1);
  window.dispose(); window.dispose(); assert.equal(f.proxy.getCurrentTime, original);
});

test('expired running playback moves to a playable point once before removal, while valid playback is untouched', () => {
  const f = fixture({ paused: false }); let expired = 0;
  f.video.seeking = true; f.video.readyState = 1;
  const window = bindLiveReplayWindow(f.player, f.video, () => expired++);
  window.maintain(); assert.equal(expired, 1); assert.equal(f.video.currentTime, 221);
  window.maintain(); assert.equal(expired, 1);
  assert.equal(restoreReplayPosition(f.video), false);
  f.video.currentTime = 20; f.video.paused = true;
  assert.equal(restoreReplayPosition(f.video), true); assert.equal(f.video.currentTime, 221);
  window.dispose();
});

test('the pinned flv fallback changes only its local cleanup clock and preserves native method receivers', () => {
  const f = fixture({ legacy: true }), window = bindLiveReplayWindow(f.player, f.video, () => {});
  assert.equal(f.controller._mediaElement.currentTime, 400); assert.equal(f.video.currentTime, 50);
  assert.equal(f.controller._mediaElement.method(), f.video);
  f.controller._mediaElement.currentTime = 250; assert.equal(f.video.currentTime, 250);
  window.maintain(); assert.equal(f.video.buffered.start(0), 220);
  window.dispose(); assert.equal(f.controller._mediaElement, f.video);
});

test('unknown buffer controllers fail explicitly and empty buffer clocks remain safe', () => {
  const f = fixture();
  assert.throws(() => bindLiveReplayWindow({}, f.video, () => {}), /Unsupported/);
  assert.throws(() => bindLiveReplayWindow({ _msectl: { ...f.controller, _mediaElementProxy: undefined } }, f.video, () => {}), /clock/);
  f.video.buffered = ranges([]); assert.equal(restoreReplayPosition(f.video), false);
  const window = bindLiveReplayWindow(f.player, f.video, () => {});
  assert.equal(f.proxy.getCurrentTime(), 50); window.dispose();
});

test('the visible window keeps a fixed scale during startup and never exposes more than three minutes', () => {
  const early = { current: 1, start: 0, end: 2, bufferedEnd: 2, live: true };
  assert.deepEqual(seekWindow(early), { start: -178, end: 2 });
  assert.equal(seekWindow({ ...early, end: 3 }).end - seekWindow({ ...early, end: 3 }).start, 180);
  const f = fixture();
  assert.equal(readMediaTimeline(f.video, { live: true, bufferedOnly: true }).start, 220);
  assert.equal(seekInMedia(f.video, 10, { live: true, bufferedOnly: true }), true);
  assert.ok(f.video.currentTime > 220 && f.video.currentTime < 221);
  f.video.buffered = ranges([[0, 70], [300, 310], [350, 400]]);
  assert.equal(seekInMedia(f.video, 10, { live: true, bufferedOnly: true }), true);
  assert.ok(f.video.currentTime > 300 && f.video.currentTime < 301);
  assert.deepEqual(seekWindow({ ...early, live: false, end: 30 }), { start: 0, end: 30 });
});

test('quota pressure shrinks replay, waits for removal and append, resumes once and restores instance settings', () => {
  for (const legacy of [false, true]) {
    const f = fixture({ legacy, start: 220 }), window = bindLiveReplayWindow(f.player, f.video, () => assert.fail('paused must not jump'));
    f.quota(); f.sourceBuffer.updating = true; window.maintain(); assert.equal(f.cleanups(), 0);
    f.sourceBuffer.updating = false; window.maintain(); assert.equal(f.config.autoCleanupMinBackwardDuration, 90);
    assert.equal(f.video.buffered.start(0), 310); assert.equal(f.video.currentTime, 50); assert.equal(f.resumes(), 0);
    f.controller._isBufferFull = false; f.appendPending(true); window.maintain(); assert.equal(f.resumes(), 0);
    f.appendPending(false); window.maintain(); window.maintain(); assert.equal(f.resumes(), 1);
    window.dispose(); assert.deepEqual(f.config, { autoCleanupMaxBackwardDuration: 185, autoCleanupMinBackwardDuration: 180 });
    assert.equal(f.listeners.size, 0); f.pending(false); window.maintain(); assert.equal(f.resumes(), 1);
  }
});

test('repeated quota failures shorten the window and move running playback before removal, then fail at a bounded minimum', () => {
  const f = fixture({ current: 250, paused: false, start: 220 }); let expired = 0;
  const window = bindLiveReplayWindow(f.player, f.video, () => expired++);
  f.quota(); window.maintain(); assert.equal(f.video.currentTime, 311); assert.equal(expired, 1);
  window.maintain(); assert.equal(f.config.autoCleanupMinBackwardDuration, 45); assert.equal(f.video.currentTime, 356);
  window.maintain(); window.maintain(); window.maintain(); assert.equal(f.config.autoCleanupMinBackwardDuration, 10);
  assert.throws(() => window.maintain(), /quota cannot be recovered/);
  window.dispose();
});
