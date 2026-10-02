const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DanmakuEngine } = require('../src/features/danmaku/DanmakuEngine.ts');

function environment(t, width = 500, height = 300) {
  let now = 0, serial = 0, disconnected = false;
  const frames = new Map(), operations = [], children = [], animations = [];
  const globals = {};
  for (const name of ['document', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance']) globals[name] = Object.getOwnPropertyDescriptor(globalThis, name);
  t.after(() => { for (const [name, descriptor] of Object.entries(globals)) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } });
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
  globalThis.requestAnimationFrame = callback => { frames.set(++serial, callback); return serial; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  globalThis.ResizeObserver = class { observe() {} disconnect() { disconnected = true; } };
  globalThis.document = {
    createDocumentFragment: () => ({ children: [], appendChild(el) { this.children.push(el); } }),
    createElement: () => ({ style: {}, textContent: '',
      get offsetWidth() { operations.push('measure'); return 50; },
      remove() { const index = children.indexOf(this); if (index >= 0) children.splice(index, 1); },
      animate() { operations.push('animate'); const animation = { onfinish: null, cancelled: false, cancel() { this.cancelled = true; } }; animations.push(animation); return animation; },
    }),
  };
  const container = { style: {}, clientWidth: width, clientHeight: height, appendChild(fragment) { operations.push('append'); children.push(...fragment.children); } };
  return { container, frames, operations, children, animations, disconnected: () => disconnected,
    time: value => { now = value; }, frame: () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(now)); } };
}

test('danmaku sleeps while idle, wakes once per batch, and releases finished animations without a frame loop', t => {
  const env = environment(t), engine = new DanmakuEngine(env.container);
  assert.equal(env.frames.size, 0);
  engine.push('one'); engine.push('two');
  assert.equal(env.frames.size, 1);
  env.frame();
  assert.equal(env.children.length, 2);
  assert.equal(env.frames.size, 0);
  assert.deepEqual(env.operations, ['append', 'measure', 'measure', 'animate', 'animate']);
  env.animations.forEach(animation => animation.onfinish());
  assert.equal(env.children.length, 0);
  assert.ok(env.animations.every(animation => animation.cancelled && animation.onfinish === null));
  assert.equal(env.frames.size, 0);
  engine.push('again'); assert.equal(env.frames.size, 1);
  engine.destroy(); assert.equal(env.frames.size, 0); assert.equal(env.disconnected(), true);
  engine.push('after destroy'); assert.equal(env.frames.size, 0);
});

test('danmaku limits a frame batch and keeps separate lanes before reading layout', t => {
  const env = environment(t), engine = new DanmakuEngine(env.container);
  for (let i = 0; i < 12; i++) engine.push(String(i));
  env.frame(); assert.equal(env.children.length, 8); assert.equal(env.frames.size, 1);
  assert.equal(new Set(env.children.map(el => el.style.transform)).size, 8);
  assert.ok(env.operations.lastIndexOf('measure') < env.operations.indexOf('animate'));
  env.frame(); assert.equal(env.children.length, 10);
  env.time(2600); env.frame(); assert.equal(env.frames.size, 0); // Remaining messages expire while all lanes are occupied.
  engine.setFontSize(30); assert.equal(env.children.length, 0); assert.ok(env.animations.every(animation => animation.cancelled));
  engine.destroy();
});

test('a zero-width or overcrowded overlay drops stale messages and cancels queued work on destroy', t => {
  const env = environment(t, 0, 30), engine = new DanmakuEngine(env.container);
  for (let i = 0; i < 100; i++) engine.push(String(i));
  env.frame(); assert.equal(env.children.length, 0); assert.equal(env.frames.size, 1);
  env.time(3000); env.frame(); assert.equal(env.frames.size, 0);
  engine.push('pending'); engine.destroy(); assert.equal(env.frames.size, 0); assert.equal(env.children.length, 0);
});
