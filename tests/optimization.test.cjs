const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {gunzipSync}=require('node:zlib');
const {pathToFileURL}=require('node:url');
const {createCompressedCache}=require('../static-cache.cjs');
const {createActiveSongFeed}=require('../live-control.cjs');
const {EventEmitter}=require('node:events');
const performanceModule=import(pathToFileURL(path.join(__dirname,'../build/assets/performance.mjs')).href);
const stemCacheModule=import(pathToFileURL(path.join(__dirname,'../build/assets/stem-cache.mjs')).href);

test('compressed variants coalesce, invalidate on edits, and remain within their memory budget',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yeatle-compression-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'asset.js');fs.writeFileSync(file,'one'.repeat(4000));
 const cache=createCompressedCache({maxBytes:1000});const stat=fs.statSync(file);
 const [first,shared]=await Promise.all([cache.get(file,stat),cache.get(file,stat)]);
 assert.equal(first,shared);assert.equal(gunzipSync(first).toString(),'one'.repeat(4000));
 fs.writeFileSync(file,'different'.repeat(3000));const updated=await cache.get(file,fs.statSync(file));
 assert.notEqual(updated,first);assert.equal(gunzipSync(updated).toString(),'different'.repeat(3000));
 assert.ok(cache.retainedBytes<=1000);
 const tiny=createCompressedCache({maxBytes:1});await tiny.get(file,fs.statSync(file));assert.equal(tiny.size,0);
});

test('live updates use one stream, close while hidden, and reconnect with the latest song',async()=>{
 const {watchActiveSong}=await performanceModule;
 const handlers=new Set(),sources=[],received=[];let polls=0;
 const document={hidden:false,addEventListener(_type,fn){handlers.add(fn);},removeEventListener(_type,fn){handlers.delete(fn);}};
 class Source {constructor(url){this.url=url;sources.push(this);}close(){this.closed=true;}}
 const stop=watchActiveSong(value=>received.push(value),{enabled:true,document,EventSource:Source,poll:()=>polls++});
 assert.equal(sources.length,1);sources[0].onmessage({data:'{"id":"first","seq":1}'});
 document.hidden=true;handlers.forEach(fn=>fn());assert.equal(sources[0].closed,true);
 document.hidden=false;handlers.forEach(fn=>fn());assert.equal(sources.length,2);
 sources[1].onmessage({data:'{"id":"latest","seq":2}'});assert.equal(received.at(-1).id,'latest');
 assert.equal(polls,0);stop();assert.equal(sources[1].closed,true);assert.equal(handlers.size,0);
 const disabled=watchActiveSong(()=>{}, {enabled:false,document,EventSource:Source,poll:()=>polls++});disabled();assert.equal(sources.length,2);
});

test('audio disposal unregisters media callbacks and disconnects every retained graph node',async()=>{
 const {disposeAudioGraph}=await performanceModule;let removed=0,disconnected=0;
 const node=()=>({disconnect(){disconnected++;}});const master=node(),source=node(),filter=node();
 const player={events:[[{removeEventListener(){removed++;}},'timeupdate',()=>{}]],master,out:master,nodes:[source,filter],analysers:[],gates:[]};
 disposeAudioGraph(player);assert.equal(removed,1);assert.equal(disconnected,3);assert.equal(player.master,null);assert.deepEqual(player.nodes,[]);
});

test('live streams drop slow or disconnected clients without retaining or writing to them',()=>{
 const feed=createActiveSongFeed();
 class Response extends EventEmitter {
  constructor(){super();this.writes=[];this.blocked=false;}
  writeHead(){}flushHeaders(){}
  write(value){this.writes.push(value);return !this.blocked;}
  end(){this.writableEnded=true;this.emit('close');}
 }
 const slow=new Response(),closed=new Response();feed.subscribe({},slow,{seq:0});feed.subscribe({},closed,{seq:0});
 assert.equal(feed.size,2);slow.blocked=true;closed.destroyed=true;feed.publish({id:'one',seq:1});
 assert.equal(feed.size,0);assert.equal(slow.writableEnded,true);assert.equal(closed.writes.length,1);
 const count=slow.writes.length;feed.publish({id:'two',seq:2});assert.equal(slow.writes.length,count);closed.emit('close');
});

test('persistent stems skip audio APIs that perturb samples without reading any real audio',async()=>{
 const {canCacheStems}=await stemCacheModule;
 function context(perturb){return{sampleRate:44100,createBuffer(_channels,length){const samples=new Float32Array(length);return{copyToChannel(input){samples.set(input)},getChannelData(){if(perturb)for(let i=0;i<samples.length;i++)samples[i]*=0.9998;return samples}}}}}
 assert.equal(canCacheStems(context(false)),true);assert.equal(canCacheStems(context(true)),false);
 assert.equal(canCacheStems({createBuffer(){throw Error('Unavailable')}}),false);
});
