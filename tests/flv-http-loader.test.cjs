const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createFlvHttpLoader } = require('../src/features/video/flv-http-loader.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));
const api = {
  BaseLoader: class { constructor() { this._status = 0; } destroy() { this.onError = this.onDataArrival = this.onComplete = null; } },
  LoaderStatus: { kIdle:0, kConnecting:1, kBuffering:2, kError:3, kComplete:4 },
  LoaderErrors: { EXCEPTION:'Exception', HTTP_STATUS_CODE_INVALID:'HttpStatusCodeInvalid', CONNECTING_TIMEOUT:'ConnectingTimeout', EARLY_EOF:'EarlyEof' },
};
const seek = { getConfig:(url,range) => ({ url, headers:range.from ? {Range:`bytes=${range.from}-`} : {} }), removeURLParameters:url=>url };

test('closing a silent FLV aborts immediately and suppresses obsolete callbacks', async t => {
  let signal, chunks=0, errors=0, completed=0;
  t.mock.method(globalThis,'fetch',async (_,request)=>{
    signal=request.signal;
    return { ok:true, url:'', headers:new Headers(), body:new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array([1,2]));
      signal.addEventListener('abort',()=>controller.error(new DOMException('Aborted','AbortError')),{once:true});
    } }) };
  });
  const Loader=createFlvHttpLoader(api), loader=new Loader(seek,{});
  loader.onDataArrival=()=>chunks++;
  loader.onError=()=>errors++;
  loader.onComplete=()=>completed++;
  loader.open({url:'https://live.test/silent.flv'},{from:0,to:-1});
  await tick(); assert.equal(chunks,1);
  loader.destroy(); assert.equal(signal.aborted,true);
  await tick(); assert.equal(errors,0); assert.equal(completed,0);
});

test('HTTP FLV forwards ranges, auth and exact byte slices, then completes with correct offsets', async t => {
  const bytes = new Uint8Array([99,1,2,3,99]), received=[];
  let request;
  t.mock.method(globalThis,'fetch',async (_,options)=>{
    request=options;
    return new Response(new ReadableStream({start(controller){controller.enqueue(bytes.subarray(1,4));controller.close();}}),{headers:{'content-length':'3'}});
  });
  const Loader=createFlvHttpLoader(api), loader=new Loader(seek,{headers:{'X-Fixture':'yes'}});
  let total, completion;
  loader.onContentLengthKnown=value=>total=value;
  loader.onDataArrival=(buffer,offset,count)=>received.push({bytes:[...new Uint8Array(buffer)],offset,count});
  loader.onComplete=(from,to)=>completion=[from,to];
  loader.onError=()=>assert.fail('unexpected failure');
  loader.open({url:'https://live.test/live.flv',withCredentials:true},{from:42,to:-1});
  await tick();
  assert.equal(request.headers.get('range'),'bytes=42-'); assert.equal(request.headers.get('X-Fixture'),'yes'); assert.equal(request.credentials,'include');
  assert.equal(total,3); assert.deepEqual(received,[{bytes:[1,2,3],offset:42,count:3}]); assert.deepEqual(completion,[42,44]);
  loader.destroy();
});

test('HTTP errors and truncated FLV data are reported instead of completing successfully', async t => {
  const queue=[new Response(null,{status:403}),new Response(new Uint8Array([1,2]),{headers:{'content-length':'9'}})];
  t.mock.method(globalThis,'fetch',async ()=>queue.shift());
  const Loader=createFlvHttpLoader(api), loader=new Loader(seek,{}), errors=[];
  loader.onError=(type,error)=>errors.push([type,error.code]);
  loader.onDataArrival=()=>{};
  loader.onComplete=()=>assert.fail('must not complete');
  loader.open({url:'https://live.test/live.flv'},{from:0,to:-1}); await tick();
  loader.open({url:'https://live.test/live.flv'},{from:0,to:-1}); await tick();
  assert.deepEqual(errors,[['HttpStatusCodeInvalid',403],['EarlyEof',-1]]);
  loader.destroy();
});

test('a stalled connection times out, aborts, and reports one failure', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  let signal;
  t.mock.method(globalThis,'fetch',(_,request)=>new Promise((_,reject)=>{
    signal=request.signal; signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
  }));
  const Loader=createFlvHttpLoader(api), loader=new Loader(seek,{}), errors=[];
  loader.onError=type=>errors.push(type);
  loader.open({url:'https://live.test/live.flv'},{from:0,to:-1});
  t.mock.timers.tick(14999); assert.equal(signal.aborted,false);
  t.mock.timers.tick(1); await tick();
  assert.equal(signal.aborted,true); assert.deepEqual(errors,['ConnectingTimeout']);
  loader.destroy();
});

test('received chunks renew the idle deadline and replacing a request cancels the old one', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const signals=[], controllers=[], errors=[];
  t.mock.method(globalThis,'fetch',async (_,request)=>{
    const signal=request.signal; signals.push(signal);
    return {ok:true,url:'',headers:new Headers(),body:new ReadableStream({start(controller){
      controllers.push(controller); signal.addEventListener('abort',()=>controller.error(new DOMException('Aborted','AbortError')),{once:true});
    }})};
  });
  const Loader=createFlvHttpLoader(api), loader=new Loader(seek,{});
  loader.onError=type=>errors.push(type);loader.onDataArrival=()=>{};
  loader.open({url:'https://live.test/first.flv'},{from:0,to:-1});await tick();
  t.mock.timers.tick(29000); controllers[0].enqueue(new Uint8Array([1]));await tick();
  t.mock.timers.tick(29000);assert.equal(signals[0].aborted,false);
  loader.open({url:'https://live.test/second.flv'},{from:0,to:-1});await tick();
  assert.equal(signals[0].aborted,true);assert.deepEqual(errors,[]);
  t.mock.timers.tick(30000);await tick();
  assert.equal(signals[1].aborted,true);assert.deepEqual(errors,['ConnectingTimeout']);
  loader.destroy();
});
