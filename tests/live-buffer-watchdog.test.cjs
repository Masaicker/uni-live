const { test }=require('node:test');
const assert=require('node:assert/strict');
const { LiveBufferWatchdog }=require('../src/features/video/live-buffer-watchdog.ts');
test('no initial playable data times out at fifteen seconds, receiving progress renews thirty seconds',()=>{
  const monitor=new LiveBufferWatchdog(0);
  assert.equal(monitor.sample(14999,0,0,false,false),false);
  assert.equal(monitor.sample(15000,0,0,false,false),true);
  assert.equal(monitor.sample(16000,3,1,false,false),false);
  assert.equal(monitor.sample(45999,3,3,false,false),false);
  assert.equal(monitor.sample(46000,3,3,false,false),true);
});
test('pause/background, completed files and ample forward buffer never trigger timeout',()=>{
  const monitor=new LiveBufferWatchdog(0);
  for(const now of [100000,200000,300000]) assert.equal(monitor.sample(now,100,0,false,false),false);
  assert.equal(monitor.sample(400000,100,100,true,false),false);
  assert.equal(monitor.sample(500000,100,100,false,true),false);
  assert.equal(monitor.sample(500001,100,100,false,false),false);
});
