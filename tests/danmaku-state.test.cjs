const { test } = require('node:test');
const assert = require('node:assert/strict');
const { monitorReducer: reduce, initialMonitorState, workspaceSnapshot } = require('../src/features/monitor/state.ts');
const { createRoom, normalizeSnapshot, restoreWorkspace, shareWorkspace } = require('../src/features/monitor/storage.ts');
const { defaultLayout } = require('../src/features/monitor/geometry.ts');
const populated = () => ['101','102'].reduce((state,id) => {
  const room = { ...createRoom('https://www.douyu.com/'+id,id), followed:true };
  return reduce(reduce(state,{type:'add',room}),{type:'open',id,layout:defaultLayout});
},initialMonitorState);
const enabled = (state,id='101') => state.videos.find(v=>v.id===id).danmakuEnabled;
const restored = state => reduce(initialMonitorState,{type:'hydrate',snapshot:normalizeSnapshot(workspaceSnapshot(state))});

test('new rooms and old implicit defaults start with danmaku off; explicit choices survive reload',()=>{
  let state=populated(); assert.equal(enabled(state),false);
  const old={...workspaceSnapshot(state),rooms:state.rooms.map(r=>({...r,danmakuEnabled:true}))};
  assert.ok(normalizeSnapshot(old).rooms.every(r=>!r.danmakuEnabled));
  state=reduce(state,{type:'danmaku',id:'101',enabled:true});
  assert.equal(enabled(restored(state)),true);assert.equal(enabled(restored(state),'102'),false);
  state=reduce(state,{type:'danmaku',id:'101',enabled:false});
  assert.equal(enabled(restored(state)),false);
});

test('focus and fullscreen temporarily open one room without persisting, and restore both off/on baselines',()=>{
  for(const baseline of [false,true]) for(const mode of ['focus','fullscreen']){
    let state=reduce(populated(),{type:'danmaku',id:'101',enabled:baseline});
    state=reduce(state,mode==='focus'?{type:mode,id:'101'}:{type:mode,id:'101',active:true,autoAudio:true});
    assert.equal(enabled(state),true);assert.equal(enabled(state,'102'),false);
    assert.equal(enabled(restored(state)),baseline);
    state=reduce(state,mode==='focus'?{type:mode,id:null}:{type:mode,id:'101',active:false,autoAudio:true});
    assert.equal(enabled(state),baseline);
  }
});

test('manual danmaku changes survive same-room mode transitions, exit, close/reopen and reload',()=>{
  let state=reduce(populated(),{type:'focus',id:'101'});
  state=reduce(state,{type:'danmaku',id:'101',enabled:false});
  state=reduce(state,{type:'fullscreen',id:'101',active:true,autoAudio:true});
  assert.equal(enabled(state),false);
  state=reduce(state,{type:'focus',id:'101'});
  assert.equal(enabled(state),false);
  state=reduce(state,{type:'danmaku',id:'101',enabled:true});
  state=reduce(state,{type:'focus',id:null}); assert.equal(enabled(state),true);
  state=reduce(state,{type:'close',id:'101'});
  state=reduce(state,{type:'open',id:'101',layout:defaultLayout});
  assert.equal(enabled(state),true);assert.equal(enabled(restored(state)),true);
});

test('audio and danmaku ownership are independent; disabled auto policy respects manual choices',()=>{
  let state=reduce(populated(),{type:'focus',id:'101'});
  state=reduce(state,{type:'audio',id:'101',muted:false,volume:.7});
  state=reduce(state,{type:'focus',id:null});assert.equal(enabled(state),false);assert.equal(state.videos[0].volume,.7);
  state=reduce(state,{type:'focus',id:'101',autoDanmaku:false});assert.equal(enabled(state),false);
  state=reduce(state,{type:'danmaku-policy',enabled:true});assert.equal(enabled(state),true);
  state=reduce(state,{type:'danmaku',id:'101',enabled:false});
  state=reduce(state,{type:'danmaku-policy',enabled:true});assert.equal(enabled(state),false);
  state=reduce(state,{type:'focus',id:'102'});assert.equal(enabled(state),false);assert.equal(enabled(state,'102'),true);
  state=reduce(state,{type:'close',id:'102'});assert.equal(state.focus,null);assert.equal(enabled(state),false);
});

test('sharing temporary focus does not enable danmaku for recipients or overwrite their saved choice',()=>{
  let state=reduce(populated(),{type:'focus',id:'101'});
  const share=new URL(shareWorkspace('http://localhost',workspaceSnapshot(state)));
  const local=reduce(populated(),{type:'danmaku',id:'101',enabled:true});
  const snapshot=restoreWorkspace({getItem:key=>key==='uni-live.workspace.v3'?JSON.stringify(workspaceSnapshot(local)):null},{shareVideo:share.searchParams.get('video')});
  assert.equal(snapshot.rooms.find(r=>r.id==='101').danmakuEnabled,true);
});

test('repeated playing does not reorder history; changed keys update once and stale keys are ignored',()=>{
  let state=populated();
  state=reduce(state,{type:'playing',id:'101',key:0,at:100});
  assert.equal(reduce(state,{type:'playing',id:'101',key:0,at:200}),state);
  assert.equal(reduce(state,{type:'video',id:'101',patch:{status:'playing'}}),state);
  assert.equal(reduce(state,{type:'video',id:'missing',patch:{status:'playing'}}),state);
  state=reduce(state,{type:'video',id:'101',patch:{paused:true}});
  state=reduce(state,{type:'playing',id:'101',key:0,at:300});
  assert.equal(state.rooms[0].lastWatchedAt,100);assert.equal(state.videos[0].paused,false);
  state=reduce(state,{type:'video',id:'101',patch:{playbackKey:1}});
  assert.equal(reduce(state,{type:'playing',id:'101',key:0,at:400}),state);
  state=reduce(state,{type:'playing',id:'101',key:1,at:500});assert.equal(state.rooms[0].lastWatchedAt,500);
});
