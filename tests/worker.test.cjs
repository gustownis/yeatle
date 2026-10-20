const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'build/assets/separator.worker.js'), 'utf8');
const bundle = fs.readFileSync(path.join(root, 'build/assets/yeatle.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('the standalone worker parses without optional helper modules', () => {
  new vm.Script(worker.replaceAll('import.meta.url', '"http://worker.test/assets/separator.worker.js"'));
  assert.doesNotMatch(worker, /(?:model-download|worker-lifecycle)\.mjs/);
});

test('audio jobs distinguish playable sources while reusing the same source', async () => {
  const first = bundle.indexOf('function vd('), last = bundle.indexOf('function km(', first);
  const jobs = new Map();
  let protectedKey;
  const { audioCacheKey } = await import('../build/assets/performance.mjs');
  const getJob = vm.runInNewContext(bundle.slice(first, last) + ';vd', {
    yt: jobs, YeatleAudioKey: audioCacheKey, Date, Em(key) { protectedKey = key; },
    xm: class { constructor(song, ctx) { this.song = song; this.ctx = ctx; this.listeners = new Set(); } }
  });
  const released = { id: 'same-answer', audioId: 'same-answer@audio-release', mode: 'filter' };
  const leak = { id: 'same-answer', audioId: 'same-answer@audio-leak', mode: 'filter' };
  const firstJob = getJob(released, {}), secondJob = getJob(leak, {});
  assert.notEqual(firstJob, secondJob, 'a different recording must not reuse the first source buffers');
  assert.equal(secondJob.song.audioId, leak.audioId);
  assert.equal(getJob({ ...leak }, {}), secondJob, 'the same recording reuses its existing work');
  assert.equal(firstJob.song.id, secondJob.song.id, 'the progress identity stays unchanged');
  assert.equal(protectedKey, leak.audioId, 'memory trimming protects the actual requested source');
  firstJob.error = new Error('failed release');
  assert.notEqual(getJob(released, {}), firstJob, 'a failed source can be retried');
  assert.equal(getJob(leak, {}), secondJob, 'retrying one source keeps the other source cache');
});

test('detaching and reattaching an unfinished round keeps its job alive', () => {
  const first = bundle.indexOf('class xm{'), last = bundle.indexOf('function Em(', first);
  const jobs = new Map();
  const Class = vm.runInNewContext(bundle.slice(first, last) + ';xm', { yt: jobs, YeatleTrim() {}, zt: null });
  const job = Object.assign(Object.create(Class.prototype), { song: { id: 'one' }, complete: false, listeners: new Set(), buffers: {}, abortController: new AbortController() });
  jobs.set('one', job);
  job.on(() => {})();
  const offAgain = job.on(() => {});
  assert.equal(job.abortController.signal.aborted, false);
  assert.equal(jobs.get('one'), job);
  assert.notEqual(job.buffers, null);
  offAgain();
});

test('an explicit cache eviction still aborts and cancels unfinished audio', () => {
  const first = bundle.indexOf('class xm{'), last = bundle.indexOf('function Em(', first);
  const messages = [];
  const Class = vm.runInNewContext(bundle.slice(first, last) + ';xm', { zt: {postMessage: message => messages.push(message)},YeatleScheduleWorkerIdle(){} });
  const job = Object.assign(Object.create(Class.prototype), {workerId: 7, complete: false, buffers: {}, abortController: new AbortController()});
  job.cancel();
  assert.equal(job.abortController.signal.aborted, true);
  assert.equal(job.buffers, null);
  assert.equal(messages[0].type, 'cancel');
  assert.equal(messages[0].id, 7);
});

test('a failed worker reports its error and a later attempt creates a fresh worker', () => {
  const instances = [], errors = [];
  const first = bundle.indexOf('let zt='), last = bundle.indexOf('class xm{', first);
  const source = bundle.slice(first, last).replaceAll('import.meta.url', '"http://worker.test/assets/yeatle.js"');
  const api = vm.runInNewContext(source + ';({gd,yt,wm})', { URL, clearTimeout(){}, Worker: class { constructor() { instances.push(this); } terminate() { this.terminated = true; } } });
  api.yt.set('one', { fail(error) { errors.push(error.message); } });
  const statuses = [];
  api.wm(status => statuses.push(status));
  const original = api.gd();
  original.onerror({message:'Failed to load the worker module'});
  assert.equal(original.terminated, true);
  assert.deepEqual(errors, ['Failed to load the worker module']);
  assert.equal(statuses.at(-1).error, errors[0]);
  assert.notEqual(api.gd(), original);
  assert.equal(instances.length, 2);
});

test('a queued cancellation is skipped and the next real split runs', async () => {
  let finishStartup;
  const startup = new Promise(resolve => { finishStartup = resolve; });
  const messages = [], splits = [];
  const context = vm.createContext({ Zr:false, YeatleDisposing:false, YeatleActiveJob:null, Jt:[], rt:new Set(), Ld:()=>startup, fh() {},
    ph:async(left,_right,_run,segment)=>{ splits.push(left); segment({stems:{drums:new Float32Array(1)}}); },
    self:{postMessage: message => messages.push(message)} });
  vm.runInContext(worker.slice(worker.indexOf('async function mh(){')), context);
  const send = data => context.self.onmessage({data});
  send({type:'split', id:1, left:'first'});
  send({type:'split', id:2, left:'cancelled'});
  send({type:'cancel', id:2});
  send({type:'split', id:3, left:'next'});
  finishStartup();await tick();
  assert.deepEqual(splits, ['first','next']);
  assert.deepEqual(messages.filter(message=>message.type==='done').map(message=>message.id), [1,3]);
  assert.equal(context.Zr, false);
});

function playerClass(context) {
  const first = bundle.indexOf('class Lm{'), last = bundle.indexOf('const Sd=', first);
  return vm.runInNewContext(bundle.slice(first, last) + ';Lm', context);
}

test('Light fallback passes the original failure reason to the visible playback state', () => {
  const Class = playerClass({rt:()=>({connect(){},gain:{value:0}}),clearInterval(){},YeatleDisposeGraph(){}});
  const progress = [], p = Object.assign(Object.create(Class.prototype), {mode:'split',ctx:{destination:{}},master:{disconnect(){}},wantPlay:false,playing:false,
    stopSources(){},applyVolume(){},buildFilters(){},applyLevel(){},onProgress:value=>progress.push(value)});
  p.onJob({error:new Error('The vocals model could not load (503)')});
  assert.equal(p.mode,'filter');
  assert.equal(progress[0].fallback,true);
  assert.equal(progress[0].reason,'The vocals model could not load (503)');
});

test('unsupported browsers explain the fallback after construction', () => {
  const pending = [], progress = [], gain = {value:0};
  const Class = playerClass({yd:()=>({destination:{}}),rt:()=>({gain,connect(){}}),So:new Set(),yo:0.8,gu:()=>false,setTimeout:fn=>pending.push(fn)});
  Class.prototype.buildFilters=function(){};
  const p = new Class({mode:'filter'}, {onProgress:value=>progress.push(value)});
  assert.equal(progress.length,0);
  pending.forEach(fn=>fn());
  assert.equal(p.mode,'filter');
  assert.match(progress[0].reason,/WebAssembly/);
});

test('final-level cancellation keeps the original, ignores late segments, and requires a fresh earlier-level job',()=>{
 const first=bundle.indexOf('class xm{'),last=bundle.indexOf('function Em(',first),messages=[];
 const Class=vm.runInNewContext(bundle.slice(first,last)+';xm',{zt:{postMessage:message=>messages.push(message)},YeatleScheduleWorkerIdle(){}});
 const original={label:'full song'},job=Object.assign(Object.create(Class.prototype),{workerId:7,buffers:{mix:original,drums:{}},listeners:new Set(),complete:false});
 job.stopSeparation();assert.equal(job.buffers.mix,original);assert.equal(job.buffers.drums,undefined);assert.equal(job.complete,false);
 job.addSegment({});job.finish();job.fail(new Error('late cancellation error'));
 assert.equal(job.error,undefined);assert.equal(messages[0].type,'cancel');assert.equal(messages.length,1);
});
