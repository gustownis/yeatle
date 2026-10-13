const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const reference=require('./fixtures/separation-reference.cjs');
const source=fs.readFileSync(path.join(__dirname,'../build/assets/separator.worker.js'),'utf8');
const first=source.indexOf('const ee=4096'),last=source.indexOf('Y.wasm.wasmPaths=new URL',first);
const split=vm.runInNewContext(source.slice(first,last)+';ph',{setTimeout});
async function run(process,left,right){
 const segments=[],inputs=[];
 await process(left,right,async(stem,input)=>{
   inputs.push(crypto.createHash('sha256').update(new Uint8Array(input.buffer,input.byteOffset,input.byteLength)).digest('hex'));
   const mask=new Float32Array(input.length);const index=['drums','bass','other','vocals'].indexOf(stem);
   for(let i=0;i<mask.length;i++)mask[i]=0.01+Math.abs(input[i])*0.0003+(i%17+index)/100;
   return mask;
 },segment=>segments.push(segment));
 return{segments,inputs};
}
test('rolling buffers and reused powers match the original samples and model inputs across a chunk boundary',async()=>{
 const length=512*1024+12345,left=new Float32Array(length),right=new Float32Array(length);
 for(let i=0;i<length;i++){left[i]=0.4*Math.sin(i*0.063)+0.11*Math.cos(i*0.021);right[i]=0.23*Math.sin(i*0.089+0.5);}
 const before=await run(reference.ph,left,right),after=await run(split,left,right);
 assert.deepEqual(after.inputs,before.inputs);assert.equal(after.segments.length,2);
 for(let i=0;i<after.segments.length;i++){
  const a=after.segments[i],b=before.segments[i];
  for(const key of ['from','to','total','done','splits'])assert.equal(a[key],b[key]);
  for(const stem of ['drums','bass','other'])assert.equal(Buffer.compare(Buffer.from(a.stems[stem].buffer),Buffer.from(b.stems[stem].buffer)),0,stem+' samples differ');
 }
});
test('explicit cancellation stops before the next model inference',async()=>{
 let cancelled=false,runs=0,segments=0;
 await assert.rejects(split(new Float32Array(1024),new Float32Array(1024),async()=>{runs++;setTimeout(()=>{cancelled=true;},0);return new Float32Array(2*512*1024);},()=>{segments++;},()=>cancelled),/cancelled/);
 assert.equal(runs,1);assert.equal(segments,0);
});
