const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { isAacFillOnly } = require("../scripts/aac-fill-only.cjs");
const patchFlvAac = require("../scripts/flv-aac-loader.cjs");

const bits = (value, count) => value.toString(2).padStart(count, "0");
const fill = (payload) => "110" + (payload.length < 15
  ? bits(payload.length, 4)
  : "1111" + bits(payload.length - 14, 8)) + payload.map(value => bits(value, 8)).join("");
const bytes = (value) => Uint8Array.from(value.padEnd(Math.ceil(value.length / 8) * 8, "0").match(/.{8}/g) ?? [], octet => parseInt(octet, 2));

test("complete fill-only blocks, including escaped counts and multiple FIL elements, produce no audio", () => {
  for (const length of [0, 1, 14, 15, 142, 269]) {
    assert.equal(isAacFillOnly(bytes(fill(Array(length).fill(0xab)) + "111")), true);
  }
  assert.equal(isAacFillOnly(bytes(fill([0xde, 0xfc]) + fill([0x01]) + "111")), true);
});

test("audio elements after FIL, unknown elements, incomplete blocks and invalid padding are retained", () => {
  for (const id of [0, 1, 2, 3, 4, 5]) {
    assert.equal(isAacFillOnly(bytes(fill([0xab]) + bits(id, 3) + "111")), false);
    assert.equal(isAacFillOnly(bytes(bits(id, 3) + "111")), false);
  }
  const complete = bytes(fill(Array(142).fill(0xab)) + "111");
  for (let length = 0; length < complete.length; length++) {
    assert.equal(isAacFillOnly(complete.subarray(0, length)), false);
  }
  assert.equal(isAacFillOnly(bytes("1101111")), false);
  assert.equal(isAacFillOnly(bytes(fill([]) + "1111")), false);
  assert.equal(isAacFillOnly(bytes(fill([]) + "111000000000")), false);
  assert.equal(isAacFillOnly(bytes("111")), false);
});

test("both installed playback bundles inline a self-contained filter before queueing AAC", () => {
  for (const name of ["mpegts.js", "flv.js"]) {
    const resourcePath = require.resolve(name);
    const original = fs.readFileSync(resourcePath, "utf8");
    const patched = patchFlvAac.call({ resourcePath }, original);
    new vm.Script(patched, { filename: resourcePath });
    const injected = patched.match(/if \(\((function isAacFillOnly[\s\S]+?)\)\([\w$]+\.data\)\) return;/);
    assert.ok(injected, `${name} must include the worker-safe predicate`);
    const filter = vm.runInNewContext(`(${injected[1]})`);
    assert.equal(filter(bytes(fill([0xab]) + "111")), true);
    assert.equal(filter(bytes(fill([0xab]) + "001111")), false);
  }
});

test("unexpected playback bundle changes fail the build instead of silently omitting the fix", () => {
  assert.throws(() => patchFlvAac.call({ resourcePath: "changed.js" }, "changed"), /found 0/);
  assert.throws(() => patchFlvAac.call({ resourcePath: "changed.js" }, "else if(1===x.packetType){}else if(1===y.packetType){}"), /found 2/);
});
