/*!
 * ONNX Runtime Web v1.20.1
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */var di=Object.defineProperty,Gd=Object.getOwnPropertyDescriptor,Fd=Object.getOwnPropertyNames,Hd=Object.prototype.hasOwnProperty,jd=(e=>typeof require<"u"?require:typeof Proxy<"u"?new Proxy(e,{get:(t,r)=>(typeof require<"u"?require:t)[r]}):e)(function(e){if(typeof require<"u")return require.apply(this,arguments);throw Error('Dynamic require of "'+e+'" is not supported')}),T=(e,t)=>()=>(e&&(t=e(e=0)),t),er=(e,t)=>{for(var r in t)di(e,r,{get:t[r],enumerable:!0})},Kd=(e,t,r,i)=>{if(t&&typeof t=="object"||typeof t=="function")for(let a of Fd(t))!Hd.call(e,a)&&a!==r&&di(e,a,{get:()=>t[a],enumerable:!(i=Gd(t,a))||i.enumerable});return e},pi=e=>Kd(di({},"__esModule",{value:!0}),e),lt,Pe,it,Li,hi,ci=T(()=>{lt=new Map,Pe=[],it=(e,t,r)=>{if(t&&typeof t.init=="function"&&typeof t.createInferenceSessionHandler=="function"){let i=lt.get(e);if(i===void 0)lt.set(e,{backend:t,priority:r});else{if(i.priority>r)return;if(i.priority===r&&i.backend!==t)throw new Error(`cannot register backend "${e}" using priority ${r}`)}if(r>=0){let a=Pe.indexOf(e);a!==-1&&Pe.splice(a,1);for(let s=0;s<Pe.length;s++)if(lt.get(Pe[s]).priority<=r){Pe.splice(s,0,e);return}Pe.push(e)}return}throw new TypeError("not a valid backend")},Li=async e=>{let t=lt.get(e);if(!t)return"backend not found.";if(t.initialized)return t.backend;if(t.aborted)return t.error;{let r=!!t.initPromise;try{return r||(t.initPromise=t.backend.init(e)),await t.initPromise,t.initialized=!0,t.backend}catch(i){return r||(t.error=`${i}`,t.aborted=!0),t.error}finally{delete t.initPromise}}},hi=async e=>{let t=e.executionProviders||[],r=t.map(u=>typeof u=="string"?u:u.name),i=r.length===0?Pe:r,a,s=[],n=new Set;for(let u of i){let l=await Li(u);typeof l=="string"?s.push({name:u,err:l}):(a||(a=l),a===l&&n.add(u))}if(!a)throw new Error(`no available backend found. ERR: ${s.map(u=>`[${u.name}] ${u.err}`).join(", ")}`);for(let{name:u,err:l}of s)r.includes(u)&&console.warn(`removing requested execution provider "${u}" from session options because it is not available: ${l}`);let o=t.filter(u=>n.has(typeof u=="string"?u:u.name));return[a,new Proxy(e,{get:(u,l)=>l==="executionProviders"?o:Reflect.get(u,l)})]}}),Zd=T(()=>{ci()}),ho,Qd=T(()=>{ho="1.20.1"}),ar,ve,co=T(()=>{Qd(),ar="warning",ve={wasm:{},webgl:{},webgpu:{},versions:{common:ho},set logLevel(e){if(e!==void 0){if(typeof e!="string"||["verbose","info","warning","error","fatal"].indexOf(e)===-1)throw new Error(`Unsupported logging level: ${e}`);ar=e}},get logLevel(){return ar}},Object.defineProperty(ve,"logLevel",{enumerable:!0})}),Y,Xd=T(()=>{co(),Y=ve}),fo,mo,Yd=T(()=>{fo=(e,t)=>{let r=typeof document<"u"?document.createElement("canvas"):new OffscreenCanvas(1,1);r.width=e.dims[3],r.height=e.dims[2];let i=r.getContext("2d");if(i!=null){let a,s;(t==null?void 0:t.tensorLayout)!==void 0&&t.tensorLayout==="NHWC"?(a=e.dims[2],s=e.dims[3]):(a=e.dims[3],s=e.dims[2]);let n=(t==null?void 0:t.format)!==void 0?t.format:"RGB",o=t==null?void 0:t.norm,u,l;o===void 0||o.mean===void 0?u=[255,255,255,255]:typeof o.mean=="number"?u=[o.mean,o.mean,o.mean,o.mean]:(u=[o.mean[0],o.mean[1],o.mean[2],0],o.mean[3]!==void 0&&(u[3]=o.mean[3])),o===void 0||o.bias===void 0?l=[0,0,0,0]:typeof o.bias=="number"?l=[o.bias,o.bias,o.bias,o.bias]:(l=[o.bias[0],o.bias[1],o.bias[2],0],o.bias[3]!==void 0&&(l[3]=o.bias[3]));let d=s*a,p=0,h=d,c=d*2,f=-1;n==="RGBA"?(p=0,h=d,c=d*2,f=d*3):n==="RGB"?(p=0,h=d,c=d*2):n==="RBG"&&(p=0,c=d,h=d*2);for(let m=0;m<s;m++)for(let w=0;w<a;w++){let y=(e.data[p++]-l[0])*u[0],g=(e.data[h++]-l[1])*u[1],_=(e.data[c++]-l[2])*u[2],$=f===-1?255:(e.data[f++]-l[3])*u[3];i.fillStyle="rgba("+y+","+g+","+_+","+$+")",i.fillRect(w,m,1,1)}if("toDataURL"in r)return r.toDataURL();throw new Error("toDataURL is not supported")}else throw new Error("Can not access image data")},mo=(e,t)=>{let r=typeof document<"u"?document.createElement("canvas").getContext("2d"):new OffscreenCanvas(1,1).getContext("2d"),i;if(r!=null){let a,s,n;(t==null?void 0:t.tensorLayout)!==void 0&&t.tensorLayout==="NHWC"?(a=e.dims[2],s=e.dims[1],n=e.dims[3]):(a=e.dims[3],s=e.dims[2],n=e.dims[1]);let o=t!==void 0&&t.format!==void 0?t.format:"RGB",u=t==null?void 0:t.norm,l,d;u===void 0||u.mean===void 0?l=[255,255,255,255]:typeof u.mean=="number"?l=[u.mean,u.mean,u.mean,u.mean]:(l=[u.mean[0],u.mean[1],u.mean[2],255],u.mean[3]!==void 0&&(l[3]=u.mean[3])),u===void 0||u.bias===void 0?d=[0,0,0,0]:typeof u.bias=="number"?d=[u.bias,u.bias,u.bias,u.bias]:(d=[u.bias[0],u.bias[1],u.bias[2],0],u.bias[3]!==void 0&&(d[3]=u.bias[3]));let p=s*a;if(t!==void 0&&(t.format!==void 0&&n===4&&t.format!=="RGBA"||n===3&&t.format!=="RGB"&&t.format!=="BGR"))throw new Error("Tensor format doesn't match input tensor dims");let h=4,c=0,f=1,m=2,w=3,y=0,g=p,_=p*2,$=-1;o==="RGBA"?(y=0,g=p,_=p*2,$=p*3):o==="RGB"?(y=0,g=p,_=p*2):o==="RBG"&&(y=0,_=p,g=p*2),i=r.createImageData(a,s);for(let v=0;v<s*a;c+=h,f+=h,m+=h,w+=h,v++)i.data[c]=(e.data[y++]-d[0])*l[0],i.data[f]=(e.data[g++]-d[1])*l[1],i.data[m]=(e.data[_++]-d[2])*l[2],i.data[w]=$===-1?255:(e.data[$++]-d[3])*l[3]}else throw new Error("Can not access image data");return i}}),Et,go,yo,wo,$o,_o,Jd=T(()=>{fi(),Et=(e,t)=>{if(e===void 0)throw new Error("Image buffer must be defined");if(t.height===void 0||t.width===void 0)throw new Error("Image height and width must be defined");if(t.tensorLayout==="NHWC")throw new Error("NHWC Tensor layout is not supported yet");let{height:r,width:i}=t,a=t.norm??{mean:255,bias:0},s,n;typeof a.mean=="number"?s=[a.mean,a.mean,a.mean,a.mean]:s=[a.mean[0],a.mean[1],a.mean[2],a.mean[3]??255],typeof a.bias=="number"?n=[a.bias,a.bias,a.bias,a.bias]:n=[a.bias[0],a.bias[1],a.bias[2],a.bias[3]??0];let o=t.format!==void 0?t.format:"RGBA",u=t.tensorFormat!==void 0&&t.tensorFormat!==void 0?t.tensorFormat:"RGB",l=r*i,d=u==="RGBA"?new Float32Array(l*4):new Float32Array(l*3),p=4,h=0,c=1,f=2,m=3,w=0,y=l,g=l*2,_=-1;o==="RGB"&&(p=3,h=0,c=1,f=2,m=-1),u==="RGBA"?_=l*3:u==="RBG"?(w=0,g=l,y=l*2):u==="BGR"&&(g=0,y=l,w=l*2);for(let $=0;$<l;$++,h+=p,f+=p,c+=p,m+=p)d[w++]=(e[h]+n[0])/s[0],d[y++]=(e[c]+n[1])/s[1],d[g++]=(e[f]+n[2])/s[2],_!==-1&&m!==-1&&(d[_++]=(e[m]+n[3])/s[3]);return u==="RGBA"?new $e("float32",d,[1,4,r,i]):new $e("float32",d,[1,3,r,i])},go=async(e,t)=>{let r=typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement,i=typeof ImageData<"u"&&e instanceof ImageData,a=typeof ImageBitmap<"u"&&e instanceof ImageBitmap,s=typeof e=="string",n,o=t??{},u=()=>{if(typeof document<"u")return document.createElement("canvas");if(typeof OffscreenCanvas<"u")return new OffscreenCanvas(1,1);throw new Error("Canvas is not supported")},l=d=>typeof HTMLCanvasElement<"u"&&d instanceof HTMLCanvasElement||d instanceof OffscreenCanvas?d.getContext("2d"):null;if(r){let d=u();d.width=e.width,d.height=e.height;let p=l(d);if(p!=null){let h=e.height,c=e.width;if(t!==void 0&&t.resizedHeight!==void 0&&t.resizedWidth!==void 0&&(h=t.resizedHeight,c=t.resizedWidth),t!==void 0){if(o=t,t.tensorFormat!==void 0)throw new Error("Image input config format must be RGBA for HTMLImageElement");o.tensorFormat="RGBA",o.height=h,o.width=c}else o.tensorFormat="RGBA",o.height=h,o.width=c;p.drawImage(e,0,0),n=p.getImageData(0,0,c,h).data}else throw new Error("Can not access image data")}else if(i){let d,p;if(t!==void 0&&t.resizedWidth!==void 0&&t.resizedHeight!==void 0?(d=t.resizedHeight,p=t.resizedWidth):(d=e.height,p=e.width),t!==void 0&&(o=t),o.format="RGBA",o.height=d,o.width=p,t!==void 0){let h=u();h.width=p,h.height=d;let c=l(h);if(c!=null)c.putImageData(e,0,0),n=c.getImageData(0,0,p,d).data;else throw new Error("Can not access image data")}else n=e.data}else if(a){if(t===void 0)throw new Error("Please provide image config with format for Imagebitmap");let d=u();d.width=e.width,d.height=e.height;let p=l(d);if(p!=null){let h=e.height,c=e.width;return p.drawImage(e,0,0,c,h),n=p.getImageData(0,0,c,h).data,o.height=h,o.width=c,Et(n,o)}else throw new Error("Can not access image data")}else{if(s)return new Promise((d,p)=>{let h=u(),c=l(h);if(!e||!c)return p();let f=new Image;f.crossOrigin="Anonymous",f.src=e,f.onload=()=>{h.width=f.width,h.height=f.height,c.drawImage(f,0,0,h.width,h.height);let m=c.getImageData(0,0,h.width,h.height);o.height=h.height,o.width=h.width,d(Et(m.data,o))}});throw new Error("Input data provided is not supported - aborted tensor creation")}if(n!==void 0)return Et(n,o);throw new Error("Input data provided is not supported - aborted tensor creation")},yo=(e,t)=>{let{width:r,height:i,download:a,dispose:s}=t,n=[1,i,r,4];return new $e({location:"texture",type:"float32",texture:e,dims:n,download:a,dispose:s})},wo=(e,t)=>{let{dataType:r,dims:i,download:a,dispose:s}=t;return new $e({location:"gpu-buffer",type:r??"float32",gpuBuffer:e,dims:i,download:a,dispose:s})},$o=(e,t)=>{let{dataType:r,dims:i,download:a,dispose:s}=t;return new $e({location:"ml-tensor",type:r??"float32",mlTensor:e,dims:i,download:a,dispose:s})},_o=(e,t,r)=>new $e({location:"cpu-pinned",type:e,data:t,dims:r??[t.length]})}),Ze,yt,nr,vo,ep=T(()=>{Ze=new Map([["float32",Float32Array],["uint8",Uint8Array],["int8",Int8Array],["uint16",Uint16Array],["int16",Int16Array],["int32",Int32Array],["bool",Uint8Array],["float64",Float64Array],["uint32",Uint32Array],["int4",Uint8Array],["uint4",Uint8Array]]),yt=new Map([[Float32Array,"float32"],[Uint8Array,"uint8"],[Int8Array,"int8"],[Uint16Array,"uint16"],[Int16Array,"int16"],[Int32Array,"int32"],[Float64Array,"float64"],[Uint32Array,"uint32"]]),nr=!1,vo=()=>{if(!nr){nr=!0;let e=typeof BigInt64Array<"u"&&BigInt64Array.from,t=typeof BigUint64Array<"u"&&BigUint64Array.from,r=typeof Float16Array<"u"&&Float16Array.from;e&&(Ze.set("int64",BigInt64Array),yt.set(BigInt64Array,"int64")),t&&(Ze.set("uint64",BigUint64Array),yt.set(BigUint64Array,"uint64")),r?(Ze.set("float16",Float16Array),yt.set(Float16Array,"float16")):Ze.set("float16",Uint16Array)}}}),bo,xo,tp=T(()=>{fi(),bo=e=>{let t=1;for(let r=0;r<e.length;r++){let i=e[r];if(typeof i!="number"||!Number.isSafeInteger(i))throw new TypeError(`dims[${r}] must be an integer, got: ${i}`);if(i<0)throw new RangeError(`dims[${r}] must be a non-negative integer, got: ${i}`);t*=i}return t},xo=(e,t)=>{switch(e.location){case"cpu":return new $e(e.type,e.data,t);case"cpu-pinned":return new $e({location:"cpu-pinned",data:e.data,type:e.type,dims:t});case"texture":return new $e({location:"texture",texture:e.texture,type:e.type,dims:t});case"gpu-buffer":return new $e({location:"gpu-buffer",gpuBuffer:e.gpuBuffer,type:e.type,dims:t});case"ml-tensor":return new $e({location:"ml-tensor",mlTensor:e.mlTensor,type:e.type,dims:t});default:throw new Error(`tensorReshape: tensor location ${e.location} is not supported`)}}}),$e,fi=T(()=>{Yd(),Jd(),ep(),tp(),$e=class{constructor(e,t,r){vo();let i,a;if(typeof e=="object"&&"location"in e)switch(this.dataLocation=e.location,i=e.type,a=e.dims,e.location){case"cpu-pinned":{let n=Ze.get(i);if(!n)throw new TypeError(`unsupported type "${i}" to create tensor from pinned buffer`);if(!(e.data instanceof n))throw new TypeError(`buffer should be of type ${n.name}`);this.cpuData=e.data;break}case"texture":{if(i!=="float32")throw new TypeError(`unsupported type "${i}" to create tensor from texture`);this.gpuTextureData=e.texture,this.downloader=e.download,this.disposer=e.dispose;break}case"gpu-buffer":{if(i!=="float32"&&i!=="float16"&&i!=="int32"&&i!=="int64"&&i!=="uint32"&&i!=="uint8"&&i!=="bool"&&i!=="uint4"&&i!=="int4")throw new TypeError(`unsupported type "${i}" to create tensor from gpu buffer`);this.gpuBufferData=e.gpuBuffer,this.downloader=e.download,this.disposer=e.dispose;break}case"ml-tensor":{if(i!=="float32"&&i!=="float16"&&i!=="int32"&&i!=="int64"&&i!=="uint32"&&i!=="uint64"&&i!=="int8"&&i!=="uint8"&&i!=="bool")throw new TypeError(`unsupported type "${i}" to create tensor from MLTensor`);this.mlTensorData=e.mlTensor,this.downloader=e.download,this.disposer=e.dispose;break}default:throw new Error(`Tensor constructor: unsupported location '${this.dataLocation}'`)}else{let n,o;if(typeof e=="string")if(i=e,o=r,e==="string"){if(!Array.isArray(t))throw new TypeError("A string tensor's data must be a string array.");n=t}else{let u=Ze.get(e);if(u===void 0)throw new TypeError(`Unsupported tensor type: ${e}.`);if(Array.isArray(t)){if(e==="float16"&&u===Uint16Array||e==="uint4"||e==="int4")throw new TypeError(`Creating a ${e} tensor from number array is not supported. Please use ${u.name} as data.`);e==="uint64"||e==="int64"?n=u.from(t,BigInt):n=u.from(t)}else if(t instanceof u)n=t;else if(t instanceof Uint8ClampedArray)if(e==="uint8")n=Uint8Array.from(t);else throw new TypeError("A Uint8ClampedArray tensor's data must be type of uint8");else throw new TypeError(`A ${i} tensor's data must be type of ${u}`)}else if(o=t,Array.isArray(e)){if(e.length===0)throw new TypeError("Tensor type cannot be inferred from an empty array.");let u=typeof e[0];if(u==="string")i="string",n=e;else if(u==="boolean")i="bool",n=Uint8Array.from(e);else throw new TypeError(`Invalid element type of data array: ${u}.`)}else if(e instanceof Uint8ClampedArray)i="uint8",n=Uint8Array.from(e);else{let u=yt.get(e.constructor);if(u===void 0)throw new TypeError(`Unsupported type for tensor data: ${e.constructor}.`);i=u,n=e}if(o===void 0)o=[n.length];else if(!Array.isArray(o))throw new TypeError("A tensor's dims must be a number array");a=o,this.cpuData=n,this.dataLocation="cpu"}let s=bo(a);if(this.cpuData&&s!==this.cpuData.length&&!((i==="uint4"||i==="int4")&&Math.ceil(s/2)===this.cpuData.length))throw new Error(`Tensor's size(${s}) does not match data length(${this.cpuData.length}).`);this.type=i,this.dims=a,this.size=s}static async fromImage(e,t){return go(e,t)}static fromTexture(e,t){return yo(e,t)}static fromGpuBuffer(e,t){return wo(e,t)}static fromMLTensor(e,t){return $o(e,t)}static fromPinnedBuffer(e,t,r){return _o(e,t,r)}toDataURL(e){return fo(this,e)}toImageData(e){return mo(this,e)}get data(){if(this.ensureValid(),!this.cpuData)throw new Error("The data is not on CPU. Use `getData()` to download GPU data to CPU, or use `texture` or `gpuBuffer` property to access the GPU data directly.");return this.cpuData}get location(){return this.dataLocation}get texture(){if(this.ensureValid(),!this.gpuTextureData)throw new Error("The data is not stored as a WebGL texture.");return this.gpuTextureData}get gpuBuffer(){if(this.ensureValid(),!this.gpuBufferData)throw new Error("The data is not stored as a WebGPU buffer.");return this.gpuBufferData}get mlTensor(){if(this.ensureValid(),!this.mlTensorData)throw new Error("The data is not stored as a WebNN MLTensor.");return this.mlTensorData}async getData(e){switch(this.ensureValid(),this.dataLocation){case"cpu":case"cpu-pinned":return this.data;case"texture":case"gpu-buffer":case"ml-tensor":{if(!this.downloader)throw new Error("The current tensor is not created with a specified data downloader.");if(this.isDownloading)throw new Error("The current tensor is being downloaded.");try{this.isDownloading=!0;let t=await this.downloader();return this.downloader=void 0,this.dataLocation="cpu",this.cpuData=t,e&&this.disposer&&(this.disposer(),this.disposer=void 0),t}finally{this.isDownloading=!1}}default:throw new Error(`cannot get data from location: ${this.dataLocation}`)}}dispose(){if(this.isDownloading)throw new Error("The current tensor is being downloaded.");this.disposer&&(this.disposer(),this.disposer=void 0),this.cpuData=void 0,this.gpuTextureData=void 0,this.gpuBufferData=void 0,this.mlTensorData=void 0,this.downloader=void 0,this.isDownloading=void 0,this.dataLocation="none"}ensureValid(){if(this.dataLocation==="none")throw new Error("The tensor is disposed.")}reshape(e){if(this.ensureValid(),this.downloader||this.disposer)throw new Error("Cannot reshape a tensor that owns GPU resource.");return xo(this,e)}}}),pe,mi=T(()=>{fi(),pe=$e}),Ft,sr,Oe,Te,ko=T(()=>{co(),Ft=(e,t)=>{(typeof ve.trace>"u"?!ve.wasm.trace:!ve.trace)||console.timeStamp(`${e}::ORT::${t}`)},sr=(e,t)=>{var a;let r=((a=new Error().stack)==null?void 0:a.split(/\r\n|\r|\n/g))||[],i=!1;for(let s=0;s<r.length;s++){if(i&&!r[s].includes("TRACE_FUNC")){let n=`FUNC_${e}::${r[s].trim().split(" ")[1]}`;t&&(n+=`::${t}`),Ft("CPU",n);return}r[s].includes("TRACE_FUNC")&&(i=!0)}},Oe=e=>{(typeof ve.trace>"u"?!ve.wasm.trace:!ve.trace)||sr("BEGIN",e)},Te=e=>{(typeof ve.trace>"u"?!ve.wasm.trace:!ve.trace)||sr("END",e)}}),So,rp=T(()=>{ci(),mi(),ko(),So=class Io{constructor(t){this.handler=t}async run(t,r,i){Oe();let a={},s={};if(typeof t!="object"||t===null||t instanceof pe||Array.isArray(t))throw new TypeError("'feeds' must be an object that use input names as keys and OnnxValue as corresponding values.");let n=!0;if(typeof r=="object"){if(r===null)throw new TypeError("Unexpected argument[1]: cannot be null.");if(r instanceof pe)throw new TypeError("'fetches' cannot be a Tensor");if(Array.isArray(r)){if(r.length===0)throw new TypeError("'fetches' cannot be an empty array.");n=!1;for(let l of r){if(typeof l!="string")throw new TypeError("'fetches' must be a string array or an object.");if(this.outputNames.indexOf(l)===-1)throw new RangeError(`'fetches' contains invalid output name: ${l}.`);a[l]=null}if(typeof i=="object"&&i!==null)s=i;else if(typeof i<"u")throw new TypeError("'options' must be an object.")}else{let l=!1,d=Object.getOwnPropertyNames(r);for(let p of this.outputNames)if(d.indexOf(p)!==-1){let h=r[p];(h===null||h instanceof pe)&&(l=!0,n=!1,a[p]=h)}if(l){if(typeof i=="object"&&i!==null)s=i;else if(typeof i<"u")throw new TypeError("'options' must be an object.")}else s=r}}else if(typeof r<"u")throw new TypeError("Unexpected argument[1]: must be 'fetches' or 'options'.");for(let l of this.inputNames)if(typeof t[l]>"u")throw new Error(`input '${l}' is missing in 'feeds'.`);if(n)for(let l of this.outputNames)a[l]=null;let o=await this.handler.run(t,a,s),u={};for(let l in o)if(Object.hasOwnProperty.call(o,l)){let d=o[l];d instanceof pe?u[l]=d:u[l]=new pe(d.type,d.data,d.dims)}return Te(),u}async release(){return this.handler.dispose()}static async create(t,r,i,a){Oe();let s,n={};if(typeof t=="string"){if(s=t,typeof r=="object"&&r!==null)n=r;else if(typeof r<"u")throw new TypeError("'options' must be an object.")}else if(t instanceof Uint8Array){if(s=t,typeof r=="object"&&r!==null)n=r;else if(typeof r<"u")throw new TypeError("'options' must be an object.")}else if(t instanceof ArrayBuffer||typeof SharedArrayBuffer<"u"&&t instanceof SharedArrayBuffer){let d=t,p=0,h=t.byteLength;if(typeof r=="object"&&r!==null)n=r;else if(typeof r=="number"){if(p=r,!Number.isSafeInteger(p))throw new RangeError("'byteOffset' must be an integer.");if(p<0||p>=d.byteLength)throw new RangeError(`'byteOffset' is out of range [0, ${d.byteLength}).`);if(h=t.byteLength-p,typeof i=="number"){if(h=i,!Number.isSafeInteger(h))throw new RangeError("'byteLength' must be an integer.");if(h<=0||p+h>d.byteLength)throw new RangeError(`'byteLength' is out of range (0, ${d.byteLength-p}].`);if(typeof a=="object"&&a!==null)n=a;else if(typeof a<"u")throw new TypeError("'options' must be an object.")}else if(typeof i<"u")throw new TypeError("'byteLength' must be a number.")}else if(typeof r<"u")throw new TypeError("'options' must be an object.");s=new Uint8Array(d,p,h)}else throw new TypeError("Unexpected argument[0]: must be 'path' or 'buffer'.");let[o,u]=await hi(n),l=await o.createInferenceSessionHandler(s,u);return Te(),new Io(l)}startProfiling(){this.handler.startProfiling()}endProfiling(){this.handler.endProfiling()}get inputNames(){return this.handler.inputNames}get outputNames(){return this.handler.outputNames}}}),kt,ip=T(()=>{rp(),kt=So}),ap=T(()=>{}),np=T(()=>{}),sp=T(()=>{}),op=T(()=>{}),Wi,zo,up=T(()=>{ci(),mi(),Wi="Training backend could not be resolved. Make sure you're using the correct configuration & WebAssembly files.",zo=class Eo{constructor(t,r,i){this.handler=t,this.hasOptimizerModel=r,this.hasEvalModel=i}get trainingInputNames(){return this.handler.inputNames}get trainingOutputNames(){return this.handler.outputNames}get evalInputNames(){if(this.hasEvalModel)return this.handler.evalInputNames;throw new Error("This training session has no evalModel loaded.")}get evalOutputNames(){if(this.hasEvalModel)return this.handler.evalOutputNames;throw new Error("This training session has no evalModel loaded.")}static async create(t,r){let i=t.evalModel||"",a=t.optimizerModel||"",s=r||{},[n,o]=await hi(s);if(n.createTrainingSessionHandler){let u=await n.createTrainingSessionHandler(t.checkpointState,t.trainModel,i,a,o);return new Eo(u,!!t.optimizerModel,!!t.evalModel)}else throw new Error(Wi)}typeNarrowingForRunStep(t,r,i,a,s){let n={},o={};if(typeof i!="object"||i===null||i instanceof pe||Array.isArray(i))throw new TypeError("'feeds' must be an object that use input names as keys and OnnxValue as corresponding values.");let u=!0;if(typeof a=="object"){if(a===null)throw new TypeError("Unexpected argument[1]: cannot be null.");if(a instanceof pe)throw new TypeError("'fetches' cannot be a Tensor");if(Array.isArray(a)){if(a.length===0)throw new TypeError("'fetches' cannot be an empty array.");u=!1;for(let l of a){if(typeof l!="string")throw new TypeError("'fetches' must be a string array or an object.");if(r.indexOf(l)===-1)throw new RangeError(`'fetches' contains invalid output name: ${l}.`);n[l]=null}if(typeof s=="object"&&s!==null)o=s;else if(typeof s<"u")throw new TypeError("'options' must be an object.")}else{let l=!1,d=Object.getOwnPropertyNames(a);for(let p of r)if(d.indexOf(p)!==-1){let h=a[p];(h===null||h instanceof pe)&&(l=!0,u=!1,n[p]=h)}if(l){if(typeof s=="object"&&s!==null)o=s;else if(typeof s<"u")throw new TypeError("'options' must be an object.")}else o=a}}else if(typeof a<"u")throw new TypeError("Unexpected argument[1]: must be 'fetches' or 'options'.");for(let l of t)if(typeof i[l]>"u")throw new Error(`input '${l}' is missing in 'feeds'.`);if(u)for(let l of r)n[l]=null;return[n,o]}convertHandlerReturnTypeToMapOfTensors(t){let r={};for(let i in t)if(Object.hasOwnProperty.call(t,i)){let a=t[i];a instanceof pe?r[i]=a:r[i]=new pe(a.type,a.data,a.dims)}return r}async lazyResetGrad(){await this.handler.lazyResetGrad()}async runTrainStep(t,r,i){let[a,s]=this.typeNarrowingForRunStep(this.trainingInputNames,this.trainingOutputNames,t,r,i),n=await this.handler.runTrainStep(t,a,s);return this.convertHandlerReturnTypeToMapOfTensors(n)}async runOptimizerStep(t){if(this.hasOptimizerModel)await this.handler.runOptimizerStep(t||{});else throw new Error("This TrainingSession has no OptimizerModel loaded.")}async runEvalStep(t,r,i){if(this.hasEvalModel){let[a,s]=this.typeNarrowingForRunStep(this.evalInputNames,this.evalOutputNames,t,r,i),n=await this.handler.runEvalStep(t,a,s);return this.convertHandlerReturnTypeToMapOfTensors(n)}else throw new Error("This TrainingSession has no EvalModel loaded.")}async getParametersSize(t=!0){return this.handler.getParametersSize(t)}async loadParametersBuffer(t,r=!0){let i=await this.getParametersSize(r);if(t.length!==4*i)throw new Error("Size of the buffer passed into loadParametersBuffer must match the number of parameters in the model. Please use getParametersSize method to check.");return this.handler.loadParametersBuffer(t,r)}async getContiguousParameters(t=!0){return this.handler.getContiguousParameters(t)}async release(){return this.handler.dispose()}}}),To,lp=T(()=>{up(),To=zo}),dp={};er(dp,{InferenceSession:()=>kt,TRACE:()=>Ft,TRACE_FUNC_BEGIN:()=>Oe,TRACE_FUNC_END:()=>Te,Tensor:()=>pe,TrainingSession:()=>To,env:()=>Y,registerBackend:()=>it});var Ce=T(()=>{Zd(),Xd(),ip(),mi(),ap(),np(),ko(),sp(),op(),lp()}),gi=T(()=>{}),Co={};er(Co,{default:()=>Ao});var or,ur,Ao,pp=T(()=>{var e;Sd(),Ye(),tr(),or="ort-wasm-proxy-worker",ur=((e=globalThis.self)==null?void 0:e.name)===or,ur&&(self.onmessage=t=>{let{type:r,in:i}=t.data;try{switch(r){case"init-wasm":yi(i.wasm).then(()=>{Oi(i).then(()=>{postMessage({type:r})},a=>{postMessage({type:r,err:a})})},a=>{postMessage({type:r,err:a})});break;case"init-ep":{let{epName:a,env:s}=i;Mi(s,a).then(()=>{postMessage({type:r})},n=>{postMessage({type:r,err:n})});break}case"copy-from":{let{buffer:a}=i,s=Yt(a);postMessage({type:r,out:s});break}case"create":{let{model:a,options:s}=i;Pi(a,s).then(n=>{postMessage({type:r,out:n})},n=>{postMessage({type:r,err:n})});break}case"release":Di(i),postMessage({type:r});break;case"run":{let{sessionId:a,inputIndices:s,inputs:n,outputIndices:o,options:u}=i;Ui(a,s,n,o,new Array(o.length).fill(null),u).then(l=>{l.some(d=>d[3]!=="cpu")?postMessage({type:r,err:"Proxy does not support non-cpu tensor location."}):postMessage({type:r,out:l},Vi([...n,...l]))},l=>{postMessage({type:r,err:l})});break}case"end-profiling":qi(i),postMessage({type:r});break;default:}}catch(a){postMessage({type:r,err:a})}}),Ao=ur?null:t=>new Worker(t??Ee,{type:"module",name:or})}),Ee,Gi,lr,Fi,Hi,dr,ji,pr,Ro,Bo,tr=T(()=>{var e,t;gi(),Ee=import.meta.url??(typeof document<"u"?(e=document.currentScript)==null?void 0:e.src:typeof self<"u"?(t=self.location)==null?void 0:t.href:void 0),Gi=typeof location>"u"?void 0:location.origin,lr=(r,i)=>{try{let a=i??Ee;return(a?new URL(r,a):new URL(r)).origin===Gi}catch{return!1}},Fi=(r,i)=>{let a=i??Ee;try{return(a?new URL(r,a):new URL(r)).href}catch{return}},Hi=(r,i)=>`${i??"./"}${r}`,dr=async r=>{let i=await(await fetch(r,{credentials:"same-origin"})).blob();return URL.createObjectURL(i)},ji=async r=>(await import(r)).default,pr=(pp(),pi(Co)).default,Ro=async()=>{if(!Ee)throw new Error("Failed to load proxy worker: cannot determine the script source URL.");if(lr(Ee))return[void 0,pr()];let r=await dr(Ee);return[r,pr(r)]},Bo=async(r,i,a)=>{{let s="ort-wasm-simd-threaded.jsep.mjs",n=r??Fi(s,i),o=a&&n&&!lr(n,i),u=o?await dr(n):n??Hi(s,i);return[o?u:void 0,await ji(u)]}}}),hr,Tt,dt,cr,Ki,Zi,yi,le,Ye=T(()=>{tr(),Tt=!1,dt=!1,cr=!1,Ki=()=>{if(typeof SharedArrayBuffer>"u")return!1;try{return typeof MessageChannel<"u"&&new MessageChannel().port1.postMessage(new SharedArrayBuffer(1)),WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,5,4,1,3,1,1,10,11,1,9,0,65,0,254,16,2,0,26,11]))}catch{return!1}},Zi=()=>{try{return WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,10,30,1,28,0,65,0,253,15,253,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,253,186,1,26,11]))}catch{return!1}},yi=async e=>{if(Tt)return Promise.resolve();if(dt)throw new Error("multiple calls to 'initializeWebAssembly()' detected.");if(cr)throw new Error("previous call to 'initializeWebAssembly()' failed.");dt=!0;let t=e.initTimeout,r=e.numThreads;if(!Zi())throw new Error("WebAssembly SIMD is not supported in the current environment.");let i=Ki();r>1&&!i&&(typeof self<"u"&&!self.crossOriginIsolated&&console.warn("env.wasm.numThreads is set to "+r+", but this will not work unless you enable crossOriginIsolated mode. See https://web.dev/cross-origin-isolation-guide/ for more info."),console.warn("WebAssembly multi-threading is not supported in the current environment. Falling back to single-threading."),e.numThreads=r=1);let a=e.wasmPaths,s=typeof a=="string"?a:void 0,n=a==null?void 0:a.mjs,o=(n==null?void 0:n.href)??n,u=a==null?void 0:a.wasm,l=(u==null?void 0:u.href)??u,d=e.wasmBinary,[p,h]=await Bo(o,s,r>1),c=!1,f=[];if(t>0&&f.push(new Promise(m=>{setTimeout(()=>{c=!0,m()},t)})),f.push(new Promise((m,w)=>{let y={numThreads:r};d?y.wasmBinary=d:(l||s)&&(y.locateFile=(g,_)=>l??(s??_)+g),h(y).then(g=>{dt=!1,Tt=!0,hr=g,m(),p&&URL.revokeObjectURL(p)},g=>{dt=!1,cr=!0,w(g)})})),await Promise.race(f),c)throw new Error(`WebAssembly backend initializing failed due to timeout: ${t}ms`)},le=()=>{if(Tt&&hr)return hr;throw new Error("WebAssembly is not initialized yet.")}}),de,Ht,ie,wi=T(()=>{Ye(),de=(e,t)=>{let r=le(),i=r.lengthBytesUTF8(e)+1,a=r._malloc(i);return r.stringToUTF8(e,a,i),t.push(a),a},Ht=(e,t,r,i)=>{if(typeof e=="object"&&e!==null){if(r.has(e))throw new Error("Circular reference in options");r.add(e)}Object.entries(e).forEach(([a,s])=>{let n=t?t+a:a;if(typeof s=="object")Ht(s,n+".",r,i);else if(typeof s=="string"||typeof s=="number")i(n,s.toString());else if(typeof s=="boolean")i(n,s?"1":"0");else throw new Error(`Can't handle extra config type: ${typeof s}`)})},ie=e=>{let t=le(),r=t.stackSave();try{let i=t.stackAlloc(8);t._OrtGetLastError(i,i+4);let a=t.HEAP32[i/4],s=t.HEAPU32[i/4+1],n=s?t.UTF8ToString(s):"";throw new Error(`${e} ERROR_CODE: ${a}, ERROR_MESSAGE: ${n}`)}finally{t.stackRestore(r)}}}),Oo,hp=T(()=>{Ye(),wi(),Oo=e=>{let t=le(),r=0,i=[],a=e||{};try{if((e==null?void 0:e.logSeverityLevel)===void 0)a.logSeverityLevel=2;else if(typeof e.logSeverityLevel!="number"||!Number.isInteger(e.logSeverityLevel)||e.logSeverityLevel<0||e.logSeverityLevel>4)throw new Error(`log serverity level is not valid: ${e.logSeverityLevel}`);if((e==null?void 0:e.logVerbosityLevel)===void 0)a.logVerbosityLevel=0;else if(typeof e.logVerbosityLevel!="number"||!Number.isInteger(e.logVerbosityLevel))throw new Error(`log verbosity level is not valid: ${e.logVerbosityLevel}`);(e==null?void 0:e.terminate)===void 0&&(a.terminate=!1);let s=0;return(e==null?void 0:e.tag)!==void 0&&(s=de(e.tag,i)),r=t._OrtCreateRunOptions(a.logSeverityLevel,a.logVerbosityLevel,!!a.terminate,s),r===0&&ie("Can't create run options."),(e==null?void 0:e.extra)!==void 0&&Ht(e.extra,"",new WeakSet,(n,o)=>{let u=de(n,i),l=de(o,i);t._OrtAddRunConfigEntry(r,u,l)!==0&&ie(`Can't set a run config entry: ${n} - ${o}.`)}),[r,i]}catch(s){throw r!==0&&t._OrtReleaseRunOptions(r),i.forEach(n=>t._free(n)),s}}}),Qi,Xi,Yi,Ji,Mo,cp=T(()=>{Ye(),wi(),Qi=e=>{switch(e){case"disabled":return 0;case"basic":return 1;case"extended":return 2;case"all":return 99;default:throw new Error(`unsupported graph optimization level: ${e}`)}},Xi=e=>{switch(e){case"sequential":return 0;case"parallel":return 1;default:throw new Error(`unsupported execution mode: ${e}`)}},Yi=e=>{e.extra||(e.extra={}),e.extra.session||(e.extra.session={});let t=e.extra.session;t.use_ort_model_bytes_directly||(t.use_ort_model_bytes_directly="1"),e.executionProviders&&e.executionProviders.some(r=>(typeof r=="string"?r:r.name)==="webgpu")&&(e.enableMemPattern=!1)},Ji=(e,t,r)=>{for(let i of t){let a=typeof i=="string"?i:i.name;switch(a){case"webnn":if(a="WEBNN",typeof i!="string"){let n=i==null?void 0:i.deviceType;if(n){let o=de("deviceType",r),u=de(n,r);le()._OrtAddSessionConfigEntry(e,o,u)!==0&&ie(`Can't set a session config entry: 'deviceType' - ${n}.`)}}break;case"webgpu":if(a="JS",typeof i!="string"){let n=i;if(n!=null&&n.preferredLayout){if(n.preferredLayout!=="NCHW"&&n.preferredLayout!=="NHWC")throw new Error(`preferredLayout must be either 'NCHW' or 'NHWC': ${n.preferredLayout}`);let o=de("preferredLayout",r),u=de(n.preferredLayout,r);le()._OrtAddSessionConfigEntry(e,o,u)!==0&&ie(`Can't set a session config entry: 'preferredLayout' - ${n.preferredLayout}.`)}}break;case"wasm":case"cpu":continue;default:throw new Error(`not supported execution provider: ${a}`)}let s=de(a,r);le()._OrtAppendExecutionProvider(e,s)!==0&&ie(`Can't append execution provider: ${a}.`)}},Mo=e=>{let t=le(),r=0,i=[],a=e||{};Yi(a);try{let s=Qi(a.graphOptimizationLevel??"all"),n=Xi(a.executionMode??"sequential"),o=typeof a.logId=="string"?de(a.logId,i):0,u=a.logSeverityLevel??2;if(!Number.isInteger(u)||u<0||u>4)throw new Error(`log serverity level is not valid: ${u}`);let l=a.logVerbosityLevel??0;if(!Number.isInteger(l)||l<0||l>4)throw new Error(`log verbosity level is not valid: ${l}`);let d=typeof a.optimizedModelFilePath=="string"?de(a.optimizedModelFilePath,i):0;if(r=t._OrtCreateSessionOptions(s,!!a.enableCpuMemArena,!!a.enableMemPattern,n,!!a.enableProfiling,0,o,u,l,d),r===0&&ie("Can't create session options."),a.executionProviders&&Ji(r,a.executionProviders,i),a.enableGraphCapture!==void 0){if(typeof a.enableGraphCapture!="boolean")throw new Error(`enableGraphCapture must be a boolean value: ${a.enableGraphCapture}`);let p=de("enableGraphCapture",i),h=de(a.enableGraphCapture.toString(),i);t._OrtAddSessionConfigEntry(r,p,h)!==0&&ie(`Can't set a session config entry: 'enableGraphCapture' - ${a.enableGraphCapture}.`)}if(a.freeDimensionOverrides)for(let[p,h]of Object.entries(a.freeDimensionOverrides)){if(typeof p!="string")throw new Error(`free dimension override name must be a string: ${p}`);if(typeof h!="number"||!Number.isInteger(h)||h<0)throw new Error(`free dimension override value must be a non-negative integer: ${h}`);let c=de(p,i);t._OrtAddFreeDimensionOverride(r,c,h)!==0&&ie(`Can't set a free dimension override: ${p} - ${h}.`)}return a.extra!==void 0&&Ht(a.extra,"",new WeakSet,(p,h)=>{let c=de(p,i),f=de(h,i);t._OrtAddSessionConfigEntry(r,c,f)!==0&&ie(`Can't set a session config entry: ${p} - ${h}.`)}),[r,i]}catch(s){throw r!==0&&t._OrtReleaseSessionOptions(r),i.forEach(n=>t._free(n)),s}}}),wt,Qe,at,$i,jt,_i,vi,Qr,V=T(()=>{wt=e=>{switch(e){case"int8":return 3;case"uint8":return 2;case"bool":return 9;case"int16":return 5;case"uint16":return 4;case"int32":return 6;case"uint32":return 12;case"float16":return 10;case"float32":return 1;case"float64":return 11;case"string":return 8;case"int64":return 7;case"uint64":return 13;case"int4":return 22;case"uint4":return 21;default:throw new Error(`unsupported data type: ${e}`)}},Qe=e=>{switch(e){case 3:return"int8";case 2:return"uint8";case 9:return"bool";case 5:return"int16";case 4:return"uint16";case 6:return"int32";case 12:return"uint32";case 10:return"float16";case 1:return"float32";case 11:return"float64";case 8:return"string";case 7:return"int64";case 13:return"uint64";case 22:return"int4";case 21:return"uint4";default:throw new Error(`unsupported data type: ${e}`)}},at=(e,t)=>{let r=[-1,4,1,1,2,2,4,8,-1,1,2,8,4,8,-1,-1,-1,-1,-1,-1,-1,.5,.5][e],i=typeof t=="number"?t:t.reduce((a,s)=>a*s,1);return r>0?Math.ceil(i*r):void 0},$i=e=>{switch(e){case"float16":return typeof Float16Array<"u"&&Float16Array.from?Float16Array:Uint16Array;case"float32":return Float32Array;case"uint8":return Uint8Array;case"int8":return Int8Array;case"uint16":return Uint16Array;case"int16":return Int16Array;case"int32":return Int32Array;case"bool":return Uint8Array;case"float64":return Float64Array;case"uint32":return Uint32Array;case"int64":return BigInt64Array;case"uint64":return BigUint64Array;default:throw new Error(`unsupported type: ${e}`)}},jt=e=>{switch(e){case"verbose":return 0;case"info":return 1;case"warning":return 2;case"error":return 3;case"fatal":return 4;default:throw new Error(`unsupported logging level: ${e}`)}},_i=e=>e==="float32"||e==="float16"||e==="int32"||e==="int64"||e==="uint32"||e==="uint8"||e==="bool"||e==="uint4"||e==="int4",vi=e=>e==="float32"||e==="float16"||e==="int32"||e==="int64"||e==="uint32"||e==="uint64"||e==="int8"||e==="uint8"||e==="bool",Qr=e=>{switch(e){case"none":return 0;case"cpu":return 1;case"cpu-pinned":return 2;case"texture":return 3;case"gpu-buffer":return 4;case"ml-tensor":return 5;default:throw new Error(`unsupported data location: ${e}`)}}}),bi,Po=T(()=>{gi(),bi=async e=>{if(typeof e=="string"){let t=await fetch(e);if(!t.ok)throw new Error(`failed to load external data file: ${e}`);let r=t.headers.get("Content-Length"),i=r?parseInt(r,10):0;if(i<1073741824)return new Uint8Array(await t.arrayBuffer());{if(!t.body)throw new Error(`failed to load external data file: ${e}, no response body.`);let a=t.body.getReader(),s;try{s=new ArrayBuffer(i)}catch(o){if(o instanceof RangeError){let u=Math.ceil(i/65536);s=new WebAssembly.Memory({initial:u,maximum:u}).buffer}else throw o}let n=0;for(;;){let{done:o,value:u}=await a.read();if(o)break;let l=u.byteLength;new Uint8Array(s,n,l).set(u),n+=l}return new Uint8Array(s,0,i)}}else return e instanceof Blob?new Uint8Array(await e.arrayBuffer()):e instanceof Uint8Array?e:new Uint8Array(e)}}),ea,ta,ra,ia,xi,aa,J,Me=T(()=>{V(),ea=["V","I","W","E","F"],ta=(e,t)=>{console.log(`[${ea[e]},${new Date().toISOString()}]${t}`)},xi=(e,t)=>{ra=e,ia=t},aa=(e,t)=>{let r=jt(e),i=jt(ra);r>=i&&ta(r,typeof t=="function"?t():t)},J=(...e)=>{ia&&aa(...e)}}),ki,Do=T(()=>{V(),ki=(e,t)=>new($i(t))(e)}),Si=T(()=>{}),fr,Ct,At,na,sa,mr,Xr,oa,Uo,fp=T(()=>{Me(),Si(),fr=new Map([[64,250],[128,200],[256,200],[512,200],[2048,230],[4096,200],[8192,50],[16384,50],[32768,50],[65536,50],[131072,50],[262144,50],[524288,50],[1048576,50],[2097152,30],[4194304,20],[8388608,10],[12582912,10],[16777216,10],[26214400,15],[33554432,22],[44236800,2],[58982400,6],[67108864,6],[134217728,6],[167772160,6]]),Ct=[],At=e=>Math.ceil(e/16)*16,na=e=>{for(let t=0;t<Ct.length;t++){let r=Ct[t];if(e<=r)return r}return Math.ceil(e/16)*16},sa=1,mr=()=>sa++,Xr=async(e,t,r,i)=>{let a=At(r),s=e.device.createBuffer({size:a,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});try{let n=e.getCommandEncoder();e.endComputePass(),n.copyBufferToBuffer(t,0,s,0,a),e.flush(),await s.mapAsync(GPUMapMode.READ);let o=s.getMappedRange();if(i){let u=i();return u.set(new Uint8Array(o,0,r)),u}else return new Uint8Array(o.slice(0,r))}finally{s.destroy()}},oa=class{constructor(e){this.backend=e,this.storageCache=new Map,this.freeBuffers=new Map,this.freeUniformBuffers=new Map,this.buffersForUploadingPending=[],this.buffersPending=[],this.capturedPendingBuffers=new Map;for(let[t]of fr)Ct.push(t),this.freeBuffers.set(t,[]),this.freeUniformBuffers.set(t,[])}upload(e,t){let r=t.buffer,i=t.byteOffset,a=t.byteLength,s=At(a),n=this.storageCache.get(e);if(!n)throw new Error("gpu data for uploading does not exist");if(n.originalSize!==a)throw new Error(`inconsistent data size. gpu data size=${n.originalSize}, data size=${a}`);let o=this.backend.device.createBuffer({mappedAtCreation:!0,size:s,usage:GPUBufferUsage.MAP_WRITE|GPUBufferUsage.COPY_SRC}),u=o.getMappedRange();new Uint8Array(u).set(new Uint8Array(r,i,a)),o.unmap();let l=this.backend.getCommandEncoder();this.backend.endComputePass(),l.copyBufferToBuffer(o,0,n.gpuData.buffer,0,s),J("verbose",()=>`[WebGPU] GpuDataManager.upload(id=${e})`),this.buffersForUploadingPending.push(o)}memcpy(e,t){let r=this.storageCache.get(e);if(!r)throw new Error("source gpu data for memcpy does not exist");let i=this.storageCache.get(t);if(!i)throw new Error("destination gpu data for memcpy does not exist");if(r.originalSize!==i.originalSize)throw new Error("inconsistent source and destination gpu data size");let a=At(r.originalSize),s=this.backend.getCommandEncoder();this.backend.endComputePass(),s.copyBufferToBuffer(r.gpuData.buffer,0,i.gpuData.buffer,0,a)}registerExternalBuffer(e,t,r){let i;if(r){if(i=r[0],e===r[1])return J("verbose",()=>`[WebGPU] GpuDataManager.registerExternalBuffer(size=${t}) => id=${i}, buffer is the same, skip.`),i;if(this.backend.capturedCommandList.has(this.backend.currentSessionId))throw new Error(`Registering a different external buffer under graph capture mode is not supported yet.
             Please use the previous external buffer!`)}else i=mr();return this.storageCache.set(i,{gpuData:{id:i,type:0,buffer:e},originalSize:t}),J("verbose",()=>`[WebGPU] GpuDataManager.registerExternalBuffer(size=${t}) => id=${i}, registered.`),i}unregisterExternalBuffer(e){e!==void 0&&(this.storageCache.delete(e),J("verbose",()=>`[WebGPU] GpuDataManager.unregisterExternalBuffer() => id=${e}`))}create(e,t=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST){let r=na(e),i,a=(t&GPUBufferUsage.STORAGE)===GPUBufferUsage.STORAGE,s=(t&GPUBufferUsage.UNIFORM)===GPUBufferUsage.UNIFORM;if(a||s){let o=(a?this.freeBuffers:this.freeUniformBuffers).get(r);o?o.length>0?i=o.pop():i=this.backend.device.createBuffer({size:r,usage:t}):i=this.backend.device.createBuffer({size:r,usage:t})}else i=this.backend.device.createBuffer({size:r,usage:t});let n={id:mr(),type:0,buffer:i};return this.storageCache.set(n.id,{gpuData:n,originalSize:e}),J("verbose",()=>`[WebGPU] GpuDataManager.create(size=${e}) => id=${n.id}`),n}get(e){var t;return(t=this.storageCache.get(e))==null?void 0:t.gpuData}release(e){let t=this.storageCache.get(e);if(!t)throw new Error("releasing data does not exist");return J("verbose",()=>`[WebGPU] GpuDataManager.release(id=${e}), gpuDataId=${t.gpuData.id}`),this.storageCache.delete(e),this.buffersPending.push(t.gpuData.buffer),t.originalSize}async download(e,t){let r=this.storageCache.get(e);if(!r)throw new Error("data does not exist");await Xr(this.backend,r.gpuData.buffer,r.originalSize,t)}refreshPendingBuffers(){for(let e of this.buffersForUploadingPending)e.destroy();if(this.buffersForUploadingPending=[],this.buffersPending.length!==0)if(this.backend.sessionStatus==="default"){for(let e of this.buffersPending){let t=fr.get(e.size);if((e.usage&GPUBufferUsage.STORAGE)===GPUBufferUsage.STORAGE){let r=this.freeBuffers.get(e.size)||[];t===void 0||r.length>=t?e.destroy():r.push(e)}else if((e.usage&GPUBufferUsage.UNIFORM)===GPUBufferUsage.UNIFORM){let r=this.freeUniformBuffers.get(e.size)||[];t===void 0||r.length>=t?e.destroy():r.push(e)}else e.destroy()}this.buffersPending=[]}else{let e=this.capturedPendingBuffers.get(this.backend.currentSessionId);e||(e=[],this.capturedPendingBuffers.set(this.backend.currentSessionId,e));for(let t of this.buffersPending)e.push(t);this.buffersPending=[]}}dispose(){this.freeBuffers.forEach(e=>{e.forEach(t=>{t.destroy()})}),this.freeUniformBuffers.forEach(e=>{e.forEach(t=>{t.destroy()})}),this.storageCache.forEach(e=>{e.gpuData.buffer.destroy()}),this.capturedPendingBuffers.forEach(e=>{e.forEach(t=>{t.destroy()})}),this.storageCache=new Map,this.freeBuffers=new Map,this.freeUniformBuffers=new Map,this.capturedPendingBuffers=new Map}onReleaseSession(e){let t=this.capturedPendingBuffers.get(e);t&&(t.forEach(r=>{r.destroy()}),this.capturedPendingBuffers.delete(e))}},Uo=(...e)=>new oa(...e)}),ua,te,se=T(()=>{ua=class{constructor(e){Object.assign(this,e)}get cacheKey(){return this.key||(this.key=Object.getOwnPropertyNames(this).sort().map(e=>`${this[e]}`).join(";")),this.key}},te=e=>new ua(e)}),la,ot,S,Kt,qo,Vo,No,W=T(()=>{la=class{static calcMatMulShape(e,t){return e[1]!==t[0]?void 0:[e[0],t[1]]}},ot=class{static calcShape(e,t,r=!1){let i=e.length,a=t.length;if(i===0)return t;if(a===0)return e;let s=Math.max(e.length,t.length),n=new Array(s);if(r){if(i<2||a<2)return;let o=la.calcMatMulShape([e[i-2],e[i-1]],[t[a-2],t[a-1]]);if(o===void 0)return;[n[s-2],n[s-1]]=o}for(let o=r?3:1;o<=s;o++){let u=i-o<0?1:e[i-o],l=a-o<0?1:t[a-o];if(u!==l&&u>1&&l>1)return;let d=Math.max(u,l);if(u&&l)n[s-o]=Math.max(u,l);else{if(d>1)return;n[s-o]=0}}return n}static isValidBroadcast(e,t){let r=e.length,i=t.length;if(r>i)return!1;for(let a=1;a<=r;a++)if(e[r-a]!==1&&e[r-a]!==t[i-a])return!1;return!0}},S=class Wt{static size(t){return Wt.getSizeFromDimensionRange(t,0,t.length)}static convertShape(t,r=4){let i=t.length;if(i===0)return[];let a=new Array(i),s=i-1;for(;s>=0;){if(t[s]%r===0){a[s]=t[s]/r;break}if(r%t[s]!==0)throw new Error("cannot convert shape");a[s]=1,r/=t[s],s--}for(s--;s>=0;s--)a[s]=t[s];return a}static sizeFromDimension(t,r){if(r<0||r>t.length)throw new Error(`invalid dimension of ${r} for sizeFromDimension as Tensor has ${t.length} dimensions.`);return Wt.getSizeFromDimensionRange(t,r,t.length)}static sizeToDimension(t,r){if(r<0||r>t.length)throw new Error(`invalid dimension of ${r} for sizeToDimension as Tensor has ${t.length} dimensions.`);return Wt.getSizeFromDimensionRange(t,0,r)}static getSizeFromDimensionRange(t,r,i){let a=1;for(let s=r;s<i;s++){if(t[s]<0)throw new Error("cannot get valid size from specified dimension range. Most likely the range contains negative values in them.");a*=t[s]}return a}static computeStrides(t){let r=t.length;if(r===0)return[];if(r===1)return[1];let i=new Array(r);i[r-1]=1,i[r-2]=t[r-1];for(let a=r-3;a>=0;--a)i[a]=i[a+1]*t[a+1];return i}static normalizeAxis(t,r){if(t<-r&&t>=r)throw new Error("unsupported axis for this operation.");return t<0?t+r:t}static normalizeAxes(t,r){return t.map(i=>this.normalizeAxis(i,r??t.length))}static sortBasedOnPerm(t,r){return r?r.map(i=>t[i]):t.slice().reverse()}static padShape(t,r){let i=t.length;return t.map((a,s)=>a+r[s]+r[s+i])}static areEqual(t,r){return t.length!==r.length?!1:t.every((i,a)=>i===r[a])}},Kt=class $t{static adjustPoolAttributes(t,r,i,a,s,n){if(!t&&i.length!==r.length-2)throw new Error("length of specified kernel shapes should be 2 less than length of input dimensions");if(t)for(let o=0;o<r.length-2;o++)o>=i.length?i.push(r[o+2]):i[o]=r[o+2];for(let o=0;o<i.length;o++)if(o<a.length){if(a[o]<0)throw new Error("strides should be greater than or equal to 1")}else a.push(1);for(let o=0;o<i.length;o++)if(o<s.length){if(s[o]<0)throw new Error("dilations should be greater than or equal to 1")}else s.push(1);for(let o=0;o<i.length*2;o++)if(o<n.length){if(n[o]<0)throw new Error("pad should be greater than or equal to 1")}else n.push(0);for(let o=0;o<i.length;o++){if(i[o]<=0)throw new Error("kernel shapes need to be greater than 0");if(n[o]>=i[o]||n[o+i.length]>=i[o])throw new Error("pads should be smaller than kernel")}}static adjustPadsBasedOnAutoPad(t,r,i,a,s,n,o){if(o){if(s.length!==2*(t.length-2))throw new Error("length of pads should be twice the length of data dimensions");if(r.length!==t.length-2)throw new Error("length of strides should be the length of data dimensions");if(a.length!==t.length-2)throw new Error("length of kernel shapes should be the length of data dimensions");for(let u=0;u<t.length-2;u++)$t.adjustPadAndReturnShape(t[u+(n?1:2)],r[u],i[u],a[u],s,u,u+t.length-2,o)}}static computePoolOutputShape(t,r,i,a,s,n,o){if(r.length<=0)throw new Error("input shape must be of size greater than 0");let u=[r[0],r[1]];return $t.computeShapeHelper(t,r,u,i,a,s,n,o),u}static computeConvOutputShape(t,r,i,a,s,n,o){if(t.length<=0||r.length<=0)throw new Error("invalid input tensor dims or invalid filter tensor dims");let u=[t[0],r[0]];return $t.computeShapeHelper(!1,t,u,i,a,s,n,o),u}static computeShapeHelper(t,r,i,a,s,n,o,u){if(t)for(let l=0;l<r.length-2;l++)i.push(1);else for(let l=0;l<r.length-2;l++)i.push($t.adjustPadAndReturnShape(r[l+2],a[l],s[l],n[l],o,l,l+r.length-2,u))}static adjustPadAndReturnShape(t,r,i,a,s,n,o,u){let l=i*(a-1)+1;if(u&&u!=="NOTSET")switch(u){case"VALID":return s[n]=0,s[o]=0,Math.floor((t-l)/r+1);case"SAME_LOWER":case"SAME_UPPER":if(i!==1)throw new Error("Dilation not supported for SAME_UPPER or SAME_LOWER");{let d=((t+r-1)/r-1)*r+a-t;return s[n]=Math.floor(u==="SAME_LOWER"?(d+1)/2:d/2),s[o]=d-s[n],Math.floor((t+d-a)/r+1)}default:throw new Error("Unsupported AutoPad type")}else return Math.floor((t+s[n]+s[o]-l)/r+1)}},qo=class{static getShapeOfGemmResult(e,t,r,i,a){if(e.length!==2||r.length!==2)throw new Error("shape need to be of size 2");let s,n,o;t?(s=e[1],n=e[0]):(s=e[0],n=e[1]);let u=-1;if(i?(o=r[0],u=1):(o=r[1],u=0),r[u]!==n)throw new Error("dimension mismatch");if(s<=0||o<=0||n<=0)throw new Error("invalid shape specified");if(a&&!ot.isValidBroadcast(a,[s,o]))throw new Error("gemm: invalid bias shape for broadcast");return[s,o,n]}},Vo=-34028234663852886e22,No=34028234663852886e22}),ut,Rt,ue,ce,B,ae,Yr,nt,Ne,O,Bt,I,M,Ii,da,Lo,St,G=T(()=>{V(),W(),ut=64,Rt=(e,t)=>{if(t===3)throw new Error("vec3 has same alignment as vec4, use vec4 instead");switch(e){case 10:return t>1?`vec${t}<f16>`:"f16";case 1:return t>1?`vec${t}<f32>`:"f32";case 6:return t>1?`vec${t}<i32>`:"i32";case 12:return t>1?`vec${t}<u32>`:"u32";case 7:if(t>1)throw new Error("currently not supported vecX of uint64 yet");return["vec2<u32>","i32"];case 13:if(t>1)throw new Error("currently not supported vecX of uint64 yet");return["vec2<u32>","u32"];case 9:if(t!==4)throw new Error("bool must be vec4");return["u32","vec4<bool>"];case 22:return"i32";case 21:return"u32";default:throw new Error(`Unknown data type: ${e}`)}},ue=(e,t=1)=>{let r=Rt(e,t);return typeof r=="string"?r:r[0]},ce=(e,t=1)=>{let r=Rt(e,t);return typeof r=="string"?r:r[1]},B=(...e)=>{let t=[];return e.forEach(r=>{r.length!==0&&t.push({type:12,data:r},{type:12,data:S.computeStrides(r)})}),t},ae=e=>e%4===0?4:e%2===0?2:1,Yr=(e="f32",t,r="0")=>!t||t===1?`${e}(${r})`:`vec${t}<${e}>(${r})`,nt=(e,t,r)=>e==="f32"?r:t===1?`f32(${r})`:`vec${t}<f32>(${r})`,Ne=(e,t)=>t===4?`(${e}.x + ${e}.y + ${e}.z + ${e}.w)`:t===2?`(${e}.x + ${e}.y)`:t===3?`(${e}.x + ${e}.y + ${e}.z)`:e,O=(e,t,r,i)=>e.startsWith("uniforms.")&&r>4?typeof t=="string"?i==="f16"?`${e}[(${t}) / 8][(${t}) % 8 / 4][(${t}) % 8 % 4]`:`${e}[(${t}) / 4][(${t}) % 4]`:i==="f16"?`${e}[${Math.floor(t/8)}][${Math.floor(t%8/4)}][${t%8%4}]`:`${e}[${Math.floor(t/4)}][${t%4}]`:r>1?`${e}[${t}]`:e,Bt=(e,t,r,i,a)=>{let s=typeof r=="number",n=s?r:r.length,o=[...new Array(n).keys()],u=n<2?"u32":n<=4?`vec${n}<u32>`:`array<u32, ${n}>`,l=Rt(t,a),d=typeof l=="string"?l:l[1],p=typeof l=="string"?l:l[0],h={indices:u,value:d,storage:p,tensor:t},c=x=>typeof x=="string"?x:`${x}u`,f={offsetToIndices:!1,indicesToOffset:!1,broadcastedIndicesToOffset:!1,set:!1,setByIndices:!1,get:!1,getByIndices:!1},m=s?"uniforms.":"",w=`${m}${e}_shape`,y=`${m}${e}_strides`,g="";for(let x=0;x<n-1;x++)g+=`
    let dim${x} = current / ${O(y,x,n)};
    let rest${x} = current % ${O(y,x,n)};
    indices[${x}] = dim${x};
    current = rest${x};
    `;g+=`indices[${n-1}] = current;`;let _=n<2?"":`
  fn o2i_${e}(offset: u32) -> ${h.indices} {
    var indices: ${h.indices};
    var current = offset;
    ${g}
    return indices;
  }`,$=x=>(f.offsetToIndices=!0,n<2?x:`o2i_${e}(${x})`),v=[];if(n>=2)for(let x=n-1;x>=0;x--)v.push(`${O(y,x,n)} * (indices[${x}])`);let k=n<2?"":`
  fn i2o_${e}(indices: ${h.indices}) -> u32 {
    return ${v.join("+")};
  }`,b=x=>(f.indicesToOffset=!0,n<2?x:`i2o_${e}(${x})`),E=(...x)=>n===0?"0u":`${h.indices}(${x.map(c).join(",")})`,C=(x,z)=>n<2?`${x}`:`${O(x,z,n)}`,A=(x,z,D)=>n<2?`${x}=${D};`:`${O(x,z,n)}=${D};`,q={},P=(x,z)=>{f.broadcastedIndicesToOffset=!0;let D=`${z.name}broadcastedIndicesTo${e}Offset`;if(D in q)return`${D}(${x})`;let j=[];for(let X=n-1;X>=0;X--){let oe=z.indicesGet("outputIndices",X+z.rank-n);j.push(`${C(y,X)} * (${oe} % ${C(w,X)})`)}return q[D]=`fn ${D}(outputIndices: ${z.type.indices}) -> u32 {
             return ${j.length>0?j.join("+"):"0u"};
           }`,`${D}(${x})`},L=(x,z)=>(()=>{if(h.storage===h.value)return`${e}[${x}]=${z};`;if(h.storage==="vec2<u32>"&&h.value==="i32")return`${e}[${x}]=vec2<u32>(u32(${z}), select(0u, 0xFFFFFFFFu, ${z} < 0));`;if(h.storage==="vec2<u32>"&&h.value==="u32")return`${e}[${x}]=vec2<u32>(u32(${z}), 0u);`;if(h.storage==="u32"&&h.value==="vec4<bool>")return`${e}[${x}]=dot(vec4<u32>(0x1, 0x100, 0x10000, 0x1000000), vec4<u32>(${z}));`;throw new Error(`not supported combination of storage type ${h.storage} and value type ${h.value} yet`)})(),F=x=>(()=>{if(h.storage===h.value)return`${e}[${x}]`;if(h.storage==="vec2<u32>"&&h.value==="i32")return`i32(${e}[${x}].x)`;if(h.storage==="vec2<u32>"&&h.value==="u32")return`u32(${e}[${x}].x)`;if(h.storage==="u32"&&h.value==="vec4<bool>")return`vec4<bool>(bool(${e}[${x}] & 0xFFu), bool(${e}[${x}] & 0xFF00u), bool(${e}[${x}] & 0xFF0000u), bool(${e}[${x}] & 0xFF000000u))`;throw new Error(`not supported combination of storage type ${h.storage} and value type ${h.value} yet`)})(),Q=n<2?"":`
  fn get_${e}ByIndices(indices: ${h.indices}) -> ${d} {
    return ${F(`i2o_${e}(indices)`)};
  }`,Z=n<2?"":(()=>{let x=o.map(D=>`d${D}: u32`).join(", "),z=o.map(D=>`d${D}`).join(", ");return`
  fn get_${e}(${x}) -> ${d} {
    return get_${e}ByIndices(${E(z)});
  }`})(),N=(...x)=>{if(x.length!==n)throw new Error(`indices length must be ${n}`);let z=x.map(c).join(",");return n===0?F("0u"):n===1?F(z[0]):(f.get=!0,f.getByIndices=!0,f.indicesToOffset=!0,`get_${e}(${z})`)},R=x=>n<2?F(x):(f.getByIndices=!0,f.indicesToOffset=!0,`get_${e}ByIndices(${x})`),U=n<2?"":`
  fn set_${e}ByIndices(indices: ${h.indices}, value: ${d}) {
    ${L(`i2o_${e}(indices)`,"value")}
  }`,H=n<2?"":(()=>{let x=o.map(D=>`d${D}: u32`).join(", "),z=o.map(D=>`d${D}`).join(", ");return`
  fn set_${e}(${x}, value: ${d}) {
    set_${e}ByIndices(${E(z)}, value);
  }`})();return{impl:()=>{let x=[],z=!1;return f.offsetToIndices&&(x.push(_),z=!0),f.indicesToOffset&&(x.push(k),z=!0),f.broadcastedIndicesToOffset&&(Object.values(q).forEach(D=>x.push(D)),z=!0),f.set&&(x.push(H),z=!0),f.setByIndices&&(x.push(U),z=!0),f.get&&(x.push(Z),z=!0),f.getByIndices&&(x.push(Q),z=!0),!s&&z&&x.unshift(`const ${w} = ${h.indices}(${r.join(",")});`,`const ${y} = ${h.indices}(${S.computeStrides(r).join(",")});`),x.join(`
`)},type:h,offsetToIndices:$,indicesToOffset:b,broadcastedIndicesToOffset:P,indices:E,indicesGet:C,indicesSet:A,set:(...x)=>{if(x.length!==n+1)throw new Error(`indices length must be ${n}`);let z=x[n];if(typeof z!="string")throw new Error("value must be string");let D=x.slice(0,n).map(c).join(",");return n===0?L("0u",z):n===1?L(D[0],z):(f.set=!0,f.setByIndices=!0,f.indicesToOffset=!0,`set_${e}(${D}, ${z})`)},setByOffset:L,setByIndices:(x,z)=>n<2?L(x,z):(f.setByIndices=!0,f.indicesToOffset=!0,`set_${e}ByIndices(${x}, ${z});`),get:N,getByOffset:F,getByIndices:R,usage:i,name:e,strides:y,shape:w,rank:n}},I=(e,t,r,i=1)=>Bt(e,t,r,"input",i),M=(e,t,r,i=1)=>Bt(e,t,r,"output",i),Ii=(e,t,r,i=1)=>Bt(e,t,r,"internal",i),da=class{constructor(e,t){this.normalizedDispatchGroup=e,this.limits=t,this.internalVariables=[],this.variables=[],this.uniforms=[],this.variableIndex=0}guardAgainstOutOfBoundsWorkgroupSizes(e){return`if (global_idx >= ${typeof e=="number"?`${e}u`:e}) { return; }`}mainStart(e=ut){let t=typeof e=="number"?e:e[0],r=typeof e=="number"?1:e[1],i=typeof e=="number"?1:e[2];if(t>this.limits.maxComputeWorkgroupSizeX||r>this.limits.maxComputeWorkgroupSizeY||i>this.limits.maxComputeWorkgroupSizeZ)throw new Error(`workgroup size [${t}, ${r}, ${i}] exceeds the maximum workgroup size [${this.limits.maxComputeWorkgroupSizeX}, ${this.limits.maxComputeWorkgroupSizeY}, ${this.limits.maxComputeWorkgroupSizeZ}].`);if(t*r*i>this.limits.maxComputeInvocationsPerWorkgroup)throw new Error(`workgroup size [${t}, ${r}, ${i}] exceeds the maximum workgroup invocations ${this.limits.maxComputeInvocationsPerWorkgroup}.`);let a=this.normalizedDispatchGroup[1]===1&&this.normalizedDispatchGroup[2]===1,s=a?`@builtin(global_invocation_id) global_id : vec3<u32>,
    @builtin(workgroup_id) workgroup_id : vec3<u32>,
    @builtin(local_invocation_index) local_idx : u32,
    @builtin(local_invocation_id) local_id : vec3<u32>`:`@builtin(global_invocation_id) global_id : vec3<u32>,
                                             @builtin(local_invocation_id) local_id : vec3<u32>,
    @builtin(local_invocation_index) local_idx : u32,
    @builtin(workgroup_id) workgroup_id : vec3<u32>,
    @builtin(num_workgroups) num_workgroups : vec3<u32>`,n=a?`let global_idx = global_id.x;
         let workgroup_index = workgroup_id.x;`:`let workgroup_index = workgroup_id.z * num_workgroups[0] * num_workgroups[1] +
             workgroup_id.y * num_workgroups[0] + workgroup_id.x;
         let global_idx = workgroup_index * ${t*r*i}u + local_idx;`;return`@compute @workgroup_size(${t}, ${r}, ${i})
  fn main(${s}) {
    ${n}
  `}appendVariableUniforms(e){e.rank!==0&&(e.shape.startsWith("uniforms.")&&this.uniforms.push({name:e.shape.replace("uniforms.",""),type:"u32",length:e.rank}),e.strides.startsWith("uniforms.")&&this.uniforms.push({name:e.strides.replace("uniforms.",""),type:"u32",length:e.rank}))}declareVariable(e,t){if(e.usage==="internal")throw new Error("cannot use internal variable with declareVariable(). use registerInternalVariables() instead.");this.variables.push(e),this.appendVariableUniforms(e);let r=e.usage==="input"?"read":"read_write",i=e.type.storage;return`@group(0) @binding(${t}) var<storage, ${r}> ${e.name}: array<${i}>;`}declareVariables(...e){return e.map(t=>this.declareVariable(t,this.variableIndex++)).join(`
`)}registerInternalVariable(e){if(e.usage!=="internal")throw new Error("cannot use input or output variable with registerInternalVariable(). use declareVariables() instead.");this.internalVariables.push(e),this.appendVariableUniforms(e)}registerInternalVariables(...e){return e.forEach(t=>this.registerInternalVariable(t)),this}registerUniform(e,t,r=1){return this.uniforms.push({name:e,type:t,length:r}),this}registerUniforms(e){return this.uniforms=this.uniforms.concat(e),this}uniformDeclaration(){if(this.uniforms.length===0)return"";let e=[];for(let{name:t,type:r,length:i}of this.uniforms)if(i&&i>4)r==="f16"?e.push(`@align(16) ${t}:array<mat2x4<${r}>, ${Math.ceil(i/8)}>`):e.push(`${t}:array<vec4<${r}>, ${Math.ceil(i/4)}>`);else{let a=i==null||i===1?r:`vec${i}<${r}>`;e.push(`${t}:${a}`)}return`
      struct Uniforms { ${e.join(", ")} };
      @group(0) @binding(${this.variableIndex}) var<uniform> uniforms: Uniforms;`}get additionalImplementations(){return this.uniformDeclaration()+this.variables.map(e=>e.impl()).join(`
`)+this.internalVariables.map(e=>e.impl()).join(`
`)}get variablesInfo(){if(this.uniforms.length===0)return;let e=t=>[12,10,1,6][["u32","f16","f32","i32"].indexOf(t)];return this.uniforms.map(t=>[e(t.type),t.length??1])}},Lo=(e,t)=>new da(e,t),St=(e,t)=>{let r=e.length,i=[];for(let a=0;a<r;a++){let s=r-1-a,n=e[s]||1;(t[t.length-1-a]||1)>1&&n===1&&i.unshift(s)}return i}}),pa,gr,ha,ca,fa,_e,Wo,Go,Fe=T(()=>{V(),W(),se(),G(),pa=e=>{if(!e||e.length!==1)throw new Error("Transpose requires 1 input.")},gr=(e,t)=>t&&t.length!==e?[...new Array(e).keys()].reverse():t,ha=(e,t)=>S.sortBasedOnPerm(e,gr(e.length,t)),ca=(e,t,r,i)=>{let a=`fn perm(i: ${i.type.indices}) -> ${r.type.indices} {
    var a: ${r.type.indices};`;for(let s=0;s<t;++s)a+=r.indicesSet("a",e[s],`i[${s}]`);return a+="return a;}"},fa=(e,t)=>{let r=[],i=[];for(let a=0;a<e.length;++a)e[a]!==1&&r.push(e[a]),e[t[a]]!==1&&i.push(t[a]);return{newShape:r,newPerm:i}},_e=(e,t)=>{let r=e.dataType,i=e.dims.length,a=gr(i,t),s=ha(e.dims,a),{newShape:n,newPerm:o}=fa(e.dims,a),u=S.areEqual(o,[2,3,1]),l=S.areEqual(o,[3,1,2]),d=n.length===2&&o[0]>o[1]||u||l,p=d?n:e.dims,h=s;d&&(p=u?[n[0],n[1]*n[2]]:l?[n[0]*n[1],n[2]]:n,h=[p[1],p[0]]);let c=I("a",r,p.length),f=M("output",r,h.length),m=16,w;return d?w=y=>`
  ${y.registerUniform("output_size","u32").declareVariables(c,f)}
  var<workgroup> tile : array<array<${f.type.value}, ${m+1}>, ${m}>;
  ${y.mainStart([m,m,1])}
    let stride = (uniforms.output_shape[1] - 1) / ${m} + 1;
    let workgroup_id_x = workgroup_index % stride;
    let workgroup_id_y = workgroup_index / stride;
    let input_col = workgroup_id_y * ${m}u + local_id.x;
    let input_row = workgroup_id_x * ${m}u + local_id.y;
    if (input_row < uniforms.a_shape[0] && input_col < uniforms.a_shape[1]) {
      tile[local_id.y][local_id.x] = ${c.getByIndices(`${c.type.indices}(input_row, input_col)`)};
    }
    workgroupBarrier();

    let output_col = workgroup_id_x * ${m}u + local_id.x;
    let output_row = workgroup_id_y * ${m}u + local_id.y;
    if (output_row < uniforms.output_shape[0] && output_col < uniforms.output_shape[1]) {
      ${f.setByIndices(`${f.type.indices}(output_row, output_col)`,"tile[local_id.x][local_id.y]")}
    }
  }`:w=y=>`
  ${y.registerUniform("output_size","u32").declareVariables(c,f)}

  ${ca(a,i,c,f)}

  ${y.mainStart()}
    ${y.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}

    let indices = ${f.offsetToIndices("global_idx")};
    let aIndices = perm(indices);

    ${f.setByOffset("global_idx",c.getByIndices("aIndices"))}
  }`,{name:d?"TransposeShared":"Transpose",shaderCache:{hint:`${t}`,inputDependencies:["rank"]},getRunData:()=>{let y=S.size(s);return{outputs:[{dims:s,dataType:e.dataType}],dispatchGroup:d?{x:Math.ceil(h[1]/m),y:Math.ceil(h[0]/m)}:{x:Math.ceil(y/64)},programUniforms:[{type:12,data:y},...B(p,h)]}},getShaderSource:w}},Wo=(e,t)=>{pa(e.inputs),e.compute(_e(e.inputs[0],t.perm))},Go=e=>te({perm:e.perm})}),ma,ga,ya,wa,$a,_a,va,ba,xa,ka,xe,Fo,Ho,jo,Ko,Zo,Qo,Xo,Yo,Jo,eu,mp=T(()=>{V(),W(),G(),zi(),Fe(),ma={max:"select(bestValue, candidate, candidate > bestValue)",min:"select(bestValue, candidate, candidate < bestValue)",mean:"bestValue + candidate",sum:"bestValue + candidate",prod:"bestValue * candidate",sumSquare:"bestValue + candidate * candidate",logSumExp:"bestValue + exp(candidate)",l1:"bestValue + abs(candidate)",l2:"bestValue + candidate * candidate",logSum:"bestValue + candidate"},ga={max:"select(bestValue, candidate, candidate > bestValue)",min:"select(bestValue, candidate, candidate < bestValue)",mean:"bestValue + candidate",sum:"bestValue + candidate",prod:"bestValue * candidate",sumSquare:"bestValue + candidate",logSumExp:"bestValue + candidate",l1:"bestValue + candidate",l2:"bestValue + candidate",logSum:"bestValue + candidate"},ya={max:"_A[offset]",min:"_A[offset]",mean:"0",sum:"0",prod:"1",sumSquare:"0",logSumExp:"0",l1:"0",l2:"0",logSum:"0"},wa={max:"bestValue",min:"bestValue",sum:"bestValue",prod:"bestValue",sumSquare:"bestValue",logSumExp:"log(bestValue)",l1:"bestValue",l2:"sqrt(bestValue)",logSum:"log(bestValue)"},$a=(e,t)=>{let r=[];for(let i=t-e;i<t;++i)r.push(i);return r},_a=(e,t)=>{let r=[],i=e.length;for(let s=0;s<i;s++)t.indexOf(s)===-1&&r.push(e[s]);let a=t.map(s=>e[s]);return[r,a]},va=(e,t)=>{let r=e.length+t.length,i=[],a=0;for(let s=0;s<r;s++)t.indexOf(s)===-1?i.push(e[a++]):i.push(1);return i},ba=(e,t)=>{for(let r=0;r<e.length;++r)if(e[e.length-r-1]!==t-1-r)return!1;return!0},xa=(e,t)=>{let r=[];if(!ba(e,t)){for(let i=0;i<t;++i)e.indexOf(i)===-1&&r.push(i);e.forEach(i=>r.push(i))}return r},ka=(e,t,r,i,a,s,n)=>{let o=r[0].dims,u=S.size(s),l=S.size(n),d=I("_A",r[0].dataType,o),p=M("output",a,s),h=32,c=`
          var<workgroup> aBestValues : array<f32, ${h}>;
       `;return{name:e,shaderCache:t,getShaderSource:f=>`
        ${f.registerUniform("reduceSize","u32").declareVariables(d,p)}
        ${c}
        fn DIV_CEIL(a : u32, b : u32) -> u32 {
          return ((a - 1u) / b + 1u);
         }
         ${f.mainStart(h)}

          let outputIndex = global_idx / ${h};
          let offset = outputIndex * uniforms.reduceSize;

          var bestValue = f32(${ya[i]});
          let Length = uniforms.reduceSize;
          for (var k = local_idx; k < Length; k = k + ${h}) {
           let candidate = f32(${d.getByOffset("offset + k")});
           bestValue = ${ma[i]};
          }
          aBestValues[local_idx] = bestValue;
          workgroupBarrier();

         var reduceSize = min(Length, ${h}u);
         for (var currentSize = reduceSize / 2u; reduceSize > 1u;
             currentSize = reduceSize / 2u) {
           let interval = DIV_CEIL(reduceSize, 2u);
           if (local_idx < currentSize) {
            let candidate = aBestValues[local_idx + interval];
            bestValue = ${ga[i]};
            aBestValues[local_idx] = bestValue;
           }
           reduceSize = interval;
           workgroupBarrier();
         }

         if (local_idx == 0u) {
          ${p.setByOffset("outputIndex",`${i==="mean"?`${p.type.storage}(bestValue / f32(uniforms.reduceSize))`:`${p.type.storage}(${wa[i]})`}`)};
         }
        }`,getRunData:()=>({outputs:[{dims:s,dataType:a}],dispatchGroup:{x:u},programUniforms:[{type:12,data:l}]})}},xe=(e,t,r,i)=>{let a=e.inputs.length===1?r:Jr(e.inputs,r),s=a.axes;s.length===0&&!a.noopWithEmptyAxes&&(s=e.inputs[0].dims.map((c,f)=>f));let n=S.normalizeAxes(s,e.inputs[0].dims.length),o=n,u=e.inputs[0],l=xa(o,e.inputs[0].dims.length);l.length>0&&(u=e.compute(_e(e.inputs[0],l),{inputs:[0],outputs:[-1]})[0],o=$a(o.length,u.dims.length));let[d,p]=_a(u.dims,o),h=d;a.keepDims&&(h=va(d,n)),e.compute(ka(t,{hint:a.cacheKey,inputDependencies:["type"]},[u],i,e.inputs[0].dataType,h,p),{inputs:[u]})},Fo=(e,t)=>{xe(e,"ReduceMeanShared",t,"mean")},Ho=(e,t)=>{xe(e,"ReduceL1Shared",t,"l1")},jo=(e,t)=>{xe(e,"ReduceL2Shared",t,"l2")},Ko=(e,t)=>{xe(e,"ReduceLogSumExpShared",t,"logSumExp")},Zo=(e,t)=>{xe(e,"ReduceMaxShared",t,"max")},Qo=(e,t)=>{xe(e,"ReduceMinShared",t,"min")},Xo=(e,t)=>{xe(e,"ReduceProdShared",t,"prod")},Yo=(e,t)=>{xe(e,"ReduceSumShared",t,"sum")},Jo=(e,t)=>{xe(e,"ReduceSumSquareShared",t,"sumSquare")},eu=(e,t)=>{xe(e,"ReduceLogSumShared",t,"logSum")}}),ke,Sa,Zt,Jr,Se,Ia,za,Ea,Ta,Ca,Aa,Ra,Ba,Oa,Ma,Ie,tu,ru,iu,au,nu,su,ou,uu,lu,du,zi=T(()=>{V(),W(),se(),G(),mp(),ke=e=>{if(!e||e.length===0||e.length>2)throw new Error("Reduce op requires 1 or 2 inputs.");if(e.length===2&&e[1].dims.length!==1)throw new Error("Invalid axes input dims.")},Sa=e=>["","",`var value = ${e.getByIndices("input_indices")};`,""],Zt=(e,t,r,i,a,s,n=!1,o=!1)=>{let u=[],l=r[0].dims,d=l.length,p=S.normalizeAxes(a,d),h=!o&&p.length===0;l.forEach((m,w)=>{h||p.indexOf(w)>=0?n&&u.push(1):u.push(m)});let c=u.length,f=S.size(u);return{name:e,shaderCache:t,getShaderSource:m=>{let w=[],y=I("_A",r[0].dataType,d),g=M("output",s,c),_=i(y,g,p),$=_[2];for(let v=0,k=0;v<d;v++)h||p.indexOf(v)>=0?(n&&k++,$=`for(var j${v}: u32 = 0; j${v} < ${l[v]}; j${v}++) {
                  ${_[2].includes("last_index")?`let last_index = j${v};`:""}
                  ${y.indicesSet("input_indices",v,`j${v}`)}
                  ${$}
                }`):(w.push(`${y.indicesSet("input_indices",v,g.indicesGet("output_indices",k))};`),k++);return`

        ${m.registerUniform("output_size","u32").declareVariables(y,g)}

        ${m.mainStart()}
          ${m.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
          var input_indices: ${y.type.indices};
          let output_indices = ${g.offsetToIndices("global_idx")};

          ${w.join(`
`)}
          ${_[0]}       // init ops for reduce max/min
          ${_[1]}
          ${$}
          ${_[3]}
          ${_.length===4?g.setByOffset("global_idx","value"):_.slice(4).join(`
`)}
        }`},getRunData:()=>({outputs:[{dims:u,dataType:s}],dispatchGroup:{x:Math.ceil(f/64)},programUniforms:[{type:12,data:f},...B(l,u)]})}},Jr=(e,t)=>{let r=[];return e[1].dims[0]>0&&e[1].getBigInt64Array().forEach(i=>r.push(Number(i))),te({axes:r,keepDims:t.keepDims,noopWithEmptyAxes:t.noopWithEmptyAxes})},Se=(e,t,r,i)=>{let a=e.inputs,s=a.length===1?r:Jr(a,r);e.compute(Zt(t,{hint:s.cacheKey,inputDependencies:["rank"]},[a[0]],s.noopWithEmptyAxes&&s.axes.length===0?Sa:i,s.axes,a[0].dataType,s.keepDims,s.noopWithEmptyAxes),{inputs:[0]})},Ia=(e,t)=>{ke(e.inputs),Se(e,"ReduceLogSum",t,(r,i)=>[`var value = ${i.type.storage}(0);`,"",`value += ${r.getByIndices("input_indices")};`,"value = log(value);"])},za=(e,t)=>{ke(e.inputs),Se(e,"ReduceL1",t,(r,i)=>[`var value = ${i.type.storage}(0);`,"",`value += abs(${r.getByIndices("input_indices")});`,""])},Ea=(e,t)=>{ke(e.inputs),Se(e,"ReduceL2",t,(r,i)=>[`var t = ${i.type.value}(0); var value = ${i.type.value}(0);`,"",`t = ${r.getByIndices("input_indices")}; value += (t * t);`,"value = sqrt(value);"])},Ta=(e,t)=>{ke(e.inputs),Se(e,"ReduceLogSumExp",t,(r,i)=>[`var value = ${i.type.storage}(0);`,"",`value += exp(${r.getByIndices("input_indices")});`,"value = log(value);"])},Ca=(e,t)=>{ke(e.inputs),Se(e,"ReduceMax",t,(r,i,a)=>{let s=[];for(let n=0;n<r.rank;n++)(a.indexOf(n)>=0||a.length===0)&&s.push(r.indicesSet("input_indices",n,0));return[`${s.join(`
`)}`,`var value = ${r.getByIndices("input_indices")};`,`value = max(value, ${r.getByIndices("input_indices")});`,""]})},Aa=(e,t)=>{ke(e.inputs),Se(e,"ReduceMean",t,(r,i,a)=>{let s=1;for(let n=0;n<r.rank;n++)(a.indexOf(n)>=0||a.length===0)&&(s*=e.inputs[0].dims[n]);return["var sum = f32(0);","",`sum += f32(${r.getByIndices("input_indices")});`,`let value = ${i.type.value}(sum / ${s});`]})},Ra=(e,t)=>{ke(e.inputs),Se(e,"ReduceMin",t,(r,i,a)=>{let s=[];for(let n=0;n<r.rank;n++)(a.indexOf(n)>=0||a.length===0)&&s.push(`input_indices[${n}] = 0;`);return[`${s.join(`
`)}`,`var value = ${r.getByIndices("input_indices")};`,`value = min(value, ${r.getByIndices("input_indices")});`,""]})},Ba=(e,t)=>{ke(e.inputs),Se(e,"ReduceProd",t,(r,i)=>[`var value = ${i.type.storage}(1);`,"",`value *= ${r.getByIndices("input_indices")};`,""])},Oa=(e,t)=>{ke(e.inputs),Se(e,"ReduceSum",t,(r,i)=>[`var value = ${i.type.storage}(0);`,"",`value += ${r.getByIndices("input_indices")};`,""])},Ma=(e,t)=>{ke(e.inputs),Se(e,"ReduceSumSquare",t,(r,i)=>[`var t = ${i.type.value}(0); var value = ${i.type.value}(0);`,"",`t = ${r.getByIndices("input_indices")}; value += t * t;`,""])},Ie=(e,t,r)=>{if(t.length===0)return r;let i=1,a=1;for(let s=0;s<t.length;s++)t.indexOf(s)===-1?i*=e[s]:a*=e[s];return a<32&&i>1024},tu=(e,t)=>{Ie(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?Aa(e,t):Fo(e,t)},ru=(e,t)=>{Ie(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?za(e,t):Ho(e,t)},iu=(e,t)=>{Ie(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?Ea(e,t):jo(e,t)},au=(e,t)=>{Ie(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?Ta(e,t):Ko(e,t)},nu=(e,t)=>{Ie(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?Ca(e,t):Zo(e,t)},su=(e,t)=>{Ie(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?Ra(e,t):Qo(e,t)},ou=(e,t)=>{Ie(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?Ba(e,t):Xo(e,t)},uu=(e,t)=>{Ie(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?Oa(e,t):Yo(e,t)},lu=(e,t)=>{Ie(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?Ma(e,t):Jo(e,t)},du=(e,t)=>{Ie(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?Ia(e,t):eu(e,t)}}),yr,pu,hu,ei,gp=T(()=>{V(),se(),zi(),yr=e=>{if(!e||e.length===0||e.length>2)throw new Error("ArgMinMaxOp op requires 1 or 2 inputs.");if(e[0].dataType!==1)throw new Error("Invalid input type.")},pu=(e,t)=>{yr(e.inputs);let r=(i,a,s)=>{let n=[];for(let o=0;o<i.rank;o++)(s.indexOf(o)>=0||s.length===0)&&n.push(`input_indices[${o}] = 0;`);return[`${n.join(`
`)}`,`var value = ${i.getByIndices("input_indices")};
var best_index : i32 = 0;`,`if (${i.getByIndices("input_indices")} ${t.selectLastIndex>0?"<=":"<"} value) {
         value = ${i.getByIndices("input_indices")};
         best_index = i32(last_index);
       }`,"",a.setByOffset("global_idx","best_index")]};e.compute(Zt("ArgMin",{hint:t.cacheKey,inputDependencies:["rank"]},[e.inputs[0]],r,[t.axis],7,t.keepDims),{inputs:[0]})},hu=(e,t)=>{yr(e.inputs);let r=(i,a,s)=>{let n=[];for(let o=0;o<i.rank;o++)(s.indexOf(o)>=0||s.length===0)&&n.push(`input_indices[${o}] = 0;`);return[`${n.join(`
`)}`,`var value = ${i.getByIndices("input_indices")};
var best_index : i32 = 0;`,`if (${i.getByIndices("input_indices")} ${t.selectLastIndex>0?">=":">"} value) {
         value = ${i.getByIndices("input_indices")};
         best_index = i32(last_index);
       }`,"",a.setByOffset("global_idx","best_index")]};e.compute(Zt("argMax",{hint:t.cacheKey,inputDependencies:["rank"]},[e.inputs[0]],r,[t.axis],7,t.keepDims),{inputs:[0]})},ei=e=>te(e)}),Pa,Da,Ua,qa,It,Va,cu,Ei=T(()=>{V(),W(),Si(),G(),Pa=(e,t)=>{let r=e[0],i=e[1],a=e[2],s=e[3],n=e[4],o=e[5];if(n&&o)throw new Error("Attention cannot have both past and attention_bias");if(r.dims.length!==3)throw new Error('Input "input" must have 3 dimensions');let u=r.dims[0],l=r.dims[1],d=r.dims[2];if(a.dims.length!==1)throw new Error('Input "bias" is expected to have 1 dimensions');if(i.dims.length!==2)throw new Error('Input "weights" is expected to have 2 dimensions');if(i.dims[0]!==d)throw new Error("Input 1 dimension 0 should have same length as dimension 2 of input 0");if(a.dims[0]!==i.dims[1])throw new Error('Input "bias" dimension 0 should have same length as dimension 1 of input "weights"');let p=a.dims[0]/3,h=p,c=h;if(t.qkvHiddenSizes.length>0){if(t.qkvHiddenSizes.length!==3)throw new Error("qkv_hidden_sizes attribute should have 3 elements");for(let _ of t.qkvHiddenSizes)if(_%t.numHeads!==0)throw new Error("qkv_hidden_sizes should be divisible by num_heads");p=t.qkvHiddenSizes[0],h=t.qkvHiddenSizes[1],c=t.qkvHiddenSizes[2]}let f=l;if(p!==h)throw new Error("qkv_hidden_sizes first element should be same as the second");if(a.dims[0]!==p+h+c)throw new Error('Input "bias" dimension 0 should have same length as sum of Q/K/V hidden sizes');let m=0;if(n){if(h!==c)throw new Error('Input "past" expect k_hidden_size == v_hidden_size');if(n.dims.length!==5)throw new Error('Input "past" must have 5 dimensions');if(n.dims[0]!==2)throw new Error('Input "past" first dimension must be 2');if(n.dims[1]!==u)throw new Error('Input "past" second dimension must be batch_size');if(n.dims[2]!==t.numHeads)throw new Error('Input "past" third dimension must be num_heads');if(n.dims[4]!==h/t.numHeads)throw new Error('Input "past" fifth dimension must be k_hidden_size / num_heads');t.pastPresentShareBuffer||(m=n.dims[3])}let w=f+m,y=-1,g=0;if(s)throw new Error("Mask not supported");if(n)throw new Error("past is not supported");if(o){if(o.dims.length!==4)throw new Error('Input "attention_bias" must have 4 dimensions');if(o.dims[0]!==u||o.dims[1]!==t.numHeads||o.dims[2]!==l||o.dims[3]!==w)throw new Error('Expect "attention_bias" shape (batch_size, num_heads, sequence_length, total_sequence_length)')}return{batchSize:u,sequenceLength:l,pastSequenceLength:m,kvSequenceLength:f,totalSequenceLength:w,maxSequenceLength:y,inputHiddenSize:d,hiddenSize:p,vHiddenSize:c,headSize:Math.floor(p/t.numHeads),vHeadSize:Math.floor(c/t.numHeads),numHeads:t.numHeads,isUnidirectional:!1,pastPresentShareBuffer:!1,maskFilterValue:t.maskFilterValue,maskType:g,scale:t.scale,broadcastResPosBias:!1,passPastInKv:!1,qkvFormat:1}},Da=(e,t,r)=>{let i=ae(r),a=64,s=r/i;s<a&&(a=32);let n=Math.ceil(r/i/a),o=[{type:1,data:1/r},{type:12,data:s},{type:12,data:n}],u=ue(e.dataType,i),l=ce(1,i),d=["type"],p=h=>{let c=M("x",e.dataType,e.dims,i),f=ce(e.dataType),m=[{name:"d_inv",type:"f32"},{name:"d_comp",type:"u32"},{name:"elements_per_thread",type:"u32"}];return`
  var<workgroup> thread_max: array<f32, ${a}>;
  var<workgroup> thread_sum: array<f32, ${a}>;
  ${h.registerUniforms(m).declareVariables(c)}
  ${h.mainStart([a,1,1])}
    let local_offset = local_idx * uniforms.elements_per_thread;
    let offset = (global_idx / ${a}) * uniforms.d_comp + local_offset;

    var thread_max_vector = ${l}(-3.402823e+38f);
    for (var i: u32 = 0; i < uniforms.elements_per_thread && i + local_offset < uniforms.d_comp; i++) {
      thread_max_vector = max(${l}(x[offset + i]), thread_max_vector);
    }
    thread_max[local_idx] = ${(()=>{switch(i){case 1:return"thread_max_vector";case 2:return"max(thread_max_vector.x, thread_max_vector.y)";case 4:return"max(max(thread_max_vector.x, thread_max_vector.y), max(thread_max_vector.z, thread_max_vector.w))";default:throw new Error(`Unsupported components: ${i}`)}})()};
    workgroupBarrier();

    var max_value =  f32(-3.402823e+38f);
    for (var i = 0u; i < ${a}; i++) {
      max_value = max(thread_max[i], max_value);
    }

    var sum_vector = ${l}(0);
    for (var i: u32 = 0; i < uniforms.elements_per_thread && i + local_offset < uniforms.d_comp; i++) {
      sum_vector += exp(${l}(x[offset + i]) - max_value);
    }
    thread_sum[local_idx] = ${(()=>{switch(i){case 1:return"sum_vector";case 2:return"sum_vector.x + sum_vector.y";case 4:return"sum_vector.x + sum_vector.y + sum_vector.z + sum_vector.w";default:throw new Error(`Unsupported components: ${i}`)}})()};
    workgroupBarrier();

    var sum: f32 = 0;
    for (var i = 0u; i < ${a}; i++) {
      sum += thread_sum[i];
    }

    if (sum == 0) {
      for (var i: u32 = 0; i < uniforms.elements_per_thread && i + local_offset < uniforms.d_comp; i++) {
        x[offset + i] = ${c.type.value}(${f}(uniforms.d_inv));
      }
    } else {
      for (var i: u32 = 0; i < uniforms.elements_per_thread && i + local_offset < uniforms.d_comp; i++) {
        var f32input = ${l}(x[offset + i]);
        x[offset + i] = ${c.type.value}(exp(f32input - max_value) / sum);
      }
    }
  }`};return{name:"AttentionProbsSoftmax",shaderCache:{hint:`${a};${u};${i}`,inputDependencies:d},getShaderSource:p,getRunData:()=>({outputs:[],dispatchGroup:{x:t},programUniforms:o})}},Ua=(e,t,r,i,a,s,n,o)=>{let u=o+s.kvSequenceLength,l=[s.batchSize,s.numHeads,s.sequenceLength,u],d=s.kvNumHeads===void 0&&e>1&&i,p=d?[s.batchSize,s.numHeads,u,s.headSize]:void 0,h=n.scale===0?1/Math.sqrt(s.headSize):n.scale,c=ae(s.headSize),f=s.headSize/c,m=12,w={x:Math.ceil(u/m),y:Math.ceil(s.sequenceLength/m),z:s.batchSize*s.numHeads},y=[{type:12,data:s.sequenceLength},{type:12,data:f},{type:12,data:u},{type:12,data:s.numHeads},{type:1,data:h},{type:12,data:o},{type:12,data:s.kvSequenceLength}],g=d&&i&&S.size(i.dims)>0,_=["type","type"];g&&_.push("type"),a&&_.push("type");let $=[{dims:l,dataType:t.dataType,gpuDataType:0}];d&&$.push({dims:p,dataType:t.dataType,gpuDataType:0});let v=k=>{let b=I("q",t.dataType,t.dims,c),E=I("key",r.dataType,r.dims,c),C=[b,E];if(g){let F=I("past_key",i.dataType,i.dims,c);C.push(F)}a&&C.push(I("attention_bias",a.dataType,a.dims));let A=M("output",t.dataType,l),q=[A];d&&q.push(M("present_key",t.dataType,p,c));let P=ce(1,c),L=[{name:"M",type:"u32"},{name:"K",type:"u32"},{name:"N",type:"u32"},{name:"num_heads",type:"u32"},{name:"alpha",type:"f32"},{name:"past_sequence_length",type:"u32"},{name:"kv_sequence_length",type:"u32"}];return`
  const TILE_SIZE = ${m}u;

  var<workgroup> tileQ: array<${b.type.storage}, ${m*m}>;
  var<workgroup> tileK: array<${b.type.storage}, ${m*m}>;
  ${k.registerUniforms(L).declareVariables(...C,...q)}
  ${k.mainStart([m,m,1])}
    // x holds the N and y holds the M
    let headIdx = workgroup_id.z;
    let m = workgroup_id.y * TILE_SIZE;
    let n = workgroup_id.x * TILE_SIZE;
    let qOffset = uniforms.M * uniforms.K * headIdx + m * uniforms.K;
    ${g&&d?`
    let kOffset = uniforms.kv_sequence_length * uniforms.K * headIdx;
    let pastKeyOffset = uniforms.past_sequence_length * uniforms.K * headIdx;`:`
    let kOffset = uniforms.N * uniforms.K * headIdx + n * uniforms.K;`}
    ${d?"let presentKeyOffset = headIdx * uniforms.N * uniforms.K;":""}
    var value = ${P}(0);
    for (var w: u32 = 0u; w < uniforms.K; w += TILE_SIZE) {
      if (global_id.y < uniforms.M && w + local_id.x < uniforms.K) {
        tileQ[TILE_SIZE * local_id.y + local_id.x] = q[qOffset + local_id.y * uniforms.K + w + local_id.x];
      }
      if (n + local_id.y < uniforms.N && w + local_id.x < uniforms.K) {
        var idx = TILE_SIZE * local_id.y + local_id.x;
      ${g&&d?`
              if (n + local_id.y < uniforms.past_sequence_length) {
                tileK[idx] = past_key[pastKeyOffset + (n + local_id.y) * uniforms.K + w + local_id.x];
              } else {
                tileK[idx] =
                         key[kOffset + (n + local_id.y - uniforms.past_sequence_length) * uniforms.K + w + local_id.x];
              }`:"tileK[idx] = key[kOffset + local_id.y * uniforms.K + w + local_id.x];"}
      ${d?"present_key[presentKeyOffset + (n + local_id.y) * uniforms.K + w + local_id.x] = tileK[idx];":""}
      }
      workgroupBarrier();

      for (var k: u32 = 0u; k < TILE_SIZE && w+k < uniforms.K; k++) {
        value += ${P}(tileQ[TILE_SIZE * local_id.y + k] * tileK[TILE_SIZE * local_id.x + k]);
      }

      workgroupBarrier();
    }

    let headOffset = headIdx * uniforms.M * uniforms.N;
    if (global_id.y < uniforms.M && global_id.x < uniforms.N) {
      let outputIdx = headOffset + global_id.y * uniforms.N + global_id.x;
      var sum: f32 = ${(()=>{switch(c){case 1:return"value";case 2:return"value.x + value.y";case 4:return"value.x + value.y + value.z + value.w";default:throw new Error(`Unsupported components: ${c}`)}})()};
        output[outputIdx] = ${A.type.value} (sum * uniforms.alpha) + ${a?"attention_bias[outputIdx]":"0.0"};
    }
  }`};return{name:"AttentionProbs",shaderCache:{hint:`${c};${a!==void 0};${i!==void 0};${e}`,inputDependencies:_},getRunData:()=>({outputs:$,dispatchGroup:w,programUniforms:y}),getShaderSource:v}},qa=(e,t,r,i,a,s)=>{let n=s+a.kvSequenceLength,o=a.nReps?a.nReps:1,u=a.vHiddenSize*o,l=a.kvNumHeads==null&&e>1&&i,d=l?[a.batchSize,a.numHeads,n,a.headSize]:void 0,p=[a.batchSize,a.sequenceLength,u],h=12,c={x:Math.ceil(a.vHeadSize/h),y:Math.ceil(a.sequenceLength/h),z:a.batchSize*a.numHeads},f=[{type:12,data:a.sequenceLength},{type:12,data:n},{type:12,data:a.vHeadSize},{type:12,data:a.numHeads},{type:12,data:u},{type:12,data:s},{type:12,data:a.kvSequenceLength}],m=l&&i&&S.size(i.dims)>0,w=["type","type"];m&&w.push("type");let y=[{dims:p,dataType:t.dataType,gpuDataType:0}];l&&y.push({dims:d,dataType:t.dataType,gpuDataType:0});let g=_=>{let $=I("probs",t.dataType,t.dims),v=I("v",r.dataType,r.dims),k=[$,v];m&&k.push(I("past_value",i.dataType,i.dims));let b=[M("output",t.dataType,p)];l&&b.push(M("present_value",t.dataType,d));let E=[{name:"M",type:"u32"},{name:"K",type:"u32"},{name:"N",type:"u32"},{name:"num_heads",type:"u32"},{name:"v_hidden_size",type:"u32"},{name:"past_sequence_length",type:"u32"},{name:"kv_sequence_length",type:"u32"}];return`
  const TILE_SIZE = ${h}u;
  var<workgroup> tileQ: array<${$.type.value}, ${h*h}>;
  var<workgroup> tileK: array<${$.type.value}, ${h*h}>;
  ${_.registerUniforms(E).declareVariables(...k,...b)}
  ${_.mainStart([h,h,1])}
   let headIdx = workgroup_id.z;
   let m = global_id.y;
   let n = global_id.x;

   let offsetA = headIdx * (uniforms.M * uniforms.K) + m * uniforms.K;
   ${m&&l?`
    let pastValueOffset = headIdx * uniforms.N * uniforms.past_sequence_length + n;
    let vOffset = headIdx * uniforms.N * uniforms.kv_sequence_length + n;
      `:`
   let offsetB = headIdx * uniforms.N * uniforms.K + n;
            `}
    ${l?"let presentValueOffset = headIdx * uniforms.N * uniforms.K + n;":""}
   var value = ${$.type.storage}(0);
   for (var w: u32 = 0u; w < uniforms.K; w += TILE_SIZE) {
      if (m < uniforms.M && w + local_id.x < uniforms.K) {
        tileQ[TILE_SIZE * local_id.y + local_id.x] = probs[offsetA + w + local_id.x];
      }
      if (n < uniforms.N && w + local_id.y < uniforms.K) {
        var idx = TILE_SIZE * local_id.y + local_id.x;
        ${m&&l?`
        if (w + local_id.y < uniforms.past_sequence_length) {
          tileK[idx] = past_value[pastValueOffset + (w + local_id.y) * uniforms.N];
        } else {
          tileK[idx] = v[vOffset + (w + local_id.y - uniforms.past_sequence_length) * uniforms.N];
        }
      `:`
        tileK[idx] = v[offsetB + (w + local_id.y) * uniforms.N];
      `}
        ${l?"present_value[presentValueOffset + (w + local_id.y) * uniforms.N] = tileK[idx];":""}
      }
     workgroupBarrier();
     for (var k: u32 = 0u; k < TILE_SIZE && w+k < uniforms.K; k++) {
       value += tileQ[TILE_SIZE * local_id.y + k] * tileK[TILE_SIZE * k + local_id.x];
     }
     workgroupBarrier();
   }

   // we need to transpose output from BNSH_v to BSND_v
   let batchIdx = workgroup_id.z / uniforms.num_heads;
   let currentBatchHeadNumber = workgroup_id.z % uniforms.num_heads;
   if (m < uniforms.M && n < uniforms.N) {
     let outputIdx = batchIdx * uniforms.M * uniforms.v_hidden_size + m * uniforms.v_hidden_size
       + currentBatchHeadNumber * uniforms.N + n;
     output[outputIdx] = value;
   }
  }`};return{name:"AttentionScore",shaderCache:{hint:`${i!==void 0};${e}`,inputDependencies:w},getRunData:()=>({outputs:y,dispatchGroup:c,programUniforms:f}),getShaderSource:g}},It=(e,t,r,i,a,s,n,o,u,l,d)=>{let p=Math.min(e.outputCount,1+(n?1:0)+(o?1:0)),h=l.kvNumHeads!==void 0||p>1?l.pastSequenceLength:0,c=h+l.kvSequenceLength,f=u&&S.size(u.dims)>0?u:void 0,m=[t,r];l.kvNumHeads===void 0&&p>1&&n&&S.size(n.dims)>0&&m.push(n),f&&m.push(f);let w=e.compute(Ua(p,t,r,n,f,l,d,h),{inputs:m,outputs:l.kvNumHeads===void 0&&p>1?[-1,1]:[-1]})[0];e.compute(Da(w,l.batchSize*l.numHeads*l.sequenceLength,c),{inputs:[w],outputs:[]});let y=[w,i];l.kvNumHeads===void 0&&p>1&&o&&S.size(o.dims)>0&&y.push(o),e.compute(qa(p,w,i,o,l,h),{inputs:y,outputs:l.kvNumHeads===void 0&&p>1?[0,2]:[0]})},Va=(e,t)=>{let r=[t.batchSize,t.numHeads,t.sequenceLength,t.headSize],i=t.sequenceLength,a=t.inputHiddenSize,s=t.headSize,n=12,o={x:Math.ceil(t.headSize/n),y:Math.ceil(t.sequenceLength/n),z:t.batchSize*t.numHeads},u=[e.inputs[0],e.inputs[1],e.inputs[2]],l=[{type:12,data:i},{type:12,data:a},{type:12,data:s},{type:12,data:t.numHeads},{type:12,data:t.headSize},{type:12,data:t.hiddenSize},{type:12,data:t.hiddenSize+t.hiddenSize+t.vHiddenSize}],d=p=>{let h=M("output_q",u[0].dataType,r),c=M("output_k",u[0].dataType,r),f=M("output_v",u[0].dataType,r),m=I("input",u[0].dataType,u[0].dims),w=I("weight",u[1].dataType,u[1].dims),y=I("bias",u[2].dataType,u[2].dims),g=m.type.storage,_=[{name:"M",type:"u32"},{name:"K",type:"u32"},{name:"N",type:"u32"},{name:"num_heads",type:"u32"},{name:"head_size",type:"u32"},{name:"hidden_size",type:"u32"},{name:"ldb",type:"u32"}];return`
  const TILE_SIZE = ${n}u;
  var<workgroup> tileInput: array<${g}, ${n*n}>;
  var<workgroup> tileWeightQ: array<${g}, ${n*n}>;
  var<workgroup> tileWeightK: array<${g}, ${n*n}>;
  var<workgroup> tileWeightV: array<${g}, ${n*n}>;
  ${p.registerUniforms(_).declareVariables(m,w,y,h,c,f)}
  ${p.mainStart([n,n,1])}
    let batchIndex = workgroup_id.z / uniforms.num_heads;
    let headNumber = workgroup_id.z % uniforms.num_heads;
    let m = global_id.y;
    let n = global_id.x;

    let inputOffset = batchIndex * (uniforms.M * uniforms.K) + m * uniforms.K;
    let biasOffsetQ = headNumber * uniforms.head_size;
    let biasOffsetK = uniforms.hidden_size + biasOffsetQ;
    let biasOffsetV = uniforms.hidden_size + biasOffsetK;

    var valueQ = ${g}(0);
    var valueK = ${g}(0);
    var valueV = ${g}(0);
    for (var w: u32 = 0u; w < uniforms.K; w += TILE_SIZE) {
      if (m < uniforms.M && w + local_id.x < uniforms.K) {
        tileInput[TILE_SIZE * local_id.y + local_id.x] = input[inputOffset + w + local_id.x];
      }
      if (n < uniforms.N && w + local_id.y < uniforms.K) {
        let offset = n + (w + local_id.y) * uniforms.ldb;
        tileWeightQ[TILE_SIZE * local_id.y + local_id.x] = weight[biasOffsetQ + offset];
        tileWeightK[TILE_SIZE * local_id.y + local_id.x] = weight[biasOffsetK + offset];
        tileWeightV[TILE_SIZE * local_id.y + local_id.x] = weight[biasOffsetV + offset];
      }
      workgroupBarrier();
      for (var k: u32 = 0u; k<TILE_SIZE && w+k < uniforms.K; k++) {
        let inputTileOffset = TILE_SIZE * local_id.y + k;
        let weightTileOffset = TILE_SIZE * k + local_id.x;
        valueQ += tileInput[inputTileOffset] * tileWeightQ[weightTileOffset];
        valueK += tileInput[inputTileOffset] * tileWeightK[weightTileOffset];
        valueV += tileInput[inputTileOffset] * tileWeightV[weightTileOffset];
      }

      workgroupBarrier();
    }

    let headOffset = (m * uniforms.N + n) % uniforms.head_size;
    valueQ += bias[headOffset + biasOffsetQ];
    valueK += bias[headOffset + biasOffsetK];
    valueV += bias[headOffset + biasOffsetV];

    let offset = workgroup_id.z * uniforms.M * uniforms.N;
    if (m < uniforms.M && n < uniforms.N) {
      let outputIdx = offset + m * uniforms.N + n;
      output_q[outputIdx] = valueQ;
      output_k[outputIdx] = valueK;
      output_v[outputIdx] = valueV;
    }
  }`};return e.compute({name:"AttentionPrepare",shaderCache:{inputDependencies:["type","type","type"]},getRunData:()=>({outputs:[{dims:r,dataType:e.inputs[0].dataType,gpuDataType:0},{dims:r,dataType:e.inputs[0].dataType,gpuDataType:0},{dims:r,dataType:e.inputs[0].dataType,gpuDataType:0}],dispatchGroup:o,programUniforms:l}),getShaderSource:d},{inputs:u,outputs:[-1,-1,-1]})},cu=(e,t)=>{let r=Pa(e.inputs,t),[i,a,s]=Va(e,r);return It(e,i,a,s,e.inputs[4],void 0,void 0,void 0,e.inputs[5],r,t)}}),Na,La,Wa,fu,yp=T(()=>{Ce(),V(),W(),se(),G(),Na=(e,t)=>{if(!e||e.length!==5)throw new Error("BatchNormalization requires 5 inputs");let r=(i,a,s)=>{let n=a.length;if(n!==i.length)throw new Error(`${s}: num dimensions != ${n}`);a.forEach((o,u)=>{if(o!==i[u])throw new Error(`${s}: dim[${u}] do not match`)})};if(e[0].dims.length>1){let i=t.format==="NHWC"?t.spatial?e[0].dims.slice(-1):e[0].dims.slice(-1).concat(e[0].dims.slice(1,e[0].dims.length-1)):e[0].dims.slice(1,t.spatial?2:void 0);r(e[1].dims,i,"Invalid input scale"),r(e[2].dims,i,"Invalid input B"),r(e[3].dims,i,"Invalid input mean"),r(e[4].dims,i,"Invalid input var")}else r(e[1].dims,[1],"Invalid input scale"),r(e[2].dims,[1],"Invalid input B"),r(e[3].dims,[1],"Invalid input mean"),r(e[4].dims,[1],"Invalid input var")},La=(e,t)=>{let{epsilon:r,spatial:i,format:a}=t,s=e[0].dims,n=i?ae(s[s.length-1]):1,o=a==="NHWC"&&s.length>1?n:1,u=S.size(s)/n,l=i,d=l?s.length:s,p=I("x",e[0].dataType,e[0].dims,n),h=I("scale",e[1].dataType,e[1].dims,o),c=I("bias",e[2].dataType,e[2].dims,o),f=I("inputMean",e[3].dataType,e[3].dims,o),m=I("inputVar",e[4].dataType,e[4].dims,o),w=M("y",e[0].dataType,d,n),y=()=>{let _="";if(i)_=`let cOffset = ${s.length===1?"0u":a==="NHWC"?`outputIndices[${s.length-1}] / ${n}`:"outputIndices[1]"};`;else if(a==="NCHW")_=`
            ${w.indicesSet("outputIndices","0","0")}
            let cOffset = ${w.indicesToOffset("outputIndices")};`;else{_=`var cIndices = ${h.type.indices}(0);
                       cIndices[0] = outputIndices[${s.length-1}];`;for(let $=1;$<h.rank;$++)_+=`cIndices[${$}] = outputIndices[${$}];`;_+=`let cOffset = ${h.indicesToOffset("cIndices")};`}return _},g=_=>`
  const epsilon = ${r};
  ${_.registerUniform("outputSize","u32").declareVariables(p,h,c,f,m,w)}
  ${_.mainStart()}
  ${_.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
    var outputIndices = ${w.offsetToIndices(`global_idx * ${n}`)};
    ${y()}
    let scale = ${h.getByOffset("cOffset")};
    let bias = ${c.getByOffset("cOffset")};
    let inputMean = ${f.getByOffset("cOffset")};
    let inputVar = ${m.getByOffset("cOffset")};
    let x = ${p.getByOffset("global_idx")};
    let value = (x - inputMean) * inverseSqrt(inputVar + epsilon) * scale + bias;
    ${w.setByOffset("global_idx","value")}
  }`;return{name:"BatchNormalization",shaderCache:{hint:`${t.epsilon}_${t.format}_${i}_${n}`,inputDependencies:l?["rank","type","type","type","type"]:void 0},getShaderSource:g,getRunData:()=>({outputs:[{dims:e[0].dims,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(u/64)},programUniforms:l?[{type:12,data:u},...B(s)]:[{type:12,data:u}]})}},Wa=e=>te(e),fu=(e,t)=>{let{inputs:r,outputCount:i}=e,a=Wa({...t,outputCount:i});if(Y.webgpu.validateInputContent&&Na(r,a),t.trainingMode)throw new Error("BatchNormalization trainingMode is not supported yet.");e.compute(La(r,a))}}),Ga,Fa,mu,wp=T(()=>{W(),G(),Ga=e=>{if(e[0].dims.length!==3)throw new Error("input should have 3 dimensions");if(![320,640,1280].includes(e[0].dims[2]))throw new Error("number of channels should be 320, 640 or 1280");if(e[1].dims.length!==1)throw new Error("bias is expected to have 1 dimensions");if(e[0].dims[2]!==e[1].dims[0])throw new Error("last dimension of input and bias are not the same")},Fa=e=>{let t=e[0].dims,r=e[0].dims[2],i=S.size(t)/4,a=e[0].dataType,s=I("input",a,t,4),n=I("bias",a,[r],4),o=I("residual",a,t,4),u=M("output",a,t,4);return{name:"BiasAdd",getRunData:()=>({outputs:[{dims:t,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(i/64)}}),getShaderSource:l=>`
  const channels = ${r}u / 4;
  ${l.declareVariables(s,n,o,u)}

  ${l.mainStart()}
    ${l.guardAgainstOutOfBoundsWorkgroupSizes(i)}
    let value = ${s.getByOffset("global_idx")}
      + ${n.getByOffset("global_idx % channels")} + ${o.getByOffset("global_idx")};
    ${u.setByOffset("global_idx","value")}
  }`}},mu=e=>{Ga(e.inputs),e.compute(Fa(e.inputs))}}),Ha,K,gu,yu,wu,$u,_u,vu,bu,xu,ku,ja,Su,Iu,zu,Eu,_t,Tu,Gt,Cu,Au,Ru,Bu,Ou,Mu,Pu,Du,Uu,qu,Vu,Nu,Lu,Wu,Gu,Fu,wr,Hu,ti,ri,ju,Ku,Zu,Ka,Za,Qu,Ti=T(()=>{V(),W(),se(),G(),Ha=(e,t,r,i,a,s,n)=>{let o=Math.ceil(t/4),u="";typeof a=="string"?u=`${a}(a)`:u=a("a");let l=I("inputData",r,[o],4),d=M("outputData",i,[o],4),p=[{name:"vec_size",type:"u32"}];return n&&p.push(...n),`
      ${e.registerUniforms(p).declareVariables(l,d)}

  ${s??""}

  ${e.mainStart()}
    ${e.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.vec_size")}

    let a = ${l.getByOffset("global_idx")};
    ${d.setByOffset("global_idx",u)}
  }`},K=(e,t,r,i,a,s=e.dataType,n,o)=>{let u=[{type:12,data:Math.ceil(S.size(e.dims)/4)}];return n&&u.push(...n),{name:t,shaderCache:{hint:a,inputDependencies:["type"]},getShaderSource:l=>Ha(l,S.size(e.dims),e.dataType,s,r,i,o),getRunData:l=>({outputs:[{dims:e.dims,dataType:s}],dispatchGroup:{x:Math.ceil(S.size(l[0].dims)/64/4)},programUniforms:u})}},gu=e=>{e.compute(K(e.inputs[0],"Abs","abs"))},yu=e=>{e.compute(K(e.inputs[0],"Acos","acos"))},wu=e=>{e.compute(K(e.inputs[0],"Acosh","acosh"))},$u=e=>{e.compute(K(e.inputs[0],"Asin","asin"))},_u=e=>{e.compute(K(e.inputs[0],"Asinh","asinh"))},vu=e=>{e.compute(K(e.inputs[0],"Atan","atan"))},bu=e=>{e.compute(K(e.inputs[0],"Atanh","atanh"))},xu=e=>te(e),ku=(e,t)=>{let r;switch(t.to){case 10:r="vec4<f16>";break;case 1:r="vec4<f32>";break;case 12:r="vec4<u32>";break;case 6:r="vec4<i32>";break;case 9:r="vec4<bool>";break;default:throw new RangeError(`not supported type (specified in attribute 'to' from 'Cast' operator): ${t.to}`)}e.compute(K(e.inputs[0],"Cast",r,void 0,t.cacheKey,t.to))},ja=e=>{let t,r,i=e.length>=2&&e[1].data!==0,a=e.length>=3&&e[2].data!==0;switch(e[0].dataType){case 1:t=i?e[1].getFloat32Array()[0]:-34028234663852886e22,r=a?e[2].getFloat32Array()[0]:34028234663852886e22;break;case 10:t=i?e[1].getUint16Array()[0]:64511,r=a?e[2].getUint16Array()[0]:31743;break;default:throw new Error("Unsupport data type")}return te({min:t,max:r})},Su=(e,t)=>{let r=t||ja(e.inputs),i=ce(e.inputs[0].dataType);e.compute(K(e.inputs[0],"Clip",a=>`clamp(${a}, vec4<${i}>(uniforms.min), vec4<${i}>(uniforms.max))`,void 0,r.cacheKey,void 0,[{type:e.inputs[0].dataType,data:r.min},{type:e.inputs[0].dataType,data:r.max}],[{name:"min",type:i},{name:"max",type:i}]),{inputs:[0]})},Iu=e=>{e.compute(K(e.inputs[0],"Ceil","ceil"))},zu=e=>{e.compute(K(e.inputs[0],"Cos","cos"))},Eu=e=>{e.compute(K(e.inputs[0],"Cosh","cosh"))},_t=e=>te(e),Tu=(e,t)=>{let r=ce(e.inputs[0].dataType);e.compute(K(e.inputs[0],"Elu",i=>`elu_vf32(${i})`,`
  const elu_alpha_ = ${r}(${t.alpha});

  fn elu_f32(a: ${r}) -> ${r} {
  return select((exp(a) - 1.0) * elu_alpha_, a, a >= 0.0);
  }

  fn elu_vf32(v: vec4<${r}>) -> vec4<${r}> {
  return vec4(elu_f32(v.x), elu_f32(v.y), elu_f32(v.z), elu_f32(v.w));
  }`,t.cacheKey))},Gt=(e="f32")=>`
const r0: ${e} = 0.3275911;
const r1: ${e} = 0.254829592;
const r2: ${e} = -0.284496736;
const r3: ${e} = 1.421413741;
const r4: ${e} = -1.453152027;
const r5: ${e} = 1.061405429;

fn erf_vf32(v: vec4<${e}>) -> vec4<${e}> {
  let absv = abs(v);
  let x = 1.0 / (1.0 + r0 * absv);
  return sign(v) * (1.0 - ((((r5 * x + r4) * x + r3) * x + r2) * x + r1) * x * exp(-absv * absv));
}`,Cu=e=>{let t=ce(e.inputs[0].dataType);e.compute(K(e.inputs[0],"Erf",r=>`erf_vf32(${r})`,Gt(t)))},Au=e=>{e.compute(K(e.inputs[0],"Exp","exp"))},Ru=e=>{e.compute(K(e.inputs[0],"Floor","floor"))},Bu=e=>{let t=ce(e.inputs[0].dataType);e.compute(K(e.inputs[0],"Gelu",r=>`0.5 * ${r} * (1.0 + erf_vf32(${r} * 0.7071067811865475))`,Gt(t)))},Ou=(e,t)=>{let r=ce(e.inputs[0].dataType);e.compute(K(e.inputs[0],"LeakyRelu",i=>`select(leaky_relu_alpha_ * ${i}, ${i}, ${i} >= vec4<${r}>(0.0))`,`const leaky_relu_alpha_ = ${r}(${t.alpha});`,t.cacheKey))},Mu=e=>{e.compute(K(e.inputs[0],"Not",t=>`!${t}`))},Pu=e=>{e.compute(K(e.inputs[0],"Neg",t=>`-${t}`))},Du=e=>{e.compute(K(e.inputs[0],"Reciprocal",t=>`1.0/${t}`))},Uu=e=>{let t=ce(e.inputs[0].dataType);e.compute(K(e.inputs[0],"Relu",r=>`select(vec4<${t}>(0.0), ${r}, ${r} > vec4<${t}>(0.0))`))},qu=e=>{e.compute(K(e.inputs[0],"Sigmoid",t=>`(1.0 / (1.0 + exp(-${t})))`))},Vu=e=>te(e),Nu=(e,t)=>{let r=ce(e.inputs[0].dataType);e.compute(K(e.inputs[0],"HardSigmoid",i=>`max(vec4<${r}>(0.0), min(vec4<${r}>(1.0), ${t.alpha} * ${i} + vec4<${r}>(${t.beta})))`,void 0,t.cacheKey))},Lu=e=>{e.compute(K(e.inputs[0],"Sin","sin"))},Wu=e=>{e.compute(K(e.inputs[0],"Sinh","sinh"))},Gu=e=>{e.compute(K(e.inputs[0],"Sqrt","sqrt"))},Fu=e=>{e.compute(K(e.inputs[0],"Tan","tan"))},wr=e=>`sign(${e}) * (1 - exp(-2 * abs(${e}))) / (1 + exp(-2 * abs(${e})))`,Hu=e=>{e.compute(K(e.inputs[0],"Tanh",wr))},ti=(e="f32")=>`
const fast_gelu_a: ${e} = 0.5;
const fast_gelu_b: ${e} = 0.7978845608028654;
const fast_gelu_c: ${e} = 0.035677408136300125;

fn tanh_v(v: vec4<${e}>) -> vec4<${e}> {
  return ${wr("v")};
}
`,ri=e=>`(fast_gelu_a + fast_gelu_a * tanh_v(${e} * (fast_gelu_c * ${e} * ${e} + fast_gelu_b))) * ${e}`,ju=e=>{let t=ce(e.inputs[0].dataType);e.compute(K(e.inputs[0],"FastGelu",ri,ti(t),void 0,e.inputs[0].dataType))},Ku=(e,t)=>{let r=ce(e.inputs[0].dataType);return e.compute(K(e.inputs[0],"ThresholdedRelu",i=>`select(vec4<${r}>(0.0), ${i}, ${i} > thresholded_relu_alpha_)`,`const thresholded_relu_alpha_ = vec4<${r}>(${t.alpha});`,t.cacheKey)),0},Zu=e=>{e.compute(K(e.inputs[0],"Log","log"))},Ka=(e,t)=>`
const alpha = vec4<${e}>(${t});
const one = ${e}(1.0);
const zero = ${e}(0.0);

fn quick_gelu_impl(x: vec4<${e}>) -> vec4<${e}> {
  let v = x *alpha;
  var x1 : vec4<${e}>;
  for (var i = 0; i < 4; i = i + 1) {
    if (v[i] >= zero) {
      x1[i] = one / (one + exp(-v[i]));
    } else {
      x1[i] = one - one / (one + exp(v[i]));
    }
  }
  return x * x1;
}
`,Za=e=>`quick_gelu_impl(${e})`,Qu=(e,t)=>{let r=ce(e.inputs[0].dataType);e.compute(K(e.inputs[0],"QuickGelu",Za,Ka(r,t.alpha),t.cacheKey,e.inputs[0].dataType))}}),Qa,Xa,Xu,$p=T(()=>{W(),G(),Ti(),Qa=e=>{if(e[0].dims.length!==3)throw new Error("input should have 3 dimensions");if(![2560,5120,10240].includes(e[0].dims[2]))throw new Error("hidden state should be 2560, 5120 or 10240");if(e[1].dims.length!==1)throw new Error("bias is expected to have 1 dimensions");if(e[0].dims[2]!==e[1].dims[0])throw new Error("last dimension of input and bias are not the same")},Xa=e=>{let t=e[0].dims.slice();t[2]=t[2]/2;let r=I("input",e[0].dataType,e[0].dims,4),i=I("bias",e[0].dataType,[e[0].dims[2]],4),a=M("output",e[0].dataType,t,4),s=S.size(t)/4,n=ue(e[0].dataType);return{name:"BiasSplitGelu",getRunData:()=>({outputs:[{dims:t,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(s/64)}}),getShaderSource:o=>`
  const M_SQRT2 = sqrt(2.0);
  const halfChannels = ${e[0].dims[2]/4/2}u;

  ${o.declareVariables(r,i,a)}

  ${Gt(n)}

  ${o.mainStart()}
    ${o.guardAgainstOutOfBoundsWorkgroupSizes(s)}
    let biasIdx = global_idx % halfChannels;
    let batchIndex = global_idx / halfChannels;
    let inputOffset = biasIdx + batchIndex * halfChannels * 2;
    let valueLeft = input[inputOffset] + bias[biasIdx];
    let valueRight = input[inputOffset + halfChannels] + bias[biasIdx + halfChannels];
    let geluRight = valueRight * 0.5 * (erf_vf32(valueRight / M_SQRT2) + 1);

    ${a.setByOffset("global_idx","valueLeft * geluRight")}
  }`}},Xu=e=>{Qa(e.inputs),e.compute(Xa(e.inputs))}}),Ya,Ja,ze,Yu,Ju,el,tl,rl,il,al,nl,sl,ol,_p=T(()=>{V(),W(),G(),Ya=(e,t,r,i,a,s,n,o,u,l,d,p)=>{let h,c;typeof o=="string"?h=c=(g,_)=>`${o}((${g}),(${_}))`:typeof o=="function"?h=c=o:(h=o.scalar,c=o.vector);let f=M("outputData",d,i.length,4),m=I("aData",u,t.length,4),w=I("bData",l,r.length,4),y;if(a)if(s){let g=S.size(t)===1,_=S.size(r)===1,$=t.length>0&&t[t.length-1]%4===0,v=r.length>0&&r[r.length-1]%4===0;g||_?y=f.setByOffset("global_idx",c(g?`${m.type.value}(${m.getByOffset("0")}.x)`:m.getByOffset("global_idx"),_?`${w.type.value}(${w.getByOffset("0")}.x)`:w.getByOffset("global_idx"))):y=`
            let outputIndices = ${f.offsetToIndices("global_idx * 4u")};
            let offsetA = ${m.broadcastedIndicesToOffset("outputIndices",f)};
            let offsetB = ${w.broadcastedIndicesToOffset("outputIndices",f)};
            ${f.setByOffset("global_idx",c(n||$?m.getByOffset("offsetA / 4u"):`${m.type.value}(${m.getByOffset("offsetA / 4u")}[offsetA % 4u])`,n||v?w.getByOffset("offsetB / 4u"):`${w.type.value}(${w.getByOffset("offsetB / 4u")}[offsetB % 4u])`))}
          `}else y=f.setByOffset("global_idx",c(m.getByOffset("global_idx"),w.getByOffset("global_idx")));else{if(!s)throw new Error("no necessary to use scalar implementation for element-wise binary op implementation.");let g=(_,$,v="")=>{let k=`aData[indexA${$}][componentA${$}]`,b=`bData[indexB${$}][componentB${$}]`;return`
            let outputIndices${$} = ${f.offsetToIndices(`global_idx * 4u + ${$}u`)};
            let offsetA${$} = ${m.broadcastedIndicesToOffset(`outputIndices${$}`,f)};
            let offsetB${$} = ${w.broadcastedIndicesToOffset(`outputIndices${$}`,f)};
            let indexA${$} = offsetA${$} / 4u;
            let indexB${$} = offsetB${$} / 4u;
            let componentA${$} = offsetA${$} % 4u;
            let componentB${$} = offsetB${$} % 4u;
            ${_}[${$}] = ${v}(${h(k,b)});
          `};d===9?y=`
            var data = vec4<u32>(0);
            ${g("data",0,"u32")}
            ${g("data",1,"u32")}
            ${g("data",2,"u32")}
            ${g("data",3,"u32")}
            outputData[global_idx] = dot(vec4<u32>(0x1, 0x100, 0x10000, 0x1000000), vec4<u32>(data));`:y=`
            ${g("outputData[global_idx]",0)}
            ${g("outputData[global_idx]",1)}
            ${g("outputData[global_idx]",2)}
            ${g("outputData[global_idx]",3)}
          `}return`
        ${e.registerUniform("vec_size","u32").declareVariables(m,w,f)}

        ${p??""}

        ${e.mainStart()}
        ${e.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.vec_size")}
        ${y}
      }`},Ja=(e,t,r,i,a,s,n=r.dataType)=>{let o=!S.areEqual(r.dims,i.dims),u=r.dims,l=S.size(r.dims),d=!1,p=!1,h=[o];if(o){let c=ot.calcShape(r.dims,i.dims,!1);if(!c)throw new Error("Can't perform binary op on the given tensors");u=c,l=S.size(u);let f=S.size(r.dims)===1,m=S.size(i.dims)===1,w=r.dims.length>0&&r.dims[r.dims.length-1]%4===0,y=i.dims.length>0&&i.dims[i.dims.length-1]%4===0;h.push(f),h.push(m),h.push(w),h.push(y);let g=1;for(let _=1;_<u.length;_++){let $=r.dims[r.dims.length-_]??1,v=i.dims[i.dims.length-_]??1;if($===v)g*=$;else break}g%4===0?(p=!0,d=!0):(f||m||w||y)&&(d=!0)}else d=!0;return h.push(d),{name:e,shaderCache:{hint:t+h.map(c=>c.toString()).join("_"),inputDependencies:["rank","rank"]},getShaderSource:c=>Ya(c,r.dims,i.dims,u,d,o,p,a,r.dataType,i.dataType,n,s),getRunData:()=>({outputs:[{dims:u,dataType:n}],dispatchGroup:{x:Math.ceil(l/64/4)},programUniforms:[{type:12,data:Math.ceil(S.size(u)/4)},...B(r.dims,i.dims,u)]})}},ze=(e,t,r,i,a,s)=>{e.compute(Ja(t,a??"",e.inputs[0],e.inputs[1],r,i,s))},Yu=e=>{ze(e,"Add",(t,r)=>`${t}+${r}`)},Ju=e=>{ze(e,"Div",(t,r)=>`${t}/${r}`)},el=e=>{ze(e,"Equal",{scalar:(t,r)=>`u32(${t}==${r})`,vector:(t,r)=>`vec4<u32>(${t}==${r})`},void 0,void 0,9)},tl=e=>{ze(e,"Mul",(t,r)=>`${t}*${r}`)},rl=e=>{let t=I("input",e.inputs[0].dataType,e.inputs[0].dims).type.value;ze(e,"Pow",{scalar:(r,i)=>`pow_custom(${r},${i})`,vector:(r,i)=>`pow_vector_custom(${r},${i})`},`
    fn pow_custom(a : ${t}, b : ${t}) -> ${t} {
      if (b == ${t}(0.0)) {
        return ${t}(1.0);
      } else if (a < ${t}(0.0) && f32(b) != floor(f32(b))) {
        return ${t}(pow(f32(a), f32(b))); // NaN
      }
      return select(sign(a), ${t}(1.0), round(f32(abs(b) % ${t}(2.0))) != 1.0) * ${t}(${t==="i32"?"round":""}(pow(f32(abs(a)), f32(b))));
    }
    fn pow_vector_custom(a : vec4<${t}>, b : vec4<${t}>) -> vec4<${t}> {
      // TODO: implement vectorized pow
      return vec4<${t}>(pow_custom(a.x, b.x), pow_custom(a.y, b.y), pow_custom(a.z, b.z), pow_custom(a.w, b.w));
    }
      `)},il=e=>{ze(e,"Sub",(t,r)=>`${t}-${r}`)},al=e=>{ze(e,"Greater",{scalar:(t,r)=>`u32(${t}>${r})`,vector:(t,r)=>`vec4<u32>(${t}>${r})`},void 0,void 0,9)},nl=e=>{ze(e,"Less",{scalar:(t,r)=>`u32(${t}<${r})`,vector:(t,r)=>`vec4<u32>(${t}<${r})`},void 0,void 0,9)},sl=e=>{ze(e,"GreaterOrEqual",{scalar:(t,r)=>`u32(${t}>=${r})`,vector:(t,r)=>`vec4<u32>(${t}>=${r})`},void 0,void 0,9)},ol=e=>{ze(e,"LessOrEqual",{scalar:(t,r)=>`u32(${t}<=${r})`,vector:(t,r)=>`vec4<u32>(${t}<=${r})`},void 0,void 0,9)}}),en,tn,rn,an,ul,ll,vp=T(()=>{V(),W(),se(),G(),en=(e,t)=>{if(!e||e.length<1)throw new Error("too few inputs");let r=0,i=e[r],a=i.dataType,s=i.dims.length;e.forEach((n,o)=>{if(o!==r){if(n.dataType!==a)throw new Error("input tensors should be one type");if(n.dims.length!==s)throw new Error("input tensors should have the same shape");n.dims.forEach((u,l)=>{if(l!==t&&u!==i.dims[l])throw new Error("non concat dimensions must match")})}})},tn=(e,t)=>`
  fn calculateInputIndex(index: u32) -> u32 {
    let sizeInConcatAxis = array<u32, ${e}u>(${t});
    for (var i: u32 = 0u; i < ${e}; i += 1u ) {
      if (index < sizeInConcatAxis[i]) {
        return i;
      }
    }
    return ${e}u;
  }`,rn=(e,t)=>{let r=e.length,i=[];for(let a=0;a<r;++a){let s=t.setByOffset("global_idx",e[a].getByIndices("indices"));r===1?i.push(s):a===0?i.push(`if (inputIndex == ${a}u) { ${s} }`):a===r-1?i.push(`else { ${s} }`):i.push(`else if (inputIndex == ${a}) { ${s} }`)}return i.join(`
`)},an=(e,t,r,i)=>{let a=S.size(r),s=new Array(e.length),n=new Array(e.length),o=0,u=[],l=[],d=[{type:12,data:a}];for(let m=0;m<e.length;++m)o+=e[m].dims[t],s[m]=o,l.push(e[m].dims.length),n[m]=I(`input${m}`,i,l[m]),u.push("rank"),d.push({type:12,data:s[m]});for(let m=0;m<e.length;++m)d.push(...B(e[m].dims));d.push(...B(r));let p=M("output",i,r.length),h=p.indicesGet("indices",t),c=Array.from(Array(s.length).keys()).map(m=>`uniforms.sizeInConcatAxis${m}`).join(","),f=m=>`

  ${(()=>{m.registerUniform("outputSize","u32");for(let w=0;w<e.length;w++)m.registerUniform(`sizeInConcatAxis${w}`,"u32");return m.declareVariables(...n,p)})()}

  ${tn(s.length,c)}

  ${m.mainStart()}
    ${m.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}

    var indices = ${p.offsetToIndices("global_idx")};

    let inputIndex = calculateInputIndex(${h});
    if (inputIndex != 0u) {
      let sizeInConcatAxis = array<u32, ${s.length}u>(${c});
      ${h} -= sizeInConcatAxis[inputIndex - 1u];
    }

    ${rn(n,p)}
  }`;return{name:"Concat",shaderCache:{hint:`${t}`,inputDependencies:u},getRunData:()=>({outputs:[{dims:r,dataType:i}],dispatchGroup:{x:Math.ceil(a/64)},programUniforms:d}),getShaderSource:f}},ul=(e,t)=>{let r=e.inputs,i=r[0].dims,a=S.normalizeAxis(t.axis,i.length);en(r,a);let s=i.slice();s[a]=r.reduce((o,u)=>o+(u.dims.length>a?u.dims[a]:0),0);let n=r.filter(o=>S.size(o.dims)>0);e.compute(an(n,a,s,r[0].dataType),{inputs:n})},ll=e=>te({axis:e.axis})}),Le,We,Ge,Ci,He=T(()=>{V(),W(),Le=(e,t,r="f32")=>{switch(e.activation){case"Relu":return`value = max(value, ${t}(0.0));`;case"Sigmoid":return`value = (${t}(1.0) / (${t}(1.0) + exp(-value)));`;case"Clip":return`value = clamp(value, ${t}(${r}(uniforms.clip_min)), ${t}(${r}(uniforms.clip_max)));`;case"HardSigmoid":return`value = max(${t}(0.0), min(${t}(1.0), ${r}(uniforms.alpha) * value + ${r}(uniforms.beta)));`;case"LeakyRelu":return`value = select(${r}(uniforms.alpha) * value, value, value >= ${t}(0.0));`;case"Tanh":return`let e2x = exp(-2.0 * abs(value));
              value = sign(value) * (1.0 - e2x) / (1.0 + e2x);
        `;case"":return"";default:throw new Error(`Unsupported activation ${e.activation}`)}},We=(e,t)=>{e.activation==="Clip"?t.push({type:1,data:e.clipMax},{type:1,data:e.clipMin}):e.activation==="HardSigmoid"?t.push({type:1,data:e.alpha},{type:1,data:e.beta}):e.activation==="LeakyRelu"&&t.push({type:1,data:e.alpha})},Ge=(e,t)=>{e.activation==="Clip"?t.push({name:"clip_max",type:"f32"},{name:"clip_min",type:"f32"}):e.activation==="HardSigmoid"?t.push({name:"alpha",type:"f32"},{name:"beta",type:"f32"}):e.activation==="LeakyRelu"&&t.push({name:"alpha",type:"f32"})},Ci=e=>{let t=(e==null?void 0:e.activation)||"";if(t==="HardSigmoid"){let[r,i]=(e==null?void 0:e.activation_params)||[.2,.5];return{activation:t,alpha:r,beta:i}}else if(t==="Clip"){let[r,i]=(e==null?void 0:e.activation_params)||[Vo,No];return{activation:t,clipMax:i,clipMin:r}}else if(t==="LeakyRelu"){let[r]=(e==null?void 0:e.activation_params)||[.01];return{activation:t,alpha:r}}return{activation:t}}}),fe,Ai,rr=T(()=>{fe=(e,t)=>{switch(e){case 1:return t;case 2:return`vec2<${t}>`;case 3:return`vec3<${t}>`;case 4:return`vec4<${t}>`;default:throw new Error(`${e}-component is not supported.`)}},Ai=e=>`
      ${e?"value = value + getBiasByOutputCoords(coords);":""}
      `}),Ri,dl=T(()=>{Ri=e=>`
fn getIndexFromCoords4D(coords : vec4<i32>, shape : vec4<i32>) -> i32 {
  return dot(coords, vec4<i32>(
      shape.y * shape.z * shape.w, shape.z * shape.w, shape.w, 1));
}
fn getOutputIndexFromCoords(coords : vec4<i32>) -> i32 {
  return dot(coords, vec4<i32>(
    i32(${e}.x), i32(${e}.y), i32(${e}.z), 1));
}
`}),nn,sn,Qt,$r,on,Xt,un,Bi,ir=T(()=>{V(),W(),G(),He(),rr(),nn=(e,t)=>e?`
        mm_Asub[inputRow][inputCol] = mm_readA(batch,
          kStart + inputRow,
          globalRowStart / innerElementSize + inputCol${t?", batchIndices":""});
        `:`
        mm_Asub[inputRow][inputCol] = mm_readA(batch,
          globalRow + innerRow,
          kStart / innerElementSize + inputCol${t?", batchIndices":""});
        `,sn=(e,t)=>e?`
        let ACached0 = mm_Asub[k * innerElementSize][localRow];
        let ACached1 = mm_Asub[k * innerElementSize + 1][localRow];
        let ACached2 = mm_Asub[k * innerElementSize + 2][localRow];
        ${t===3?"":"let ACached3 = mm_Asub[k * innerElementSize + 3][localRow];"}
        for (var i = 0; i < rowPerThread; i = i + 1) {
          acc[i] = BCached0 * ACached0[i] + acc[i];
          acc[i] = BCached1 * ACached1[i] + acc[i];
          acc[i] = BCached2 * ACached2[i] + acc[i];
          ${t===3?"":"acc[i] = BCached3 * ACached3[i] + acc[i];"}
        }`:`
        for (var i = 0; i < rowPerThread; i = i + 1) {
          let ACached = mm_Asub[tileRow + i][k];
          acc[i] = BCached0 * ACached.x + acc[i];
          acc[i] = BCached1 * ACached.y + acc[i];
          acc[i] = BCached2 * ACached.z + acc[i];
          ${t===3?"":"acc[i] = BCached3 * ACached.w + acc[i];"}
        }`,Qt=(e,t,r="f32",i,a=!1,s=32,n=!1,o=32)=>{let u=t[1]*e[1],l=t[0]*e[0],d=a?u:s,p=a?s:u,h=d/t[0],c=s/t[1];if(!((a&&h===4&&e[1]===4||!a&&(h===3||h===4))&&d%t[0]===0&&s%t[1]===0&&e[0]===4))throw new Error(`If transposeA ${a} is true, innerElementSize ${h} and workPerThread[1] ${e[1]} must be 4.
      Otherwise, innerElementSize ${h} must be 3 or 4.
  tileAWidth ${d} must be divisible by workgroupSize[0]${t[0]}. tileInner ${s} must be divisible by workgroupSize[1] ${t[1]}. colPerThread ${e[0]} must be 4.`);return`
var<workgroup> mm_Asub: array<array<vec${h}<${r}>, ${d/h}>, ${p}>;
var<workgroup> mm_Bsub: array<array<vec4<${r}>, ${l/e[0]}>, ${s}>;

const rowPerThread = ${e[1]};
const colPerThread = ${e[0]};
const innerElementSize = ${h};
const tileInner = ${s};

@compute @workgroup_size(${t[0]}, ${t[1]}, ${t[2]})
fn main(@builtin(local_invocation_id) localId : vec3<u32>,
        @builtin(global_invocation_id) globalId : vec3<u32>,
        @builtin(workgroup_id) workgroupId : vec3<u32>) {
  let localRow = i32(localId.y);
  let tileRow = localRow * rowPerThread;
  let tileCol = i32(localId.x);

  let globalRow =i32(globalId.y) * rowPerThread;
  let globalCol = i32(globalId.x);
  let batch = ${n?"0":"i32(globalId.z)"};
  ${i?`let batchIndices = ${i.offsetToIndices("u32(batch)")};`:""}
  let globalRowStart = i32(workgroupId.y) * ${u};

  let num_tiles = ${n?`${Math.ceil(o/s)}`:"(uniforms.dim_inner - 1) / tileInner + 1"};
  var kStart = ${n?`i32(globalId.z) * ${o}`:"0"};

  var acc: array<vec4<${r}>, rowPerThread>;

  // Loop over shared dimension.
  let tileRowB = localRow * ${c};
  for (var t = 0; t < num_tiles; t = t + 1) {
      // Load one tile of A into local memory.
      for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
          let inputRow = tileRow + innerRow;
          let inputCol = tileCol;
          ${nn(a,i)}
      }

      // Load one tile of B into local memory.
      for (var innerRow = 0; innerRow < ${c}; innerRow = innerRow + 1) {
          let inputRow = tileRowB + innerRow;
          let inputCol = tileCol;
          mm_Bsub[inputRow][inputCol] = mm_readB(batch, kStart + inputRow, globalCol${i?", batchIndices":""});
      }
      kStart = kStart + tileInner;
      workgroupBarrier();

      // Compute acc values for a single thread.
      for (var k = 0; k < tileInner / innerElementSize; k = k + 1) {
          let BCached0 = mm_Bsub[k * innerElementSize][tileCol];
          let BCached1 = mm_Bsub[k * innerElementSize + 1][tileCol];
          let BCached2 = mm_Bsub[k * innerElementSize + 2][tileCol];
          ${h===3?"":"let BCached3 = mm_Bsub[k * innerElementSize + 3][tileCol];"}

          ${sn(a,h)}
      }

      workgroupBarrier();
  }

  for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
      mm_write(batch, globalRow + innerRow, globalCol, acc[innerRow]);
  }
}`},$r=(e,t)=>e?`
            mm_Asub[inputRow][inputCol] = mm_readA(batch,
              kStart + inputRow,
              globalRowStart + inputCol${t?", batchIndices":""});
            `:`
            mm_Asub[inputRow][inputCol] = mm_readA(batch,
              globalRowStart + inputRow,
              kStart + inputCol${t?", batchIndices":""});
            `,on=e=>e?"let ACached = mm_Asub[k][tileRow + innerRow];":"let ACached = mm_Asub[tileRow + innerRow][k];",Xt=(e,t,r="f32",i,a=!1,s=32,n=!1,o=32,u=!1)=>{let l=e[1]*t[1],d=e[0]*t[0],p=a?l:s,h=a?s:l;if(!(h%t[1]===0&&p%t[0]===0&&s%t[1]===0))throw new Error(`tileAHight ${h} must be divisible by workgroupSize[1]${t[1]}, tileAWidth ${p} must be divisible by workgroupSize[0]${t[0]}, tileInner ${s} must be divisible by workgroupSize[1]${t[1]}`);let c=h/t[1],f=p/t[0],m=s/t[1],w=u?`
    let localRow = i32(localId.y);
    let localCol = i32(localId.x);
    let globalRowStart = i32(workgroupId.y) * ${l};
    let globalColStart = i32(workgroupId.x) * ${d};

    // Loop over shared dimension.
    for (var t = 0; t < num_tiles; t = t + 1) {
      // Load one tile of A into local memory.
      for (var inputRow = localRow; inputRow < ${h}; inputRow = inputRow + ${t[1]}) {
        for (var inputCol = localCol; inputCol < ${p}; inputCol = inputCol + ${t[0]}) {
          ${$r(a,i)}
        }
      }
      // Load one tile of B into local memory.
      for (var inputRow = localRow; inputRow < ${s}; inputRow = inputRow + ${t[1]}) {
            for (var inputCol = localCol; inputCol < ${d}; inputCol = inputCol + ${t[0]}) {
          mm_Bsub[inputRow][inputCol] = mm_readB(batch,
            kStart + inputRow,
            globalColStart + inputCol${i?", batchIndices":""});
        }
      }
      kStart = kStart + tileInner;
      workgroupBarrier();

      // Compute acc values for a single thread.
      var BCached : array<${r}, colPerThread>;
      for (var k = 0; k < tileInner; k = k + 1) {
        for (var inner = 0; inner < colPerThread; inner = inner + 1) {
          BCached[inner] = mm_Bsub[k][localCol + inner * ${t[0]}];
        }
        for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
          let ACached = ${a?`mm_Asub[k][localRow + innerRow * ${t[1]}];`:`mm_Asub[localRow + innerRow * ${t[1]}][k];`}
          for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
            acc[innerRow][innerCol] = acc[innerRow][innerCol] +
                ACached * BCached[innerCol];
          }
        }
      }
      workgroupBarrier();
    }
    for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
      let gRow = globalRowStart + localRow + innerRow * ${t[1]};
      for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
        let gCol = globalColStart + localCol + innerCol * ${t[0]};
        mm_write(batch, gRow, gCol, acc[innerRow][innerCol]);
      }
    }
    `:`
let tileRow = i32(localId.y) * rowPerThread;
let tileCol = i32(localId.x) * colPerThread;

let globalRow = i32(globalId.y) * rowPerThread;
let globalCol = i32(globalId.x) * colPerThread;
let globalRowStart = i32(workgroupId.y) * ${l};

let tileRowA = i32(localId.y) * ${c};
let tileColA = i32(localId.x) * ${f};
let tileRowB = i32(localId.y) * ${m};
// Loop over shared dimension.
for (var t = 0; t < num_tiles; t = t + 1) {
  // Load one tile of A into local memory.
  for (var innerRow = 0; innerRow < ${c}; innerRow = innerRow + 1) {
    for (var innerCol = 0; innerCol < ${f}; innerCol = innerCol + 1) {
      let inputRow = tileRowA + innerRow;
      let inputCol = tileColA + innerCol;
      ${$r(a,i)}
    }
  }

  // Load one tile of B into local memory.
  for (var innerRow = 0; innerRow < ${m}; innerRow = innerRow + 1) {
    for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
      let inputRow = tileRowB + innerRow;
      let inputCol = tileCol + innerCol;
      mm_Bsub[inputRow][inputCol] = mm_readB(batch,
        kStart + inputRow,
        globalCol + innerCol${i?", batchIndices":""});
    }
  }
  kStart = kStart + tileInner;
  workgroupBarrier();

  // Compute acc values for a single thread.
  var BCached : array<${r}, colPerThread>;
  for (var k = 0; k < tileInner; k = k + 1) {
    for (var inner = 0; inner < colPerThread; inner = inner + 1) {
      BCached[inner] = mm_Bsub[k][tileCol + inner];
    }

    for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
      ${on(a)}
      for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
        acc[innerRow][innerCol] = acc[innerRow][innerCol] + ACached * BCached[innerCol];
      }
    }
  }

  workgroupBarrier();
}

for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
  for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
    mm_write(batch, globalRow + innerRow, globalCol + innerCol,
        acc[innerRow][innerCol]);
  }
}
`;return`
  var<workgroup> mm_Asub : array<array<${r}, ${p}>, ${h}>;
  var<workgroup> mm_Bsub : array<array<${r}, ${d}>, ${s}>;
  const rowPerThread = ${e[1]};
  const colPerThread = ${e[0]};
  const tileInner = ${s};

@compute @workgroup_size(${t[0]}, ${t[1]}, ${t[2]})
fn main(@builtin(local_invocation_id) localId : vec3<u32>,
        @builtin(global_invocation_id) globalId : vec3<u32>,
        @builtin(workgroup_id) workgroupId : vec3<u32>) {
    let batch = ${n?"0":"i32(globalId.z)"};
    ${i?`let batchIndices = ${i.offsetToIndices("u32(batch)")};`:""}
    let num_tiles = ${n?`${Math.ceil(o/s)}`:"(uniforms.dim_inner - 1) / tileInner + 1"};
    var kStart = ${n?`i32(globalId.z) * ${o}`:"0"};

    var acc : array<array<${r}, colPerThread>, rowPerThread>;
    ${w}
  }
`},un=(e,t,r,i,a,s=!1)=>{let[n,o,u]=a,[l,d,p,h]=i,c=St(n,u),f=St(o,u),m=ue(i[0].type.tensor),w=()=>{let g=d.rank,_=l.rank,$=`var aIndices: ${d.type.indices};`;for(let v=g-2-1,k=_-1;v>=0;v--,k--)$+=`
aIndices[${v}] = ${_>1?`batchIndices[${k}]`:"batchIndices"};`;return c.forEach(v=>{$+=`
aIndices[${v}] = 0;`}),$+=`
aIndices[${g-2}] = u32(row);
                   aIndices[${g-1}] = u32(colIn);`,$},y=()=>{let g=p.rank,_=l.rank,$=`var bIndices: ${p.type.indices};`;for(let v=g-2-1,k=_-1;v>=0;v--,k--)$+=`
bIndices[${v}] = ${_>1?`batchIndices[${k}]`:"batchIndices"};`;return f.forEach(v=>{$+=`
bIndices[${v}] = 0;`}),$+=`
bIndices[${g-2}] = u32(row);
                   bIndices[${g-1}] = u32(colIn);`,$};return`
    fn mm_readA(batch: i32, row: i32, colIn: i32, batchIndices: ${l.type.indices}) -> ${fe(e,m)} {
      var value = ${fe(e,m)}(0.0);
      let col = colIn * ${e};
      if(row < uniforms.dim_a_outer && col < uniforms.dim_inner)
      {
        ${w()}
        value = ${d.getByIndices("aIndices")};
      }
      return value;
    }

    fn mm_readB(batch: i32, row: i32, colIn: i32, batchIndices: ${l.type.indices}) -> ${fe(e,m)} {
      var value = ${fe(e,m)}(0.0);
      let col = colIn * ${e};
      if(row < uniforms.dim_inner && col < uniforms.dim_b_outer)
      {
        ${y()}
        value = ${p.getByIndices("bIndices")};
      }
      return value;
    }

    fn mm_write(batch: i32, row: i32, colIn: i32, valueIn: ${fe(e,m)}) {
      let col = colIn * ${e};
      if (row < uniforms.dim_a_outer && col < uniforms.dim_b_outer) {
        var value = valueIn;
        let coords = vec3<i32>(batch, row, colIn);
        ${t?`value = value + ${s?"bias[colIn]":`${fe(e,m)}(bias[row])`};`:""}
        ${r}
        ${h.setByIndices("vec3<u32>(coords)","value")}
      }
    }
    `},Bi=(e,t,r,i,a=!1,s)=>{let n=e[0].dims,o=e[1].dims,u=n.slice(0,-2),l=o.slice(0,-2),d=i?i.slice(0,-2):r.slice(0,-2),p=S.size(d),h=n[n.length-2],c=n[n.length-1],f=o[o.length-1],m=c%4===0&&f%4===0,w=h<=8?[4,1,1]:[4,4,1],y=[8,8,1],g=[Math.ceil(f/y[0]/w[0]),Math.ceil(h/y[1]/w[1]),Math.ceil(p/y[2]/w[2])],_=m?4:1,$=[...u,h,c/_],v=$.length,k=[...l,c,f/_],b=k.length,E=[p,h,f/_],C=[{type:6,data:h},{type:6,data:f},{type:6,data:c}];We(t,C),C.push(...B(d,$,k));let A=["rank","rank"],q=e.length>2;q&&(C.push(...B(e[2].dims)),A.push("rank")),C.push(...B(E));let P=L=>{let F=d.length,Q=Ii("batchDims",e[0].dataType,F,1),Z=ue(e[0].dataType),N=I("a",e[0].dataType,v,_),R=I("b",e[1].dataType,b,_),U=M("result",e[0].dataType,E.length,_),H=[N,R];if(q){let X=a?_:1;H.push(I("bias",e[2].dataType,e[2].dims.length,X))}let x=[{name:"dim_a_outer",type:"i32"},{name:"dim_b_outer",type:"i32"},{name:"dim_inner",type:"i32"}];Ge(t,x);let z=ue(U.type.tensor),D=Le(t,U.type.value,z),j=un(_,q,D,[Q,N,R,U],[u,l,d],a);return`
  ${L.registerUniforms(x).registerInternalVariables(Q).declareVariables(...H,U)}
  ${j}
  ${m?Qt(w,y,Z,Q):Xt(w,y,Z,Q)}
                   `};return{name:"MatMul",shaderCache:{hint:`${w};${t.activation};${m};${a}`,inputDependencies:A},getRunData:()=>({outputs:[{dims:s?s(r):r,dataType:e[0].dataType}],dispatchGroup:{x:g[0],y:g[1],z:g[2]},programUniforms:C}),getShaderSource:P}}}),ln,pl,bp=T(()=>{V(),Me(),G(),He(),rr(),dl(),ir(),ln=(e,t,r,i,a=!1,s,n=4,o=4,u=4,l="f32")=>{let d=C=>{switch(C){case 1:return"resData = x[xIndex];";case 3:return`resData = vec3<${l}>(x[xIndex], x[xIndex + 1], x[xIndex + 2]);`;case 4:return"resData = x[xIndex / 4];";default:throw new Error(`innerElementSize ${C} is not supported.`)}},p=C=>{switch(C){case 1:return"return w[row * i32(uniforms.w_shape[3]) + colIn];";case 4:return"return w[row * i32(uniforms.w_shape[3]) / 4 + colIn];";default:throw new Error(`innerElementSize ${C} is not supported.`)}},h=e?`
    let coord = vec4<i32>(batch, xRow, xCol, xCh);
    `:`
    let coord = vec4<i32>(batch, xCh, xRow, xCol);
    `,c=e?`
    let coords = vec4<i32>(
      batch,
      row / outWidth,
      row % outWidth,
      col);
    `:`
    let coords = vec4<i32>(
      batch,
      row,
      col / outWidth,
      col % outWidth);
    `,f=e?"i32(uniforms.x_shape[1])":"i32(uniforms.x_shape[2])",m=e?"i32(uniforms.x_shape[2])":"i32(uniforms.x_shape[3])",w=e?"row":"col",y=e?"col":"row",g=`
    let inChannels = i32(uniforms.w_shape[2]);
    let outWidth = ${e?"i32(uniforms.result_shape[2])":"i32(uniforms.result_shape[3])"};
    let outRow = ${w} / outWidth;
    let outCol = ${w} % outWidth;

    let WRow = ${y} / (i32(uniforms.w_shape[1]) * inChannels);
    let WCol = ${y} / inChannels % i32(uniforms.w_shape[1]);
    let xRow = outRow * uniforms.stride[0] + uniforms.dilation[0] * WRow - uniforms.pad[0];
    let xCol = outCol * uniforms.stride[1] + uniforms.dilation[1] * WCol - uniforms.pad[1];
    let xCh = ${y} % inChannels;
    var resData = ${fe(n,l)}(0.0);
    // The bounds checking is always needed since we use it to pad zero for
    // the 'same' padding type.
    if (xRow >= 0 && xRow < ${f} && xCol >= 0 && xCol < ${m}) {
      ${h}
      let xIndex = getIndexFromCoords4D(coord, vec4<i32>(uniforms.x_shape));
      ${d(n)}
    }
    return resData;`,_=e?t&&i?`
    let col = colIn * ${n};
    ${g}`:`
    let col = colIn * ${n};
    if (row < uniforms.dim_a_outer && col < uniforms.dim_inner) {
      ${g}
    }
    return ${fe(n,l)}(0.0);`:i&&r?`
    let col = colIn * ${n};
    ${g}`:`
    let col = colIn * ${n};
    if (row < uniforms.dim_inner && col < uniforms.dim_b_outer) {
      ${g}
    }
    return ${fe(n,l)}(0.0);`,$=`${p(o)}`,v=fe(u,l),k=fe(e?n:o,l),b=fe(e?o:n,l),E=Le(s,v,l);return`
    fn mm_readA(batch: i32, row : i32, colIn : i32) -> ${k} {
      ${e?_:$}
    }

    fn mm_readB(batch: i32, row : i32, colIn : i32) -> ${b} {
      ${e?$:_}
    }

    fn mm_write(batch: i32, row : i32, colIn : i32, valueIn : ${v}) {
      let col = colIn * ${u};
      if (row < uniforms.dim_a_outer && col < uniforms.dim_b_outer)
      {
      var value = valueIn;
      let outWidth = ${e?"i32(uniforms.result_shape[2])":"i32(uniforms.result_shape[3])"};
      ${c}
      ${Ai(a)}
      ${E}
      setOutputAtCoords(coords[0], coords[1], coords[2], coords[3], value);
      }
    }`},pl=(e,t,r,i,a,s,n,o,u)=>{let l=t.format==="NHWC",d=l?e[0].dims[3]:e[0].dims[1],p=r[0],h=l?r[2]:r[3],c=l?r[1]:r[2],f=l?r[3]:r[1],m=l&&(d%4===0||d%3===0)&&f%4===0,w=l?f:h*c,y=l?h*c:f,g=[8,8,1],_=i<=8?[4,1,1]:[4,4,1],$=[Math.ceil(w/g[0]/_[0]),Math.ceil(y/g[1]/_[1]),Math.ceil(p/g[2]/_[2])];J("verbose",()=>`[conv2d_mm_webgpu] dispatch = ${$}`);let v=m?l&&d%4!==0?3:4:1,k=g[1]*_[1],b=g[0]*_[0],E=Math.max(g[0]*v,g[1]),C=i%k===0,A=a%b===0,q=s%E===0,P=m?[v,4,4]:[1,1,1],L=[{type:6,data:i},{type:6,data:a},{type:6,data:s},{type:6,data:[t.pads[0],t.pads[1]]},{type:6,data:t.strides},{type:6,data:t.dilations}];We(t,L),L.push(...B(e[0].dims,e[1].dims));let F=["rank","rank"];n&&(L.push(...B(e[2].dims)),F.push("rank")),L.push(...B(r));let Q=Z=>{let N=[{name:"dim_a_outer",type:"i32"},{name:"dim_b_outer",type:"i32"},{name:"dim_inner",type:"i32"},{name:"pad",type:"i32",length:2},{name:"stride",type:"i32",length:2},{name:"dilation",type:"i32",length:2}];Ge(t,N);let R=m?4:1,U=ue(e[0].dataType),H=`
      fn setOutputAtIndex(flatIndex : i32, value : ${m?`vec4<${U}>`:U}) {
        result[flatIndex] = ${m?`vec4<${U}>`:U}(value);
      }
      fn setOutputAtCoords(d0 : i32, d1 : i32, d2 : i32, d3 : i32, value : ${m?`vec4<${U}>`:U}) {
        let flatIndex = getOutputIndexFromCoords(vec4<i32>(d0, d1, d2, d3));
        setOutputAtIndex(flatIndex ${m?"/ 4":""}, value);
      }`,x=I("x",e[0].dataType,e[0].dims.length,v===3?1:v),z=I("w",e[1].dataType,e[1].dims.length,R),D=[x,z],j=M("result",e[0].dataType,r.length,R);if(n){let X=I("bias",e[2].dataType,e[2].dims.length,R);D.push(X),H+=`
        fn getBiasByOutputCoords(coords : vec4<i32>) -> ${m?`vec4<${U}>`:U} {
          return bias[coords.${l?"w":"y"}${m?"/ 4":""}];
        }`}return`
        ${Ri("uniforms.result_strides")}
        //struct Uniforms { xShape : vec4<i32>, wShape : vec4<i32>, outShape : vec4<i32>,
        //  outShapeStrides: vec3<i32>, filterDims : vec2<i32>, pad : vec2<i32>, stride : vec2<i32>,
        //  dilation : vec2<i32>, dimAOuter : i32, dimBOuter : i32, dimInner : i32 };
        ${Z.registerUniforms(N).declareVariables(...D,j)}
        ${H}
        ${ln(l,C,A,q,n,t,P[0],P[1],P[2],U)}
        ${m?Qt(_,g,U,void 0,!l,E):Xt(_,g,U,void 0,!l,E,!1,void 0,o)}`};return{name:"Conv2DMatMul",shaderCache:{hint:`${t.cacheKey};${v};${m};${C};${A};${q};${k};${b};${E}`,inputDependencies:F},getRunData:()=>({outputs:[{dims:u?u(r):r,dataType:e[0].dataType}],dispatchGroup:{x:$[0],y:$[1],z:$[2]},programUniforms:L}),getShaderSource:Q}}}),dn,_r,pt,pn,vr,hn,hl,cl,xp=T(()=>{V(),Me(),W(),G(),He(),rr(),dn=e=>{let t=1;for(let r=0;r<e.length;r++)t*=e[r];return t},_r=e=>typeof e=="number"?[e,e,e]:e,pt=(e,t)=>t<=1?e:e+(e-1)*(t-1),pn=(e,t,r,i=1)=>{let a=pt(t,i);return Math.floor((e[0]*(r-1)-r+a)/2)},vr=(e,t,r,i,a)=>{a==null&&(a=pn(e,t[0],i[0]));let s=[0,0,0,r];for(let n=0;n<3;n++)e[n]+2*a>=t[n]&&(s[n]=Math.trunc((e[n]-t[n]+2*a)/i[n]+1));return s},hn=(e,t,r,i,a,s,n,o,u,l)=>{let d,p,h,c;if(e==="VALID"&&(e=0),typeof e=="number"){d={top:e,bottom:e,left:e,right:e,front:e,back:e};let f=vr([t,r,i,1],[o,u,l],1,[a,s,n],e);p=f[0],h=f[1],c=f[2]}else if(Array.isArray(e)){if(!e.every((m,w,y)=>m===y[0]))throw Error(`Unsupported padding parameter: ${e}`);d={top:e[0],bottom:e[1],left:e[2],right:e[3],front:e[4],back:e[5]};let f=vr([t,r,i,1],[o,u,l],1,[a,s,n],e[0]);p=f[0],h=f[1],c=f[2]}else if(e==="SAME_UPPER"){p=Math.ceil(t/a),h=Math.ceil(r/s),c=Math.ceil(i/n);let f=(p-1)*a+o-t,m=(h-1)*s+u-r,w=(c-1)*n+l-i,y=Math.floor(f/2),g=f-y,_=Math.floor(m/2),$=m-_,v=Math.floor(w/2),k=w-v;d={top:_,bottom:$,left:v,right:k,front:y,back:g}}else throw Error(`Unknown padding parameter: ${e}`);return{padInfo:d,outDepth:p,outHeight:h,outWidth:c}},hl=(e,t,r,i,a,s=!1,n="channelsLast")=>{let o,u,l,d,p;if(n==="channelsLast")[o,u,l,d,p]=e;else if(n==="channelsFirst")[o,p,u,l,d]=e;else throw new Error(`Unknown dataFormat ${n}`);let[h,,c,f,m]=t,[w,y,g]=_r(r),[_,$,v]=_r(i),k=pt(c,_),b=pt(f,$),E=pt(m,v),{padInfo:C,outDepth:A,outHeight:q,outWidth:P}=hn(a,u,l,d,w,y,g,k,b,E),L=s?h*p:h,F=[0,0,0,0,0];return n==="channelsFirst"?F=[o,L,A,q,P]:n==="channelsLast"&&(F=[o,A,q,P,L]),{batchSize:o,dataFormat:n,inDepth:u,inHeight:l,inWidth:d,inChannels:p,outDepth:A,outHeight:q,outWidth:P,outChannels:L,padInfo:C,strideDepth:w,strideHeight:y,strideWidth:g,filterDepth:c,filterHeight:f,filterWidth:m,effectiveFilterDepth:k,effectiveFilterHeight:b,effectiveFilterWidth:E,dilationDepth:_,dilationHeight:$,dilationWidth:v,inShape:e,outShape:F,filterShape:t}},cl=(e,t,r,i,a,s)=>{let n=s==="channelsLast";n?e[0].dims[3]:e[0].dims[1];let o=[64,1,1],u={x:r.map((w,y)=>y)},l=[Math.ceil(dn(u.x.map(w=>r[w]))/o[0]),1,1];J("verbose",()=>`[conv3d_naive_webgpu] dispatch = ${l}`);let d=1,p=S.size(r),h=[{type:12,data:p},{type:12,data:i},{type:12,data:a},{type:12,data:t.strides},{type:12,data:t.dilations}];We(t,h),h.push(...B(e[0].dims,e[1].dims));let c=["rank","rank"],f=e.length===3;f&&(h.push(...B(e[2].dims)),c.push("rank")),h.push(...B(r));let m=w=>{let y=[{name:"output_size",type:"u32"},{name:"filter_dims",type:"u32",length:i.length},{name:"pads",type:"u32",length:a.length},{name:"strides",type:"u32",length:t.strides.length},{name:"dilations",type:"u32",length:t.dilations.length}];Ge(t,y);let g=1,_=ue(e[0].dataType),$=I("x",e[0].dataType,e[0].dims.length,d),v=I("W",e[1].dataType,e[1].dims.length,g),k=[$,v],b=M("result",e[0].dataType,r.length,g),E="";if(f){let q=I("bias",e[2].dataType,e[2].dims.length,g);k.push(q),E+=`
        fn getBiasByOutputCoords(coords : array<u32, 5>) -> ${_} {
          return bias[${n?O("coords",4,5):O("coords",1,5)}];
        }`}let C=fe(d,_),A=Le(t,C,_);return`
            ${E}
            fn getX(d0 : u32, d1 : u32, d2 : u32, d3 : u32, d4 : u32) -> f32 {
              let aIndices = array<u32, 5>(d0, d1, d2, d3, d4);
              return ${$.getByIndices("aIndices")};
            }
            fn getW(d0 : u32, d1 : u32, d2 : u32, d3 : u32, d4 : u32) -> f32 {
              let aIndices = array<u32, 5>(d0, d1, d2, d3, d4);
              return ${v.getByIndices("aIndices")};
            }
          ${w.registerUniforms(y).declareVariables(...k,b)}
          ${w.mainStart()}
          ${w.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
              let coords = ${b.offsetToIndices("global_idx")};
              let batch = ${O("coords",0,$.rank)};
              let d2 = ${n?O("coords",$.rank-1,$.rank):O("coords",1,$.rank)};
              let xFRCCorner = vec3<u32>(${n?O("coords",1,$.rank):O("coords",2,$.rank)},
              ${n?O("coords",2,$.rank):O("coords",3,$.rank)},
              ${n?O("coords",3,$.rank):O("coords",4,$.rank)}) * uniforms.strides - uniforms.pads;
              let xFCorner = xFRCCorner.x;
              let xRCorner = xFRCCorner.y;
              let xCCorner = xFRCCorner.z;
              let xShapeY = ${n?O("uniforms.x_shape",1,$.rank):O("uniforms.x_shape",2,$.rank)};
              let xShapeZ = ${n?O("uniforms.x_shape",2,$.rank):O("uniforms.x_shape",3,$.rank)};
              let xShapeW = ${n?O("uniforms.x_shape",3,$.rank):O("uniforms.x_shape",4,$.rank)};
              let xShapeU = ${n?O("uniforms.x_shape",4,$.rank):O("uniforms.x_shape",1,$.rank)};
              let inputDepthNearestVec4 = (xShapeU / 4) * 4;
              let inputDepthVec4Remainder = xShapeU % 4;

              var value = 0.0;
              for (var wF = 0u; wF < uniforms.filter_dims[0]; wF++) {
                let xF = xFCorner + wF * uniforms.dilations[0];
                if (xF < 0 || xF >= xShapeY) {
                  continue;
                }

                for (var wR = 0u; wR < uniforms.filter_dims[1]; wR++) {
                  let xR = xRCorner + wR * uniforms.dilations[1];
                  if (xR < 0 || xR >= xShapeZ) {
                    continue;
                  }

                  for (var wC = 0u; wC < uniforms.filter_dims[2]; wC++) {
                    let xC = xCCorner + wC * uniforms.dilations[2];
                    if (xC < 0 || xC >= xShapeW) {
                      continue;
                    }

                    for (var d1 = 0u; d1 < inputDepthNearestVec4; d1 += 4) {
                      ${n?`let xValues = vec4<f32>(
                               getX(batch, xF, xR, xC, d1),
                               getX(batch, xF, xR, xC, d1 + 1),
                               getX(batch, xF, xR, xC, d1 + 2),
                               getX(batch, xF, xR, xC, d1 + 3));
                            `:`let xValues = vec4<f32>(
                               getX(batch, d1, xF, xR, xC),
                               getX(batch, d1 + 1, xF, xR, xC),
                               getX(batch, d1 + 2, xF, xR, xC),
                               getX(batch, d1 + 3, xF, xR, xC));
                            `}
                            let wValues = vec4<f32>(
                              getW(d2, d1, wF, wR, wC),
                              getW(d2, d1 + 1, wF, wR, wC),
                              getW(d2, d1 + 2, wF, wR, wC),
                              getW(d2, d1 + 3, wF, wR, wC));
                      value += dot(xValues, wValues);
                    }
                    if (inputDepthVec4Remainder == 1) {
                        ${n?`value += getX(batch, xF, xR, xC, inputDepthNearestVec4)
                          * getW(d2, inputDepthNearestVec4, wF, wR, wC);`:`value += getX(batch, inputDepthNearestVec4, xF, xR, xC)
                          * getW(d2, inputDepthNearestVec4, wF, wR, wC);`}
                    } else if (inputDepthVec4Remainder == 2) {
                      ${n?`let xValues = vec2<f32>(
                        getX(batch, xF, xR, xC, inputDepthNearestVec4),
                        getX(batch, xF, xR, xC, inputDepthNearestVec4 + 1));
                      `:`let xValues = vec2<f32>(
                        getX(batch, inputDepthNearestVec4, xF, xR, xC),
                        getX(batch, inputDepthNearestVec4 + 1, xF, xR, xC));
                    `}
                    let wValues = vec2<f32>(
                      getW(d2, inputDepthNearestVec4, wF, wR, wC),
                      getW(d2, inputDepthNearestVec4 + 1, wF, wR, wC));
                      value += dot(xValues, wValues);
                    } else if (inputDepthVec4Remainder == 3) {
                      ${n?`let xValues = vec3<f32>(
                        getX(batch, xF, xR, xC, inputDepthNearestVec4),
                        getX(batch, xF, xR, xC, inputDepthNearestVec4 + 1),
                        getX(batch, xF, xR, xC, inputDepthNearestVec4 + 2));
                      `:`let xValues = vec3<f32>(
                        getX(batch, inputDepthNearestVec4, xF, xR, xC),
                        getX(batch, inputDepthNearestVec4 + 1, xF, xR, xC),
                        getX(batch, inputDepthNearestVec4 + 2, xF, xR, xC));
                    `}
                    let wValues = vec3<f32>(
                      getW(d2, inputDepthNearestVec4, wF, wR, wC),
                      getW(d2, inputDepthNearestVec4 + 1, wF, wR, wC),
                      getW(d2, inputDepthNearestVec4 + 2, wF, wR, wC));
                      value += dot(xValues, wValues);
                    }
                  }
                }
              }
              ${f?"value = value + getBiasByOutputCoords(coords)":""};
              ${A}
              result[global_idx] = f32(value);
          }`};return{name:"Conv3DNaive",shaderCache:{hint:`${t.cacheKey};${n};${d};${f}`,inputDependencies:c},getRunData:()=>({outputs:[{dims:r,dataType:e[0].dataType}],dispatchGroup:{x:l[0],y:l[1],z:l[2]},programUniforms:h}),getShaderSource:m}}}),fl,ml,kp=T(()=>{V(),W(),G(),He(),fl=(e,t,r,i)=>{let a=e.length>2,s=a?"value += b[output_channel];":"",n=e[0].dims,o=e[1].dims,u=t.format==="NHWC",l=u?r[3]:r[1],d=l/t.group,p=u&&d>=4?ae(l):1,h=S.size(r)/p,c=[{type:12,data:h},{type:12,data:t.dilations},{type:12,data:[t.strides[0],t.strides[1]]},{type:12,data:[t.pads[0],t.pads[1]]},{type:12,data:d}];We(t,c),c.push(...B(n,[o[0],o[1],o[2],o[3]/p]));let f=a?["rank","rank","rank"]:["rank","rank"];c.push(...B([r[0],r[1],r[2],r[3]/p]));let m=w=>{let y=M("output",e[0].dataType,r.length,p),g=ue(y.type.tensor),_=Le(t,y.type.value,g),$=I("x",e[0].dataType,n.length),v=I("w",e[1].dataType,o.length,p),k=[$,v];a&&k.push(I("b",e[2].dataType,e[2].dims,p));let b=[{name:"output_size",type:"u32"},{name:"dilations",type:"u32",length:t.dilations.length},{name:"strides",type:"u32",length:2},{name:"pads",type:"u32",length:2},{name:"output_channels_per_group",type:"u32"}];Ge(t,b);let E=u?`
      for (var wHeight: u32 = 0u; wHeight < uniforms.w_shape[0]; wHeight++) {
        let xHeight = xRCCorner.x + wHeight * uniforms.dilations[0];

        if (xHeight < 0u || xHeight >= uniforms.x_shape[1]) {
          continue;
        }

        for (var wWidth: u32 = 0u; wWidth < uniforms.w_shape[1]; wWidth++) {
          let xWidth = xRCCorner.y + wWidth * uniforms.dilations[1];
          if (xWidth < 0u || xWidth >= uniforms.x_shape[2]) {
            continue;
          }

          for (var wInChannel: u32 = 0u; wInChannel < uniforms.w_shape[2]; wInChannel++) {
            let input_channel = in_channel_offset + wInChannel;
            let xVal = ${$.get("batch","xHeight","xWidth","input_channel")};
            let wVal = ${v.get("wHeight","wWidth","wInChannel","output_channel")};
            value += xVal * wVal;
          }
        }
      }
      `:`
      for (var wInChannel: u32 = 0u; wInChannel < uniforms.w_shape[1]; wInChannel++) {
        let input_channel = in_channel_offset + wInChannel;
        for (var wHeight: u32 = 0u; wHeight < uniforms.w_shape[2]; wHeight++) {
          let xHeight = xRCCorner.x + wHeight * uniforms.dilations[0];

          if (xHeight < 0u || xHeight >= uniforms.x_shape[2]) {
            continue;
          }

          for (var wWidth: u32 = 0u; wWidth < uniforms.w_shape[3]; wWidth++) {
            let xWidth = xRCCorner.y + wWidth * uniforms.dilations[1];
            if (xWidth < 0u || xWidth >= uniforms.x_shape[3]) {
              continue;
            }

            let xVal = ${$.get("batch","input_channel","xHeight","xWidth")};
            let wVal = ${v.get("output_channel","wInChannel","wHeight","wWidth")};
            value += xVal * wVal;
          }
        }
      }
      `;return`
  ${w.registerUniforms(b).declareVariables(...k,y)}

  ${w.mainStart()}
    ${w.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}

    let outputIndices = ${y.offsetToIndices("global_idx")};
    let batch: u32 = outputIndices[0];
    let output_channel: u32 = outputIndices[${u?3:1}];
    let xRCCorner: vec2<u32> = vec2<u32>(outputIndices[${u?1:2}], outputIndices[${u?2:3}]) * uniforms.strides - uniforms.pads;
    let group_id: u32 = output_channel * ${p} / uniforms.output_channels_per_group;
    var in_channel_offset = group_id * uniforms.w_shape[${u?2:1}];

    var value: ${y.type.value} = ${y.type.value}(0);
    ${E}
    ${s}
    ${_}
    ${y.setByOffset("global_idx","value")}
  }`};return{name:"GroupedConv",shaderCache:{hint:`${t.cacheKey}_${p}`,inputDependencies:f},getRunData:()=>({outputs:[{dims:i?i(r):r,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(h/64)},programUniforms:c}),getShaderSource:m}},ml=(e,t,r,i)=>{let a=e.length>2,s=ae(r[3]),n=ae(r[2]),o=S.size(r)/s/n,u=[e[0].dims[0],e[0].dims[1],e[0].dims[2],e[0].dims[3]/s],l=[e[1].dims[0],e[1].dims[1],e[1].dims[2],e[1].dims[3]/s],d=[r[0],r[1],r[2],r[3]/s],p=[{type:12,data:o},{type:6,data:[t.strides[0],t.strides[1]]},{type:6,data:[t.pads[0],t.pads[1]]}];We(t,p),p.push(...B(u,l,d));let h=(n-1)*t.strides[1]+l[1],c=f=>{let m=M("output",e[0].dataType,d.length,s),w=ue(m.type.tensor),y=Le(t,m.type.value,w),g=I("x",e[0].dataType,u.length,s),_=I("w",e[1].dataType,l.length,s),$=[g,_];a&&$.push(I("b",e[2].dataType,e[2].dims,s));let v=a?"value += b[output_channel];":"",k=[{name:"output_size",type:"u32"},{name:"strides",type:"i32",length:2},{name:"pads",type:"i32",length:2}];return Ge(t,k),`
  ${f.registerUniforms(k).declareVariables(...$,m)}
  ${f.mainStart()}
    ${f.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    let width0 = uniforms.output_shape[3];
    let output_channel = global_idx % width0;
    var index1 = global_idx / width0;
    let width1 = uniforms.output_shape[2] / ${n}u;
    let col = (index1 % width1) * ${n}u;
    index1 = index1 / width1;
    let row = index1 % uniforms.output_shape[1];
    let batch = index1 / uniforms.output_shape[1];

    let x_corner = vec2<i32>(i32(row), i32(col)) * uniforms.strides - uniforms.pads;

    var x_vals: array<${g.type.value}, ${h}>;
    var values: array<${m.type.value}, ${n}>;
    let input_channel = output_channel;
    // Use constant instead of uniform can give better performance for w's height/width.
    for (var w_height: u32 = 0u; w_height < ${l[0]}; w_height++) {
      let x_height = x_corner.x + i32(w_height);
      if (x_height >= 0 && u32(x_height) < uniforms.x_shape[1]) {
        for (var i = 0; i < ${h}; i++) {
          let x_width = x_corner.y + i;
          if (x_width >= 0 && u32(x_width) < uniforms.x_shape[2]) {
            x_vals[i] = ${g.get("batch","u32(x_height)","u32(x_width)","input_channel")};
          } else {
            x_vals[i] = ${g.type.value}(0);
          }
        }
        for (var w_width: u32 = 0u; w_width < ${l[1]}; w_width++) {
          let w_val = ${_.get("w_height","w_width","0","output_channel")};
          for (var i = 0u; i < ${n}u; i++) {
            values[i] = fma(x_vals[i * u32(uniforms.strides[1]) + w_width], w_val, values[i]);
          }
        }
      }
    }

    for (var i = 0u; i < ${n}u; i++) {
      var value = values[i];
      ${v}
      ${y}
      ${m.set("batch","row","col + i","output_channel","value")};
    }
  }`};return{name:"GroupedConv-Vectorize",shaderCache:{hint:`${t.cacheKey};${s};${n};${h};${l[0]};${l[1]}`,inputDependencies:a?["rank","rank","type"]:["rank","rank"]},getRunData:()=>({outputs:[{dims:i?i(r):r,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(o/64)},programUniforms:p}),getShaderSource:c}}}),ii,cn,gl,yl=T(()=>{V(),W(),ir(),G(),He(),ii=(e,t,r,i,a=!1,s)=>{let n=e[0].dims,o=e[1].dims,u=n[n.length-2],l=o[o.length-1],d=n[n.length-1],p=ae(l),h=ae(d),c=ae(u),f=S.size(r)/p/c,m=e.length>2,w=i?i.slice(0,-2):r.slice(0,-2),y=[S.size(w),u,l],g=[{type:12,data:f},{type:12,data:u},{type:12,data:l},{type:12,data:d}];We(t,g),g.push(...B(w,n,o)),m&&g.push(...B(e[2].dims)),g.push(...B(y));let _=$=>{let v=Ii("batch_dims",e[0].dataType,w.length),k=I("a",e[0].dataType,n.length,h),b=I("b",e[1].dataType,o.length,p),E=M("output",e[0].dataType,y.length,p),C=ue(E.type.tensor),A=Le(t,E.type.value,C),q=[k,b],P="";if(m){let H=a?p:1;q.push(I("bias",e[2].dataType,e[2].dims.length,H)),P=`${a?`value += bias[col / ${H}];`:`value += ${E.type.value}(bias[row + i]);`}`}let L=n.slice(0,-2),F=o.slice(0,-2),Q=St(L,w),Z=St(F,w),N=[{name:"output_size",type:"u32"},{name:"M",type:"u32"},{name:"N",type:"u32"},{name:"K",type:"u32"}];Ge(t,N);let R=(H,x)=>{let z=H.rank,D=H.name;if(z===2)return`var ${D}_indices = ${H.type.indices}(0u, 0u);`;let j=v.rank,X=`var ${D}_indices: ${H.type.indices};`;for(let oe=z-2-1,be=j-1;oe>=0;oe--,be--)X+=`
${D}_indices[${oe}] = ${j>1?`batch_indices[${be}]`:"batch_indices"};`;return x.forEach(oe=>{X+=`
${D}_indices[${oe}] = 0;`}),X+=`${D}_indices[${z-2}] = 0u;
                     ${D}_indices[${z-1}] = 0u;`,X},U=()=>{let H=`var a_data: ${k.type.value};`;for(let x=0;x<h;x++)H+=`
              let b_data${x} = b[(b_offset + (k + ${x}) * uniforms.N + col) / ${p}];`;for(let x=0;x<c;x++){H+=`a_data = a[(a_offset + (row + ${x}) * uniforms.K + k) / ${h}];`;for(let z=0;z<h;z++)H+=`
            values[${x}] = fma(${b.type.value}(a_data${h===1?"":`[${z}]`}), b_data${z}, values[${x}]);
`}return H};return`
  ${$.registerUniforms(N).registerInternalVariables(v).declareVariables(...q,E)}
  ${$.mainStart()}
    ${$.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    let col = (global_idx % (uniforms.N / ${p})) * ${p};
    var index1 = global_idx / (uniforms.N / ${p});
    let stride1 = uniforms.M / ${c};
    let row = (index1 % stride1) * ${c};
    let batch = index1 / stride1;

    ${r.length===2?"":`let batch_indices = ${v.offsetToIndices("batch")};`}
    ${R(k,Q)}
    let a_offset = ${k.indicesToOffset("a_indices")};
    ${R(b,Z)}
    let b_offset = ${b.indicesToOffset("b_indices")};
    var values: array<${E.type.value}, ${c}>;
    for (var k: u32 = 0u; k < uniforms.K; k = k + ${h}) {
      ${U()}
    }
    for (var i = 0u; i < ${c}u; i++) {
      var value = values[i];
      ${P}
      ${A}
      let cur_indices = ${E.type.indices}(batch, row + i, col);
      let offset = ${E.indicesToOffset("cur_indices")};
      ${E.setByOffset(`offset / ${p}`,"value")};
    }
  }
  `};return{name:"MatMulNaive",shaderCache:{hint:`${t.activation};${p};${h};${c};${a}`,inputDependencies:m?["rank","rank","rank"]:["rank","rank"]},getRunData:()=>({outputs:[{dims:s?s(r):r,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(f/64)},programUniforms:g}),getShaderSource:_}},cn=e=>{if(!e||e.length!==2)throw new Error("MatMul requires 2 inputs.");if(e[0].dims[e[0].dims.length-1]!==e[1].dims[e[1].dims.length-2])throw new Error("shared dimension does not match.")},gl=e=>{cn(e.inputs);let t=ot.calcShape(e.inputs[0].dims,e.inputs[1].dims,!0);if(!t)throw new Error("Can't use matmul on the given tensors");let r=t[t.length-1],i=e.inputs[0].dims[e.inputs[0].dims.length-1];r<8&&i<8?e.compute(ii(e.inputs,{activation:""},t)):e.compute(Bi(e.inputs,{activation:""},t))}}),fn,Ot,mn,Mt,ai,br,gn,yn,ni,Sp=T(()=>{W(),bp(),xp(),ir(),kp(),He(),yl(),Fe(),fn=(e,t,r,i,a,s)=>{let n=e[0],o=e.slice(s?1:2,s?3:4),u=o.length,l=t[0],d=t.slice(2).map((h,c)=>h+(h-1)*(r[c]-1)),p=o.map((h,c)=>h+i[c]+i[c+u]).map((h,c)=>Math.floor((h-d[c]+a[c])/a[c]));return p.splice(0,0,n),p.splice(s?3:1,0,l),p},Ot=[2,3,1,0],mn=(e,t)=>{if(!e||e.length!==2&&e.length!==3)throw new Error("Conv requires 2 or 3 inputs");if(e[0].dims.length>5)throw new Error("greater than 5D is not supported");if(e[0].dims.length!==e[1].dims.length)throw new Error("filter does not have same dimension as input");let r=e[0].dims[t.format==="NHWC"?e[0].dims.length-1:1],i=e[1].dims[1]*t.group;if(r!==i)throw new Error("FILTER_IN_CHANNEL should be equal to DATA_CHANNEL");if(e.length===3&&(e[2].dims.length!==1||e[1].dims[0]!==e[2].dims[0]))throw new Error("invalid bias");let a=e[0].dims.length-2;if(t.dilations.length!==a)throw new Error(`dilations should be ${a}D`);if(t.strides.length!==a)throw new Error(`strides should be ${a}D`);if(t.pads.length!==a*2)throw new Error(`pads should be ${a*2}D`);if(t.kernelShape.length!==0&&t.kernelShape.length!==e[1].dims.length-2)throw new Error("invalid kernel shape")},Mt=(e,t)=>{let r=e.kernelShape.slice();r.length<t[1].dims.length-2&&r.push(...Array(t[1].dims.length-2-r.length).fill(0));for(let s=2;s<t[1].dims.length;++s)r[s-2]===0&&(r[s-2]=t[1].dims[s]);let i=e.pads.slice();Kt.adjustPadsBasedOnAutoPad(t[0].dims,e.strides,e.dilations,r,i,e.format==="NHWC",e.autoPad);let a=Object.assign({},e);return Object.assign(a,{kernelShape:r,pads:i}),a},ai=e=>{let t=Ci(e),r=e.format,i=["NOTSET","VALID","SAME_UPPER","SAME_LOWER"][e.auto_pad],a=e.dilations,s=e.group,n=e.kernel_shape,o=e.pads,u=e.strides,l=e.w_is_const();return{autoPad:i,format:r,dilations:a,group:s,kernelShape:n,pads:o,strides:u,wIsConst:l,...t,cacheKey:`${e.format};${t.activation};`}},br=(e,t,r,i)=>{let a=r.format==="NHWC",s=fn(t[0].dims,t[1].dims,r.dilations,r.pads,r.strides,a);if(r.group!==1){let k=[t[0]];if(a){let b=e.kernelCustomData.wT??e.compute(_e(t[1],Ot),{inputs:[1],outputs:[r.wIsConst?-2:-1]})[0];r.wIsConst&&!e.kernelCustomData.wT&&(e.kernelCustomData.wT=b),k.push(b)}else k.push(t[1]);t.length===3&&k.push(t[2]),!e.adapterInfo.isArchitecture("ampere")&&a&&t[1].dims[0]===r.group&&t[1].dims[1]===1&&r.dilations[0]===1&&r.dilations[1]===1?e.compute(ml(k,r,s,i),{inputs:k}):e.compute(fl(k,r,s,i),{inputs:k});return}let n=t.length===3,o=t[0].dims[a?1:2],u=t[0].dims[a?2:3],l=t[0].dims[a?3:1],d=t[1].dims[2],p=t[1].dims[3],h=s[a?1:2],c=s[a?2:3],f=s[a?3:1],m=a&&d===o&&p===u&&r.pads[0]===0&&r.pads[1]===0;if(m||d===1&&p===1&&r.dilations[0]===1&&r.dilations[1]===1&&r.strides[0]===1&&r.strides[1]===1&&r.pads[0]===0&&r.pads[1]===0){let k=s[0],b,E,C,A=[];if(a){let L=e.kernelCustomData.wT??e.compute(_e(t[1],Ot),{inputs:[1],outputs:[r.wIsConst?-2:-1]})[0];if(r.wIsConst&&!e.kernelCustomData.wT&&(e.kernelCustomData.wT=L),m){let F=o*u*l;b=t[0].reshape([1,k,F]),E=L.reshape([1,F,f]),C=[1,k,f]}else b=t[0].reshape([k,o*u,l]),E=L.reshape([1,l,f]),C=[k,h*c,f];A.push(b),A.push(E)}else b=t[0].reshape([k,l,o*u]),E=t[1].reshape([1,f,l]),C=[k,f,h*c],A.push(E),A.push(b);n&&A.push(t[2]);let q=C[2],P=A[0].dims[A[0].dims.length-1];q<8&&P<8?e.compute(ii(A,r,s,C,a,i),{inputs:A}):e.compute(Bi(A,r,s,C,a,i),{inputs:A});return}let w=!0,y=e.kernelCustomData.wT??e.compute(_e(t[1],Ot),{inputs:[1],outputs:[r.wIsConst?-2:-1]})[0];r.wIsConst&&!e.kernelCustomData.wT&&(e.kernelCustomData.wT=y);let g=[t[0],y];n&&g.push(t[2]);let _=a?h*c:f,$=a?f:h*c,v=d*p*l;e.compute(pl(g,r,s,_,$,v,n,w,i),{inputs:g})},gn=(e,t)=>{let r=t.format==="NHWC",i=[e.inputs[0].reshape(r?[e.inputs[0].dims[0],1,e.inputs[0].dims[1],e.inputs[0].dims[2]]:[e.inputs[0].dims[0],e.inputs[0].dims[1],1,e.inputs[0].dims[2]]),e.inputs[1].reshape([e.inputs[1].dims[0],e.inputs[1].dims[1],1,e.inputs[1].dims[2]])];e.inputs.length===3&&i.push(e.inputs[2]);let a=[0,t.pads[0],0,t.pads[1]],s=[1].concat(t.strides),n=[1].concat(t.dilations),o=[1].concat(t.kernelShape),u=Mt({...t,pads:a,strides:s,dilations:n,kernelShape:o},i);br(e,i,u,l=>r?[l[0],l[2],l[3]]:[l[0],l[1],l[3]])},yn=(e,t,r)=>{let i=r.format==="NHWC"?"channelsLast":"channelsFirst",a=Mt(r,t),s=r.autoPad==="NOTSET"?r.pads:r.autoPad,n=hl(t[0].dims,t[1].dims,r.strides,r.dilations,s,!1,i);e.compute(cl(t,a,n.outShape,[n.filterDepth,n.filterHeight,n.filterWidth],[n.padInfo.front,n.padInfo.top,n.padInfo.left],i))},ni=(e,t)=>{if(mn(e.inputs,t),e.inputs[0].dims.length===3)gn(e,t);else if(e.inputs[0].dims.length===5)yn(e,e.inputs,t);else{let r=Mt(t,e.inputs);br(e,e.inputs,r)}}}),wn,wl,Ip=T(()=>{V(),Me(),G(),He(),rr(),dl(),ir(),wn=(e,t=!1,r,i,a=4)=>{let s=w=>{switch(w){case 1:return"return w[getIndexFromCoords4D(coord, vec4<i32>(uniforms.w_shape))];";case 4:return`
            let coord1 = vec4<i32>(coordX, coordY, col + 1, rowInner);
            let coord2 = vec4<i32>(coordX, coordY, col + 2, rowInner);
            let coord3 = vec4<i32>(coordX, coordY, col + 3, rowInner);
            let v0 = w[getIndexFromCoords4D(coord, vec4<i32>(uniforms.w_shape))];
            let v1 = w[getIndexFromCoords4D(coord1, vec4<i32>(uniforms.w_shape))];
            let v2 = w[getIndexFromCoords4D(coord2, vec4<i32>(uniforms.w_shape))];
            let v3 = w[getIndexFromCoords4D(coord3, vec4<i32>(uniforms.w_shape))];
            return ${i}(v0, v1, v2, v3);
            `;default:throw new Error(`innerElementSize ${w} is not supported.`)}},n=e?`
      let coord = vec4<i32>(batch, iXR, iXC, xCh);
      `:`
      let coord = vec4<i32>(batch, xCh, iXR, iXC);
      `,o=e?`
    let coords = vec4<i32>(
      batch,
      row / outWidth,
      row % outWidth,
      col);
    `:`
    let coords = vec4<i32>(
      batch,
      row,
      col / outWidth,
      col % outWidth);
    `,u=e?"i32(uniforms.x_shape[1])":"i32(uniforms.x_shape[2])",l=e?"i32(uniforms.x_shape[2])":"i32(uniforms.x_shape[3])",d=e?"row":"col",p=e?"col":"row",h=`
      let inChannels = ${e?"i32(uniforms.x_shape[3])":"i32(uniforms.x_shape[1])"};
      let outWidth = ${e?"i32(uniforms.result_shape[2])":"i32(uniforms.result_shape[3])"};
      let outRow = ${d} / outWidth;
      let outCol = ${d} % outWidth;

      let WRow = ${p} / (uniforms.filter_dims[1] * inChannels);
      let WCol = ${p} / inChannels % uniforms.filter_dims[1];
      let xR = f32(outRow - uniforms.pads[0] + uniforms.dilations[0] * WRow) / f32(uniforms.strides[0]);
      let xC = f32(outCol - uniforms.pads[1] + uniforms.dilations[1] * WCol) / f32(uniforms.strides[1]);
      if (xR < 0.0 || xR >= f32(${u}) || fract(xR) > 0.0) {
        return ${i}(0.0);
      }
      if (xC < 0.0 || xC >= f32(${l}) || fract(xC) > 0.0) {
        return ${i}(0.0);
      }
      let iXR = i32(xR);
      let iXC = i32(xC);
      let xCh = ${p} % inChannels;
      ${n}
      return x[getIndexFromCoords4D(coord, vec4<i32>(uniforms.x_shape))/${a}];`,c=e?`
      let col = colIn * ${a};
      if (row < uniforms.dim_a_outer && col < uniforms.dim_inner) {
        ${h}
      }
      return ${i}(0.0);`:`
      let col = colIn * ${a};
      if (row < uniforms.dim_inner && col < uniforms.dim_b_outer) {
        ${h}
      }
      return ${i}(0.0);`,f=`
      let col = colIn * ${a};
      let inChannels = ${e?"i32(uniforms.x_shape[3])":"i32(uniforms.x_shape[1])"};
      let coordX = uniforms.filter_dims[0] - 1 - row / (uniforms.filter_dims[1] * inChannels);
      let coordY = uniforms.filter_dims[1] - 1 - (row / inChannels) % uniforms.filter_dims[1];
      if (${e?"row < uniforms.dim_inner && col < uniforms.dim_b_outer":"row < uniforms.dim_inner && col < uniforms.dim_a_outer"}  && coordX >= 0 && coordY >= 0) {
        let rowInner = row % inChannels;
        let coord = vec4<i32>(coordX, coordY, col, rowInner);
        ${s(a)}
      }
      return ${i}(0.0);
      `,m=Le(r,i);return`
  fn mm_readA(batch: i32, row : i32, colIn : i32) -> ${i} {
    ${e?c:f}
  }

  fn mm_readB(batch: i32, row : i32, colIn : i32) -> ${i} {
    ${e?f:c}
  }

  fn mm_write(batch: i32, row : i32, colIn : i32, valueInput : ${i}) {
    let col = colIn * ${a};
    if (row < uniforms.dim_a_outer && col < uniforms.dim_b_outer) {
      var value = valueInput;
      let outWidth = ${e?"i32(uniforms.result_shape[2])":"i32(uniforms.result_shape[3])"};
      ${o}
      ${Ai(t)}
      ${m}
      result[getIndexFromCoords4D(coords, vec4<i32>(uniforms.result_shape))/${a}] = value;
    }
  }`},wl=(e,t,r,i,a,s,n,o)=>{let u=t.format==="NHWC",l=u?e[0].dims[3]:e[0].dims[1],d=r[0],p=u?r[2]:r[3],h=u?r[1]:r[2],c=u?r[3]:r[1],f=u&&l%4===0&&l%3&&c%4===0,m=u?c:p*h,w=u?p*h:c,y=[8,8,1],g=i<=8?[4,1,1]:[4,4,1],_=[Math.ceil(m/y[0]/g[0]),Math.ceil(w/y[1]/g[1]),Math.ceil(d/y[2]/g[2])];J("verbose",()=>`[conv_backprop_mm_webgpu] dispatch = ${_}`);let $=f?4:1,v=Math.max(y[0]*$,y[1]),k=f?4:1,b=[t.kernelShape[u?1:2],t.kernelShape[u?2:3]],E=[b[0]+(t.dilations[0]<=1?0:(b[0]-1)*(t.dilations[0]-1)),b[1]+(t.dilations[1]<=1?0:(b[1]-1)*(t.dilations[1]-1))],C=[E[0]-1-Math.floor((t.pads[0]+t.pads[2])/2),E[1]-1-Math.floor((t.pads[1]+t.pads[3])/2)],A=[{type:6,data:i},{type:6,data:a},{type:6,data:s},{type:6,data:t.strides},{type:6,data:t.dilations},{type:6,data:b},{type:6,data:C}];We(t,A),A.push(...B(e[0].dims,e[1].dims));let q=["rank","rank"];n&&(A.push(...B(e[2].dims)),q.push("rank")),A.push(...B(r));let P=L=>{let F=I("x",e[0].dataType,e[0].dims.length,k),Q=I("w",e[1].dataType,e[1].dims.length,1),Z=M("result",e[0].dataType,r.length,k),N=[F,Q],R="";if(n){let x=I("bias",e[2].dataType,e[2].dims.length,k);N.push(x),R+=`
          fn getBiasByOutputCoords(coords : vec4<i32>) -> ${x.type.value} {
            return bias[coords.${u?"w":"y"}${f?"/ 4":""}];
          }`}let U=[{name:"dim_a_outer",type:"i32"},{name:"dim_b_outer",type:"i32"},{name:"dim_inner",type:"i32"},{name:"strides",type:"i32",length:2},{name:"dilations",type:"i32",length:2},{name:"filter_dims",type:"i32",length:b.length},{name:"pads",type:"i32",length:C.length}];Ge(t,U);let H=ue(e[0].dataType,1);if(H!=="f16"&&H!=="f32")throw new Error(`elemType ${H} is not supported.`);return`
        ${Ri("uniforms.result_strides")}
        ${L.registerUniforms(U).declareVariables(...N,Z)};
        ${R}
        ${wn(u,n,t,F.type.value,$)}
        ${f?Qt(g,y,H,void 0,!u,v):Xt(g,y,H,void 0,!u,v,!1,void 0,o)}`};return{name:"Conv2DTransposeMatMul",shaderCache:{hint:`${t.cacheKey};${g};${y};${f}`,inputDependencies:q},getRunData:()=>({outputs:[{dims:r,dataType:e[0].dataType}],dispatchGroup:{x:_[0],y:_[1],z:_[2]},programUniforms:A}),getShaderSource:P}}}),$n,si,zp=T(()=>{V(),Me(),W(),G(),$n=(e,t,r,i,a,s=!1,n,o,u=!1)=>{let l=u?1:2,d=u?2:3,p=u?3:1,h=s?2:1,c=`
  fn setOutputAtIndex(flatIndex : u32, value : ${s?`vec4<${n}>`:n}) {
    result[flatIndex] = ${s?`vec4<${n}>`:n}(value);
  }`;i&&(c+=`
    fn getBiasByOutputCoords(coords : vec4<u32>) -> ${s?`vec4<${n}>`:n} {
      return bias[coords.${u?"w":"y"}${s?"/ 4":""}];
    }`);let f=s?4:1,m=I("W",t[1].dataType,t[1].dims.length,f),w=I("Dy",t[0].dataType,t[0].dims.length,f),y=[w,m];i&&y.push(I("bias",t[2].dataType,[r[p]].length,f));let g=M("result",t[0].dataType,r.length,f),_=`{
        let batch: u32 = ${a?"global_id.z":"workgroup_id.z"} / uniforms.result_shape[1];
        let r = ${a?"global_id.z":"workgroup_id.z"} % uniforms.result_shape[1];
        let c = ${a?"global_id.y":"workgroup_id.y"} * ${h};
        let d1: u32 = ${a?"global_id.x":"workgroup_id.x"} * 4;

        let dyCorner = vec2<i32>(i32(r), i32(c)) - vec2<i32>(uniforms.pads);

        // Convolve dy(?, ?, d2) with w(:, :, d1, d2) to compute dx(xR, xC, d1).
        // ? = to be determined. : = across all values in that axis.
        var dotProd: array<vec4<${n}>, ${h}>;
        for (var i = 0; i < ${h}; i++) {
          dotProd[i] = vec4<${n}>(0.0);
        }
        for (var wR: u32 = 0; wR < uniforms.filter_dims[0]; wR = wR + 1) {
          var dyR = (${n}(dyCorner.x) + ${n}(wR)) / ${n}(uniforms.strides.x);
          let wRPerm = uniforms.filter_dims[0] - 1 - wR;
          if (dyR < 0.0 || dyR >= ${n}(uniforms.Dy_shape[1]) ||
              fract(dyR) > 0.0 || wRPerm < 0) {
            continue;
          }
          let idyR: u32 = u32(dyR);

          for (var wC: u32 = 0; wC < uniforms.filter_dims[1]; wC = wC + 1) {
            let dyC = (${n}(dyCorner.y) + ${n}(wC)) / ${n}(uniforms.strides.y);
            let dyC2 = (${n}(dyCorner.y) + 1.0 + ${n}(wC)) / ${n}(uniforms.strides.y);
            let wCPerm = uniforms.filter_dims[1] - 1 - wC;
            if (wCPerm < 0) {
              continue;
            }
            var bDyCVal = true;
            var bDyCVal2 = true;
            if (dyC < 0.0 || dyC >= ${n}(uniforms.Dy_shape[2]) ||
                fract(dyC) > 0.0) {
              bDyCVal = false;
            }
            if (dyC2 < 0.0 || dyC2 >= ${n}(uniforms.Dy_shape[2]) ||
                fract(dyC2) > 0.0) {
              bDyCVal2 = false;
            }

            let idyC: u32 = u32(dyC);
            let idyC2: u32 = u32(dyC2);
            if (bDyCVal && bDyCVal2) {
              let d2Length = uniforms.Dy_shape[3];
              for (var d2 :u32 = 0; d2 < d2Length; d2 = d2 + 4) {
                let wValue0 = ${m.get("u32(wRPerm)","u32(wCPerm)","d1","d2")};
                let wValue1 = ${m.get("u32(wRPerm)","u32(wCPerm)","d1 + 1","d2")};
                let wValue2 = ${m.get("u32(wRPerm)","u32(wCPerm)","d1 + 2","d2")};
                let wValue3 = ${m.get("u32(wRPerm)","u32(wCPerm)","d1 + 3","d2")};

                var xValue = ${w.get("batch","idyR","idyC","d2")};
                let tmpval = vec4<${n}>(dot(xValue, wValue0),
                                      dot(xValue, wValue1),
                                      dot(xValue, wValue2),
                                      dot(xValue, wValue3));
                dotProd[0] = dotProd[0] + tmpval;

                xValue =  ${w.get("batch","idyR","idyC2","d2")};

                dotProd[1] = dotProd[1] + vec4<${n}>(dot(xValue, wValue0),
                                                    dot(xValue, wValue1),
                                                    dot(xValue, wValue2),
                                                    dot(xValue, wValue3));
              }
            } else if (bDyCVal) {
              let d2Length = uniforms.Dy_shape[${p}];
              for (var d2: u32 = 0; d2 < d2Length; d2 = d2 + 4) {
                let wValue0 = ${m.get("u32(wRPerm)","u32(wCPerm)","d1","d2")};
                let wValue1 = ${m.get("u32(wRPerm)","u32(wCPerm)","d1 + 1","d2")};
                let wValue2 = ${m.get("u32(wRPerm)","u32(wCPerm)","d1 + 2","d2")};
                let wValue3 = ${m.get("u32(wRPerm)","u32(wCPerm)","d1 + 3","d2")};

                var xValue = ${w.get("batch","idyR","idyC","d2")};
                let tmpval = vec4<${n}>(dot(xValue, wValue0),
                                      dot(xValue, wValue1),
                                      dot(xValue, wValue2),
                                      dot(xValue, wValue3));
                dotProd[0] = dotProd[0] + tmpval;
              }
            } else if (bDyCVal2) {
              let d2Length = uniforms.Dy_shape[3];
              for (var d2: u32 = 0; d2 < d2Length; d2 = d2 + 4) {
                let wValue0 = ${m.get("u32(wRPerm)","u32(wCPerm)","d1","d2")};
                let wValue1 = ${m.get("u32(wRPerm)","u32(wCPerm)","d1 + 1","d2")};
                let wValue2 = ${m.get("u32(wRPerm)","u32(wCPerm)","d1 + 2","d2")};
                let wValue3 = ${m.get("u32(wRPerm)","u32(wCPerm)","d1 + 3","d2")};

                var xValue = ${w.get("batch","idyR","idyC2","d2")};
                let tmpval = vec4<${n}>(dot(xValue, wValue0),
                                      dot(xValue, wValue1),
                                      dot(xValue, wValue2),
                                      dot(xValue, wValue3));
                dotProd[1] = dotProd[1] + tmpval;
              }
            }
          }
        }

        for (var i: u32 = 0; i < ${h}; i = i + 1) {
          let value = dotProd[i] + ${i?"bias[c+i]":`vec4<${n}>(0.0)`};
          ${g.set("batch","r","c + i","d1","value")};
        }
      }`,$=`
          let outputIndices = ${g.offsetToIndices("global_idx")};
          let batch = ${g.indicesGet("outputIndices",0)};
          let d1 = ${g.indicesGet("outputIndices",p)};
          let r = ${g.indicesGet("outputIndices",l)};
          let c = ${g.indicesGet("outputIndices",d)};
          let dyCorner = vec2<i32>(i32(r), i32(c)) - uniforms.pads;
          let dyRCorner = dyCorner.x;
          let dyCCorner = dyCorner.y;
          let groupId = d1 / uniforms.output_channels_per_group;
          let wOutChannel = d1 - groupId * uniforms.output_channels_per_group;
          // Convolve dy(?, ?, d2) with w(:, :, d1, d2) to compute dx(xR, xC, d1).
          // ? = to be determined. : = across all values in that axis.
          var dotProd = ${n}(0.0);
          for (var wR: u32 = 0; wR < uniforms.effective_filter_dims.x; wR = wR + 1) {
            if (wR % uniforms.dilations.x != 0) {
              continue;
            }
            let dyR = (${n}(dyRCorner) + ${n}(wR)) / ${n}(uniforms.strides[0]);
            let wRPerm = uniforms.filter_dims.x - 1 - wR / uniforms.dilations.x;
            if (dyR < 0.0 || dyR >= ${n}(uniforms.Dy_shape[${l}]) || fract(dyR) > 0.0 ||
                wRPerm < 0) {
              continue;
            }
            let idyR: u32 = u32(dyR);

            for (var wC: u32 = 0; wC < uniforms.effective_filter_dims.y; wC = wC + 1) {
              if (wC % uniforms.dilations.y != 0) {
                continue;
              }
              let dyC = (${n}(dyCCorner) + ${n}(wC)) / ${n}(uniforms.strides.y);
              let wCPerm = uniforms.filter_dims.y - 1 - wC / uniforms.dilations.y;
              if (dyC < 0.0 || dyC >= ${n}(uniforms.Dy_shape[${d}]) ||
                  fract(dyC) > 0.0 || wCPerm < 0) {
                continue;
              }
              let idyC: u32 = u32(dyC);
              var inputChannel = groupId * uniforms.input_channels_per_group;
              for (var d2: u32 = 0; d2 < uniforms.input_channels_per_group; d2 = d2 + 1) {
                let xValue = ${u?w.get("batch","idyR","idyC","inputChannel"):w.get("batch","inputChannel","idyR","idyC")};
                let wValue = ${m.get("inputChannel","wOutChannel","u32(wRPerm)","u32(wCPerm)")};
                dotProd = dotProd + xValue * wValue;
                inputChannel = inputChannel + 1;
              }
            }
          }
          let value = dotProd + ${i?"bias[d1]":`${n}(0.0)`};
          ${g.setByOffset("global_idx","value")};
        `;return`
  ${e.registerUniforms(o).declareVariables(...y,g)}
  ${c}

    ${e.mainStart()}
    ${e.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")};
  ${s?_:$}}`},si=(e,t,r)=>{let i=e.length>2,a=t.outputShape,s=S.size(a),n=[Math.ceil(s/64),1,1];J("verbose",()=>`[conv2d_backprop_webgpu] dispatch = ${n}`);let o=t.format==="NHWC",u=["rank","rank"],l=[t.strides[0],t.strides[1]],d=[t.kernelShape[o?1:2],t.kernelShape[o?2:3]],p=[t.dilations[0],t.dilations[1]],h=[d[0]+(t.dilations[0]<=1?0:(t.kernelShape[o?1:2]-1)*(t.dilations[0]-1)),d[1]+(t.dilations[1]<=1?0:(t.kernelShape[o?2:3]-1)*(t.dilations[1]-1))],c=[h[0]-1-Math.floor((t.pads[0]+t.pads[2])/2),h[1]-1-Math.floor(t.pads[1]+t.pads[3])/2],f=!1,m=t.group,w=e[1].dims,y=w[0]/m,g=w[1],_=[{type:12,data:s},{type:12,data:l},{type:12,data:d},{type:12,data:p},{type:12,data:h},{type:6,data:c},{type:12,data:y},{type:12,data:g},...B(e[0].dims,e[1].dims)];i&&(_.push(...B(e[2].dims)),u.push("rank")),_.push(...B(a));let $=n[1]===1&&n[2]===1,v=k=>{let b=[{name:"output_size",type:"u32"},{name:"strides",type:"u32",length:l.length},{name:"filter_dims",type:"u32",length:d.length},{name:"dilations",type:"u32",length:d.length},{name:"effective_filter_dims",type:"u32",length:h.length},{name:"pads",type:"i32",length:c.length},{name:"input_channels_per_group",type:"u32"},{name:"output_channels_per_group",type:"u32"}],E=ue(e[0].dataType);return`${$n(k,e,a,i,$,f,E,b,o)}`};return{name:"ConvTranspose2D",shaderCache:{hint:`${t.cacheKey};`,inputDependencies:u},getRunData:()=>({dispatchGroup:{x:n[0],y:n[1],z:n[2]},outputs:[{dims:r?r(a):a,dataType:e[0].dataType}],programUniforms:_}),getShaderSource:v}}}),_n,vn,bn,xr,$l,xn,kn,Sn,In,_l,Ep=T(()=>{Ip(),zp(),He(),Fe(),_n=(e,t,r,i,a,s)=>(e-1)*t+r+(i-1)*a+1-s,vn=(e,t,r,i,a)=>{let s=Math.floor(e/2);t==="SAME_UPPER"?(r[i]=s,r[a]=e-s):t==="SAME_LOWER"&&(r[i]=e-s,r[a]=s)},bn=(e,t,r,i,a,s,n,o,u,l)=>{let d=e.length-2,p=l.length===0;u.length<d&&u.push(...Array(d-u.length).fill(0));let h=e[0],c=t[o?3:1]*a;for(let f=0,m=e.length-d-(o?1:0);f<d;++f,++m){let w=e[m],y=p?w*n[f]:l[f],g=_n(w,n[f],s[f],t[m],r[f],y);vn(g,i,s,f,f+d),p&&l.push(n[f]*(w-1)+u[f]+(t[m]-1)*r[f]+1-s[f]-s[f+d])}l.splice(0,0,h),l.splice(o?3:1,0,c)},xr=(e,t)=>{let r=e.kernelShape.slice();if(e.kernelShape.length===0||e.kernelShape.reduce((p,h)=>p*h,1)===0){r.length=0;for(let p=2;p<t[1].dims.length;++p)r.push(t[1].dims[p])}let i=e.format==="NHWC";r.splice(0,0,t[1].dims[0]),r.splice(i?3:1,0,t[1].dims[1]);let a=e.pads.slice(),s=e.outputShape.slice(),n=e.outputPadding.slice(),o=t[0].dims,u=e.dilations.slice();if(u.reduce((p,h)=>p+h,0)===0){let p=t[0].dims.length-2;u=new Array(p).fill(1)}let l=e.strides.slice();if(l.reduce((p,h)=>p+h,0)===0){let p=t[0].dims.length-2;l=new Array(p).fill(1)}bn(o,r,u,e.autoPad,e.group,a,l,i,n,s);let d=Object.assign({},e);return Object.assign(d,{kernelShape:r,pads:a,outputPadding:n,outputShape:s,dilations:u,strides:l}),d},$l=e=>{let t=Ci(e),r=e.format,i=["NOTSET","VALID","SAME_UPPER","SAME_LOWER"][typeof e.autoPad>"u"?0:e.autoPad],a=e.dilations,s=e.group,n=e.kernelShape,o=e.pads,u=e.strides,l=e.wIsConst(),d=e.outputPadding,p=e.outputShape;return{autoPad:i,format:r,dilations:a,group:s,kernelShape:n,outputPadding:d,outputShape:p,pads:o,strides:u,wIsConst:l,...t,cacheKey:`${e.format};${t.activation};`}},xn=(e,t)=>{if(!e||e.length!==2&&e.length!==3)throw new Error("Conv requires 2 or 3 inputs");if(e[0].dims.length!==4&&e[0].dims.length!==3)throw new Error("currently only support 2-dimensional conv");if(e[0].dims.length!==e[1].dims.length)throw new Error("filter does not have same dimension as input");let r=e[0].dims[t.format==="NHWC"?e[0].dims.length-1:1],i=e[1].dims[0];if(r!==i)throw new Error("FILTER_IN_CHANNEL should be equal to DATA_CHANNEL");let a=e[1].dims[1]*t.group;if(e.length===3&&(e[2].dims.length!==1||e[2].dims[0]!==a))throw new Error("invalid bias");let s=e[0].dims.length-2;if(t.dilations.reduce((n,o)=>n+o,0)>0&&t.dilations.length!==s)throw new Error(`dilations should be ${s}D`);if(t.strides.reduce((n,o)=>n+o,0)>0&&t.strides.length!==s)throw new Error(`strides should be ${s}D`);if(t.pads.reduce((n,o)=>n+o,0)>0&&t.pads.length!==s*2)throw new Error(`pads should be ${s*2}D`);if(t.outputPadding.length!==s&&t.outputPadding.length!==0)throw new Error(`output_padding should be ${s}D`);if(t.kernelShape.reduce((n,o)=>n+o,0)>0&&t.kernelShape.length!==0&&t.kernelShape.length!==e[1].dims.length-2)throw new Error("invalid kernel shape");if(t.outputShape.length!==0&&t.outputShape.length!==e[0].dims.length-2)throw new Error("invalid output shape")},kn=[2,3,1,0],Sn=(e,t,r)=>{let i=xr(r,t),a=r.format==="NHWC",s=i.outputShape,n=s[a?3:1],o=t[0].dims[a?3:1];if(i.group!==1||n===1&&o===1){e.compute(si(t,i));return}let u=s[a?1:2],l=s[a?2:3],d=t[1].dims[2],p=t[1].dims[3],h=a?u*l:n,c=a?n:u*l,f=d*p*o,m=!0,w=e.kernelCustomData.wT??e.compute(_e(t[1],kn),{inputs:[1],outputs:[r.wIsConst?-2:-1]})[0];r.wIsConst&&!e.kernelCustomData.wT&&(e.kernelCustomData.wT=w);let y=[t[0],w],g=t.length===3;g&&(!a&&t[2].dims.length===1?y.push(t[2].reshape([t[2].dims[0],1,1])):y.push(t[2])),e.compute(wl(y,i,s,h,c,f,g,m),{inputs:y})},In=(e,t)=>{let r=t.format==="NHWC",i=[e.inputs[0].reshape(r?[e.inputs[0].dims[0],1,e.inputs[0].dims[1],e.inputs[0].dims[2]]:[e.inputs[0].dims[0],e.inputs[0].dims[1],1,e.inputs[0].dims[2]]),e.inputs[1].reshape([e.inputs[1].dims[0],e.inputs[1].dims[1],1,e.inputs[1].dims[2]])];e.inputs.length===3&&i.push(e.inputs[2]);let a=t.kernelShape;(a.length===0||a[0]===0)&&(a=[e.inputs[1].dims[2]]);let s=t.dilations;(s.length===0||s[0]===0)&&(s=[1]);let n=t.strides;(n.length===0||n[0]===0)&&(n=[1]);let o=t.pads;o.length===0&&(o=[0,0]),o=[0,o[0],0,o[1]],n=[1].concat(n),s=[1].concat(s),a=[1].concat(a);let u=xr({...t,pads:o,strides:n,dilations:s,kernelShape:a},i);e.compute(si(i,u,l=>r?[l[0],l[2],l[3]]:[l[0],l[1],l[3]]))},_l=(e,t)=>{xn(e.inputs,t),e.inputs[0].dims.length===3?In(e,t):Sn(e,e.inputs,t)}}),zn,vl,bl,Tp=T(()=>{V(),W(),se(),G(),zn=(e,t,r,i)=>{let a=S.size(t),s=t.length,n=I("input",e,s),o=M("output",e,s),u=r.dataType===6?r.getInt32Array()[0]:Number(r.getBigInt64Array()[0]),l=S.normalizeAxis(u,s),d=p=>{let h=` i32(${n.indicesGet("inputIndices","uniforms.axis")}) `,c=O("uniforms.input_shape","uniforms.axis",s),f=i.reverse?h+(i.exclusive?" + 1":""):"0",m=i.reverse?c:h+(i.exclusive?"":" + 1");return`
                ${p.registerUniform("outputSize","u32").registerUniform("axis","u32").declareVariables(n,o)}
                ${p.mainStart()}
                  ${p.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
                  var inputIndices = ${o.offsetToIndices("global_idx")};
                  var sum = ${o.type.value}(0);
                  let first : i32 = ${f};
                  let last : i32 = ${m};
                  for (var i : i32 = first; i < last; i++) {
                    ${n.indicesSet("inputIndices","uniforms.axis","u32(i)")};
                    sum = sum + ${n.getByIndices("inputIndices")};
                  }
                  ${o.setByOffset("global_idx","sum")};
                }`};return{name:"CumSum",shaderCache:{hint:i.cacheKey,inputDependencies:["rank"]},getRunData:()=>({outputs:[{dims:t,dataType:e}],dispatchGroup:{x:Math.ceil(a/64)},programUniforms:[{type:12,data:a},{type:12,data:l},...B(t,t)]}),getShaderSource:d}},vl=(e,t)=>{let r=e.inputs[0].dims,i=e.inputs[0].dataType,a=e.inputs[1];e.compute(zn(i,r,a,t),{inputs:[0]})},bl=e=>{let t=e.exclusive===1,r=e.reverse===1;return te({exclusive:t,reverse:r})}}),En,Tn,Cn,xl,kl,Cp=T(()=>{V(),W(),se(),G(),En=e=>{if(!e||e.length!==1)throw new Error("DepthToSpace requires 1 input.");if(e[0].dims.length!==4)throw new Error("DepthToSpace requires 4D input.")},Tn=(e,t,r,i)=>{let a=[];a.push(`fn perm(i: ${i.type.indices}) -> ${r.type.indices} {
    var a: ${r.type.indices};`);for(let s=0;s<t;++s)a.push(r.indicesSet("a",e[s],`i[${s}]`));return a.push("return a;}"),a.join(`
`)},Cn=(e,t)=>{let r,i,a,s,n,o,u=t.format==="NHWC",l=t.blocksize,d=t.mode==="DCR";u?([r,i,a,s]=e.dims,n=d?[r,i,a,l,l,s/l**2]:[r,i,a,s/l**2,l,l],o=d?[0,1,3,2,4,5]:[0,1,4,2,5,3]):([r,i,a,s]=[e.dims[0],e.dims[2],e.dims[3],e.dims[1]],n=d?[r,l,l,s/l**2,i,a]:[r,s/l**2,l,l,i,a],o=d?[0,3,4,1,5,2]:[0,1,4,2,5,3]);let p=e.reshape(n),h=p.dims.length,c=e.dataType,f=I("a",c,h),m=M("output",c,h),w=y=>`
  ${y.registerUniform("output_size","u32").declareVariables(f,m)}

  ${Tn(o,h,f,m)}

  ${y.mainStart()}
    ${y.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}

    let indices = ${m.offsetToIndices("global_idx")};
    let aIndices = perm(indices);

    ${m.setByOffset("global_idx",f.getByIndices("aIndices"))}
  }`;return{name:"DepthToSpace",shaderCache:{hint:`${e.dims};${t.blocksize};${t.mode}`,inputDependencies:["rank"]},getRunData:y=>{let g=u?[r,i*l,a*l,s/l**2]:[r,s/l**2,i*l,a*l],_=S.size(g),$=p.dims,v=S.sortBasedOnPerm($,o);return{outputs:[{dims:g,dataType:y[0].dataType}],dispatchGroup:{x:Math.ceil(_/64)},programUniforms:[{type:12,data:_},...B($,v)]}},getShaderSource:w}},xl=(e,t)=>{En(e.inputs),e.compute(Cn(e.inputs[0],t))},kl=e=>te({blocksize:e.blocksize,mode:e.mode,format:e.format})}),Pt,ht,kr,An,Rn,Bn,On,Sr,Mn,Sl,Il,Ap=T(()=>{V(),W(),se(),G(),Pt="[a-zA-Z]|\\.\\.\\.",ht="("+Pt+")+",kr="^"+ht+"$",An="("+ht+",)*"+ht,Rn="^"+An+"$",Bn=class{constructor(e=-1){this.symbolToIndices=new Map,this.inputIndex=e}addSymbol(e,t){let r=this.symbolToIndices.get(e);r===void 0?r=[t]:r.push(t),this.symbolToIndices.set(e,r)}},On=class{constructor(e,t){var a;this.equation=t,this.hasEllipsis=!1,this.symbolToInfo=new Map,this.lhs=new Array,this.outputDims=[];let[r,i]=t.includes("->")?t.split("->",2):[t,""];if(!r.match(RegExp(Rn)))throw new Error("Invalid LHS term");if(r.split(",").forEach((s,n)=>{let o=e[n].dims.slice();if(!s.match(RegExp(kr)))throw new Error("Invalid LHS term");let u=this.processTerm(s,!0,o,n);this.lhs.push(u)}),i==="")i+=[...this.symbolToInfo.entries()].filter(([s,n])=>n.count===1||s==="...").map(([s])=>s).join("");else if(!i.match(RegExp(ht)))throw new Error("Invalid RHS");(a=i.match(RegExp(Pt,"g")))==null||a.forEach(s=>{if(s==="...")this.outputDims=this.outputDims.concat(this.ellipsisDims);else{let n=this.symbolToInfo.get(s);if(n===void 0)throw new Error("Invalid RHS symbol");this.outputDims.push(n.dimValue)}}),this.rhs=this.processTerm(i,!1,this.outputDims)}addSymbol(e,t,r){let i=this.symbolToInfo.get(e);if(i!==void 0){if(i.dimValue!==t&&i.count!==1)throw new Error("Dimension mismatch");i.count++,i.inputIndices.push(r)}else i={count:1,dimValue:t,inputIndices:[r]};this.symbolToInfo.set(e,i)}processTerm(e,t,r,i=-1){let a=r.length,s=!1,n=[],o=0;if(!e.match(RegExp(kr))&&!t&&e!=="")throw new Error("Invalid LHS term");let u=e.match(RegExp(Pt,"g")),l=new Bn(i);return u==null||u.forEach((d,p)=>{if(d==="..."){if(s)throw new Error("Only one ellipsis is allowed per input term");s=!0;let h=a-u.length+1;if(h<0)throw new Error("Ellipsis out of bounds");if(n=r.slice(o,o+h),this.hasEllipsis){if(this.ellipsisDims.length!==n.length||this.ellipsisDims.toString()!==n.toString())throw new Error("Ellipsis dimensions mismatch")}else if(t)this.hasEllipsis=!0,this.ellipsisDims=n;else throw new Error("Ellipsis must be specified in the LHS");for(let c=0;c<n.length;c++){let f=String.fromCharCode(48+c);l.addSymbol(f,p+c),this.addSymbol(f,r[o++],i)}}else l.addSymbol(d,p+(this.hasEllipsis?this.ellipsisDims.length-1:0)),this.addSymbol(d,r[o++],i)}),l}},Sr=e=>e+"_max",Mn=(e,t,r,i)=>{let a=e.map(l=>l.length).map((l,d)=>I(`input${d}`,t,l)),s=S.size(i),n=M("output",t,i.length),o=[...r.symbolToInfo.keys()].filter(l=>!r.rhs.symbolToIndices.has(l)),u=l=>{let d=[],p="var prod = 1.0;",h="var sum = 0.0;",c="sum += prod;",f=[],m=[],w=[],y=[],g=r.symbolToInfo.size===r.rhs.symbolToIndices.size;r.symbolToInfo.forEach(($,v)=>{var k;if(r.rhs.symbolToIndices.has(v)){let b=(k=r.rhs.symbolToIndices.get(v))==null?void 0:k[0];b!==void 0&&r.lhs.forEach((E,C)=>{if($.inputIndices.includes(C)){let A=E.symbolToIndices.get(v);if(A===void 0)throw new Error("Invalid symbol error");A.forEach(q=>{d.push(`${a[C].indicesSet(`input${C}Indices`,q,n.indicesGet("outputIndices",b))}`)})}})}else r.lhs.forEach((b,E)=>{if($.inputIndices.includes(E)){let C=b.symbolToIndices.get(v);if(C===void 0)throw new Error("Invalid symbol error");C.forEach(A=>{f.push(`${a[E].indicesSet(`input${E}Indices`,A,`${v}`)}`)}),y.push(`prod *= ${a[E].getByIndices(`input${E}Indices`)};`)}}),m.push(`for(var ${v}: u32 = 0; ${v} < uniforms.${Sr(v)}; ${v}++) {`),w.push("}")});let _=g?[...d,`let sum = ${a.map(($,v)=>$.getByIndices(`input${v}Indices`)).join(" * ")};`]:[...d,h,...m,...f,p,...y,c,...w];return`
            ${l.registerUniforms(o.map($=>({name:`${Sr($)}`,type:"u32"}))).registerUniform("outputSize","u32").declareVariables(...a,n)}

            ${l.mainStart()}
            ${l.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
            var outputIndices = ${n.offsetToIndices("global_idx")};
            ${a.map(($,v)=>`var input${v}Indices: ${a[v].type.indices};`).join(`
`)}
            ${_.join(`
`)};
            ${n.setByOffset("global_idx","sum")};
          }`};return{name:"Einsum",shaderCache:{hint:r.equation,inputDependencies:e.map(()=>"rank")},getRunData:()=>{let l=o.filter(p=>r.symbolToInfo.has(p)).map(p=>{var h;return{type:12,data:((h=r.symbolToInfo.get(p))==null?void 0:h.dimValue)||0}});l.push({type:12,data:s});let d=e.map((p,h)=>[...B(p)]).reduce((p,h)=>p.concat(h),l);return d.push(...B(i)),{outputs:[{dims:i,dataType:t}],dispatchGroup:{x:Math.ceil(s/64)},programUniforms:d}},getShaderSource:u}},Sl=(e,t)=>{let r=new On(e.inputs,t.equation),i=r.outputDims,a=e.inputs.map((s,n)=>s.dims);e.compute(Mn(a,e.inputs[0].dataType,r,i))},Il=e=>{let t=e.equation.replace(/\s+/g,"");return te({equation:t})}}),Pn,Ir,Dn,Un,zl,Rp=T(()=>{V(),W(),G(),Pn=e=>{if(!e||e.length!==2)throw new Error("Expand requires 2 input.");let t=e[0].dims,r=Array.from(e[1].getBigInt64Array(),Number),i=r.length<t.length?0:r.length-t.length,a=t.length<r.length?0:t.length-r.length;for(;i<r.length&&a<t.length;++i,++a)if(r[i]!==t[a]&&r[i]!==1&&t[a]!==1)throw new Error("Expand requires shape to be broadcastable to input")},Ir=(e,t)=>{let r=e.length-t.length,i=[];for(let a=0;a<r;++a)i.push(e[a]);for(let a=0;a<t.length;++a)i.push(t[a]===1?e[a+r]:t[a]);return i},Dn=(e,t)=>e.length>t.length?Ir(e,t):Ir(t,e),Un=e=>{let t=e[0].dims,r=Array.from(e[1].getBigInt64Array(),Number),i=Dn(t,r),a=e[0].dataType,s=a===9?4:1,n=Math.ceil(S.size(i)/s),o=l=>{let d=I("input",a,t.length,s),p=M("output",a,i.length,s),h;if(a===9){let c=(f,m,w="")=>`
          let outputIndices${m} = ${p.offsetToIndices(`outputOffset + ${m}u`)};
          let offset${m} = ${d.broadcastedIndicesToOffset(`outputIndices${m}`,p)};
          let index${m} = offset${m} / 4u;
          let component${m} = offset${m} % 4u;
          ${f}[${m}] = ${w}(${d.getByOffset(`index${m}`)}[component${m}]);
        `;h=`
        let outputOffset = global_idx * ${s};
        var data = vec4<u32>(0);
        ${c("data",0,"u32")}
        ${c("data",1,"u32")}
        ${c("data",2,"u32")}
        ${c("data",3,"u32")}
        ${p.setByOffset("global_idx","data")}
      }`}else h=`
        let outputIndices = ${p.offsetToIndices("global_idx")};
        let inputOffset = ${d.broadcastedIndicesToOffset("outputIndices",p)};
        ${p.setByOffset("global_idx",d.getByOffset("inputOffset"))}
      }`;return`
    ${l.registerUniform("vec_size","u32").declareVariables(d,p)}
    ${l.mainStart()}
    ${l.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.vec_size")}
    ${h}`},u=[{type:12,data:n},...B(t,i)];return{name:"Expand",shaderCache:{hint:`${i.length}`,inputDependencies:["rank"]},getShaderSource:o,getRunData:()=>({outputs:[{dims:i,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(n/64)},programUniforms:u})}},zl=e=>{Pn(e.inputs),e.compute(Un(e.inputs),{inputs:[0]})}}),qn,El,Bp=T(()=>{V(),W(),G(),Ti(),qn=e=>{let t=e[0].dataType,r=S.size(e[0].dims),i=S.size(e[1].dims),a=i%4===0,s=n=>{let o=I("x",t,[1],4),u=I("bias",t,[1],4),l=M("y",t,[1],4),d=[{name:"output_vec_size",type:"u32"},{name:"bias_size",type:"u32"}],p=c=>`
      let bias${c}_offset: u32 = (global_idx * 4 + ${c}) % uniforms.bias_size;
      let bias${c} = ${u.getByOffset(`bias${c}_offset / 4`)}[bias${c}_offset % 4];`,h=a?`
      let bias = ${u.getByOffset("global_idx % (uniforms.bias_size / 4)")};`:`${p(0)}${p(1)}${p(2)}${p(3)}
      let bias = ${o.type.value}(bias0, bias1, bias2, bias3);`;return`${n.registerUniforms(d).declareVariables(o,u,l)}

    ${ti(ce(t))}

    ${n.mainStart(ut)}
      ${n.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_vec_size")}

      let x = ${o.getByOffset("global_idx")};
      ${h}
      let x_in = x + bias;
      ${l.setByOffset("global_idx",ri("x_in"))}
    }`};return{name:"FastGeluWithBias",shaderCache:{hint:`${a}`,inputDependencies:["type","type"]},getShaderSource:s,getRunData:n=>({outputs:[{dims:n[0].dims,dataType:n[0].dataType}],programUniforms:[{type:12,data:Math.ceil(r/4)},{type:12,data:i}],dispatchGroup:{x:Math.ceil(r/ut/4)}})}},El=e=>{e.inputs.length<2||S.size(e.inputs[1].dims)===0?ju(e):e.compute(qn(e.inputs))}}),Vn,Nn,Tl,Cl,Op=T(()=>{V(),W(),se(),G(),Vn=e=>{if(!e||e.length!==2)throw new Error("Gather requires 2 inputs.")},Nn=(e,t)=>{let r=e[0].dims,i=e[1].dims,a=r.length,s=S.normalizeAxis(t.axis,a),n=r.slice(0);n.splice(s,1,...i);let o=r[s],u=e[0].dataType===9?4:1,l=Math.ceil(S.size(n)/u),d=[{type:12,data:l},{type:6,data:o},{type:12,data:s},...B(e[0].dims,e[1].dims,n)],p=h=>{let c=I("data",e[0].dataType,e[0].dims.length,u),f=I("inputIndices",e[1].dataType,e[1].dims.length),m=M("output",e[0].dataType,n.length,u),w=g=>{let _=i.length,$=`var indicesIndices${g}  = ${f.type.indices}(0);`;for(let v=0;v<_;v++)$+=`${_>1?`indicesIndices${g}[${v}]`:`indicesIndices${g}`} = ${n.length>1?`outputIndices${g}[uniforms.axis + ${v}]`:`outputIndices${g}`};`;$+=`
          var idx${g} = ${f.getByIndices(`indicesIndices${g}`)};
          if (idx${g} < 0) {
            idx${g} = idx${g} + uniforms.axisDimLimit;
          }
          var dataIndices${g} : ${c.type.indices};
        `;for(let v=0,k=0;v<a;v++)v===s?($+=`${a>1?`dataIndices${g}[${v}]`:`dataIndices${g}`} = u32(idx${g});`,k+=_):($+=`${a>1?`dataIndices${g}[${v}]`:`dataIndices${g}`} = ${n.length>1?`outputIndices${g}[${k}]`:`outputIndices${g}`};`,k++);return $},y;if(e[0].dataType===9){let g=(_,$,v="")=>`
          let outputIndices${$} = ${m.offsetToIndices(`outputOffset + ${$}u`)};
          ${w($)};
          let offset${$} = ${c.indicesToOffset(`dataIndices${$}`)};
          let index${$} = offset${$} / 4u;
          let component${$} = offset${$} % 4u;
          ${_}[${$}] = ${v}(${c.getByOffset(`index${$}`)}[component${$}]);
        `;y=`
        let outputOffset = global_idx * ${u};
        var value = vec4<u32>(0);
        ${g("value",0,"u32")}
        ${g("value",1,"u32")}
        ${g("value",2,"u32")}
        ${g("value",3,"u32")}
        ${m.setByOffset("global_idx","value")}
      `}else y=`
      let outputIndices = ${m.offsetToIndices("global_idx")};
      ${w("")};
      let value = ${c.getByIndices("dataIndices")};
      ${m.setByOffset("global_idx","value")};
      `;return`
      ${h.registerUniform("outputSize","u32").registerUniform("axisDimLimit","i32").registerUniform("axis","u32").declareVariables(c,f,m)}
      ${h.mainStart()}
        ${h.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
        ${y}
      }`};return{name:"Gather",shaderCache:{hint:t.cacheKey,inputDependencies:["rank","rank"]},getRunData:()=>({outputs:[{dims:n,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(l/64)},programUniforms:d}),getShaderSource:p}},Tl=e=>te({axis:e.axis}),Cl=(e,t)=>{let r=e.inputs;Vn(r),e.compute(Nn(e.inputs,t))}}),Ln,Wn,Al,Rl,Mp=T(()=>{V(),W(),se(),G(),Ln=(e,t)=>{if(e.length<3||e.length>4)throw new Error("GatherBlockQuantized requires 3 or 4 inputs.");let r=S.normalizeAxis(t.quantizeAxis,e[0].dims.length),i=t.blockSize,a=e[0],s=e[2],n=e.length===4?e[3]:void 0;if(s.dims.length!==a.dims.length||!a.dims.map((o,u)=>u===r?Math.ceil(o/i)===s.dims[u]:o===s.dims[u]).reduce((o,u)=>o&&u,!0))throw new Error("Scales must have the same rank as the input tensor and the dims should match except on gatherAxis.");if(n){if(n.dataType!==a.dataType)throw new Error("Zero point must have the same data type as the input tensor.");if(n.dims.length!==s.dims.length||!n.dims.map((o,u)=>o===s.dims[u]).reduce((o,u)=>o&&u,!0))throw new Error("Zero point must have the same rank as the input tensor and the dims should match except on quantizeAxis.")}},Wn=(e,t)=>{let r=e[0].dims,i=e[1].dims,a=r.length,s=S.normalizeAxis(t.gatherAxis,a),n=S.normalizeAxis(t.quantizeAxis,a),o=r.slice(0);o.splice(s,1,...i);let u=S.size(o),l=e[2].dataType,d=e[0].dataType===22,p=[{type:12,data:u},{type:12,data:n},{type:12,data:s},{type:12,data:t.blockSize},...B(...e.map((c,f)=>c.dims),o)],h=c=>{let f=I("data",e[0].dataType,e[0].dims.length),m=I("inputIndices",e[1].dataType,e[1].dims.length),w=I("scales",e[2].dataType,e[2].dims.length),y=e.length>3?I("zeroPoint",e[3].dataType,e[3].dims.length):void 0,g=M("output",l,o.length),_=[f,m,w];y&&_.push(y);let $=[{name:"output_size",type:"u32"},{name:"quantize_axis",type:"u32"},{name:"gather_axis",type:"u32"},{name:"block_size",type:"u32"}];return`
        ${c.registerUniforms($).declareVariables(..._,g)}
        ${c.mainStart()}
        let output_indices = ${g.offsetToIndices("global_idx")};
        var indices_indices = ${m.type.indices}(0);
        ${i.length>1?`
          for (var i: u32 = 0; i < ${i.length}; i++) {
            let index = ${g.indicesGet("output_indices","uniforms.gather_axis + i")};
            ${m.indicesSet("indices_indices","i","index")};
          }`:`indices_indices = ${g.indicesGet("output_indices","uniforms.gather_axis")};`};
        var data_indices = ${f.type.indices}(0);
        for (var i: u32 = 0; i < uniforms.gather_axis; i++) {
          let index = ${g.indicesGet("output_indices","i")};
          ${f.indicesSet("data_indices","i","index")};
        }
        var index_from_indices = ${m.getByIndices("indices_indices")};
        if (index_from_indices < 0) {
          index_from_indices += ${r[s]};
        }
        ${f.indicesSet("data_indices","uniforms.gather_axis","u32(index_from_indices)")};
        for (var i = uniforms.gather_axis + 1; i < ${o.length}; i++) {
          let index = ${g.indicesGet("output_indices",`i + ${i.length} - 1`)};
          ${f.indicesSet("data_indices","i","index")};
        }
        let data_offset = ${f.indicesToOffset("data_indices")};
        let data_index = data_offset % 8;
        // Convert 4-bit packed data to 8-bit packed data.
        let packed_4bit_quantized_data = ${f.getByOffset("data_offset / 8")};
        let packed_8bit_quantized_data = (packed_4bit_quantized_data >> (4 * (data_index % 2))) & 0x0f0f0f0f;
        let quantized_data_vec = ${d?"unpack4xI8":"unpack4xU8"}(u32(packed_8bit_quantized_data));
        let quantized_data = quantized_data_vec[data_index / 2];
        var scale_indices = data_indices;
        let quantize_axis_index = ${w.indicesGet("data_indices","uniforms.quantize_axis")} / uniforms.block_size;
        ${w.indicesSet("scale_indices","uniforms.quantize_axis","quantize_axis_index")};
        var scale = ${w.getByIndices("scale_indices")};
        ${y?`
              let zero_point_indices = scale_indices;
              let zero_point_offset = ${y.indicesToOffset("zero_point_indices")};
              let zero_point_index = zero_point_offset % 8;
              let packed_4bit_zero_points = ${y.getByOffset("zero_point_offset / 8")};
              let packed_8bit_zero_points = (packed_4bit_zero_points >> (4 * (zero_point_index % 2))) & 0x0f0f0f0f;
              let zero_point_vec = ${d?"unpack4xI8":"unpack4xU8"}(u32(packed_8bit_zero_points));
              let zero_point = zero_point_vec[zero_point_index / 2];`:"var zero_point = 0"};
        let dequantized_data = ${ce(l)}(quantized_data - zero_point) * scale;
        ${g.setByOffset("global_idx","dequantized_data")};
    }`};return{name:"GatherBlockQuantized",shaderCache:{hint:`${t.cacheKey};${e.filter((c,f)=>f!==1).map(c=>c.dims.join("_")).join(";")}`,inputDependencies:Array.from({length:e.length},(c,f)=>"rank")},getRunData:()=>({outputs:[{dims:o,dataType:l}],dispatchGroup:{x:Math.ceil(u/64)},programUniforms:p}),getShaderSource:h}},Al=(e,t)=>{let r=e.inputs;Ln(r,t),e.compute(Wn(e.inputs,t))},Rl=e=>te({blockSize:e.blockSize,gatherAxis:e.gatherAxis,quantizeAxis:e.quantizeAxis})}),Gn,Fn,Bl,Ol,Pp=T(()=>{V(),W(),se(),G(),Gn=e=>{if(!e||e.length!==2)throw new Error("GatherElements requires 2 inputs.");if(e[0].dims.length<1)throw new Error("GatherElements requires that the data input be rank >= 1.");if(e[0].dims.length!==e[1].dims.length)throw new Error(`GatherElements requires that the data input and
                     indices input tensors be of same rank.`)},Fn=(e,t)=>{let r=e[0].dims,i=e[0].dataType,a=r.length,s=e[1].dims,n=e[1].dataType,o=S.normalizeAxis(t.axis,a),u=r[o],l=s.slice(0),d=S.size(l),p=I("input",i,a),h=I("indicesInput",n,s.length),c=M("output",i,l.length),f=[{type:12,data:d},{type:6,data:u},{type:12,data:o}];return f.push(...B(r,s,l)),{name:"GatherElements",shaderCache:{inputDependencies:["rank","rank"]},getRunData:()=>({outputs:[{dims:l,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(d/64)},programUniforms:f}),getShaderSource:m=>`
      ${m.registerUniform("outputSize","u32").registerUniform("axisDimLimit","i32").registerUniform("axis","u32").declareVariables(p,h,c)}
      ${m.mainStart()}
      ${m.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}

      let outputIndices = ${c.offsetToIndices("global_idx")};

      var idx = ${h.getByOffset("global_idx")};
      if (idx < 0) {
        idx = idx + uniforms.axisDimLimit;
      }
      var inputIndices = ${p.type.indices}(outputIndices);
      ${p.indicesSet("inputIndices","uniforms.axis","u32(idx)")};
      let value = ${p.getByIndices("inputIndices")};

      ${c.setByOffset("global_idx","value")};
  }`}},Bl=e=>te({axis:e.axis}),Ol=(e,t)=>{let r=e.inputs;Gn(r),e.compute(Fn(e.inputs,t))}}),Hn,jn,Ml,Pl,Dp=T(()=>{V(),W(),G(),Hn=e=>{if(!e)throw new Error("Input is missing");if(e.length<2||e.length>3)throw new Error("Invaid input number.");if(e.length===3&&e[2].dims.length>2)throw new Error("Invalid input shape of C");if(e[0].dataType!==e[1].dataType||e.length===3&&e[0].dataType!==e[2].dataType)throw new Error("Input types are mismatched")},jn=(e,t)=>{let r=e[0].dims.slice(),i=e[1].dims.slice(),[a,s,n]=qo.getShapeOfGemmResult(r,t.transA,i,t.transB,e.length===3?e[2].dims:void 0),o=[a,s];if(!o)throw new Error("Can't use gemm on the given tensors");let u=S.size(o),l=[{type:12,data:u},{type:12,data:a},{type:12,data:s},{type:12,data:n},{type:1,data:t.alpha},{type:1,data:t.beta}],d=["type","type"];e.length===3&&(l.push(...B(e[2].dims)),d.push("rank")),l.push(...B(o));let p=h=>{let c="";t.transA&&t.transB?c="value += a[k * uniforms.M + m] * b[n * uniforms.K + k];":t.transA&&!t.transB?c="value += a[k * uniforms.M + m] * b[k * uniforms.N + n];":!t.transA&&t.transB?c="value += a[m * uniforms.K + k] * b[n * uniforms.K + k];":!t.transA&&!t.transB&&(c="value += a[m * uniforms.K + k] * b[k * uniforms.N + n];");let f=t.alpha===1?"":"value *= uniforms.alpha;",m=I("a",e[0].dataType,e[0].dims),w=I("b",e[1].dataType,e[1].dims),y=m.type.value,g=null,_=[m,w];e.length===3&&(g=I("c",e[2].dataType,e[2].dims.length),_.push(g));let $=M("output",e[0].dataType,o.length);_.push($);let v=[{name:"output_size",type:"u32"},{name:"M",type:"u32"},{name:"N",type:"u32"},{name:"K",type:"u32"},{name:"alpha",type:"f32"},{name:"beta",type:"f32"}];return`
  ${h.registerUniforms(v).declareVariables(..._)}

  ${h.mainStart()}
    ${h.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}

    let m = global_idx / uniforms.N;
    let n = global_idx % uniforms.N;

    var value = ${y}(0);
    for (var k: u32 = 0u; k < uniforms.K; k++) {
      ${c}
    }

    ${f}
    ${g!=null?`let cOffset = ${g.broadcastedIndicesToOffset("vec2(m, n)",$)}; value += ${y}(uniforms.beta) * ${g.getByOffset("cOffset")};`:""}
    output[global_idx] = value;
  }`};return{name:"Gemm",shaderCache:{hint:`${t.cacheKey}`,inputDependencies:d},getRunData:()=>({outputs:[{dims:o,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(u/64)},programUniforms:l}),getShaderSource:p}},Ml=e=>{let t=e.transA,r=e.transB,i=e.alpha,a=e.beta;return{transA:t,transB:r,alpha:i,beta:a,cacheKey:`${e.transA};${e.transB};${e.alpha===1}`}},Pl=(e,t)=>{Hn(e.inputs),e.compute(jn(e.inputs,t))}}),ge,Kn,Dl,zr,Zn,vt,Ul,ql=T(()=>{V(),W(),se(),Si(),Ei(),G(),Fe(),ge=(e,t)=>e.length>t&&e[t].dims.length>0?e[t]:void 0,Kn=(e,t)=>{let r=e[0],i=ge(e,1),a=ge(e,2),s=ge(e,3),n=ge(e,4),o=ge(e,5),u=ge(e,6),l=ge(e,7);if(r.dims.length!==3&&r.dims.length!==5)throw new Error("Input query is expected to have 3 or 5 dimensions");let d=r.dims[0],p=r.dims[1],h=r.dims.length===3?r.dims[2]:t.numHeads*r.dims[4],c=p,f=0,m=0,w=Math.floor(h/t.numHeads);if(u&&l&&S.size(u.dims)&&S.size(l.dims)){if(u.dims.length!==4)throw new Error('Input "past_key" is expected to have 4 dimensions');if(u.dims[0]!==d||u.dims[1]!==t.numHeads||u.dims[3]!==w)throw new Error('Input "past_key" shape (batch_size, num_heads, past_sequence_length, head_size)');if(l.dims[0]!==d||l.dims[1]!==t.numHeads||l.dims[3]!==w)throw new Error('Input "past_value" shape (batch_size, num_heads, past_sequence_length, head_size)');if(u.dims[2]!==l.dims[2])throw new Error('Input "past_key" and "past_value" shall have same dim 2 (past_sequence_length)');if(l.dims.length!==4)throw new Error('Input "past_value" is expected to have 4 dimensions');f=u.dims[2],m=u.dims[2]}else if(u&&S.size(u.dims)||l&&S.size(l.dims))throw new Error('Input "past_key" and "past_value" shall be both present or both absent');let y;if(i&&S.size(i.dims)>0){if(r.dims.length!==3)throw new Error('Input "query" is expected to have 3 dimensions when key is given');if(i.dims.length<3||i.dims.length>5)throw new Error('Input "key" is expected to have 3, 4, or 5 dimensions');if(r.dims[0]!==i.dims[0])throw new Error('Input "query" and "key" shall have same dim 0 (batch size)');if(i.dims.length===3){if(i.dims[2]!==r.dims[2])throw new Error('Input "query" and "key" shall have same dim 2 (hidden_size)');y=2,c=i.dims[1]}else if(i.dims.length===5){if(i.dims[2]!==t.numHeads||i.dims[3]!==2||i.dims[4]!==w)throw new Error('Expect "key" shape (batch_size, kv_sequence_length, num_heads, 2, head_size) for packed kv');if(a)throw new Error('Expect "value" be none when "key" has packed kv format.');y=5,c=i.dims[1]}else{if(i.dims[1]!==t.numHeads||i.dims[3]!==w)throw new Error('Expect "key" shape (batch_size, num_heads, kv_sequence_length, head_size) for past_key');y=0,c=i.dims[2]}}else{if(r.dims.length!==5)throw new Error('Input "query" is expected to have 5 dimensions when key is empty');if(r.dims[2]!==t.numHeads||r.dims[3]!==3)throw new Error('Expect "query" shape (batch_size, kv_sequence_length, num_heads, 3, head_size) for packed kv');y=3}if(s&&S.size(s.dims)>0){if(s.dims.length!==1)throw new Error('Input "bias" is expected to have 1 dimension');if(i&&i.dims.length===5&&i.dims[3]===2)throw new Error("bias is not allowed for packed kv.")}let g=f+c,_=0;if(n&&S.size(n.dims)>0){_=8;let b=n.dims;throw b.length===1?b[0]===d?_=1:b[0]===3*d+2&&(_=3):b.length===2&&b[0]===d&&b[1]===g&&(_=5),_===8?new Error('Input "key_padding_mask" shape shall be (batch_size) or (batch_size, total_sequence_length)'):new Error("Mask not supported")}let $=!1,v=h;if(a&&S.size(a.dims)>0){if(a.dims.length!==3&&a.dims.length!==4)throw new Error('Input "value" is expected to have 3 or 4 dimensions');if(r.dims[0]!==a.dims[0])throw new Error('Input "query" and "value" shall have same dim 0 (batch_size)');if(a.dims.length===3){if(c!==a.dims[1])throw new Error('Input "key" and "value" shall have the same dim 1 (kv_sequence_length)');v=a.dims[2]}else{if(c!==a.dims[2])throw new Error('Input "key" and "value" shall have the same dim 2 (kv_sequence_length)');v=a.dims[1]*a.dims[3],$=!0}}let k=!1;if(n&&S.size(n.dims)>0)throw new Error("Key padding mask is not supported");if(o&&S.size(o.dims)>0){if(o.dims.length!==4)throw new Error('Input "attention_bias" is expected to have 4 dimensions');if(o.dims[0]!==d||o.dims[1]!==t.numHeads||o.dims[2]!==p||o.dims[3]!==g)throw new Error('Expect "attention_bias" shape (batch_size, num_heads, sequence_length, total_sequence_length)')}return{batchSize:d,sequenceLength:p,pastSequenceLength:f,kvSequenceLength:c,totalSequenceLength:g,maxSequenceLength:m,inputHiddenSize:0,hiddenSize:h,vHiddenSize:v,headSize:w,vHeadSize:Math.floor(v/t.numHeads),numHeads:t.numHeads,isUnidirectional:!1,pastPresentShareBuffer:!1,maskFilterValue:t.maskFilterValue,maskType:_,scale:t.scale,broadcastResPosBias:k,passPastInKv:$,qkvFormat:y}},Dl=e=>te({...e}),zr=te({perm:[0,2,1,3]}),Zn=(e,t,r,i,a,s,n)=>{let o=[i,a,s],u=S.size(o),l=[{type:12,data:u},{type:12,data:n},{type:12,data:s}],d=p=>{let h=M("qkv_with_bias",t.dataType,o),c=I("qkv",t.dataType,o),f=I("bias",r.dataType,o),m=[{name:"output_size",type:"u32"},{name:"bias_offset",type:"u32"},{name:"hidden_size",type:"u32"}];return`
  ${p.registerUniforms(m).declareVariables(c,f,h)}
  ${p.mainStart()}
    ${p.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    let bias_offset_idx = (global_idx % uniforms.hidden_size) + uniforms.bias_offset;

    qkv_with_bias[global_idx] = qkv[global_idx] + bias[bias_offset_idx];
  }`};return e.compute({name:"MultiHeadAttentionAddBias",shaderCache:{inputDependencies:["type","type"]},getRunData:()=>({outputs:[{dims:o,dataType:t.dataType,gpuDataType:0}],dispatchGroup:{x:Math.ceil(u/64)},programUniforms:l}),getShaderSource:d},{inputs:[t,r],outputs:[-1]})[0]},vt=(e,t,r,i,a,s,n,o)=>{let u=s;if(n&&S.size(n.dims)>0){if(i===1)throw new Error("AddBiasReshape is not implemented. Please export your model with packed QKV or KV");return u=Zn(e,s,n,t,i,r*a,o),u=u.reshape([t,i,r,a]),r===1||i===1?u:e.compute(_e(u,zr.perm),{inputs:[u],outputs:[-1]})[0]}else return s.dims.length===3&&(u=s.reshape([t,i,r,a])),r===1||i===1?u:e.compute(_e(u,zr.perm),{inputs:[u],outputs:[-1]})[0]},Ul=(e,t)=>{let r=Kn(e.inputs,t),i=e.inputs[0],a=ge(e.inputs,1),s=ge(e.inputs,2),n=ge(e.inputs,3),o=ge(e.inputs,4),u=ge(e.inputs,5),l=ge(e.inputs,6),d=ge(e.inputs,7);if(i.dims.length===5)throw new Error("Packed QKV is not implemented");if((a==null?void 0:a.dims.length)===5)throw new Error("Packed KV is not implemented");let p=a&&s&&a.dims.length===4&&s.dims.length===4,h=vt(e,r.batchSize,r.numHeads,r.sequenceLength,r.headSize,i,n,0);if(p)return It(e,h,a,s,o,void 0,l,d,u,r,t);if(!a||!s)throw new Error("key and value must be provided");let c=vt(e,r.batchSize,r.numHeads,r.kvSequenceLength,r.headSize,a,n,r.hiddenSize),f=vt(e,r.batchSize,r.numHeads,r.kvSequenceLength,r.vHeadSize,s,n,2*r.hiddenSize);It(e,h,c,f,o,void 0,l,d,u,r,t)}}),Er,Qn,Xn,oi,Vl,Nl=T(()=>{V(),W(),G(),Er=e=>Array.from(e.getBigInt64Array(),Number),Qn=e=>{if(!e||e.length!==2)throw new Error("Tile requires 2 inputs.");if(e[0].dataType!==1&&e[0].dataType!==10&&e[0].dataType!==6&&e[0].dataType!==12)throw new Error("Tile only support float, float16, int32, and uint32 data types");if(e[1].dataType!==7)throw new Error("Tile `repeats` input should be of int64 data type");if(e[1].dims.length!==1)throw new Error("Tile `repeats` input should be 1-D");if(Er(e[1]).length!==e[0].dims.length)throw new Error("Tile `repeats` input should have same number of elements as rank of input data tensor")},Xn=(e,t)=>{let r=[];for(let i=0;i<e.length;++i)r.push(e[i]*t[i]);return r},oi=(e,t)=>{let r=e[0].dims,i=t??Er(e[1]),a=Xn(r,i),s=S.size(a),n=e[0].dataType,o=I("input",n,r.length),u=M("output",n,a.length),l=d=>`
      const inputShape = ${o.indices(...r)};
      ${d.registerUniform("output_size","u32").declareVariables(o,u)}
      ${d.mainStart()}
      ${d.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
      let output_indices = ${u.offsetToIndices("global_idx")};
      var input_indices: ${o.type.indices};
      for (var i = 0; i < ${r.length}; i++) {
        let input_dim_i = ${o.indicesGet("uniforms.input_shape","i")};
        let input_dim_value = ${u.indicesGet("output_indices","i")}  % input_dim_i;

        ${o.indicesSet("input_indices","i","input_dim_value")}
      }
      ${u.setByOffset("global_idx",o.getByIndices("input_indices"))}
    }`;return{name:"Tile",shaderCache:{hint:`${i}`,inputDependencies:["rank"]},getRunData:()=>({outputs:[{dims:a,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(s/64)},programUniforms:[{type:12,data:s},...B(e[0].dims,a)]}),getShaderSource:l}},Vl=e=>{Qn(e.inputs),e.compute(oi(e.inputs),{inputs:[0]})}}),Yn,Tr,Ll,Jn,Cr,Wl,Up=T(()=>{V(),W(),se(),Ei(),G(),ql(),Nl(),Fe(),Yn=(e,t)=>{let r=e[0],i=e[1],a=e[2],s=e[3],n=e[4];if(r.dims.length!==3&&r.dims.length!==5)throw new Error("Input query is expected to have 3 or 5 dimensions");let o=!1,u=r.dims[0],l=r.dims[1],d=r.dims.length===3?o?r.dims[2]/3:r.dims[2]:t.numHeads*r.dims[4],p=l,h=0,c=0,f=Math.floor(d/t.numHeads),m=s&&s.dims.length!==0,w=n&&n.dims.length!==0,y=!0;if(m&&w){if(s.dims.length!==4)throw new Error('Input "past_key" is expected to have 4 dimensions');if(n.dims.length!==4)throw new Error('Input "past_value" is expected to have 4 dimensions');h=s.dims[1],c=s.dims[1]}else if(m||w)throw new Error('Input "past_key" and "past_value" shall be both present or both absent');let g;if(i){if(r.dims.length!==3)throw new Error('Input "query" is expected to have 3 dimensions when key is given');if(i.dims.length<3||i.dims.length>5)throw new Error('Input "key" is expected to have 3, 4, or 5 dimensions');if(r.dims[0]!==i.dims[0])throw new Error('Input "query" and "key" shall have same dim 0 (batch size)');if(i.dims.length===3){if(r.dims[2]%i.dims[2]!==0)throw new Error('Dimension 2 of "query" should be a multiple of "key"');g=2,p=i.dims[1]}else if(i.dims.length===5){if(i.dims[2]!==t.numHeads||i.dims[3]!==2||i.dims[4]!==f)throw new Error('Expect "key" shape (batch_size, kv_sequence_length, num_heads, 2, head_size) for packed kv');if(a)throw new Error('Expect "value" be none when "key" has packed kv format.');g=5,p=i.dims[1]}else{if(i.dims[1]!==t.numHeads||i.dims[3]!==f)throw new Error('Expect "key" shape (batch_size, num_heads, kv_sequence_length, head_size) for past_key');g=0,p=i.dims[2]}}else{if(r.dims.length!==3&&r.dims.length!==5)throw new Error('Input "query" is expected to have 3 or 5 dimensions when key is empty');if(r.dims.length===5&&(r.dims[2]!==t.numHeads||r.dims[3]!==3))throw new Error('Expect "query" shape (batch_size, kv_sequence_length, num_heads, 3, head_size) for packed kv');g=3}let _=0,$=!1,v=d;if(a){if(a.dims.length!==3&&a.dims.length!==4)throw new Error('Input "value" is expected to have 3 or 4 dimensions');if(r.dims[0]!==a.dims[0])throw new Error('Input "query" and "value" shall have same dim 0 (batch_size)');if(a.dims.length===3){if(p!==a.dims[1])throw new Error('Input "key" and "value" shall have the same dim 1 (kv_sequence_length)');v=a.dims[2]}else{if(p!==a.dims[2])throw new Error('Input "past_key" and "past_value" shall have the same dim 2 (kv_sequence_length)');v=a.dims[1]*a.dims[3],$=!0}}let k=h+p;return{batchSize:u,sequenceLength:l,pastSequenceLength:h,kvSequenceLength:p,totalSequenceLength:k,maxSequenceLength:c,inputHiddenSize:0,hiddenSize:d,vHiddenSize:v,headSize:f,vHeadSize:Math.floor(v/t.kvNumHeads),numHeads:t.numHeads,kvNumHeads:t.kvNumHeads,nReps:t.numHeads/t.kvNumHeads,pastPresentShareBuffer:!1,maskType:_,scale:t.scale,broadcastResPosBias:!1,passPastInKv:$,qkvFormat:g,isPastkvBSNH:y}},Tr=(e,t,r,i)=>{let a=[i.batchSize,i.totalSequenceLength,i.kvNumHeads,i.headSize],s=4,n=S.size(a)/s,o=i.totalSequenceLength,u=M("present_kv",r,a.length,s),l=I("new_kv",e.dataType,e.dims.length,s),d=t?I("past_kv",t.dataType,t.dims.length,s):void 0,p=Math.ceil(i.headSize/s),h={x:o,y:e.dims[0],z:1},c=t?["rank","rank"]:["rank"],f=[{type:12,data:n},{type:12,data:i.pastSequenceLength},{type:12,data:i.kvSequenceLength},{type:12,data:i.totalSequenceLength}],m=[l];d?(f.push(...B(e.dims),...B(t.dims),...B(a)),m.push(d)):f.push(...B(e.dims),...B(a));let w=[{name:"output_size",type:"u32"},{name:"past_seqlen",type:"u32"},{name:"new_seqlen",type:"u32"},{name:"present_seqlen",type:"u32"}],y=`      let past_batch_stride = uniforms.past_seqlen * num_heads * H;
        var past_head_stride = uniforms.past_seqlen * H;
        if (is_bsnh) {
          past_head_stride = H;
        }
        let in_offset = b * past_batch_stride + s * row_stride + n * past_head_stride + h;
        present_kv[out_offset] = past_kv[in_offset];`,g=`      let new_batch_stride = uniforms.new_seqlen * num_heads * H;
        let new_row_stride = num_heads * H;
        let new_head_stride = H;
        let in_offset = b * new_batch_stride + (s - past_seqlen) * new_row_stride + n * new_head_stride + h;
        present_kv[out_offset] = new_kv[in_offset];`,_=t?`if (s < past_seqlen) {
        ${y}
        } else if (s < past_seqlen + uniforms.new_seqlen) {
        ${g}
        }`:`if (s < past_seqlen + uniforms.new_seqlen) {
          ${g}
        }`,$=v=>`

  ${v.registerUniforms(w).declareVariables(...m,u)}
  ${v.mainStart([p,i.kvNumHeads,1])}
    ${v.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    var indices = ${u.offsetToIndices("global_idx")};
    let h = local_id.x;
    let n = local_id.y;
    let s = workgroup_id.x;
    let b = workgroup_id.y;
    let num_heads = ${i.kvNumHeads}u;
    let H = ${p}u;

    let present_seqlen = uniforms.present_seqlen;
    let present_batch_stride = present_seqlen * num_heads * H;
    var row_stride = H;
    let is_bsnh = ${i.isPastkvBSNH};

    if (is_bsnh) {
      row_stride = num_heads * H;
    }
    var present_head_stride = present_seqlen * H;
    if (is_bsnh) {
      present_head_stride = H;
    }

    let past_seqlen = uniforms.past_seqlen;

    let out_offset = b * present_batch_stride + s * row_stride + n * present_head_stride + h;
    ${_}
  }`;return{name:"ConcatPastNew",shaderCache:{hint:`${i.kvNumHeads}${p}${!!t}`,inputDependencies:c},getRunData:()=>({outputs:[{dims:a,dataType:r}],dispatchGroup:h,programUniforms:f}),getShaderSource:$}},Ll=e=>te({...e}),Jn=te({perm:[0,2,1,3]}),Cr=(e,t,r,i,a)=>{let s=t,n=i.kvNumHeads,o=i.nReps;return t.dims.length===3&&i.kvSequenceLength!==0&&(s=t.reshape([i.batchSize,i.kvSequenceLength,n,i.headSize])),r?s=e.compute(Tr(s,r,s.dataType,i),{inputs:[s,r],outputs:[i.isPastkvBSNH?a:-1]})[0]:s=e.compute(Tr(s,void 0,s.dataType,i),{inputs:[s],outputs:[i.isPastkvBSNH?a:-1]})[0],o!==1&&(s=e.compute(oi([s],[1,1,1,o]),{inputs:[s],outputs:[-1]})[0],s=s.reshape([i.batchSize,i.totalSequenceLength,n*o,i.headSize])),e.compute(_e(s,Jn.perm),{inputs:[s],outputs:[-1]})[0]},Wl=(e,t)=>{var u;let r=Yn(e.inputs,t);if(e.inputs[0].dims.length===5)throw new Error("Packed QKV is not implemented");if(((u=e.inputs[1])==null?void 0:u.dims.length)===5)throw new Error("Packed KV is not implemented");let i=vt(e,r.batchSize,r.numHeads,r.sequenceLength,r.headSize,e.inputs[0],void 0,0),a=e.inputs[3]&&e.inputs[3].dims.length!==0?e.inputs[3]:void 0,s=e.inputs[4]&&e.inputs[4].dims.length!==0?e.inputs[4]:void 0,n=Cr(e,e.inputs[1],a,r,1),o=Cr(e,e.inputs[2],s,r,2);It(e,i,n,o,void 0,void 0,void 0,void 0,void 0,r,t)}}),Ar,es,ts,Gl,qp=T(()=>{V(),W(),Fe(),G(),Ar=(e,t,r,i,a,s,n,o)=>{let u=ae(s),l=u===1?"f32":`vec${u}f`,d=u===1?"vec2f":`mat2x${u}f`,p=a*n,h=[a,n,s/u],c=[a,n,2],f=["rank","type","type"],m=[];m.push(...B(h,c));let w=y=>{let g=I("x",t.dataType,3,u),_=I("scale",r.dataType,r.dims),$=I("bias",i.dataType,i.dims),v=M("output",1,3,2),k=[g,_,$,v],b=64;return`
  var<workgroup> workgroup_shared : array<${d}, ${b}>;
  const workgroup_size = ${b}u;
  ${y.declareVariables(...k)}
  ${y.mainStart(b)}
    let batch = workgroup_index / uniforms.x_shape[1];
    let channel = workgroup_index % uniforms.x_shape[1];
    let hight = uniforms.x_shape[2];
    // initialize workgroup memory
    var sum = ${l}(0);
    var squared_sum = ${l}(0);
    for (var h = local_idx; h < hight; h += workgroup_size) {
      let value = ${l}(${g.get("batch","channel","h")});
      sum += value;
      squared_sum += value * value;
    }
    workgroup_shared[local_idx] = ${d}(sum, squared_sum);
    workgroupBarrier();

    for (var currSize = workgroup_size >> 1;  currSize > 0; currSize = currSize >> 1) {
      if (local_idx < currSize) {
        workgroup_shared[local_idx] = workgroup_shared[local_idx] + workgroup_shared[local_idx + currSize];
      }
      workgroupBarrier();
    }
    if (local_idx == 0) {
      let sum_final = ${Ne("workgroup_shared[0][0]",u)} / f32(hight * ${u});
      let squared_sum_final = ${Ne("workgroup_shared[0][1]",u)} / f32(hight * ${u});

      let inv_std_dev = inverseSqrt(squared_sum_final - sum_final * sum_final + f32(${o}));
      let channel_scale = inv_std_dev * f32(scale[channel]);
      let channel_shift = f32(bias[channel]) - sum_final * channel_scale;
      output[workgroup_index] = vec2f(channel_scale, channel_shift);
    }
  }`};return e.compute({name:"InstanceNormComputeChannelScaleShift",shaderCache:{hint:`${u};${o}`,inputDependencies:f},getRunData:()=>({outputs:[{dims:c,dataType:1}],dispatchGroup:{x:p},programUniforms:m}),getShaderSource:w},{inputs:[t,r,i],outputs:[-1]})[0]},es=(e,t,r)=>{let i=t[0].dims,a=i,s=2,n=i[0],o=i[1],u=S.sizeFromDimension(i,s),l=ae(u),d=S.size(a)/l,p=Ar(e,t[0],t[1],t[2],n,u,o,r.epsilon),h=[n,o,u/l],c=[n,o],f=["type","none"],m=w=>{let y=I("x",t[0].dataType,h.length,l),g=I("scale_shift",1,c.length,2),_=M("output",t[0].dataType,h.length,l),$=[y,g,_];return`
  ${w.registerUniform("output_size","u32").declareVariables(...$)}
  ${w.mainStart()}
  ${w.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
      let outputIndices = ${_.offsetToIndices("global_idx")};
      let batch = outputIndices[0];
      let channel = outputIndices[1];
      let scale_shift = ${g.getByIndices("vec2<u32>(batch, channel)")};
      let value = ${y.getByOffset("global_idx")} * ${_.type.value}(scale_shift.x) + ${_.type.value}(scale_shift.y);
      ${_.setByOffset("global_idx","value")};
  }`};e.compute({name:"InstanceNormalization",shaderCache:{hint:`${l}`,inputDependencies:f},getRunData:()=>({outputs:[{dims:a,dataType:t[0].dataType}],dispatchGroup:{x:Math.ceil(d/64)},programUniforms:[{type:12,data:d},...B(h,c,h)]}),getShaderSource:m},{inputs:[t[0],p]})},ts=(e,t,r)=>{let i=t[0].dims,a=i,s=i[0],n=i[i.length-1],o=S.sizeFromDimension(i,1)/n,u=ae(n),l=S.size(a)/u,d=[{type:12,data:o},{type:12,data:Math.floor(n/u)}],p=["type","type"],h=[0,i.length-1];for(let w=0;w<i.length-2;w++)h.push(w+1);let c=e.compute(_e(e.inputs[0],h),{inputs:[e.inputs[0]],outputs:[-1]})[0],f=Ar(e,c,t[1],t[2],s,o,n,r.epsilon),m=w=>{let y=ue(t[0].dataType),g=u===1?"vec2f":`mat${u}x2f`,_=k=>{let b=k===0?"x":"y",E=u===1?"f32":`vec${u}f`;switch(u){case 1:return`${y}(${E}(scale.${b}))`;case 2:return`vec2<${y}>(${E}(scale[0].${b}, scale[1].${b}))`;case 4:return`vec4<${y}>(${E}(scale[0].${b}, scale[1].${b}, scale[2].${b}, scale[3].${b}))`;default:throw new Error(`Not supported compoents ${u}`)}},$=I("input",t[0].dataType,t[0].dims,u),v=M("output",t[0].dataType,a,u);return`
  @group(0) @binding(0) var<storage, read> input : array<${$.type.storage}>;
  @group(0) @binding(1) var<storage, read> scale_input : array<${g}>;
  @group(0) @binding(2) var<storage, read_write> output : array<${v.type.storage}>;
  struct Uniforms {H: u32, C : u32};
  @group(0) @binding(3) var<uniform> uniforms: Uniforms;

  ${w.mainStart()}
    let current_image_number = global_idx / (uniforms.C * uniforms.H);
    let current_channel_number = global_idx % uniforms.C;

    let scale_offset = current_image_number * uniforms.C + current_channel_number;
    let scale = scale_input[scale_offset];
    output[global_idx] = fma(input[global_idx], ${_(0)}, ${_(1)});
  }`};e.compute({name:"InstanceNormalizationNHWC",shaderCache:{hint:`${u}`,inputDependencies:p},getRunData:()=>({outputs:[{dims:a,dataType:t[0].dataType}],dispatchGroup:{x:Math.ceil(l/64)},programUniforms:d}),getShaderSource:m},{inputs:[t[0],f]})},Gl=(e,t)=>{t.format==="NHWC"?ts(e,e.inputs,t):es(e,e.inputs,t)}}),rs,is,Fl,Vp=T(()=>{V(),W(),G(),rs=e=>{if(!e||e.length<2)throw new Error("layerNorm requires at least 2 inputs.")},is=(e,t,r)=>{let i=t.simplified,a=e[0].dims,s=e[1],n=!i&&e[2],o=a,u=S.normalizeAxis(t.axis,a.length),l=S.sizeToDimension(a,u),d=S.sizeFromDimension(a,u),p=S.size(s.dims),h=n?S.size(n.dims):0;if(p!==d||n&&h!==d)throw new Error(`Size of X.shape()[axis:] == ${d}.
       Size of scale and bias (if provided) must match this.
       Got scale size of ${p} and bias size of ${h}`);let c=[];for(let v=0;v<a.length;++v)v<u?c.push(a[v]):c.push(1);let f=ae(d),m=["type","type"],w=[{type:12,data:l},{type:1,data:d},{type:12,data:Math.floor(d/f)},{type:1,data:t.epsilon}];n&&m.push("type");let y=r>1,g=r>2,_=v=>{let k=ue(e[0].dataType),b=[I("x",e[0].dataType,e[0].dims,f),I("scale",s.dataType,s.dims,f)];n&&b.push(I("bias",n.dataType,n.dims,f)),b.push(M("output",e[0].dataType,o,f)),y&&b.push(M("mean_data_output",1,c)),g&&b.push(M("inv_std_output",1,c));let E=[{name:"norm_count",type:"u32"},{name:"norm_size",type:"f32"},{name:"norm_size_vectorized",type:"u32"},{name:"epsilon",type:"f32"}];return`
  ${v.registerUniforms(E).declareVariables(...b)}
  ${v.mainStart()}
    ${v.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.norm_count")}
    let offset = global_idx * uniforms.norm_size_vectorized;
    var mean_vector = ${Yr("f32",f)};
    var mean_square_vector = ${Yr("f32",f)};

    for (var h: u32 = 0u; h < uniforms.norm_size_vectorized; h++) {
      let value = ${nt(k,f,"x[h + offset]")};
      mean_vector += value;
      mean_square_vector += value * value;
    }
    let mean = ${Ne("mean_vector",f)} / uniforms.norm_size;
    let inv_std_dev = inverseSqrt(${Ne("mean_square_vector",f)} / uniforms.norm_size ${i?"":"- mean * mean"} + uniforms.epsilon);

    for (var j: u32 = 0; j < uniforms.norm_size_vectorized; j++) {
      let f32input = ${nt(k,f,"x[j + offset]")};
      let f32scale = ${nt(k,f,"scale[j]")};
      output[j + offset] = ${b[0].type.value}((f32input ${i?"":"- mean"}) * inv_std_dev * f32scale
        ${n?`+ ${nt(k,f,"bias[j]")}`:""}
      );
    }

    ${y?"mean_data_output[global_idx] = mean":""};
    ${g?"inv_std_output[global_idx] = inv_std_dev":""};
  }`},$=[{dims:o,dataType:e[0].dataType}];return y&&$.push({dims:c,dataType:1}),g&&$.push({dims:c,dataType:1}),{name:"LayerNormalization",shaderCache:{hint:`${f};${r};${i}`,inputDependencies:m},getRunData:()=>({outputs:$,dispatchGroup:{x:Math.ceil(l/64)},programUniforms:w}),getShaderSource:_}},Fl=(e,t)=>{rs(e.inputs),e.compute(is(e.inputs,t,e.outputCount))}}),as,ns,ss,Hl,jl,Np=T(()=>{V(),W(),se(),G(),as=(e,t)=>{if(e.length<3||e.length>4)throw new Error("MatMulNBits requires 3 or 4 inputs");let r=e[0],i=r.dims.length;if(r.dims[i-1]!==t.k)throw new Error("The last dim of input shape does not match the k value");let a=Math.floor((t.k+t.blockSize-1)/t.blockSize),s=t.blockSize/8*t.bits,n=e[1];if(!S.areEqual(n.dims,[t.n,a,s]))throw new Error("The second inputs must be 3D tensor with shape N X nBlocksPerCol X blobSize");let o=e[2].dims;if(S.size(o)!==t.n*a)throw new Error("scales input size error.");if(e.length===4){let u=e[3].dims,l=t.bits>4?t.n*a:t.n*Math.floor((a+1)/2);if(S.size(u)!==l)throw new Error("zeroPoints input size error.")}},ns=(e,t)=>{let r=e[0].dims,i=r.length,a=r[i-2],s=t.k,n=t.n,o=r.slice(0,i-2),u=S.size(o),l=e[1].dims[2]/4,d=e[0].dataType,p=ae(t.k),h=ae(l),c=ae(n),f=o.concat([a,n]),m=a>1&&n/c%2===0?2:1,w=S.size(f)/c/m,y=64,g=[],_=[u,a,s/p],$=S.convertShape(e[1].dims).slice();$.splice(-1,1,l/h),g.push(...B(_)),g.push(...B($)),g.push(...B(e[2].dims)),e.length===4&&g.push(...B(S.convertShape(e[3].dims)));let v=[u,a,n/c];g.push(...B(v));let k=b=>{let E=_.length,C=I("a",e[0].dataType,E,p),A=I("b",12,$.length,h),q=I("scales",e[2].dataType,e[2].dims.length),P=[C,A,q],L=e.length===4?I("zero_points",12,e[3].dims.length):void 0;L&&P.push(L);let F=v.length,Q=M("output",e[0].dataType,F,c),Z=ue(e[0].dataType),N=(()=>{switch(p){case 1:return`array<${Z}, 8>`;case 2:return`mat4x2<${Z}>`;case 4:return`mat2x4<${Z}>`;default:throw new Error(`${p}-component is not supported.`)}})(),R=()=>{let x=`
          // reuse a data
            var input_offset = ${C.indicesToOffset(`${C.type.indices}(batch, row, word_offset)`)};
            var a_data: ${N};
            for (var j: u32 = 0; j < ${8/p}; j++) {
              a_data[j] = ${C.getByOffset("input_offset")};
              input_offset++;
            }
          `;for(let z=0;z<c*m;z++)x+=`
            b_value = ${h===1?`b${z}_data`:`b${z}_data[i]`};
            b_value_lower = unpack4xU8(b_value & b_mask);
            b_value_upper = unpack4xU8((b_value >> 4) & b_mask);
            b_quantized_values = ${N}(${Array.from({length:4},(D,j)=>`${Z}(b_value_lower[${j}]), ${Z}(b_value_upper[${j}])`).join(", ")});
            b_dequantized_values = ${p===1?`${N}(${Array.from({length:8},(D,j)=>`(b_quantized_values[${j}] - ${L?`zero_point${z}`:"zero_point"}) * scale${z}`).join(", ")});`:`(b_quantized_values - ${N}(${Array(8).fill(`${L?`zero_point${z}`:"zero_point"}`).join(",")})) * scale${z};`};
            workgroup_shared[local_id.x * ${m} + ${Math.floor(z/c)}]${c>1?`[${z%c}]`:""} += ${Array.from({length:8/p},(D,j)=>`${p===1?`a_data[${j}] * b_dequantized_values[${j}]`:`dot(a_data[${j}], b_dequantized_values[${j}])`}`).join(" + ")};
          `;return x},U=()=>{let x=`
            var col_index = col * ${c};
            ${L?`
            let zero_point_bytes_per_col = (nBlocksPerCol + 1) / 2;
            var zero_point_byte_count: u32;
            var zero_point_word_index: u32;
            var zero_point_byte_offset: u32;
            let zero_point_nibble_offset: u32 = block & 0x1u;
            var zero_point_bits_offset: u32;
            var zero_point_word: u32;`:`
            // The default zero point is 8 for unsigned 4-bit quantization.
            let zero_point = ${Z}(8);`}
            `;for(let z=0;z<c*m;z++)x+=`
            let scale${z} = ${q.getByOffset("col_index * nBlocksPerCol + block")};
            ${L?`
            zero_point_byte_count = col_index * zero_point_bytes_per_col + (block >> 0x1u);
            zero_point_word_index = zero_point_byte_count >> 0x2u;
            zero_point_byte_offset = zero_point_byte_count & 0x3u;
            zero_point_bits_offset = (zero_point_byte_offset << 3) + (zero_point_nibble_offset << 2);
            zero_point_word = ${L.getByOffset("zero_point_word_index")} >> zero_point_bits_offset;
            let zero_point${z} = ${Z}((zero_point_word) & 0xFu);`:""}
            col_index += 1;`;return x},H=()=>{let x=`col_index = col * ${c};`;for(let z=0;z<c*m;z++)x+=`
            let b${z}_data = ${A.getByIndices(`${A.type.indices}(col_index, block, word)`)};
            col_index += 1;`;return x+=`
            var b_value: u32;
            let b_mask: u32 = 0x0F0F0F0Fu;
            var b_value_lower: vec4<u32>;
            var b_value_upper: vec4<u32>;
            var b_quantized_values: ${N};
            var b_dequantized_values: ${N};`,x};return`
        var<workgroup> workgroup_shared: array<${Q.type.value}, ${m*y}>;
        ${b.declareVariables(...P,Q)}
        ${b.mainStart([y,1,1])}
          let output_indices = ${Q.offsetToIndices(`(global_idx / ${y}) * ${m}`)};
          let col = output_indices[2];
          let row = output_indices[1];
          let batch = output_indices[0];
          let nBlocksPerCol = uniforms.b_shape[1];

          for (var block = local_id.x; block < nBlocksPerCol; block += ${y}) {
            //process one block
            var word_offset: u32 = block * ${t.blockSize/p};
            ${U()}
            for (var word: u32 = 0; word < ${l}; word += ${h}) {
              ${H()}
              for (var i: u32 = 0; i < ${h}; i++) {
                ${R()}
                word_offset += ${8/p};
              }
            }
          }
          workgroupBarrier();

          if (local_id.x < ${m}) {
            var output_value: ${Q.type.value} = ${Q.type.value}(0);
            var workgroup_shared_offset: u32 = local_id.x;
            for (var b: u32 = 0u; b < ${y}u; b++) {
              output_value += workgroup_shared[workgroup_shared_offset];
              workgroup_shared_offset += ${m};
            }
            ${Q.setByIndices(`${Q.type.indices}(batch, row, col + local_id.x)`,"output_value")};
          }
        }`};return{name:"MatMulNBits",shaderCache:{hint:`${t.blockSize};${t.bits};${p};${h};${c};${m};${y}`,inputDependencies:Array(e.length).fill("rank")},getRunData:()=>({outputs:[{dims:f,dataType:d}],dispatchGroup:{x:w},programUniforms:g}),getShaderSource:k}},ss=(e,t)=>{let r=e[0].dims,i=r.length,a=r[i-2],s=t.k,n=t.n,o=r.slice(0,i-2),u=S.size(o),l=e[1].dims[2]/4,d=e[0].dataType,p=ae(t.k),h=ae(l),c=o.concat([a,n]),f=128,m=n%8===0?8:n%4===0?4:1,w=f/m,y=w*h*8,g=y/p,_=y/t.blockSize,$=S.size(c)/m,v=[],k=[u,a,s/p],b=S.convertShape(e[1].dims).slice();b.splice(-1,1,l/h),v.push(...B(k)),v.push(...B(b)),v.push(...B(e[2].dims)),e.length===4&&v.push(...B(S.convertShape(e[3].dims)));let E=[u,a,n];v.push(...B(E));let C=A=>{let q=k.length,P=I("a",e[0].dataType,q,p),L=I("b",12,b.length,h),F=I("scales",e[2].dataType,e[2].dims.length),Q=[P,L,F],Z=e.length===4?I("zero_points",12,e[3].dims.length):void 0;Z&&Q.push(Z);let N=E.length,R=M("output",e[0].dataType,N),U=ue(e[0].dataType),H=()=>{switch(p){case 1:return`
          let a_data0 = vec4<${U}>(sub_a[word_offset], sub_a[word_offset + 1], sub_a[word_offset + 2], sub_a[word_offset + 3]);
          let a_data1 = vec4<${U}>(sub_a[word_offset + 4], sub_a[word_offset + 5], sub_a[word_offset + 6], sub_a[word_offset + 7]);`;case 2:return`
          let a_data0 = vec4<${U}>(sub_a[word_offset], sub_a[word_offset + 1]);
          let a_data1 = vec4<${U}>(sub_a[word_offset + 2], sub_a[word_offset + 3]);`;case 4:return`
          let a_data0 = sub_a[word_offset];
          let a_data1 = sub_a[word_offset + 1];`;default:throw new Error(`${p}-component is not supported.`)}};return`
        var<workgroup> sub_a: array<${P.type.value}, ${g}>;
        var<workgroup> inter_results: array<array<${R.type.value}, ${w}>, ${m}>;
        ${A.declareVariables(...Q,R)}
        ${A.mainStart([w,m,1])}
          let output_indices = ${R.offsetToIndices(`workgroup_index * ${m}`)};
          let col = output_indices[2];
          let row = output_indices[1];
          let batch = output_indices[0];
          let n_blocks_per_col = uniforms.b_shape[1];
          let num_tiles =  (n_blocks_per_col - 1) / ${_} + 1;

          // Loop over shared dimension.
          for (var tile: u32 = 0; tile < num_tiles; tile += 1) {
            let a_col_start = tile * ${g};
            // load one tile A data into shared memory.
            for (var a_offset = local_idx; a_offset < ${g}; a_offset += ${f})
            {
              let a_col = a_col_start + a_offset;
              if (a_col < uniforms.a_shape[2])
              {
                sub_a[a_offset] = ${P.getByIndices(`${P.type.indices}(batch, row, a_col)`)};
              } else {
                sub_a[a_offset] = ${P.type.value}(0);
              }
            }
            workgroupBarrier();

            // each thread process one block
            let b_row = col + local_id.y;
            let block = tile * ${_} + local_id.x;
            ${Z?`
            let zero_point_bytes_per_col = (n_blocks_per_col + 1) / 2;
            let zero_point_byte_count = b_row * zero_point_bytes_per_col + (block >> 0x1u);
            let zero_point_word_index = zero_point_byte_count >> 0x2u;
            let zero_point_byte_offset = zero_point_byte_count & 0x3u;
            let zero_point_nibble_offset: u32 = block & 0x1u;
            let zero_point_bits_offset = (zero_point_byte_offset << 3) + (zero_point_nibble_offset << 2);
            let zero_point_word = ${Z.getByOffset("zero_point_word_index")} >> zero_point_bits_offset;
            let zero_point = ${U}((zero_point_word) & 0xFu);`:`
            // The default zero point is 8 for unsigned 4-bit quantization.
            let zero_point = ${U}(8);`}
            let scale = ${F.getByOffset("b_row * n_blocks_per_col + block")};
            let b_data = ${L.getByIndices(`${L.type.indices}(b_row, block, 0)`)};
            var word_offset = local_id.x * ${t.blockSize/p};
            for (var i: u32 = 0; i < ${h}; i++) {
              ${H()}
              let b_value = ${h===1?"b_data":"b_data[i]"};
              let b_value_lower = unpack4xU8(b_value & 0x0F0F0F0Fu);
              let b_value_upper = unpack4xU8((b_value >> 4) & 0x0F0F0F0Fu);
              let b_quantized_values = mat2x4<${U}>(${Array.from({length:4},(x,z)=>`${U}(b_value_lower[${z}]), ${U}(b_value_upper[${z}])`).join(", ")});
              let b_dequantized_values = (b_quantized_values - mat2x4<${U}>(${Array(8).fill("zero_point").join(",")})) * scale;
              inter_results[local_id.y][local_id.x] += ${Array.from({length:2},(x,z)=>`${`dot(a_data${z}, b_dequantized_values[${z}])`}`).join(" + ")};
              word_offset += ${8/p};
            }
            workgroupBarrier();
          }

          if (local_idx < ${m}) {
            var output_value: ${R.type.value} = ${R.type.value}(0);
            for (var b = 0u; b < ${w}; b++) {
              output_value += inter_results[local_idx][b];
            }
            if (col + local_idx < uniforms.output_shape[2])
            {
              ${R.setByIndices(`${R.type.indices}(batch, row, col + local_idx)`,"output_value")}
            }
          }
        }`};return{name:"BlockwiseMatMulNBits32",shaderCache:{hint:`${t.blockSize};${p};${h};${w};${m}`,inputDependencies:Array(e.length).fill("rank")},getRunData:()=>({outputs:[{dims:c,dataType:d}],dispatchGroup:{x:$},programUniforms:v}),getShaderSource:C}},Hl=(e,t)=>{as(e.inputs,t),t.blockSize===32&&e.adapterInfo.isVendor("intel")&&e.adapterInfo.isArchitecture("gen-12lp")?e.compute(ss(e.inputs,t)):e.compute(ns(e.inputs,t))},jl=e=>te(e)}),os,us,ls,ds,ps,hs,cs,fs,Kl,Lp=T(()=>{V(),W(),G(),os=e=>{if(!e||e.length<1)throw new Error("Too few inputs");if(e[0].dataType!==1&&e[0].dataType!==10)throw new Error("Input type must be float or float16.");if(e.length>=2){let t=e[0].dims.length*2===e[1].dims[0];if(e.length===4&&(t=e[3].dims[0]*2===e[1].dims[0]),!t)throw new Error("The pads should be a 1D tensor of shape [2 * input_rank] or [2 * num_axes].")}},us=(e,t,r)=>{let i="";for(let a=t-1;a>=0;--a)i+=`
            k = i32(${e.indicesGet("indices",a)}) - ${O("uniforms.pads",a,r)};
            if (k < 0) {
              break;
            }
            if (k >= i32(${O("uniforms.x_shape",a,t)})) {
              break;
            }
            offset += k * i32(${O("uniforms.x_strides",a,t)});
        `;return`
          value = ${e.type.value}(uniforms.constant_value);
          for (var i = 0; i < 1; i++) {
            var offset = 0;
            var k = 0;
            ${i}
            value = x[offset];
          }
      `},ls=(e,t,r)=>{let i="";for(let a=t-1;a>=0;--a)i+=`
                k = i32(${e.indicesGet("indices",a)}) - ${O("uniforms.pads",a,r)};
                if (k < 0) {
                  k = -k;
                }
                {
                  let _2n_1 = 2 * (i32(${O("uniforms.x_shape",a,t)}) - 1);
                  k = k % _2n_1;
                  if(k >= i32(${O("uniforms.x_shape",a,t)})) {
                    k = _2n_1 - k;
                  }
                }
                offset += k * i32(${O("uniforms.x_strides",a,t)});
            `;return`
              var offset = 0;
              var k = 0;
              ${i}
              value = x[offset];
          `},ds=(e,t,r)=>{let i="";for(let a=t-1;a>=0;--a)i+=`
                k = i32(${e.indicesGet("indices",a)}) - ${O("uniforms.pads",a,r)};
                if (k < 0) {
                  k = 0;
                }
                if (k >= i32(${O("uniforms.x_shape",a,t)})) {
                  k = i32(${O("uniforms.x_shape",a,t)}) - 1;
                }
                offset += k * i32(${O("uniforms.x_strides",a,t)});
            `;return`
              var offset = 0;
              var k = 0;
              ${i}
              value = x[offset];
          `},ps=(e,t,r)=>{let i="";for(let a=t-1;a>=0;--a)i+=`
                k = i32(${e.indicesGet("indices",a)}) - ${O("uniforms.pads",a,r)};
                if (k < 0)  {
                  k += i32(${O("uniforms.x_shape",a,t)}]);
                }
                if (k >= i32(${O("uniforms.x_shape",a,t)})) {
                  k -= i32(${O("uniforms.x_shape",a,t)});
                }
                offset += k * i32(${O("uniforms.x_strides",a,t)});
            `;return`
              var offset = 0;
              var k = 0;
              ${i}
              value = x[offset];
          `},hs=(e,t,r)=>{switch(r.mode){case 0:return us(e,t,r.pads.length);case 1:return ls(e,t,r.pads.length);case 2:return ds(e,t,r.pads.length);case 3:return ps(e,t,r.pads.length);default:throw new Error("Invalid mode")}},cs=(e,t)=>{let r=S.padShape(e[0].dims.slice(),t.pads),i=e[0].dims,a=S.size(r),s=[{type:12,data:a},{type:6,data:t.pads}],n=e.length>=3&&e[2].data;t.mode===0&&s.push({type:n?e[2].dataType:1,data:t.value}),s.push(...B(e[0].dims,r));let o=["rank"],u=l=>{let d=M("output",e[0].dataType,r.length),p=I("x",e[0].dataType,i.length),h=p.type.value,c=hs(d,i.length,t),f=[{name:"output_size",type:"u32"},{name:"pads",type:"i32",length:t.pads.length}];return t.mode===0&&f.push({name:"constant_value",type:n?h:"f32"}),`
            ${l.registerUniforms(f).declareVariables(p,d)}
            ${l.mainStart()}
            ${l.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}

            let indices = ${d.offsetToIndices("global_idx")};

            var value = ${h}(0);
            ${c}
            output[global_idx] = value;
        }`};return{name:"Pad",shaderCache:{hint:`${t.mode}${n}`,inputDependencies:o},getRunData:()=>({outputs:[{dims:r,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(S.size(r)/64)},programUniforms:s}),getShaderSource:u}},fs=(e,t)=>{if(e.length>1){let r=e[1].getBigInt64Array(),i=e.length>=3&&e[2].data?e[2].dataType===10?e[2].getUint16Array()[0]:e[2].getFloat32Array()[0]:0,a=e[0].dims.length,s=new Int32Array(2*a).fill(0);if(e.length>=4){let o=e[3].getBigInt64Array();for(let u=0;u<o.length;u++)s[Number(o[u])]=Number(r[u]),s[Number(o[u])+a]=Number(r[u+o.length])}else r.forEach((o,u)=>s[Number(u)]=Number(o));let n=[];return s.forEach(o=>n.push(o)),{mode:t.mode,value:i,pads:n}}else return t},Kl=(e,t)=>{os(e.inputs);let r=fs(e.inputs,t);e.compute(cs(e.inputs,r),{inputs:[0]})}}),ct,Rr,Br,Or,Mr,ms,gs,Pr,Dr,Zl,Ql,Ur,Xl,Yl,qr,Jl,ed,td,rd,Wp=T(()=>{Ce(),V(),W(),G(),ct=e=>{if(Y.webgpu.validateInputContent&&(!e||e.length!==1))throw new Error("Pool ops requires 1 input.")},Rr=(e,t,r)=>{let i=t.format==="NHWC",a=e.dims.slice();i&&a.splice(1,0,a.pop());let s=Object.hasOwnProperty.call(t,"dilations"),n=t.kernelShape.slice(),o=t.strides.slice(),u=s?t.dilations.slice():[],l=t.pads.slice();Kt.adjustPoolAttributes(r,a,n,o,u,l);let d=Kt.computePoolOutputShape(r,a,o,u,n,l,t.autoPad),p=Object.assign({},t);s?Object.assign(p,{kernelShape:n,strides:o,pads:l,dilations:u,cacheKey:t.cacheKey}):Object.assign(p,{kernelShape:n,strides:o,pads:l,cacheKey:t.cacheKey});let h=d.slice();return h.push(h.splice(1,1)[0]),[p,i?h:d]},Br=(e,t)=>{let r=t.format==="NHWC",i=S.size(e),a=S.size(t.kernelShape),s=[{type:12,data:i},{type:12,data:a}],n=[{name:"outputSize",type:"u32"},{name:"kernelSize",type:"u32"}];if(t.kernelShape.length<=2){let o=t.kernelShape[t.kernelShape.length-1],u=t.strides[t.strides.length-1],l=t.pads[t.pads.length/2-1],d=t.pads[t.pads.length-1],p=!!(l+d);s.push({type:12,data:o},{type:12,data:u},{type:12,data:l},{type:12,data:d}),n.push({name:"kw",type:"u32"},{name:"sw",type:"u32"},{name:"pwStart",type:"u32"},{name:"pwEnd",type:"u32"});let h=!1;if(t.kernelShape.length===2){let c=t.kernelShape[t.kernelShape.length-2],f=t.strides[t.strides.length-2],m=t.pads[t.pads.length/2-2],w=t.pads[t.pads.length-2];h=!!(m+w),s.push({type:12,data:c},{type:12,data:f},{type:12,data:m},{type:12,data:w}),n.push({name:"kh",type:"u32"},{name:"sh",type:"u32"},{name:"phStart",type:"u32"},{name:"phEnd",type:"u32"})}return[s,n,!0,p,h]}else{if(r)throw new Error("Pooling with kernelShape.length > 2 is not supported for NHWC format.");let o=S.computeStrides(t.kernelShape);s.push({type:12,data:o},{type:12,data:t.pads},{type:12,data:t.strides}),n.push({name:"kernelStrides",type:"u32",length:o.length},{name:"pads",type:"u32",length:t.pads.length},{name:"strides",type:"u32",length:t.strides.length});let u=t.pads.reduce((l,d)=>l+d);return[s,n,!!u,!1,!1]}},Or=(e,t,r,i,a,s,n,o,u,l,d,p)=>{let h=a.format==="NHWC",c=t.type.value,f=M("output",t.type.tensor,i);if(a.kernelShape.length<=2){let m="",w="",y="",g=r-(h?2:1);if(d?m=`
                for (var i: u32 = 0u; i < uniforms.kw; i++) {
                  xIndices[${g}] = indices[${g}] * uniforms.sw - uniforms.pwStart + i;
                  if (xIndices[${g}] < 0 || xIndices[${g}]
                      >= uniforms.x_shape[${g}]) {
                    pad++;
                    continue;
                  }
                  let x_val = x[${t.indicesToOffset("xIndices")}];
                  ${s}
                }`:m=`
                for (var i: u32 = 0u; i < uniforms.kw; i++) {
                  xIndices[${g}] = indices[${g}] * uniforms.sw - uniforms.pwStart + i;
                  let x_val = x[${t.indicesToOffset("xIndices")}];
                  ${s}
                }`,a.kernelShape.length===2){let _=r-(h?3:2);p?w=`
                for (var j: u32 = 0u; j < uniforms.kh; j++) {
                  xIndices[${_}] = indices[${_}] * uniforms.sh - uniforms.phStart + j;
                  if (xIndices[${_}] < 0 || xIndices[${_}] >= uniforms.x_shape[${_}]) {
                    pad += i32(uniforms.kw);
                    continue;
                  }
              `:w=`
                for (var j: u32 = 0u; j < uniforms.kh; j++) {
                  xIndices[${_}] = indices[${_}] * uniforms.sh - uniforms.phStart + j;
                `,y=`
              }
            `}return`
            ${e.registerUniforms(u).declareVariables(t,f)}

            ${e.mainStart()}
              ${e.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}

              let indices = ${f.offsetToIndices("global_idx")};
              var xIndices = ${f.offsetToIndices("global_idx")};

              var value = ${c}(${o});
              var pad = 0;
              ${w}
              ${m}
              ${y}
              ${n}

              output[global_idx] = value;
            }`}else{if(h)throw new Error("Pooling with kernelShape.length > 2 is not supported for NHWC format.");let m=a.kernelShape.length,w=a.pads.length,y="";return l?y=`
                if (xIndices[j] >= uniforms.x_shape[j]) {
                  pad++;
                  isPad = true;
                  break;
                }
              }
              if (!isPad) {
                let x_val = x[${t.indicesToOffset("xIndices")}];
                ${s}
              }`:y=`
              }
              let x_val = x[${t.indicesToOffset("xIndices")}];
              ${s}
            `,`
            ${e.registerUniforms(u).declareVariables(t,f)}

            ${e.mainStart()}
              ${e.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
              let indices = ${f.offsetToIndices("global_idx")};
              var xIndices = ${f.offsetToIndices("global_idx")};

              var offsets: array<u32, ${m}>;

              var value = ${c}(${o});
              var pad = 0;
              var isPad = false;

              for (var i: u32 = 0u; i < uniforms.kernelSize; i++) {
                var offset = i;
                for (var j = 0u; j < ${m-1}u; j++) {
                  offsets[j] = offset / ${O("uniforms.kernelStrides","j",m)};
                  offset -= offsets[j] * ${O("uniforms.kernelStrides","j",m)};
                }
                offsets[${m-1}] = offset;

                isPad = false;
                for (var j = ${r-m}u; j < ${r}u; j++) {
                  xIndices[j] = indices[j] * ${O("uniforms.strides",`j - ${r-m}u`,m)}
                    + offsets[j - ${r-m}u] - ${O("uniforms.pads","j - 2u",w)};
                  ${y}
              }
              ${n}

              output[global_idx] = value;
            }`}},Mr=e=>`${e.format};${e.ceilMode};${e.autoPad};${e.kernelShape.length}`,ms=e=>`${Mr(e)};${e.countIncludePad}`,gs=e=>`${Mr(e)};${e.storageOrder};${e.dilations}`,Pr=e=>({format:e.format,autoPad:["NOTSET","VALID","SAME_UPPER","SAME_LOWER"][e.auto_pad],ceilMode:e.ceil_mode,kernelShape:e.kernel_shape,strides:e.strides,pads:e.pads}),Dr=(e,t,r,i)=>{let[a,s]=Rr(t,i,r),n=I("x",t.dataType,t.dims.length),o=n.type.value,u="value += x_val;",l="";a.countIncludePad?l+=`value /= ${o}(uniforms.kernelSize);`:l+=`value /= ${o}(i32(uniforms.kernelSize) - pad);`;let[d,p,h,c,f]=Br(s,a);d.push(...B(t.dims,s));let m=["rank"];return{name:e,shaderCache:{hint:`${i.cacheKey};${h};${c};${f}`,inputDependencies:m},getRunData:()=>({outputs:[{dims:s,dataType:t.dataType}],dispatchGroup:{x:Math.ceil(S.size(s)/64)},programUniforms:d}),getShaderSource:w=>Or(w,n,t.dims.length,s.length,a,u,l,0,p,h,c,f)}},Zl=e=>{let t=e.count_include_pad!==0,r=Pr(e);if(r.ceilMode!==0)throw new Error("using ceil() in shape computation is not yet supported for AveragePool");let i={countIncludePad:t,...r,cacheKey:""};return{...i,cacheKey:ms(i)}},Ql=(e,t)=>{ct(e.inputs),e.compute(Dr("AveragePool",e.inputs[0],!1,t))},Ur={autoPad:"",ceilMode:0,countIncludePad:!1,kernelShape:[],strides:[],pads:[],storageOrder:0,dilations:[]},Xl=e=>{let t=e.format;return{format:t,...Ur,cacheKey:t}},Yl=(e,t)=>{ct(e.inputs),e.compute(Dr("GlobalAveragePool",e.inputs[0],!0,t))},qr=(e,t,r,i)=>{let[a,s]=Rr(t,i,r),n=`
      value = max(x_val, value);
    `,o="",u=I("x",t.dataType,t.dims.length),l=["rank"],[d,p,h,c,f]=Br(s,a);return d.push(...B(t.dims,s)),{name:e,shaderCache:{hint:`${i.cacheKey};${h};${c};${f}`,inputDependencies:l},getRunData:()=>({outputs:[{dims:s,dataType:t.dataType}],dispatchGroup:{x:Math.ceil(S.size(s)/64)},programUniforms:d}),getShaderSource:m=>Or(m,u,t.dims.length,s.length,a,n,o,t.dataType===10?-65504:-1e5,p,h,c,f)}},Jl=(e,t)=>{ct(e.inputs),e.compute(qr("MaxPool",e.inputs[0],!1,t))},ed=e=>{let t=e.storage_order,r=e.dilations,i=Pr(e);if(t!==0)throw new Error("column major storage order is not yet supported for MaxPool");if(i.ceilMode!==0)throw new Error("using ceil() in shape computation is not yet supported for MaxPool");let a={storageOrder:t,dilations:r,...i,cacheKey:""};return{...a,cacheKey:gs(a)}},td=e=>{let t=e.format;return{format:t,...Ur,cacheKey:t}},rd=(e,t)=>{ct(e.inputs),e.compute(qr("GlobalMaxPool",e.inputs[0],!0,t))}}),ys,ws,id,ad,Gp=T(()=>{V(),W(),se(),G(),ys=(e,t)=>{if(e.length<2||e.length>3)throw new Error("DequantizeLinear requires 2 or 3 inputs.");if(e.length===3&&e[1].dims===e[2].dims)throw new Error("x-scale and x-zero-point must have the same shape.");if(e.length===3&&e[0].dataType!==e[2].dataType)throw new Error("x and x-zero-point must have the same data type.");if(e[0].dataType===6&&e.length>2)throw new Error("In the case of dequantizing int32 there is no zero point.");if(e[1].dims.length!==0&&e[1].dims.length!==1&&e[1].dims.length!==e[0].dims.length)throw new Error("scale input must be a scalar, a 1D tensor, or have the same rank as the input tensor.");if(e.length>2){if(e[0].dataType!==e[2].dataType)throw new Error("x and x-zero-point must have the same data type.");if(e[1].dims.length!==e[2].dims.length)throw new Error("scale and zero-point inputs must have the same rank.");if(!e[1].dims.map((r,i)=>r===e[2].dims[i]).reduce((r,i)=>r&&i,!0))throw new Error("scale and zero-point inputs must have the same shape.")}if(t.blockSize>0){if(e[1].dims.length===0||e[1].dims.length===1&&e[1].dims[0]===1)throw new Error("blockSize must be set only for block quantization.");if(!e[1].dims.map((a,s)=>s===t.axis||a===e[0].dims[s]).reduce((a,s)=>a&&s,!0))throw new Error("For block qunatization, scale input shape to match the input shape except for the axis");if(e[1].dims.length!==e[0].dims.length)throw new Error("For block qunatization the scale input rank must be the same as the x rank.");let r=e[0].dims[t.axis],i=e[1].dims[t.axis];if(t.blockSize<Math.ceil(r/i)||t.blockSize>Math.ceil(r/(i-1)-1))throw new Error("blockSize must be with in the range [ceil(dI / Si), ceil(dI / (Si - 1) - 1)].")}},ws=(e,t)=>{let r=S.normalizeAxis(t.axis,e[0].dims.length),i=e[0].dataType,a=i===3,s=e[0].dims,n=e[1].dataType,o=S.size(s),u=i===3||i===2,l=u?[Math.ceil(S.size(e[0].dims)/4)]:e[0].dims,d=e[1].dims,p=e.length>2?e[2]:void 0,h=p?u?[Math.ceil(S.size(p.dims)/4)]:p.dims:void 0,c=d.length===0||d.length===1&&d[0]===1,f=c===!1&&d.length===1,m=ae(o),w=c&&(!u||m===4),y=w?m:1,g=w&&!u?m:1,_=I("input",u?12:i,l.length,g),$=I("scale",n,d.length),v=p?I("zero_point",u?12:i,h.length):void 0,k=M("output",n,s.length,y),b=[_,$];v&&b.push(v);let E=[l,d];p&&E.push(h);let C=[{type:12,data:o/y},{type:12,data:r},{type:12,data:t.blockSize},...B(...E,s)],A=q=>{let P=[{name:"output_size",type:"u32"},{name:"axis",type:"u32"},{name:"block_size",type:"u32"}];return`
      ${q.registerUniforms(P).declareVariables(...b,k)}
      ${q.mainStart()}
          ${q.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
          let output_indices = ${k.offsetToIndices("global_idx")};

          // Set input x
          ${u?`
            let input = ${_.getByOffset("global_idx / 4")};
            let x_vec = ${a?"unpack4xI8(input)":"unpack4xU8(input)"};
            let x_value = ${y===1?"x_vec[global_idx % 4]":"x_vec"};`:`let x_value = ${_.getByOffset("global_idx")};`};

          // Set scale input
          ${c?`let scale_value= ${$.getByOffset("0")}`:f?`
            let scale_index = ${k.indicesGet("output_indices","uniforms.axis")};
            let scale_value= ${$.getByOffset("scale_index")};`:`
            var scale_indices: ${$.type.indices} = output_indices;
            let index = ${$.indicesGet("scale_indices","uniforms.axis")} / uniforms.block_size;
            ${$.indicesSet("scale_indices","uniforms.axis","index")};
            let scale_value= ${$.getByIndices("scale_indices")};`};

          // Set zero-point input
          ${v?c?u?`
                let zero_point_input = ${v.getByOffset("0")};
                let zero_point_vec =  ${a?"unpack4xI8(zero_point_input)":"unpack4xU8(zero_point_input)"};
                let zero_point_value= zero_point_vec[0]`:`let zero_point_value = ${v.getByOffset("0")}`:f?u?`
                let zero_point_index = ${k.indicesGet("output_indices","uniforms.axis")};
                let zero_point_input = ${v.getByOffset("zero_point_index / 4")};
                let zero_point_vec =  ${a?"unpack4xI8(zero_point_input)":"unpack4xU8(zero_point_input)"};
                let zero_point_value = zero_point_vec[zero_point_index % 4]`:`
                let zero_point_index = ${k.indicesGet("output_indices","uniforms.axis")};
                let zero_point_value = ${v.getByOffset("zero_point_index")};`:u?`
                let zero_point_offset = ${$.indicesToOffset("scale_indices")};
                let zero_point_input = ${v.getByOffset("zero_point_offset / 4")};
                let zero_point_vec = ${a?"unpack4xI8(zero_point_input)":"unpack4xU8(zero_point_input)"};
                let zero_point_value = zero_point_vec[zero_point_offset % 4];`:`let zero_point_value = ${v.getByIndices("scale_indices")};`:`let zero_point_value = ${u?a?"i32":"u32":_.type.value}(0);`};
      // Compute and write output
      ${k.setByOffset("global_idx",`${k.type.value}(x_value - zero_point_value) * scale_value`)};
      }`};return{name:"DequantizeLinear",shaderCache:{hint:t.cacheKey,inputDependencies:v?["rank","rank","rank"]:["rank","rank"]},getShaderSource:A,getRunData:()=>({outputs:[{dims:s,dataType:n}],dispatchGroup:{x:Math.ceil(o/y/64),y:1,z:1},programUniforms:C})}},id=(e,t)=>{ys(e.inputs,t),e.compute(ws(e.inputs,t))},ad=e=>te({axis:e.axis,blockSize:e.blockSize})}),$s,_s,nd,Fp=T(()=>{Ce(),V(),G(),$s=(e,t,r)=>{let i=e===t,a=e<t&&r<0,s=e>t&&r>0;if(i||a||s)throw new Error("Range these inputs' contents are invalid.")},_s=(e,t,r,i)=>{let a=Math.abs(Math.ceil((t-e)/r)),s=[a],n=a,o=[{type:12,data:n},{type:i,data:e},{type:i,data:r},...B(s)],u=l=>{let d=M("output",i,s.length),p=d.type.value,h=[{name:"outputSize",type:"u32"},{name:"start",type:p},{name:"delta",type:p}];return`
        ${l.registerUniforms(h).declareVariables(d)}
        ${l.mainStart()}
        ${l.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
        output[global_idx] = uniforms.start + ${p}(global_idx) * uniforms.delta;
      }`};return{name:"Range",shaderCache:{hint:`${i}`},getShaderSource:u,getRunData:()=>({outputs:[{dims:s,dataType:i}],dispatchGroup:{x:Math.ceil(n/64)},programUniforms:o})}},nd=e=>{let t=0,r=0,i=0;e.inputs[0].dataType===6?(t=e.inputs[0].getInt32Array()[0],r=e.inputs[1].getInt32Array()[0],i=e.inputs[2].getInt32Array()[0]):e.inputs[0].dataType===1&&(t=e.inputs[0].getFloat32Array()[0],r=e.inputs[1].getFloat32Array()[0],i=e.inputs[2].getFloat32Array()[0]),Y.webgpu.validateInputContent&&$s(t,r,i),e.compute(_s(t,r,i,e.inputs[0].dataType),{inputs:[]})}}),vs,bs,xs,ks,Ss,Is,zs,Es,Ts,Cs,As,Vr,Rs,Bs,Os,Ms,Ps,sd,od,Hp=T(()=>{V(),W(),se(),G(),vs=(e,t)=>{if(e.every(r=>r>0||(()=>{throw new Error("Resize requires scales input values to be positive")})),e.length>0){if(t.mode==="linear"){if(!(e.length===2||e.length===3||e.length===4&&e[0]===1&&e[1]===1||e.length===4&&e[0]===1&&e[3]===1||e.length===5&&e[0]===1&&e[1]===1))throw new Error(`For linear mode, Resize requires scales to be 2D, 3D, 4D with either two outermost or one innermost and
            one outermost scale values equal to 1, or 5D with two outermost scale values equal to 1`)}else if(t.mode==="cubic"&&!(e.length===2||e.length===4&&e[0]===1&&e[1]===1||e.length===4&&e[0]===1&&e[3]===1))throw new Error("Resize requires scales input size to be 2 or 4 for cubic mode")}},bs=(e,t,r)=>{t.every(a=>a>=0&&a<r||(()=>{throw new Error("Resize requires axes input values to be positive and less than rank")}));let i=new Array(r).fill(1);return t.forEach((a,s)=>i[a]=e[s]),i},xs=(e,t,r,i,a,s)=>{let[n,o,u]=r>10?[1,2,3]:[-1,e.length>1?1:-1,-1],l=e[0].dims.length;if(n>0&&e.length>n&&e[n].dims.length>0)e[n].getFloat32Array().forEach(d=>s.push(d));else if(t.coordinateTransformMode==="tf_crop_and_resize")throw new Error("Resize requires RoI input to be specified when coordinateTransformMode is tfCropAndResize");if(o>0&&e.length>o&&e[o].dims.length===1&&e[o].dims[0]>0){if(e[o].getFloat32Array().forEach(d=>i.push(d)),i.length!==0&&i.length!==l&&r>=18&&i.length!==t.axes.length)throw new Error("Resize requires scales input size to be same as input rank or axes size for opset 18 and up");vs(i,t),t.axes.length>0&&bs(i,t.axes,l).forEach((d,p)=>i[p]=d)}if(u>0&&e.length>u&&e[u].dims.length===1&&e[u].dims[0]>0&&(e[u].getBigInt64Array().forEach(d=>a.push(Number(d))),a.length!==0&&a.length!==l&&r>=18&&a.length!==t.axes.length))throw new Error("Resize requires sizes input size to be same as input rank or axes size for opset 18 and up");if(t.axes.length>0){if(i.length!==0&&i.length!==t.axes.length)throw new Error('Resize requires "scales" input size to be of axes rank when axes attributes is specified');if(a.length!==0&&a.length!==t.axes.length)throw new Error('Resize requires "sizes" input size to be of rank axes rank when axes attributes is specified')}if(typeof i<"u"&&typeof a<"u"&&i.length>0&&a.length>l)throw new Error("Resize requires only of scales or sizes to be specified")},ks=(e,t)=>`fn getOriginalCoordinateFromResizedCoordinate(xResized: u32, xScale: f32, lengthResized: u32,
     lengthOriginal: u32, roiStart: f32, roiEnd: f32) -> ${t} { `+(()=>{switch(e){case"asymmetric":return`return ${t}(xResized) / ${t}(xScale);`;case"pytorch_half_pixel":return`if (lengthResized > 1) {
                    return (${t}(xResized) + 0.5) / ${t}(xScale) - 0.5;
                  } else {
                    return 0.0;
                  }`;case"tf_half_pixel_for_nn":return`return (${t}(xResized) + 0.5) / ${t}(xScale);`;case"align_corners":return`if (lengthResized == 1) {
                    return 0.0;
                  } else {
                    // The whole part and the fractional part are calculated separately due to inaccuracy of floating
                    // point division. As an example, f32(21) / f32(7) may evaluate to 2.99... instead of 3, causing an
                    // offset-by-one error later in floor().
                    let whole = ${t}(xResized * (lengthOriginal - 1) / (lengthResized - 1));
                    let fract =
                        ${t}(xResized * (lengthOriginal - 1) % (lengthResized - 1)) / ${t}(lengthResized - 1);
                    return whole + fract;
                  }`;case"tf_crop_and_resize":return`if (lengthResized > 1) {
                    return ${t}(roiStart) * ${t}(lengthOriginal - 1) +
                        (${t}(xResized) * ${t}(roiEnd - roiStart) * ${t}(lengthOriginal - 1)) /
                        ${t}(lengthResized - 1);
                  } else {
                    return 0.5 * ${t}(roiStart + roiEnd) * ${t}(lengthOriginal - 1);
                  }`;case"half_pixel_symmetric":return`const outputWidth = ${t}xScale * ${t}(lengthResized);
                  const adjustment = ${t}(lengthResized) / outputWidth;
                  const center = ${t}(lengthOriginal) / 2;
                  const offset = center * (1 - adjustment);
                  return offset + ((${t}(xResized) + 0.5) / ${t}(xScale)) - 0.5;`;case"half_pixel":return`return ((${t}(xResized) + 0.5) / ${t}(xScale)) - 0.5;`;default:throw new Error(`Coordinate transform mode ${e} is not supported`)}})()+"}",Ss=(e,t,r)=>`fn getNearestPixelFromOriginal(xOriginal: ${r}, isDownSample: bool) -> ${r} {`+(()=>{switch(e){case"round_prefer_ceil":return"if (fract(xOriginal) == 0.5) {             return ceil(xOriginal);           } else {             return round(xOriginal);           }";case"floor":return"return floor(xOriginal);";case"ceil":return"return ceil(xOriginal);";case"round_prefer_floor":return"if (fract(xOriginal) == 0.5) {                     return floor(xOriginal);                   } else {                     return round(xOriginal);                   }";case"simple":default:if(t<11)return"if (isDownSample)                     {                       return ceil(xOriginal);                     } else {                       return xOriginal;                     }";throw new Error(`Nearest mode ${e} is not supported`)}})()+"}",Is=(e,t,r)=>{let i=new Array(r).fill(0).concat(new Array(r).fill(1)),a=e.length===0?i:e.slice();return t.length>0?(t.forEach((s,n)=>{i[s]=a[n],i[n+r]=a[t.length+n]}),i):a},zs=(e,t,r,i)=>{let a=[];if(r.length>0)if(i.length>0){if(e.forEach(s=>a.push(s)),Math.max(...i)>e.length)throw new Error("axes is out of bound");i.forEach((s,n)=>a[s]=r[n])}else r.forEach(s=>a.push(s));else{if(t.length===0)throw new Error("Resize requires either scales or sizes.");a=e.map((s,n)=>Math.round(s*t[n]))}return a},Es=(e,t,r)=>{let i=(()=>{switch(r.keepAspectRatioPolicy){case"not_larger":return r.axes.length>0?Math.min(...r.axes.map(s=>t[s]),Number.MAX_VALUE):Math.min(...t,Number.MAX_VALUE);case"not_smaller":return r.axes.length>0?Math.max(...r.axes.map(s=>t[s]),Number.MIN_VALUE):Math.max(...t,Number.MIN_VALUE);default:throw new Error(`Keep aspect ratio policy ${r.keepAspectRatioPolicy} is not supported`)}})();t.fill(1,0,t.length);let a=e.slice();return r.axes.length>0?(r.axes.forEach(s=>t[s]=i),r.axes.forEach(s=>a[s]=Math.round(e[s]*t[s]))):(t.fill(i,0,t.length),a.forEach((s,n)=>a[n]=Math.round(s*t[n]))),a},Ts=(e,t,r,i,a)=>`
    fn calculateOriginalIndicesFromOutputIndices(output_indices: ${e.type.indices}) -> array<${e.type.value}, ${r.length}> {
      var original_indices: array<${e.type.value}, ${r.length}>;
      for (var i:u32 = 0; i < ${r.length}; i++) {
        var output_index = ${e.indicesGet("output_indices","i")};
        var scale = ${O("uniforms.scales","i",i)};
        var roi_low = ${O("uniforms.roi","i",a)};
        var roi_hi = ${O("uniforms.roi",`i + ${t.length}`,a)};
        if (scale == 1.0) {
          original_indices[i] = ${e.type.value}(output_index);
        } else {
          var input_shape_i = ${O("uniforms.input_shape","i",t.length)};
          var output_shape_i = ${O("uniforms.output_shape","i",r.length)};
          original_indices[i] = getOriginalCoordinateFromResizedCoordinate(output_index, scale, output_shape_i,
                                                                           input_shape_i, roi_low, roi_hi);
        }
      }
      return original_indices;
    }`,Cs=(e,t,r,i,a,s,n)=>`
    fn calculateInputIndicesFromOutputIndices(output_indices: ${t.type.indices}) -> ${e.type.indices} {
      var input_indices: ${e.type.indices};
      for (var i:u32 = 0; i < ${i.length}; i++) {
        var output_index = ${t.indicesGet("output_indices","i")};
        var input_index: u32;
        var scale = ${O("uniforms.scales","i",a)};
        if (scale == 1.0) {
          input_index = output_index;
        } else {
          var roi_low = ${O("uniforms.roi","i",s)};
          var roi_hi = ${O("uniforms.roi",`i + ${r.length}`,s)};
          var input_shape_i = ${O("uniforms.input_shape","i",r.length)};
          var output_shape_i = ${O("uniforms.output_shape","i",i.length)};
          var original_idx = getOriginalCoordinateFromResizedCoordinate(output_index, scale, output_shape_i,
                                                                        input_shape_i, roi_low, roi_hi);
          if (!${n} || (original_idx >= 0 && original_idx < ${t.type.value}(input_shape_i))) {
            if (original_idx < 0) {
              input_index = 0;
            } else if (original_idx > ${t.type.value}(input_shape_i - 1)) {
              input_index = input_shape_i - 1;
            } else {
              input_index = u32(getNearestPixelFromOriginal(original_idx, scale < 1));
            }
          } else {
            input_index = u32(original_idx);
          }
        }
        ${e.indicesSet("input_indices","i"," input_index")}
      }
      return input_indices;
    }`,As=(e,t)=>`
    fn checkInputIndices(input_indices: ${e.type.indices}) -> bool {
      for (var i:u32 = 0; i < ${t.length}; i++) {
        var input_index = ${e.indicesGet("input_indices","i")};
        if (input_index < 0 || input_index >= ${O("uniforms.input_shape","i",t.length)}) {
          return false;
        }
      }
      return true;
    }`,Vr=(e,t,r,i)=>e.rank>i?`
    ${e.indicesSet("input_indices",t,"channel")};
    ${e.indicesSet("input_indices",r,"batch")};
`:"",Rs=(e,t,r,i,a)=>{let[s,n,o,u]=r.length===2?[-1,0,1,-1]:[0,2,3,1],l=e.type.value;return`
    fn getInputValue(batch: u32, channel: u32, row: u32, col: u32) -> ${l} {
      var input_indices: ${e.type.indices};
      ${e.indicesSet("input_indices",n,`max(0, min(row, ${r[n]} - 1))`)};
      ${e.indicesSet("input_indices",o,`max(0, min(col, ${r[o]} - 1))`)};
      ${Vr(e,u,s,2)}
      return ${e.getByIndices("input_indices")};
    }

    fn bilinearInterpolation(output_indices: ${t.type.indices}) -> ${l} {
      var originalIndices = calculateOriginalIndicesFromOutputIndices(output_indices);
      var row:${l} = originalIndices[${n}];
      var col:${l} = originalIndices[${o}];
      ${i?`if (row < 0 || row > (${r[n]} - 1) || col < 0 || col > (${r[o]} - 1)) {
        return ${a};
      }`:""};
      row = max(0, min(row, ${r[n]} - 1));
      col = max(0, min(col, ${r[o]} - 1));
      var row1: u32 = u32(row);
      var col1: u32 = u32(col);
      var row2: u32 = u32(row + 1);
      var col2: u32 = u32(col + 1);
      var channel: u32 = ${r.length>2?`u32(originalIndices[${u}])`:"0"};
      var batch: u32 =  ${r.length>2?`u32(originalIndices[${s}])`:"0"};
      var x11: ${l} = getInputValue(batch, channel, row1, col1);
      var x12: ${l} = getInputValue(batch, channel, row1, col2);
      var x21: ${l} = getInputValue(batch, channel, row2, col1);
      var x22: ${l} = getInputValue(batch, channel, row2, col2);
      var dx1: ${l} = abs(row - ${l}(row1));
      var dx2: ${l} = abs(${l}(row2) - row);
      var dy1: ${l} = abs(col - ${l}(col1));
      var dy2: ${l} = abs(${l}(col2) - col);
      if (row1 == row2) {
        dx1 = 0.5;
        dx2 = 0.5;
      }
      if (col1 == col2) {
        dy1 = 0.5;
        dy2 = 0.5;
      }
      return (x11 * dx2 * dy2 + x12 * dx2 * dy1 + x21 * dx1 * dy2 + x22 * dx1 * dy1);
    }`},Bs=(e,t,r,i,a,s,n,o,u,l)=>{let d=r.length===2,[p,h]=d?[0,1]:[2,3],c=e.type.value,f=m=>{let w=m===p?"row":"col";return`
      fn ${w}CubicInterpolation(input_indices: ${e.type.indices}, output_indices: ${t.type.indices}) -> ${c} {
        var output_index = ${t.indicesGet("output_indices",m)};
        var originalIdx: ${c} = getOriginalCoordinateFromResizedCoordinate(output_index, ${a[m]},
        ${i[m]}, ${r[m]}, ${s[m]}, ${s[m]} + ${r.length});
        var fractOriginalIdx: ${c} = originalIdx - floor(originalIdx);
        var coefs = getCubicInterpolationCoefs(fractOriginalIdx);

        if (${o} && (originalIdx < 0 || originalIdx > (${r[m]} - 1))) {
          return ${u};
        }
        var data: array<${c}, 4> = array<${c}, 4>(0.0, 0.0, 0.0, 0.0);
        for (var i: i32 = -1; i < 3; i++) {
          var ${w}: ${c} = originalIdx + ${c}(i);
          if (${w} < 0 || ${w} >= ${r[m]}) {
            ${l?`coefs[i + 1] = 0.0;
                        continue;`:o?`return ${u};`:`${w} = max(0, min(${w}, ${r[m]} - 1));`};
          }
        var input_indices_copy: ${e.type.indices} = input_indices;
          ${e.indicesSet("input_indices_copy",m,`u32(${w})`)};
          data[i + 1] = ${m===p?e.getByIndices("input_indices_copy"):"rowCubicInterpolation(input_indices_copy, output_indices)"};
        }
        return cubicInterpolation1D(data, coefs);
      }`};return`
    ${f(p)};
    ${f(h)};
  fn getCubicInterpolationCoefs(s: ${c}) -> array<${c}, 4> {
    var absS = abs(s);
    var coeffs: array<${c}, 4> = array<${c}, 4>(0.0, 0.0, 0.0, 0.0);
    var oneMinusAbsS: ${c} = 1.0 - absS;
    var twoMinusAbsS: ${c} = 2.0 - absS;
    var onePlusAbsS: ${c} = 1.0 + absS;
    coeffs[0] = ((${n} * onePlusAbsS - 5 * ${n}) * onePlusAbsS + 8 * ${n}) * onePlusAbsS - 4 * ${n};
    coeffs[1] = ((${n} + 2) * absS - (${n} + 3)) * absS * absS + 1;
    coeffs[2] = ((${n} + 2) * oneMinusAbsS - (${n} + 3)) * oneMinusAbsS * oneMinusAbsS + 1;
    coeffs[3] = ((${n} * twoMinusAbsS - 5 * ${n}) * twoMinusAbsS + 8 * ${n}) * twoMinusAbsS - 4 * ${n};
    return coeffs;
  }

  fn cubicInterpolation1D(x: array<${c}, 4>, coefs: array<${c}, 4>) -> ${c} {
    var coefsSum: ${c} = coefs[0] + coefs[1] + coefs[2] + coefs[3];
    return (x[0] * coefs[0] + x[1] * coefs[1]+ x[2] * coefs[2]+ x[3] * coefs[3]) / coefsSum;
  }

  fn bicubicInterpolation(output_indices: ${t.type.indices}) -> ${c} {
    var input_indices: ${e.type.indices} = output_indices;
    return colCubicInterpolation(input_indices, output_indices);
  }
    `},Os=(e,t,r,i,a)=>{let[s,n,o,u,l]=r.length===3?[-1,0,1,2,-1]:[0,2,3,4,1],d=e.type.value;return`
    fn getInputValue(batch: u32, channel: u32, depth:u32, height: u32, width: u32) -> ${d} {
      var input_indices: ${e.type.indices};
      ${e.indicesSet("input_indices",n,`max(0, min(depth, ${r[n]} - 1))`)};
      ${e.indicesSet("input_indices",o,`max(0, min(height, ${r[o]} - 1))`)};
      ${e.indicesSet("input_indices",u,`max(0, min(width, ${r[u]} - 1))`)};
      ${Vr(e,l,s,3)}
      return ${e.getByIndices("input_indices")};
    }

    fn trilinearInterpolation(output_indices: ${t.type.indices}) -> ${d} {
      var originalIndices = calculateOriginalIndicesFromOutputIndices(output_indices);
      var depth:${d} = originalIndices[${n}];
      var height:${d} = originalIndices[${o}];
      var width:${d} = originalIndices[${u}];
      ${i?`if (depth < 0 || depth > (${r[n]} - 1) || height < 0 || height > (${r[o]} - 1) || width < 0 || (width > ${r[u]} - 1)) {
      return ${a};
        }`:""};

    depth = max(0, min(depth, ${r[n]} - 1));
      height = max(0, min(height, ${r[o]} - 1));
      width = max(0, min(width, ${r[u]} - 1));
      var depth1: u32 = u32(depth);
      var height1: u32 = u32(height);
      var width1: u32 = u32(width);
      var depth2: u32 = u32(depth + 1);
      var height2: u32 = u32(height + 1);
      var width2: u32 = u32(width + 1);
      var channel: u32 = ${r.length>3?`u32(originalIndices[${l}])`:"0"};
      var batch: u32 =  ${r.length>3?`u32(originalIndices[${s}])`:"0"};

      var x111: ${d} = getInputValue(batch, channel, depth1, height1, width1);
      var x112: ${d} = getInputValue(batch, channel, depth1, height1, width2);
      var x121: ${d} = getInputValue(batch, channel, depth1, height2, width1);
      var x122: ${d} = getInputValue(batch, channel, depth1, height2, width2);
      var x211: ${d} = getInputValue(batch, channel, depth2, height1, width1);
      var x212: ${d} = getInputValue(batch, channel, depth2, height1, width2);
      var x221: ${d} = getInputValue(batch, channel, depth2, height2, width1);
      var x222: ${d} = getInputValue(batch, channel, depth2, height2, width2);
      var dx1: ${d} = abs(depth - ${d}(depth1));
      var dx2: ${d} = abs(${d}(depth2) - depth);
      var dy1: ${d} = abs(height - ${d}(height1));
      var dy2: ${d} = abs(${d}(height2) - height);
      var dz1: ${d} = abs(width - ${d}(width1));
      var dz2: ${d} = abs(${d}(width2) - width);
      if (depth1 == depth2) {
        dx1 = 0.5;
        dx2 = 0.5;
      }
      if (height1 == height2) {
        dy1 = 0.5;
        dy2 = 0.5;
      }
      if (width1 == width2) {
        dz1 = 0.5;
        dz2 = 0.5;
      }
      return (x111 * dx2 * dy2 * dz2 + x112 * dx2 * dy2 * dz1 + x121 * dx2 * dy1 *dz2 + x122 * dx2 * dy1 * dz1 +
              x211 * dx1 * dy2 * dz2 + x212 * dx1 * dy2 * dz1 + x221 * dx1 * dy1 *dz2 + x222 * dx1 * dy1 * dz1);
    }`},Ms=(e,t,r,i,a,s)=>{let n=e.dims,o=Is(s,t.axes,n.length),u=zs(n,i,a,t.axes),l=i.slice();i.length===0&&(l=n.map((g,_)=>g===0?1:u[_]/g),t.keepAspectRatioPolicy!=="stretch"&&(u=Es(n,l,t)));let d=M("output",e.dataType,u.length),p=I("input",e.dataType,n.length),h=S.size(u),c=n.length===u.length&&n.every((g,_)=>g===u[_]),f=t.coordinateTransformMode==="tf_crop_and_resize",m=t.extrapolationValue,w=p.type.value,y=g=>`
      ${c?"":`
      ${ks(t.coordinateTransformMode,w)};
      ${(()=>{switch(t.mode){case"nearest":return`
              ${As(p,n)};
              ${Ss(t.nearestMode,r,w)};
              ${Cs(p,d,n,u,l.length,o.length,f)};
              `;case"linear":return`
              ${Ts(d,n,u,l.length,o.length)};
              ${(()=>{if(n.length===2||n.length===4)return`${Rs(p,d,n,f,m)}`;if(n.length===3||n.length===5)return`${Os(p,d,n,f,m)}`;throw Error("Linear mode only supports input dims 2, 3, 4 and 5 are supported in linear mode.")})()};
            `;case"cubic":return`
            ${(()=>{if(n.length===2||n.length===4)return`${Bs(p,d,n,u,l,o,t.cubicCoeffA,f,t.extrapolationValue,t.excludeOutside)}`;throw Error("Cubic mode only supports input dims 2 and 4 are supported in linear mode.")})()};
            `;default:throw Error("Invalid resize mode")}})()};
      `}
      ${g.registerUniform("output_size","u32").registerUniform("scales","f32",l.length).registerUniform("roi","f32",o.length).declareVariables(p,d)}
      ${g.mainStart()}
        ${g.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
        ${c?"output[global_idx] = input[global_idx];":`
        let output_indices = ${d.offsetToIndices("global_idx")};
        var input_indices: ${p.type.indices};
        ${(()=>{switch(t.mode){case"nearest":return`input_indices = calculateInputIndicesFromOutputIndices(output_indices);
                if (checkInputIndices(input_indices)) {
                  output[global_idx] = ${p.getByIndices("input_indices")};
                } else {
                  output[global_idx] = ${t.extrapolationValue};
                }`;case"linear":return`output[global_idx] = ${n.length===2||n.length===4?"bilinearInterpolation":"trilinearInterpolation"}(output_indices);`;case"cubic":return"output[global_idx] = bicubicInterpolation(output_indices);";default:throw Error(`Unsupported resize mode: ${t.mode}`)}})()};
`}
      }`;return{name:"Resize",shaderCache:{hint:`${t.cacheKey}|${r}|${l.length>0?l:""}|${a.length>0?a:""}|${o.length>0?o:""}|${c}|${n}`,inputDependencies:["rank"]},getShaderSource:y,getRunData:()=>({outputs:[{dims:u,dataType:e.dataType}],dispatchGroup:{x:Math.ceil(h/64)},programUniforms:[{type:12,data:h},{type:1,data:l},{type:1,data:o},...B(n,u)]})}},Ps=e=>{let t=e.customDataBuffer;return new Uint32Array(t,t.byteOffset,1)[0]},sd=(e,t)=>{let r=[],i=[],a=[],s=Ps(e);if(t.antialias!==0)throw Error("Only default value (0) for Antialias attribute is supported");xs(e.inputs,t,s,r,i,a),e.compute(Ms(e.inputs[0],t,s,r,i,a),{inputs:[0]})},od=e=>{let t=e.antialias,r=e.axes,i=e.coordinateTransformMode,a=e.cubicCoeffA,s=e.excludeOutside!==0,n=e.extrapolationValue,o=e.keepAspectRatioPolicy,u=e.mode,l=e.nearestMode===""?"simple":e.nearestMode;return te({antialias:t,axes:r,coordinateTransformMode:i,cubicCoeffA:a,excludeOutside:s,extrapolationValue:n,keepAspectRatioPolicy:o,mode:u,nearestMode:l})}}),Ds,Us,ud,jp=T(()=>{V(),W(),se(),G(),Ds=(e,t)=>{let[r,i,a,s]=e,{numHeads:n,rotaryEmbeddingDim:o}=t;if(r.dims.length!==3&&r.dims.length!==4)throw new Error(`Input 'x' is expected to have 3 or 4 dimensions, got ${r.dims.length}`);if(!S.areEqual(i.dims,[])&&!S.areEqual(i.dims,[1])&&i.dims.length!==2)throw new Error(`Input 'position_ids' is expected to have 0, 1, or 2 dimensions, got ${i.dims.length}`);if(a.dims.length!==2)throw new Error(`Input 'cos_cache' is expected to have 2 dimensions, got ${a.dims.length}`);if(s.dims.length!==2)throw new Error(`Input 'sin_cache' is expected to have 2 dimensions, got ${s.dims.length}`);if(!S.areEqual(a.dims,s.dims))throw new Error("Inputs 'cos_cache' and 'sin_cache' are expected to have the same shape");if(o>0&&n===0)throw new Error("num_heads must be provided if rotary_embedding_dim is specified");let u=r.dims[0],l=r.dims[r.dims.length-2],d=a.dims[0],p=S.sizeFromDimension(r.dims,1)/l,h=o===0?a.dims[1]*2:p/n;if(o>h)throw new Error("rotary_embedding_dim must be less than or equal to head_size");if(i.dims.length===2){if(u!==i.dims[0])throw new Error(`Input 'position_ids' dimension 0 should be of size batch_size, got ${i.dims[0]}`);if(l!==i.dims[1])throw new Error(`Input 'position_ids' dimension 1 should be of size sequence_length, got ${i.dims[1]}`)}if(h/2!==a.dims[1]&&o/2!==a.dims[1])throw new Error(`Input 'cos_cache' dimension 1 should be same as head_size / 2 or rotary_embedding_dim / 2, got ${a.dims[1]}`);if(l>d)throw new Error("Updating cos_cache and sin_cache in RotaryEmbedding is not currently supported")},Us=(e,t)=>{let{interleaved:r,numHeads:i,rotaryEmbeddingDim:a,scale:s}=t,n=e[0].dims[0],o=S.sizeFromDimension(e[0].dims,1),u=e[0].dims[e[0].dims.length-2],l=o/u,d=e[2].dims[1],p=a===0?d*2:l/i,h=new Array(n,u,l/p,p-d),c=S.computeStrides(h),f=[{type:1,data:s},{type:12,data:h},{type:12,data:c},...e[0].dims.length===3?new Array({type:12,data:[o,l,p,1]}):[],...e[0].dims.length===4?new Array({type:12,data:[o,p,u*p,1]}):[],...B(e[0].dims,e[1].dims,e[2].dims,e[3].dims,e[0].dims)],m=w=>{let y=I("input",e[0].dataType,e[0].dims.length),g=I("position_ids",e[1].dataType,e[1].dims.length),_=I("cos_cache",e[2].dataType,e[2].dims.length),$=I("sin_cache",e[3].dataType,e[3].dims.length),v=M("output",e[0].dataType,e[0].dims.length);return w.registerUniforms([{name:"scale",type:"f32"},{name:"global_shape",type:"u32",length:h.length},{name:"global_strides",type:"u32",length:c.length},{name:"input_output_strides",type:"u32",length:c.length}]),`
        ${w.declareVariables(y,g,_,$,v)}

        ${w.mainStart(ut)}
          let half_rotary_emb_dim = uniforms.${_.name}_shape[1];
          let bsnh = global_idx / uniforms.global_strides % uniforms.global_shape;
          let size = uniforms.global_shape[0] * uniforms.global_strides[0];
          ${w.guardAgainstOutOfBoundsWorkgroupSizes("size")}

          if (bsnh[3] < half_rotary_emb_dim) {
            let position_ids_idx =
                ${g.broadcastedIndicesToOffset("bsnh.xy",M("",g.type.tensor,2))};
            let position_id =
                u32(${g.getByOffset("position_ids_idx")}) + select(0, bsnh[1], position_ids_idx == 0);
            let i = dot(bsnh, uniforms.input_output_strides) + select(0, bsnh[3], ${r});
            let j = i + select(half_rotary_emb_dim, 1, ${r});
            let re = ${y.getByOffset("i")} * ${_.get("position_id","bsnh[3]")} -
                ${y.getByOffset("j")} * ${$.get("position_id","bsnh[3]")};
            ${v.setByOffset("i","re")}
            let im = ${y.getByOffset("i")} * ${$.get("position_id","bsnh[3]")} +
                ${y.getByOffset("j")} * ${_.get("position_id","bsnh[3]")};
            ${v.setByOffset("j","im")}
          } else {
            let k = dot(bsnh, uniforms.input_output_strides) + half_rotary_emb_dim;
            ${v.setByOffset("k",y.getByOffset("k"))}
          }
        }`};return{name:"RotaryEmbedding",shaderCache:{hint:te({interleaved:r}).cacheKey,inputDependencies:["rank","rank","rank","rank"]},getShaderSource:m,getRunData:()=>({outputs:[{dims:e[0].dims,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(S.size(h)/ut)},programUniforms:f})}},ud=(e,t)=>{Ds(e.inputs,t),e.compute(Us(e.inputs,t))}}),qs,Vs,ld,Kp=T(()=>{V(),W(),G(),qs=e=>{if(!e||e.length<3)throw new Error("layerNorm requires at least 3 inputs.");let t=e[0],r=e[1],i=e[2];if(t.dataType!==r.dataType||t.dataType!==i.dataType)throw new Error("All inputs must have the same data type");if(t.dims.length!==3&&t.dims.length!==2)throw new Error("Input must be 2D or 3D");if(r.dims.length!==3&&r.dims.length!==2)throw new Error("Skip must be 2D or 3D");let a=t.dims[t.dims.length-1],s=t.dims[t.dims.length-2];if(r.dims[r.dims.length-1]!==a)throw new Error("Skip must have the same hidden size as input");if(r.dims[r.dims.length-2]!==s)throw new Error("Skip must have the same sequence length as input");if(i.dims.length!==1)throw new Error("Gamma must be 1D");if(i.dims[i.dims.length-1]!==a)throw new Error("Gamma must have the same hidden size as input");if(e.length>3){let n=e[3];if(n.dims.length!==1)throw new Error("Beta must be 1D");if(n.dims[n.dims.length-1]!==a)throw new Error("Beta must have the same hidden size as input")}if(e.length>4){let n=e[4];if(n.dims.length!==1)throw new Error("Bias must be 1D");if(n.dims[n.dims.length-1]!==a)throw new Error("Bias must have the same hidden size as input")}},Vs=(e,t,r,i)=>{let a=t.simplified,s=e[0].dims,n=S.size(s),o=s,u=n,l=s.slice(-1)[0],d=i?s.slice(0,-1).concat(1):[],p=!a&&e.length>3,h=e.length>4,c=i&&r>1,f=i&&r>2,m=r>3,w=64,y=ae(l),g=[{type:12,data:u},{type:12,data:y},{type:12,data:l},{type:1,data:t.epsilon}],_=v=>{let k=[{name:"output_size",type:"u32"},{name:"components",type:"u32"},{name:"hidden_size",type:"u32"},{name:"epsilon",type:"f32"}],b=[I("x",e[0].dataType,e[0].dims,y),I("skip",e[1].dataType,e[1].dims,y),I("gamma",e[2].dataType,e[2].dims,y)];p&&b.push(I("beta",e[3].dataType,e[3].dims,y)),h&&b.push(I("bias",e[4].dataType,e[4].dims,y)),b.push(M("output",e[0].dataType,o,y)),c&&b.push(M("mean_output",1,d)),f&&b.push(M("inv_std_output",1,d)),m&&b.push(M("input_skip_bias_sum",e[0].dataType,o,y));let E=ue(e[0].dataType),C=ue(1,y);return`

      ${v.registerUniforms(k).declareVariables(...b)}
      var<workgroup> sum_shared : array<${C}, ${w}>;
      var<workgroup> sum_squared_shared : array<${C}, ${w}>;

      ${v.mainStart([w,1,1])}
        let ix = local_id.x;
        let iy = global_id.x / ${w};

        let hidden_size_vectorized: u32 = uniforms.hidden_size / uniforms.components;
        var stride = hidden_size_vectorized / ${w};
        let offset = ix * stride + iy * hidden_size_vectorized;
        let offset1d = stride * ix;
        if (ix == ${w-1}) {
          stride = hidden_size_vectorized - stride * ix;
        }
        for (var i: u32 = 0; i < stride; i++) {
          let skip_value = skip[offset + i];
          let bias_value = ${h?"bias[offset1d + i]":E+"(0.0)"};
          let input_value = x[offset + i];
          let value = input_value + skip_value + bias_value;
          ${m?"input_skip_bias_sum[offset + i] = value;":""}
          output[offset + i] = value;
          let f32_value = ${nt(E,y,"value")};
          sum_shared[ix] += f32_value;
          sum_squared_shared[ix] += f32_value * f32_value;
        }
        workgroupBarrier();

        var reduce_size : u32 = ${w};
        for (var curr_size = reduce_size >> 1;  curr_size > 0; curr_size = reduce_size >> 1) {
          reduce_size = curr_size + (reduce_size & 1);
          if (ix < curr_size) {
            sum_shared[ix] += sum_shared[ix + reduce_size];
            sum_squared_shared[ix] += sum_squared_shared[ix + reduce_size];
          }
          workgroupBarrier();
        }

        let sum = sum_shared[0];
        let square_sum = sum_squared_shared[0];
        let mean = ${Ne("sum",y)} / f32(uniforms.hidden_size);
        let inv_std_dev = inverseSqrt(${Ne("square_sum",y)} / f32(uniforms.hidden_size) ${a?"":"- mean * mean"} + uniforms.epsilon);
        ${c?"mean_output[global_idx] = mean;":""}
        ${f?"inv_std_output[global_idx] = inv_std_dev;":""}

        for (var i: u32 = 0; i < stride; i++) {
          output[offset + i] = (output[offset + i] ${a?"":`- ${E}(mean)`}) *
            ${E}(inv_std_dev) * gamma[offset1d + i]
            ${p?"+ beta[offset1d + i]":""};
        }
      }`},$=[{dims:o,dataType:e[0].dataType}];return r>1&&$.push({dims:d,dataType:1}),r>2&&$.push({dims:d,dataType:1}),r>3&&$.push({dims:s,dataType:e[0].dataType}),{name:"SkipLayerNormalization",shaderCache:{hint:`${y};${c};${f};${m}`,inputDependencies:e.map((v,k)=>"type")},getShaderSource:_,getRunData:()=>({outputs:$,dispatchGroup:{x:Math.ceil(u/l)},programUniforms:g})}},ld=(e,t)=>{qs(e.inputs);let r=[0];e.outputCount>1&&r.push(-3),e.outputCount>2&&r.push(-3),e.outputCount>3&&r.push(3),e.compute(Vs(e.inputs,t,e.outputCount,!1),{outputs:r})}}),Ns,ft,Ls,Nr,Ws,Gs,dd,pd,Zp=T(()=>{V(),W(),se(),G(),Ns=(e,t)=>{if(!e||e.length<1)throw new Error("too few inputs");if(t.axes.length!==0){if(t.axes.length!==t.starts.length||t.axes.length!==t.ends.length)throw new Error("axes, starts and ends must have the same length")}else if(t.starts.length!==t.ends.length)throw new Error("starts and ends must have the same length");e.slice(1).forEach((r,i)=>{if(e[i+1].dataType!==6&&e[i+1].dataType!==7)throw new Error(`Input ${i} must be an array of int32 or int64`)})},ft=(e,t)=>{let r=[];if(e.length>t)if(e[t].dataType===7)e[t].getBigInt64Array().forEach(i=>r.push(Number(i)));else if(e[t].dataType===6)e[t].getInt32Array().forEach(i=>r.push(Number(i)));else throw new Error(`Input ${t} must be an array of int32 or int64`);return r},Ls=(e,t)=>{if(e.length>1){let r=ft(e,1),i=ft(e,2),a=ft(e,3);return a.length===0&&(a=[...Array(e[0].dims.length).keys()]),te({starts:r,ends:i,axes:a})}else return t},Nr=(e,t,r,i,a)=>{let s=e;return e<0&&(s+=r[i[t]]),a[t]<0?Math.max(0,Math.min(s,r[i[t]]-1)):Math.max(0,Math.min(s,r[i[t]]))},Ws=(e,t,r)=>`fn calculateInputIndices(output_indices: ${t.type.indices}) -> ${e.type.indices} {
          var input_indices: ${e.type.indices};
          var carry = 0u;
          for (var i = ${r.length}; i >= 0; i--) {
            let input_shape_i = ${O("uniforms.input_shape","i",r.length)};
            let steps_i = ${O("uniforms.steps","i",r.length)};
            let signs_i = ${O("uniforms.signs","i",r.length)};
            let starts_i = ${O("uniforms.starts","i",r.length)};
            var output_index = ${t.indicesGet("output_indices","i")};
            var input_index = output_index * steps_i + starts_i + carry;
            carry = input_index / input_shape_i;
            input_index = input_index % input_shape_i;
            if (signs_i < 0) {
              input_index = input_shape_i - input_index - 1u + starts_i;
            }
            ${e.indicesSet("input_indices","i","input_index")};
          }
          return input_indices;
      }`,Gs=(e,t)=>{let r=e[0].dims,i=S.size(r),a=t.axes.length>0?S.normalizeAxes(t.axes,r.length):[...Array(r.length).keys()],s=ft(e,4);s.forEach(y=>y!==0||(()=>{throw new Error("step cannot be 0")})),s.length===0&&(s=Array(a.length).fill(1));let n=t.starts.map((y,g)=>Nr(y,g,r,a,s)),o=t.ends.map((y,g)=>Nr(y,g,r,a,s));if(a.length!==n.length||a.length!==o.length)throw new Error("start, ends and axes should have the same number of elements");if(a.length!==r.length)for(let y=0;y<r.length;++y)a.includes(y)||(n.splice(y,0,0),o.splice(y,0,r[y]),s.splice(y,0,1));let u=s.map(y=>Math.sign(y));s.forEach((y,g,_)=>{if(y<0){let $=(o[g]-n[g])/y,v=n[g],k=v+$*s[g];n[g]=k,o[g]=v,_[g]=-y}});let l=r.slice(0);a.forEach((y,g)=>{l[y]=Math.ceil((o[y]-n[y])/s[y])});let d={dims:l,dataType:e[0].dataType},p=M("output",e[0].dataType,l.length),h=I("input",e[0].dataType,e[0].dims.length),c=S.size(l),f=[{name:"outputSize",type:"u32"},{name:"starts",type:"u32",length:n.length},{name:"signs",type:"i32",length:u.length},{name:"steps",type:"u32",length:s.length}],m=[{type:12,data:c},{type:12,data:n},{type:6,data:u},{type:12,data:s},...B(e[0].dims,l)],w=y=>`
      ${y.registerUniforms(f).declareVariables(h,p)}
        ${Ws(h,p,r)}
        ${y.mainStart()}
          ${y.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
          let output_indices = ${p.offsetToIndices("global_idx")};
          let input_indices = calculateInputIndices(output_indices);
          ${p.setByOffset("global_idx",h.getByIndices("input_indices"))}
      }`;return{name:"Slice",shaderCache:{hint:`${u.length}_${n.length}_${s.length}`,inputDependencies:["rank"]},getShaderSource:w,getRunData:()=>({outputs:[d],dispatchGroup:{x:Math.ceil(i/64)},programUniforms:m})}},dd=(e,t)=>{Ns(e.inputs,t);let r=Ls(e.inputs,t);e.compute(Gs(e.inputs,r),{inputs:[0]})},pd=e=>{let t=e.starts,r=e.ends,i=e.axes;return te({starts:t,ends:r,axes:i})}}),Fs,Hs,hd,cd,Qp=T(()=>{V(),W(),se(),Fe(),G(),Fs=e=>{if(!e||e.length!==1)throw new Error("Softmax op requires 1 input.")},Hs=(e,t)=>{let r=e.inputs[0],i=r.dims,a=S.size(i),s=64,n=i.length,o=S.normalizeAxis(t.axis,n),u=o<i.length-1,l,d=[];u?(d=Array.from({length:n},(b,E)=>E),d[o]=n-1,d[n-1]=o,l=e.compute(_e(r,d),{inputs:[r],outputs:[-1]})[0]):l=r;let p=l.dims,h=p[n-1],c=a/h,f=ae(h),m=h/f,w=(b,E)=>E===4?`max(max(${b}.x, ${b}.y), max(${b}.z, ${b}.w))`:E===2?`max(${b}.x, ${b}.y)`:E===3?`max(max(${b}.x, ${b}.y), ${b}.z)`:b,y=I("x",l.dataType,l.dims,f),g=M("result",l.dataType,l.dims,f),_=y.type.value,$=ue(l.dataType)==="f32"?`var threadMax = ${_}(-3.402823e+38f);`:`var threadMax = ${_}(-65504.0h);`,v=b=>`
      var<workgroup> rowMaxShared : ${_};
      var<workgroup> rowSumShared : ${_};
      var<workgroup> threadShared : array<${_}, ${s}>;

      fn getValue(row: i32, col: i32, row_stride: i32) -> ${_} {
        let index = row * row_stride + col;
        return x[index];
      }

      fn setValue(row: i32, col: i32, row_stride: i32, value: ${_}) {
        let index = row * row_stride + col;
        result[index] = value;
      }
      ${b.registerUniform("packedCols","i32").declareVariables(y,g)}
      ${b.mainStart()}
        let gindex = i32(global_idx);
        let lindex = i32(local_idx);
        const wg = ${s};
        let row = gindex / wg;
        let cols = uniforms.packedCols;
        let row_stride : i32 = uniforms.packedCols;

        // find the rows max
        ${$}
        for (var col = lindex; col < cols; col += wg) {
          let value = getValue(row, col, row_stride);
          threadMax = max(threadMax, value);
        }
        if (lindex < cols) {
          threadShared[lindex] = threadMax;
        }
        workgroupBarrier();

        var reduceSize = min(cols, wg);
        for (var currSize = reduceSize >> 1;  currSize > 0; currSize = reduceSize >> 1) {
          reduceSize = currSize + (reduceSize & 1);
          if (lindex < currSize) {
            threadShared[lindex] = max(threadShared[lindex], threadShared[lindex + reduceSize]);
          }
          workgroupBarrier();
        }
        if (lindex == 0) {
          rowMaxShared = ${_}(${w("threadShared[0]",f)});
        }
        workgroupBarrier();

        // find the rows sum
        var threadSum = ${_}(0.0);
        for (var col = lindex; col < cols; col += wg) {
          let subExp = exp(getValue(row, col, row_stride) - rowMaxShared);
          threadSum += subExp;
        }
        threadShared[lindex] = threadSum;
        workgroupBarrier();

        for (var currSize = wg >> 1;  currSize > 0; currSize = currSize >> 1) {
          if (lindex < currSize) {
            threadShared[lindex] = threadShared[lindex] + threadShared[lindex + currSize];
          }
          workgroupBarrier();
        }
        if (lindex == 0) {
          rowSumShared = ${_}(${Ne("threadShared[0]",f)});
        }
        workgroupBarrier();

        // calculate final value for each element in the row
        for (var col = lindex; col < cols; col += wg) {
          let value = exp(getValue(row, col, row_stride) - rowMaxShared) / rowSumShared;
          setValue(row, col, row_stride, value);
        }
      }`,k=e.compute({name:"Softmax",shaderCache:{hint:`${f}`,inputDependencies:["type"]},getRunData:()=>({outputs:[{dims:p,dataType:l.dataType}],dispatchGroup:{x:c},programUniforms:[{type:6,data:m}]}),getShaderSource:v},{inputs:[l],outputs:[u?-1:0]})[0];u&&e.compute(_e(k,d),{inputs:[k]})},hd=(e,t)=>{Fs(e.inputs),Hs(e,t)},cd=e=>te({axis:e.axis})}),js,Ks,Zs,Qs,Xs,fd,md,Xp=T(()=>{V(),W(),se(),G(),js=e=>{if(!e||e.length<1)throw new Error("too few inputs")},Ks=(e,t)=>{let r=[],i=t.numOutputs;return e[1].dims[0]>0&&(e[1].getBigInt64Array().forEach(a=>r.push(Number(a))),i=r.length),te({numOutputs:i,axis:t.axis,splitSizes:r})},Zs=e=>`
fn calculateOutputIndex(index: u32) -> u32 {
    for (var i: u32 = 0u; i < ${e}u; i += 1u ) {
    if (index < ${O("uniforms.size_in_split_axis","i",e)}) {
        return i;
    }
    }
    return ${e}u;
}`,Qs=e=>{let t=e.length,r=[];for(let i=0;i<t;++i){let a=e[i].setByIndices("indices","input[global_idx]");t===1?r.push(a):i===0?r.push(`if (output_number == ${i}u) { ${a} }`):i===t-1?r.push(`else { ${a} }`):r.push(`else if (output_number == ${i}) { ${a} }`)}return`
      fn writeBufferData(output_number: u32, indices: ${e[0].type.indices}, global_idx: u32) {
        ${r.join(`
`)}
      }`},Xs=(e,t)=>{let r=e[0].dims,i=S.size(r),a=e[0].dataType,s=S.normalizeAxis(t.axis,r.length),n=new Array(t.numOutputs),o=I("input",a,r.length),u=new Array(t.numOutputs),l=[],d=[],p=0,h=[{type:12,data:i}];for(let f=0;f<t.numOutputs;f++){p+=t.splitSizes[f],u[f]=p;let m=r.slice();m[s]=t.splitSizes[f],d.push(m),n[f]=M(`output${f}`,a,m.length),l.push({dims:d[f],dataType:e[0].dataType})}h.push({type:12,data:u},...B(r,...d));let c=f=>`
  ${f.registerUniform("input_size","u32").registerUniform("size_in_split_axis","u32",u.length).declareVariables(o,...n)}
  ${Zs(u.length)}
  ${Qs(n)}

  ${f.mainStart()}
    ${f.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.input_size")}

    var indices = ${o.offsetToIndices("global_idx")};
    var index = ${o.indicesGet("indices",s)};
    let output_number = calculateOutputIndex(index);
    if (output_number != 0) {
      index -= ${O("uniforms.size_in_split_axis","output_number - 1u",u.length)};
      ${o.indicesSet("indices",s,"index")};
    }
    writeBufferData(output_number, indices, global_idx);
  }`;return{name:"Split",shaderCache:{hint:t.cacheKey,inputDependencies:["rank"]},getShaderSource:c,getRunData:()=>({outputs:l,dispatchGroup:{x:Math.ceil(i/64)},programUniforms:h})}},fd=(e,t)=>{js(e.inputs);let r=e.inputs.length===1?t:Ks(e.inputs,t);e.compute(Xs(e.inputs,r),{inputs:[0]})},md=e=>{let t=e.axis,r=e.splitSizes,i=e.numOutputs<0?r.length:e.numOutputs;if(i!==r.length)throw new Error("numOutputs and splitSizes lengh must be equal");return te({axis:t,numOutputs:i,splitSizes:r})}}),Ys,Js,gd,Yp=T(()=>{V(),W(),G(),Ys=(e,t,r,i,a)=>{let s=M("output_data",a,r.length,4),n=I("a_data",t[1].dataType,t[1].dims.length,4),o=I("b_data",t[2].dataType,t[2].dims.length,4),u=I("c_data",t[0].dataType,t[0].dims.length,4),l,d=(p,h,c)=>`select(${h}, ${p}, ${c})`;if(!i)l=s.setByOffset("global_idx",d(n.getByOffset("global_idx"),o.getByOffset("global_idx"),u.getByOffset("global_idx")));else{let p=(h,c,f="")=>{let m=`a_data[index_a${c}][component_a${c}]`,w=`b_data[index_b${c}][component_b${c}]`,y=`bool(c_data[index_c${c}] & (0xffu << (component_c${c} * 8)))`;return`
            let output_indices${c} = ${s.offsetToIndices(`global_idx * 4u + ${c}u`)};
            let offset_a${c} = ${n.broadcastedIndicesToOffset(`output_indices${c}`,s)};
            let offset_b${c} = ${o.broadcastedIndicesToOffset(`output_indices${c}`,s)};
            let offset_c${c} = ${u.broadcastedIndicesToOffset(`output_indices${c}`,s)};
            let index_a${c} = offset_a${c} / 4u;
            let index_b${c} = offset_b${c} / 4u;
            let index_c${c} = offset_c${c} / 4u;
            let component_a${c} = offset_a${c} % 4u;
            let component_b${c} = offset_b${c} % 4u;
            let component_c${c} = offset_c${c} % 4u;
            ${h}[${c}] = ${f}(${d(m,w,y)});
          `};a===9?l=`
            var data = vec4<u32>(0);
            ${p("data",0,"u32")}
            ${p("data",1,"u32")}
            ${p("data",2,"u32")}
            ${p("data",3,"u32")}
            output_data[global_idx] = dot(vec4<u32>(0x1, 0x100, 0x10000, 0x1000000), vec4<u32>(data));`:l=`
            ${p("output_data[global_idx]",0)}
            ${p("output_data[global_idx]",1)}
            ${p("output_data[global_idx]",2)}
            ${p("output_data[global_idx]",3)}
          `}return`
        ${e.registerUniform("vec_size","u32").declareVariables(u,n,o,s)}
        ${e.mainStart()}
        ${e.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.vec_size")}
        ${l}
      }`},Js=e=>{let t=e[1].dims,r=e[2].dims,i=e[0].dims,a=e[1].dataType,s=!(S.areEqual(t,r)&&S.areEqual(r,i)),n=t,o=S.size(t);if(s){let l=ot.calcShape(ot.calcShape(t,r,!1),i,!1);if(!l)throw new Error("Can't perform where op on the given tensors");n=l,o=S.size(n)}let u=Math.ceil(o/4);return{name:"Where",shaderCache:{inputDependencies:["rank","rank","rank"]},getShaderSource:l=>Ys(l,e,n,s,a),getRunData:()=>({outputs:[{dims:n,dataType:a}],dispatchGroup:{x:Math.ceil(o/64/4)},programUniforms:[{type:12,data:u},...B(i,t,r,n)]})}},gd=e=>{e.compute(Js(e.inputs))}}),yd,Jp=T(()=>{gp(),Ei(),yp(),wp(),$p(),_p(),vp(),Sp(),Ep(),Tp(),Cp(),Ap(),Rp(),Bp(),Op(),Mp(),Pp(),Dp(),Up(),qp(),Vp(),yl(),Np(),ql(),Lp(),Wp(),Gp(),Fp(),zi(),Hp(),jp(),Kp(),Zp(),Qp(),Xp(),Nl(),Fe(),Ti(),Yp(),yd=new Map([["Abs",[gu]],["Acos",[yu]],["Acosh",[wu]],["Add",[Yu]],["ArgMax",[hu,ei]],["ArgMin",[pu,ei]],["Asin",[$u]],["Asinh",[_u]],["Atan",[vu]],["Atanh",[bu]],["Attention",[cu]],["AveragePool",[Ql,Zl]],["BatchNormalization",[fu]],["BiasAdd",[mu]],["BiasSplitGelu",[Xu]],["Cast",[ku,xu]],["Ceil",[Iu]],["Clip",[Su]],["Concat",[ul,ll]],["Conv",[ni,ai]],["ConvTranspose",[_l,$l]],["Cos",[zu]],["Cosh",[Eu]],["CumSum",[vl,bl]],["DepthToSpace",[xl,kl]],["DequantizeLinear",[id,ad]],["Div",[Ju]],["Einsum",[Sl,Il]],["Elu",[Tu,_t]],["Equal",[el]],["Erf",[Cu]],["Exp",[Au]],["Expand",[zl]],["FastGelu",[El]],["Floor",[Ru]],["FusedConv",[ni,ai]],["Gather",[Cl,Tl]],["GatherElements",[Ol,Bl]],["GatherBlockQuantized",[Al,Rl]],["Gelu",[Bu]],["Gemm",[Pl,Ml]],["GlobalAveragePool",[Yl,Xl]],["GlobalMaxPool",[rd,td]],["Greater",[al]],["GreaterOrEqual",[sl]],["GroupQueryAttention",[Wl,Ll]],["HardSigmoid",[Nu,Vu]],["InstanceNormalization",[Gl]],["LayerNormalization",[Fl]],["LeakyRelu",[Ou,_t]],["Less",[nl]],["LessOrEqual",[ol]],["Log",[Zu]],["MatMul",[gl]],["MatMulNBits",[Hl,jl]],["MaxPool",[Jl,ed]],["Mul",[tl]],["MultiHeadAttention",[Ul,Dl]],["Neg",[Pu]],["Not",[Mu]],["Pad",[Kl]],["Pow",[rl]],["QuickGelu",[Qu,_t]],["Range",[nd]],["Reciprocal",[Du]],["ReduceMin",[su]],["ReduceMean",[tu]],["ReduceMax",[nu]],["ReduceSum",[uu]],["ReduceProd",[ou]],["ReduceL1",[ru]],["ReduceL2",[iu]],["ReduceLogSum",[du]],["ReduceLogSumExp",[au]],["ReduceSumSquare",[lu]],["Relu",[Uu]],["Resize",[sd,od]],["RotaryEmbedding",[ud]],["Sigmoid",[qu]],["Sin",[Lu]],["Sinh",[Wu]],["Slice",[dd,pd]],["SkipLayerNormalization",[ld]],["Split",[fd,md]],["Sqrt",[Gu]],["Softmax",[hd,cd]],["Sub",[il]],["Tan",[Fu]],["Tanh",[Hu]],["ThresholdedRelu",[Ku,_t]],["Tile",[Vl]],["Transpose",[Wo,Go]],["Where",[gd]]])}),wd,eh=T(()=>{Ce(),Me(),G(),wd=class{constructor(e){this.backend=e,this.repo=new Map,this.attributesBound=!1}getArtifact(e){return this.repo.get(e)}setArtifact(e,t){this.repo.set(e,t)}run(e,t,r,i,a){Oe(e.programInfo.name);let s=this.backend.device,n=this.backend.getComputePassEncoder();this.backend.writeTimestamp(this.backend.pendingDispatchNumber*2);let o=[];for(let l of t)o.push({binding:o.length,resource:{buffer:l.buffer}});for(let l of r)o.push({binding:o.length,resource:{buffer:l.buffer}});a&&o.push({binding:o.length,resource:a});let u=s.createBindGroup({layout:e.computePipeline.getBindGroupLayout(0),entries:o,label:e.programInfo.name});if(this.backend.sessionStatus==="capturing"){let l={kernelId:this.backend.currentKernelId,computePipeline:e.computePipeline,bindGroup:u,dispatchGroup:i};this.backend.capturedCommandList.get(this.backend.currentSessionId).push(l)}n.setPipeline(e.computePipeline),n.setBindGroup(0,u),n.dispatchWorkgroups(...i),this.backend.writeTimestamp(this.backend.pendingDispatchNumber*2+1),this.backend.pendingDispatchNumber++,(this.backend.pendingDispatchNumber>=this.backend.maxDispatchNumber||this.backend.queryType==="at-passes")&&this.backend.endComputePass(),this.backend.pendingDispatchNumber>=this.backend.maxDispatchNumber&&this.backend.flush(),Te(e.programInfo.name)}dispose(){}build(e,t){Oe(e.name);let r=this.backend.device,i=[];r.features.has("shader-f16")&&i.push("enable f16;");let a=Lo(t,this.backend.device.limits),s=e.getShaderSource(a),n=`${i.join(`
`)}
${a.additionalImplementations}
${s}`,o=r.createShaderModule({code:n,label:e.name});J("verbose",()=>`[WebGPU] ${e.name} shader code: ${n}`);let u=r.createComputePipeline({compute:{module:o,entryPoint:"main"},layout:"auto",label:e.name});return Te(e.name),{programInfo:e,computePipeline:u,uniformVariablesInfo:a.variablesInfo}}normalizeDispatchGroupSize(e){let t=typeof e=="number"?e:e.x,r=typeof e=="number"?1:e.y||1,i=typeof e=="number"?1:e.z||1,a=this.backend.device.limits.maxComputeWorkgroupsPerDimension;if(t<=a&&r<=a&&i<=a)return[t,r,i];let s=t*r*i,n=Math.ceil(Math.sqrt(s));if(n>a){if(n=Math.ceil(Math.cbrt(s)),n>a)throw new Error("Total dispatch size exceeds WebGPU maximum.");return[n,n,n]}else return[n,n,1]}}}),eo,to,ro,$d,th=T(()=>{Ce(),V(),Me(),Do(),fp(),Jp(),eh(),eo=(e,t)=>{if(t.length!==e.length)throw new Error(`inputDependencies length ${t.length} is not equal to inputTensors length ${e.length}.`);let r=[];for(let i=0;i<e.length;++i){let a=e[i].dataType;switch(t[i]){case"none":{r.push("");break}case"type":{r.push(`${a}`);break}case"rank":{let s=e[i].dims.length;r.push(`${a};${s}`);break}case"dims":{let s=e[i].dims.join(",");r.push(`${a};${s}`);break}default:throw new Error(`unsupported input dependency: ${t[i]}`)}}return r.join("|")},to=(e,t,r)=>{var a,s;let i=e.name;return(a=e.shaderCache)!=null&&a.hint&&(i+="["+e.shaderCache.hint+"]"),i+=":"+r+`:${eo(t,((s=e.shaderCache)==null?void 0:s.inputDependencies)??new Array(t.length).fill("dims"))}`,i},ro=class{constructor(e){e&&(this.architecture=e.architecture,this.vendor=e.vendor)}isArchitecture(e){return this.architecture===e}isVendor(e){return this.vendor===e}},$d=class{constructor(){this.currentSessionId=null,this.currentKernelId=null,this.commandEncoder=null,this.computePassEncoder=null,this.maxDispatchNumber=16,this.pendingDispatchNumber=0,this.pendingKernels=[],this.pendingQueries=new Map,this.sessionStatus="default",this.capturedCommandList=new Map,this.capturedPendingKernels=new Map,this.sessionExternalDataMapping=new Map}get currentKernelCustomData(){if(this.currentKernelId===null)throw new Error("currentKernelCustomData(): currentKernelId is null. (should not happen)");let e=this.kernelCustomData.get(this.currentKernelId);return e||(e={},this.kernelCustomData.set(this.currentKernelId,e)),e}async initialize(e,t){this.env=e;let r=[],i={requiredLimits:{maxComputeWorkgroupStorageSize:t.limits.maxComputeWorkgroupStorageSize,maxComputeWorkgroupsPerDimension:t.limits.maxComputeWorkgroupsPerDimension,maxStorageBufferBindingSize:t.limits.maxStorageBufferBindingSize,maxBufferSize:t.limits.maxBufferSize,maxComputeInvocationsPerWorkgroup:t.limits.maxComputeInvocationsPerWorkgroup,maxComputeWorkgroupSizeX:t.limits.maxComputeWorkgroupSizeX,maxComputeWorkgroupSizeY:t.limits.maxComputeWorkgroupSizeY,maxComputeWorkgroupSizeZ:t.limits.maxComputeWorkgroupSizeZ},requiredFeatures:r};t.features.has("chromium-experimental-timestamp-query-inside-passes")?r.push("chromium-experimental-timestamp-query-inside-passes"):t.features.has("timestamp-query")&&r.push("timestamp-query"),t.features.has("shader-f16")&&r.push("shader-f16"),this.device=await t.requestDevice(i),this.adapterInfo=new ro(t.info||await t.requestAdapterInfo()),this.gpuDataManager=Uo(this),this.programManager=new wd(this),this.kernels=new Map,this.kernelPersistentData=new Map,this.kernelCustomData=new Map,xi(e.logLevel,!!e.debug),this.device.onuncapturederror=a=>{a.error instanceof GPUValidationError&&console.error(`An uncaught WebGPU validation error was raised: ${a.error.message}`)},Object.defineProperty(this.env.webgpu,"device",{value:this.device,writable:!1,enumerable:!0,configurable:!1}),Object.defineProperty(this.env.webgpu,"adapter",{value:t,writable:!1,enumerable:!0,configurable:!1}),this.setQueryType()}dispose(){typeof this.querySet<"u"&&this.querySet.destroy(),this.gpuDataManager.dispose()}getCommandEncoder(){return this.commandEncoder||(this.commandEncoder=this.device.createCommandEncoder()),this.commandEncoder}getComputePassEncoder(){if(!this.computePassEncoder){let e=this.getCommandEncoder(),t={};this.queryType==="at-passes"&&(t.timestampWrites={querySet:this.querySet,beginningOfPassWriteIndex:this.pendingDispatchNumber*2,endOfPassWriteIndex:this.pendingDispatchNumber*2+1}),this.computePassEncoder=e.beginComputePass(t)}return this.computePassEncoder}endComputePass(){this.computePassEncoder&&(this.computePassEncoder.end(),this.computePassEncoder=null)}flush(){if(!this.commandEncoder)return;Oe(),this.endComputePass();let e;this.queryType!=="none"&&(this.commandEncoder.resolveQuerySet(this.querySet,0,this.pendingDispatchNumber*2,this.queryResolveBuffer,0),e=this.device.createBuffer({size:this.pendingDispatchNumber*2*8,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),this.pendingQueries.set(e,this.pendingKernels),this.pendingKernels=[],this.commandEncoder.copyBufferToBuffer(this.queryResolveBuffer,0,e,0,this.pendingDispatchNumber*2*8)),this.device.queue.submit([this.commandEncoder.finish()]),this.gpuDataManager.refreshPendingBuffers(),this.commandEncoder=null,this.pendingDispatchNumber=0,this.queryType!=="none"&&e.mapAsync(GPUMapMode.READ).then(()=>{var i;let t=new BigUint64Array(e.getMappedRange()),r=this.pendingQueries.get(e);for(let a=0;a<t.length/2;a++){let s=r[a],n=s.kernelId,o=this.kernels.get(n),u=o.kernelType,l=o.kernelName,d=s.programName,p=s.inputTensorViews,h=s.outputTensorViews,c=t[a*2],f=t[a*2+1];typeof this.queryTimeBase>"u"&&(this.queryTimeBase=c);let m=Number(c-this.queryTimeBase),w=Number(f-this.queryTimeBase);if(!Number.isSafeInteger(m)||!Number.isSafeInteger(w))throw new RangeError("incorrect timestamp range");if((i=this.env.webgpu.profiling)!=null&&i.ondata)this.env.webgpu.profiling.ondata({version:1,inputsMetadata:p.map(y=>({dims:y.dims,dataType:Qe(y.dataType)})),outputsMetadata:h.map(y=>({dims:y.dims,dataType:Qe(y.dataType)})),kernelId:n,kernelType:u,kernelName:l,programName:d,startTime:m,endTime:w});else{let y="";p.forEach((_,$)=>{y+=`input[${$}]: [${_.dims}] | ${Qe(_.dataType)}, `});let g="";h.forEach((_,$)=>{g+=`output[${$}]: [${_.dims}] | ${Qe(_.dataType)}, `}),console.log(`[profiling] kernel "${n}|${u}|${l}|${d}" ${y}${g}execution time: ${w-m} ns`)}Ft("GPU",`${d}::${c}::${f}`)}e.unmap(),this.pendingQueries.delete(e)}),Te()}run(e,t,r,i,a,s){Oe(e.name);let n=[];for(let g=0;g<t.length;++g){let _=t[g].data;if(_===0)continue;let $=this.gpuDataManager.get(_);if(!$)throw new Error(`no GPU data for input: ${_}`);n.push($)}let{outputs:o,dispatchGroup:u,programUniforms:l}=e.getRunData(t),d=r.length===0?o.map((g,_)=>_):r;if(d.length!==o.length)throw new Error(`Output size ${d.length} must be equal to ${o.length}.`);let p=[],h=[];for(let g=0;g<o.length;++g){if(!Number.isInteger(d[g])||d[g]<-3||d[g]>=s)throw new Error(`Invalid output index: ${d[g]}`);if(d[g]===-3)continue;let _=d[g]===-1,$=d[g]===-2,v=_||$?a(o[g].dataType,o[g].dims):i(d[g],o[g].dataType,o[g].dims);if(p.push(v),v.data===0)continue;let k=this.gpuDataManager.get(v.data);if(!k)throw new Error(`no GPU data for output: ${v.data}`);if(_&&this.temporaryData.push(k),$){let b=this.kernelPersistentData.get(this.currentKernelId);b||(b=[],this.kernelPersistentData.set(this.currentKernelId,b)),b.push(k)}h.push(k)}if(n.length!==t.length||h.length!==p.length){if(h.length===0)return Te(e.name),p;throw new Error(`Program ${e.name} has zero-sized tensor(s) in inputs or outputs. This is not supported now.`)}let c;if(l){let g=0,_=[];l.forEach(b=>{let E=typeof b.data=="number"?[b.data]:b.data;if(E.length===0)return;let C=b.type===10?2:4,A,q;b.type===10?(q=E.length>4?16:E.length>2?8:E.length*C,A=E.length>4?16:C*E.length):(q=E.length<=2?E.length*C:16,A=16),g=Math.ceil(g/q)*q,_.push(g);let P=b.type===10?8:4;g+=E.length>4?Math.ceil(E.length/P)*A:E.length*C});let $=16;g=Math.ceil(g/$)*$;let v=new ArrayBuffer(g);l.forEach((b,E)=>{let C=_[E],A=typeof b.data=="number"?[b.data]:b.data;if(b.type===6)new Int32Array(v,C,A.length).set(A);else if(b.type===12)new Uint32Array(v,C,A.length).set(A);else if(b.type===10)new Uint16Array(v,C,A.length).set(A);else if(b.type===1)new Float32Array(v,C,A.length).set(A);else throw new Error(`Unsupported uniform type: ${Qe(b.type)}`)});let k=this.gpuDataManager.create(g,GPUBufferUsage.COPY_DST|GPUBufferUsage.UNIFORM);this.device.queue.writeBuffer(k.buffer,0,v,0,g),this.gpuDataManager.release(k.id),c={offset:0,size:g,buffer:k.buffer}}let f=this.programManager.normalizeDispatchGroupSize(u),m=f[1]===1&&f[2]===1,w=to(e,t,m),y=this.programManager.getArtifact(w);if(y||(y=this.programManager.build(e,f),this.programManager.setArtifact(w,y),J("info",()=>`[artifact] key: ${w}, programName: ${e.name}`)),l&&y.uniformVariablesInfo){if(l.length!==y.uniformVariablesInfo.length)throw new Error(`Uniform variables count mismatch: expect ${y.uniformVariablesInfo.length}, got ${l.length} in program "${y.programInfo.name}".`);for(let g=0;g<l.length;g++){let _=l[g],$=_.type,v=typeof _.data=="number"?1:_.data.length,[k,b]=y.uniformVariablesInfo[g];if($!==k||v!==b)throw new Error(`Uniform variable ${g} mismatch: expect type ${k} with size ${b}, got type ${$} with size ${v} in program "${y.programInfo.name}".`)}}if(J("info",()=>`[ProgramManager] run "${e.name}" (key=${w}) with ${f[0]}x${f[1]}x${f[2]}`),this.queryType!=="none"||this.sessionStatus==="capturing"){let g={kernelId:this.currentKernelId,programName:y.programInfo.name,inputTensorViews:t,outputTensorViews:p};this.pendingKernels.push(g),this.sessionStatus==="capturing"&&this.capturedPendingKernels.get(this.currentSessionId).push(g)}return this.programManager.run(y,n,h,f,c),Te(e.name),p}upload(e,t){this.gpuDataManager.upload(e,t)}memcpy(e,t){this.gpuDataManager.memcpy(e,t)}async download(e,t){await this.gpuDataManager.download(e,t)}alloc(e){return this.gpuDataManager.create(e).id}free(e){return this.gpuDataManager.release(e)}createKernel(e,t,r,i){let a=yd.get(e);if(!a)throw new Error(`kernel not implemented: ${e}`);let s={kernelType:e,kernelName:i,kernelEntry:a[0],attributes:[a[1],r]};this.kernels.set(t,s)}releaseKernel(e){let t=this.kernelPersistentData.get(e);if(t){for(let r of t)this.gpuDataManager.release(r.id);this.kernelPersistentData.delete(e)}this.kernelCustomData.delete(e),this.kernels.delete(e)}computeKernel(e,t,r){let i=this.kernels.get(e);if(!i)throw new Error(`kernel not created: ${e}`);let a=i.kernelType,s=i.kernelName,n=i.kernelEntry,o=i.attributes;if(this.currentKernelId!==null)throw new Error(`kernel "[${a}] ${s}" is not allowed to be called recursively`);this.currentKernelId=e,o[0]&&(o[1]=o[0](o[1]),o[0]=void 0),J("info",()=>`[WebGPU] Start to run kernel "[${a}] ${s}"...`);let u=this.env.debug;this.temporaryData=[];try{return u&&this.device.pushErrorScope("validation"),n(t,o[1]),0}catch(l){return r.push(Promise.resolve(`[WebGPU] Kernel "[${a}] ${s}" failed. ${l}`)),1}finally{u&&r.push(this.device.popErrorScope().then(l=>l?`GPU validation error for kernel "[${a}] ${s}": ${l.message}`:null));for(let l of this.temporaryData)this.gpuDataManager.release(l.id);this.temporaryData=[],this.currentKernelId=null}}registerBuffer(e,t,r,i){let a=this.sessionExternalDataMapping.get(e);a||(a=new Map,this.sessionExternalDataMapping.set(e,a));let s=a.get(t),n=this.gpuDataManager.registerExternalBuffer(r,i,s);return a.set(t,[n,r]),n}unregisterBuffers(e){let t=this.sessionExternalDataMapping.get(e);t&&(t.forEach(r=>this.gpuDataManager.unregisterExternalBuffer(r[0])),this.sessionExternalDataMapping.delete(e))}getBuffer(e){let t=this.gpuDataManager.get(e);if(!t)throw new Error(`no GPU data for buffer: ${e}`);return t.buffer}createDownloader(e,t,r){return async()=>{let i=await Xr(this,e,t);return ki(i.buffer,r)}}writeTimestamp(e){this.queryType==="inside-passes"&&this.computePassEncoder.writeTimestamp(this.querySet,e)}setQueryType(){var e;this.queryType="none",(((e=this.env.webgpu.profiling)==null?void 0:e.mode)==="default"||(typeof this.env.trace>"u"?this.env.wasm.trace:this.env.trace))&&(this.device.features.has("chromium-experimental-timestamp-query-inside-passes")?this.queryType="inside-passes":this.device.features.has("timestamp-query")&&(this.queryType="at-passes"),this.queryType!=="none"&&typeof this.querySet>"u"&&(this.querySet=this.device.createQuerySet({type:"timestamp",count:this.maxDispatchNumber*2}),this.queryResolveBuffer=this.device.createBuffer({size:this.maxDispatchNumber*2*8,usage:GPUBufferUsage.COPY_SRC|GPUBufferUsage.QUERY_RESOLVE})))}captureBegin(){J("info","captureBegin"),this.capturedCommandList.get(this.currentSessionId)||this.capturedCommandList.set(this.currentSessionId,[]),this.capturedPendingKernels.get(this.currentSessionId)||this.capturedPendingKernels.set(this.currentSessionId,[]),this.flush(),this.sessionStatus="capturing"}captureEnd(){J("info","captureEnd"),this.flush(),this.sessionStatus="default"}replay(){J("info","replay"),this.sessionStatus="replaying";let e=this.capturedCommandList.get(this.currentSessionId),t=this.capturedPendingKernels.get(this.currentSessionId),r=e.length;this.pendingKernels=[];for(let i=0;i<r;i++){let a=this.getComputePassEncoder(),s=e[i];this.writeTimestamp(this.pendingDispatchNumber*2),a.setPipeline(s.computePipeline),a.setBindGroup(0,s.bindGroup),a.dispatchWorkgroups(...s.dispatchGroup),this.writeTimestamp(this.pendingDispatchNumber*2+1),this.pendingDispatchNumber++,this.queryType!=="none"&&this.pendingKernels.push(t[i]),(this.pendingDispatchNumber>=this.maxDispatchNumber||this.queryType==="at-passes")&&this.endComputePass(),this.pendingDispatchNumber>=this.maxDispatchNumber&&this.flush()}this.flush(),this.sessionStatus="default"}onReleaseSession(e){this.unregisterBuffers(e),this.capturedCommandList.has(e)&&this.capturedCommandList.delete(e),this.capturedPendingKernels.has(e)&&this.capturedPendingKernels.delete(e),this.gpuDataManager.onReleaseSession(e)}onRunStart(e){this.currentSessionId=e,this.setQueryType()}}}),io,Lr,Wr,ao,_d,rh=T(()=>{Me(),io=1,Lr=()=>io++,Wr=class{constructor(e,t){this.mlContext=e,this.tensorEntry=t,this.tensorCache=t?[t]:[]}get tensor(){var e;return(e=this.tensorEntry)==null?void 0:e[0]}get context(){if(!this.mlContext)throw new Error("MLContext has not been set.");return this.mlContext}set context(e){if(this.mlContext&&this.mlContext!==e)throw new Error("MLTensor in use in a different MLContext.");this.mlContext=e}destroy(){for(let[e]of this.tensorCache)e.destroy();this.tensorCache=[],this.tensorEntry=void 0}trySelectTensor(e,t){for(let[r,i,a]of this.tensorCache)if(t===r){if(this.context!==e)throw new Error("MLTensor cannot be registered with a different MLContext.");return this.tensorEntry=[r,i,a],!0}return!1}async ensureTensor(e,t,r){var s;if(this.tensorEntry){let[n,o,u]=this.tensorEntry;if(o===e&&u.every((l,d)=>l===t[d]))return n}for(let[n,o,u]of this.tensorCache)if(o===e&&u.every((l,d)=>l===t[d])){if(r&&this.tensorEntry){J("verbose",()=>`[WebNN] Slowdown may occur, having to copy existing tensor {dataType: ${e}, shape: ${t}}`);let l=await this.context.readTensor(this.tensorEntry[0]);this.context.writeTensor(n,l)}return this.tensorEntry=[n,o,u],n}J("verbose",()=>`[WebNN] MLContext.createTensor {dataType: ${e}, shape: ${t}}`);let i=MLTensorUsage.READ|MLTensorUsage.WRITE,a=await this.context.createTensor({dataType:e,shape:t,dimensions:t,usage:i});return this.tensorEntry=[a,e,t],this.tensorCache.push(this.tensorEntry),this.activeUpload&&((s=this.mlContext)==null||s.writeTensor(a,this.activeUpload),this.activeUpload=void 0),a}upload(e){var t;if(!this.tensorEntry){this.activeUpload=new Uint8Array(e);return}(t=this.mlContext)==null||t.writeTensor(this.tensorEntry[0],e)}async download(e){if(this.activeUpload)if(e){e instanceof ArrayBuffer?new Uint8Array(e).set(this.activeUpload):new Uint8Array(e.buffer,e.byteOffset,e.byteLength).set(this.activeUpload);return}else return this.activeUpload.buffer;if(!this.tensorEntry)throw new Error("Tensor has not been created.");return e?this.context.readTensor(this.tensorEntry[0],e):this.context.readTensor(this.tensorEntry[0])}},ao=class{constructor(e){this.backend=e,this.tensorsById=new Map,this.tensorIdsByContext=new Map}reserveTensorId(){let e=Lr();return this.tensorsById.set(e,new Wr),e}releaseTensorId(e){let t=this.tensorsById.get(e);if(t){t.destroy(),this.tensorsById.delete(e);for(let[r,i]of this.tensorIdsByContext)if(i.has(e)){i.delete(e),i.size===0&&this.tensorIdsByContext.delete(r);break}}}async ensureTensor(e,t,r,i){var s;J("verbose",()=>`[WebNN] TensorManager.ensureTensor {tensorId: ${e}, dataType: ${t}, shape: ${r}, copyOld: ${i}}`);let a=this.tensorsById.get(e);if(!a)throw new Error("Tensor not found.");return a.context=this.backend.currentContext,this.tensorIdsByContext.has(this.backend.currentContext)||this.tensorIdsByContext.set(this.backend.currentContext,new Set),(s=this.tensorIdsByContext.get(this.backend.currentContext))==null||s.add(e),a.ensureTensor(t,r,i)}upload(e,t){this.tensorsById.get(e).upload(t)}async download(e,t){return J("verbose",()=>`[WebNN] TensorManager.download {tensorId: ${e}, dstBuffer: ${t==null?void 0:t.byteLength}}`),this.tensorsById.get(e).download(t)}releaseTensorsForContext(e){let t=this.tensorIdsByContext.get(e);if(t){for(let r of t)this.tensorsById.get(r).destroy(),this.tensorsById.delete(r);this.tensorIdsByContext.delete(e)}}registerTensor(e,t,r,i){for(let[n,o]of this.tensorsById)if(o.trySelectTensor(e,t))return n;let a=Lr();this.tensorsById.set(a,new Wr(e,[t,r,i]));let s=this.tensorIdsByContext.get(e);return s||(s=new Set,this.tensorIdsByContext.set(e,s)),s.add(a),a}},_d=(...e)=>new ao(...e)}),Gr,vd,ih=T(()=>{V(),Ye(),Do(),rh(),Me(),Gr=new Map([[1,"float32"],[10,"float16"],[6,"int32"],[12,"uint32"],[7,"int64"],[13,"uint64"],[3,"int8"],[2,"uint8"],[9,"uint8"]]),vd=class{constructor(e){this.tensorManager=_d(this),this.mlContextBySessionId=new Map,this.sessionIdsByMLContext=new Map,xi(e.logLevel,!!e.debug)}get currentSessionId(){if(this.activeSessionId===void 0)throw new Error("No active session");return this.activeSessionId}onRunStart(e){this.activeSessionId=e}get currentContext(){let e=this.getMLContext(this.currentSessionId);if(!e)throw new Error(`No MLContext found for session ${this.currentSessionId}`);return e}registerMLContext(e,t){this.mlContextBySessionId.set(e,t);let r=this.sessionIdsByMLContext.get(t);r||(r=new Set,this.sessionIdsByMLContext.set(t,r)),r.add(e)}onReleaseSession(e){let t=this.mlContextBySessionId.get(e);if(!t)return;this.mlContextBySessionId.delete(e);let r=this.sessionIdsByMLContext.get(t);r.delete(e),r.size===0&&(this.sessionIdsByMLContext.delete(t),this.tensorManager.releaseTensorsForContext(t))}getMLContext(e){return this.mlContextBySessionId.get(e)}reserveTensorId(){return this.tensorManager.reserveTensorId()}releaseTensorId(e){J("verbose",()=>`[WebNN] releaseTensorId {tensorId: ${e}}`),this.tensorManager.releaseTensorId(e)}async ensureTensor(e,t,r,i){let a=Gr.get(t);if(!a)throw new Error(`Unsupported ONNX data type: ${t}`);return this.tensorManager.ensureTensor(e,a,r,i)}uploadTensor(e,t){if(!le().shouldTransferToMLTensor)throw new Error("Trying to upload to a MLTensor while shouldTransferToMLTensor is false");J("verbose",()=>`[WebNN] uploadTensor {tensorId: ${e}, data: ${t.byteLength}}`),this.tensorManager.upload(e,t)}async downloadTensor(e,t){return this.tensorManager.download(e,t)}createMLTensorDownloader(e,t){return async()=>{let r=await this.tensorManager.download(e);return ki(r,t)}}registerMLTensor(e,t,r){let i=Gr.get(t);if(!i)throw new Error(`Unsupported ONNX data type: ${t}`);let a=this.tensorManager.registerTensor(this.currentContext,e,i,r);return J("verbose",()=>`[WebNN] registerMLTensor {tensor: ${e}, dataType: ${i}, dimensions: ${r}} -> {tensorId: ${a}}`),a}flush(){}}}),bd={};er(bd,{init:()=>xd});var Dt,no,xd,ah=T(()=>{V(),th(),Me(),W(),ih(),Dt=class kd{constructor(t,r,i,a){this.module=t,this.dataType=r,this.data=i,this.dims=a}getFloat32Array(){if(this.dataType!==1)throw new Error("Invalid data type");let t=S.size(this.dims);return t===0?new Float32Array:new Float32Array(this.module.HEAP8.buffer,this.data,t)}getBigInt64Array(){if(this.dataType!==7)throw new Error("Invalid data type");let t=S.size(this.dims);return t===0?new BigInt64Array:new BigInt64Array(this.module.HEAP8.buffer,this.data,t)}getInt32Array(){if(this.dataType!==6)throw new Error("Invalid data type");let t=S.size(this.dims);return t===0?new Int32Array:new Int32Array(this.module.HEAP8.buffer,this.data,t)}getUint16Array(){if(this.dataType!==10&&this.dataType!==4)throw new Error("Invalid data type");let t=S.size(this.dims);return t===0?new Uint16Array:new Uint16Array(this.module.HEAP8.buffer,this.data,t)}reshape(t){if(S.size(t)!==S.size(this.dims))throw new Error("Invalid new shape");return new kd(this.module,this.dataType,this.data,t)}},no=class{constructor(e,t,r){this.module=e,this.backend=t,this.customDataOffset=0,this.customDataSize=0,this.adapterInfo=t.adapterInfo;let i=e.HEAPU32,a=r>>>2;this.opKernelContext=i[a++];let s=i[a++];this.outputCount=i[a++],this.customDataOffset=i[a++],this.customDataSize=i[a++];let n=[];for(let o=0;o<s;o++){let u=i[a++],l=i[a++],d=i[a++],p=[];for(let h=0;h<d;h++)p.push(i[a++]);n.push(new Dt(e,u,l,p))}this.inputs=n}get kernelCustomData(){return this.backend.currentKernelCustomData}get customDataBuffer(){return this.module.HEAPU8.subarray(this.customDataOffset,this.customDataOffset+this.customDataSize)}getMaxComputeWorkgroupSizes(){return[this.backend.device.limits.maxComputeWorkgroupSizeX,this.backend.device.limits.maxComputeWorkgroupSizeY,this.backend.device.limits.maxComputeWorkgroupSizeZ]}getMaxComputeWorkgroupStoragesize(){return this.backend.device.limits.maxComputeWorkgroupStorageSize}compute(e,t){var n;let r=((n=t==null?void 0:t.inputs)==null?void 0:n.map(o=>typeof o=="number"?this.inputs[o]:o))??this.inputs,i=(t==null?void 0:t.outputs)??[],a=(o,u,l)=>new Dt(this.module,u,this.output(o,l),l),s=(o,u)=>{let l=at(o,u);if(!l)throw new Error(`Unsupported data type: ${o}`);let d=l>0?this.backend.gpuDataManager.create(l).id:0;return new Dt(this.module,o,d,u)};return this.backend.run(e,r,i,a,s,this.outputCount)}output(e,t){let r=this.module.stackSave();try{let i=this.module.stackAlloc((1+t.length)*4),a=i>>2;this.module.HEAPU32[a++]=t.length;for(let s=0;s<t.length;s++)this.module.HEAPU32[a++]=t[s];return this.module._JsepOutput(this.opKernelContext,e,i)}catch(i){throw new Error(`Failed to generate kernel's output[${e}] with dims [${t}]. If you are running with pre-allocated output, please make sure the output type/dims are correct. Error: ${i}`)}finally{this.module.stackRestore(r)}}},xd=async(e,t,r,i)=>{let a=t.jsepInit;if(!a)throw new Error("Failed to initialize JSEP. The WebAssembly module is not built with JSEP support.");if(e==="webgpu"){let s=new $d;await s.initialize(r,i),a("webgpu",[s,n=>s.alloc(n),n=>s.free(n),(n,o,u,l=!1)=>{if(l)J("verbose",()=>`[WebGPU] jsepCopyGpuToGpu: src=${n}, dst=${o}, size=${u}`),s.memcpy(n,o);else{J("verbose",()=>`[WebGPU] jsepCopyCpuToGpu: dataOffset=${n}, gpuDataId=${o}, size=${u}`);let d=t.HEAPU8.subarray(n>>>0,(n>>>0)+u);s.upload(o,d)}},async(n,o,u)=>{J("verbose",()=>`[WebGPU] jsepCopyGpuToCpu: gpuDataId=${n}, dataOffset=${o}, size=${u}`),await s.download(n,()=>t.HEAPU8.subarray(o>>>0,(o>>>0)+u))},(n,o,u)=>s.createKernel(n,o,u,t.UTF8ToString(t._JsepGetNodeName(o))),n=>s.releaseKernel(n),(n,o,u,l)=>{J("verbose",()=>`[WebGPU] jsepRun: sessionHandle=${u}, kernel=${n}, contextDataOffset=${o}`);let d=new no(t,s,o);return s.computeKernel(n,d,l)},()=>s.captureBegin(),()=>s.captureEnd(),()=>s.replay()])}else{let s=new vd(r);a("webnn",[s,()=>s.reserveTensorId(),n=>s.releaseTensorId(n),async(n,o,u,l)=>s.ensureTensor(n,o,u,l),(n,o)=>{s.uploadTensor(n,o)},async(n,o)=>s.downloadTensor(n,o)])}}}),so,Oi,Mi,De,oo,Yt,Pi,Di,Fr,Ui,qi,Vi,Sd=T(()=>{hp(),cp(),V(),Ye(),wi(),Po(),so=(e,t)=>{le()._OrtInit(e,t)!==0&&ie("Can't initialize onnxruntime.")},Oi=async e=>{so(e.wasm.numThreads,jt(e.logLevel))},Mi=async(e,t)=>{{let r=(ah(),pi(bd)).init;if(t==="webgpu"){if(typeof navigator>"u"||!navigator.gpu)throw new Error("WebGPU is not supported in current environment");let i=e.webgpu.adapter;if(i){if(typeof i.limits!="object"||typeof i.features!="object"||typeof i.requestDevice!="function")throw new Error("Invalid GPU adapter set in `env.webgpu.adapter`. It must be a GPUAdapter object.")}else{let a=e.webgpu.powerPreference;if(a!==void 0&&a!=="low-power"&&a!=="high-performance")throw new Error(`Invalid powerPreference setting: "${a}"`);let s=e.webgpu.forceFallbackAdapter;if(s!==void 0&&typeof s!="boolean")throw new Error(`Invalid forceFallbackAdapter setting: "${s}"`);if(i=await navigator.gpu.requestAdapter({powerPreference:a,forceFallbackAdapter:s}),!i)throw new Error('Failed to get GPU adapter. You may need to enable flag "--enable-unsafe-webgpu" if you are using Chrome.')}await r("webgpu",le(),e,i)}if(t==="webnn"){if(typeof navigator>"u"||!navigator.ml)throw new Error("WebNN is not supported in current environment");await r("webnn",le(),e)}}},De=new Map,oo=e=>{let t=le(),r=t.stackSave();try{let i=t.stackAlloc(8);return t._OrtGetInputOutputCount(e,i,i+4)!==0&&ie("Can't get session input/output count."),[t.HEAP32[i/4],t.HEAP32[i/4+1]]}finally{t.stackRestore(r)}},Yt=e=>{let t=le(),r=t._malloc(e.byteLength);if(r===0)throw new Error(`Can't create a session. failed to allocate a buffer of size ${e.byteLength}.`);return t.HEAPU8.set(e,r),[r,e.byteLength]},Pi=async(e,t)=>{var p,h;let r,i,a=le();Array.isArray(e)?[r,i]=e:e.buffer===a.HEAPU8.buffer?[r,i]=[e.byteOffset,e.byteLength]:[r,i]=Yt(e);let s=0,n=0,o=0,u=[],l=[],d=[];try{if([n,u]=Mo(t),(t==null?void 0:t.externalData)&&a.mountExternalData){let $=[];for(let v of t.externalData){let k=typeof v=="string"?v:v.path;$.push(bi(typeof v=="string"?v:v.data).then(b=>{a.mountExternalData(k,b)}))}await Promise.all($)}for(let $ of(t==null?void 0:t.executionProviders)??[])if((typeof $=="string"?$:$.name)==="webnn"){if(a.shouldTransferToMLTensor=!1,a.currentContext)throw new Error("WebNN execution provider is already set.");if(typeof $!="string"){let v=$,k=v==null?void 0:v.context,b=v==null?void 0:v.gpuDevice,E=v==null?void 0:v.deviceType,C=v==null?void 0:v.numThreads,A=v==null?void 0:v.powerPreference;k?a.currentContext=k:b?a.currentContext=await navigator.ml.createContext(b):a.currentContext=await navigator.ml.createContext({deviceType:E,numThreads:C,powerPreference:A})}else a.currentContext=await navigator.ml.createContext();break}s=await a._OrtCreateSession(r,i,n),s===0&&ie("Can't create a session."),a.currentContext&&(a.jsepRegisterMLContext(s,a.currentContext),a.currentContext=void 0,a.shouldTransferToMLTensor=!0);let[c,f]=oo(s),m=!!(t!=null&&t.enableGraphCapture),w=[],y=[],g=[];for(let $=0;$<c;$++){let v=a._OrtGetInputName(s,$);v===0&&ie("Can't get an input name."),l.push(v),w.push(a.UTF8ToString(v))}for(let $=0;$<f;$++){let v=a._OrtGetOutputName(s,$);v===0&&ie("Can't get an output name."),d.push(v);let k=a.UTF8ToString(v);y.push(k);{if(m&&(t==null?void 0:t.preferredOutputLocation)===void 0){g.push("gpu-buffer");continue}let b=typeof(t==null?void 0:t.preferredOutputLocation)=="string"?t.preferredOutputLocation:((p=t==null?void 0:t.preferredOutputLocation)==null?void 0:p[k])??"cpu";if(b!=="cpu"&&b!=="cpu-pinned"&&b!=="gpu-buffer"&&b!=="ml-tensor")throw new Error(`Not supported preferred output location: ${b}.`);if(m&&b!=="gpu-buffer")throw new Error(`Not supported preferred output location: ${b}. Only 'gpu-buffer' location is supported when enableGraphCapture is true.`);g.push(b)}}let _=null;return g.some($=>$==="gpu-buffer"||$==="ml-tensor")&&(o=a._OrtCreateBinding(s),o===0&&ie("Can't create IO binding."),_={handle:o,outputPreferredLocations:g,outputPreferredLocationsEncoded:g.map($=>Qr($))}),De.set(s,[s,l,d,_,m,!1]),[s,w,y]}catch(c){throw l.forEach(f=>a._OrtFree(f)),d.forEach(f=>a._OrtFree(f)),o!==0&&a._OrtReleaseBinding(o),s!==0&&a._OrtReleaseSession(s),c}finally{a._free(r),n!==0&&a._OrtReleaseSessionOptions(n),u.forEach(c=>a._free(c)),(h=a.unmountExternalData)==null||h.call(a)}},Di=e=>{var u;let t=le(),r=De.get(e);if(!r)throw new Error(`cannot release session. invalid session id: ${e}`);let[i,a,s,n,o]=r;n&&(o&&t._OrtClearBoundOutputs(n.handle),t._OrtReleaseBinding(n.handle)),(u=t.jsepOnReleaseSession)==null||u.call(t,e),a.forEach(l=>t._OrtFree(l)),s.forEach(l=>t._OrtFree(l)),t._OrtReleaseSession(i),De.delete(e)},Fr=(e,t,r,i,a,s=!1)=>{if(!e){t.push(0);return}let n=le(),o=e[0],u=e[1],l=e[3],d,p;if(o==="string"&&(l==="gpu-buffer"||l==="ml-tensor"))throw new Error("String tensor is not supported on GPU.");if(s&&l!=="gpu-buffer")throw new Error(`External buffer must be provided for input/output index ${a} when enableGraphCapture is true.`);if(l==="gpu-buffer"){let f=e[2].gpuBuffer;p=at(wt(o),u);let m=n.jsepRegisterBuffer;if(!m)throw new Error('Tensor location "gpu-buffer" is not supported without using WebGPU.');d=m(i,a,f,p)}else if(l==="ml-tensor"){let f=e[2].mlTensor;p=at(wt(o),u);let m=n.jsepRegisterMLTensor;if(!m)throw new Error('Tensor location "ml-tensor" is not supported without using WebNN.');d=m(f,wt(o),u)}else{let f=e[2];if(Array.isArray(f)){p=4*f.length,d=n._malloc(p),r.push(d);let m=d/4;for(let w=0;w<f.length;w++){if(typeof f[w]!="string")throw new TypeError(`tensor data at index ${w} is not a string`);n.HEAPU32[m++]=de(f[w],r)}}else p=f.byteLength,d=n._malloc(p),r.push(d),n.HEAPU8.set(new Uint8Array(f.buffer,f.byteOffset,p),d)}let h=n.stackSave(),c=n.stackAlloc(4*u.length);try{let f=c/4;u.forEach(w=>n.HEAP32[f++]=w);let m=n._OrtCreateTensor(wt(o),d,p,c,u.length,Qr(l));m===0&&ie(`Can't create tensor for input/output. session=${i}, index=${a}.`),t.push(m)}finally{n.stackRestore(h)}},Ui=async(e,t,r,i,a,s)=>{var A,q;let n=le(),o=De.get(e);if(!o)throw new Error(`cannot run inference. invalid session id: ${e}`);let u=o[0],l=o[1],d=o[2],p=o[3],h=o[4],c=o[5],f=t.length,m=i.length,w=0,y=[],g=[],_=[],$=[],v=n.stackSave(),k=n.stackAlloc(f*4),b=n.stackAlloc(f*4),E=n.stackAlloc(m*4),C=n.stackAlloc(m*4);try{(A=n.jsepOnRunStart)==null||A.call(n,u),[w,y]=Oo(s);for(let R=0;R<f;R++)Fr(r[R],g,$,e,t[R],h);for(let R=0;R<m;R++)Fr(a[R],_,$,e,f+i[R],h);let P=k/4,L=b/4,F=E/4,Q=C/4;for(let R=0;R<f;R++)n.HEAPU32[P++]=g[R],n.HEAPU32[L++]=l[t[R]];for(let R=0;R<m;R++)n.HEAPU32[F++]=_[R],n.HEAPU32[Q++]=d[i[R]];if(p&&!c){let{handle:R,outputPreferredLocations:U,outputPreferredLocationsEncoded:H}=p;if(l.length!==f)throw new Error(`input count from feeds (${f}) is expected to be always equal to model's input count (${l.length}).`);for(let x=0;x<f;x++){let z=t[x];await n._OrtBindInput(R,l[z],g[x])!==0&&ie(`Can't bind input[${x}] for session=${e}.`)}for(let x=0;x<m;x++){let z=i[x];(q=a[x])!=null&&q[3]?n._OrtBindOutput(R,d[z],_[x],0)!==0&&ie(`Can't bind pre-allocated output[${x}] for session=${e}.`):n._OrtBindOutput(R,d[z],0,H[z])!==0&&ie(`Can't bind output[${x}] to ${U[x]} for session=${e}.`)}De.set(e,[u,l,d,p,h,!0])}let Z;p?Z=await n._OrtRunWithBinding(u,p.handle,m,E,w):Z=await n._OrtRun(u,b,k,f,C,m,E,w),Z!==0&&ie("failed to call OrtRun().");let N=[];for(let R=0;R<m;R++){let U=n.HEAPU32[E/4+R];if(U===_[R]){N.push(a[R]);continue}let H=n.stackSave(),x=n.stackAlloc(4*4),z=!1,D,j=0;try{n._OrtGetTensorData(U,x,x+4,x+8,x+12)!==0&&ie(`Can't access output tensor data on index ${R}.`);let X=x/4,oe=n.HEAPU32[X++];j=n.HEAPU32[X++];let be=n.HEAPU32[X++],re=n.HEAPU32[X++],Ae=[];for(let he=0;he<re;he++)Ae.push(n.HEAPU32[be/4+he]);n._OrtFree(be);let Re=Ae.reduce((he,me)=>he*me,1);D=Qe(oe);let zt=p==null?void 0:p.outputPreferredLocations[i[R]];if(D==="string"){if(zt==="gpu-buffer"||zt==="ml-tensor")throw new Error("String tensor is not supported on GPU.");let he=[],me=j/4;for(let Je=0;Je<Re;Je++){let Ni=n.HEAPU32[me++],Wd=Je===Re-1?void 0:n.HEAPU32[me]-Ni;he.push(n.UTF8ToString(Ni,Wd))}N.push([D,Ae,he,"cpu"])}else if(zt==="gpu-buffer"&&Re>0){let he=n.jsepGetBuffer;if(!he)throw new Error('preferredLocation "gpu-buffer" is not supported without using WebGPU.');let me=he(j),Je=at(oe,Re);if(Je===void 0||!_i(D))throw new Error(`Unsupported data type: ${D}`);z=!0,N.push([D,Ae,{gpuBuffer:me,download:n.jsepCreateDownloader(me,Je,D),dispose:()=>{n._OrtReleaseTensor(U)}},"gpu-buffer"])}else if(zt==="ml-tensor"&&Re>0){let he=n.jsepEnsureTensor;if(!he)throw new Error('preferredLocation "ml-tensor" is not supported without using WebNN.');if(at(oe,Re)===void 0||!vi(D))throw new Error(`Unsupported data type: ${D}`);let me=await he(j,oe,Ae,!1);z=!0,N.push([D,Ae,{mlTensor:me,download:n.jsepCreateMLTensorDownloader(j,D),dispose:()=>{n.jsepReleaseTensorId(j),n._OrtReleaseTensor(U)}},"ml-tensor"])}else{let he=$i(D),me=new he(Re);new Uint8Array(me.buffer,me.byteOffset,me.byteLength).set(n.HEAPU8.subarray(j,j+me.byteLength)),N.push([D,Ae,me,"cpu"])}}finally{n.stackRestore(H),D==="string"&&j&&n._free(j),z||n._OrtReleaseTensor(U)}}return p&&!h&&(n._OrtClearBoundOutputs(p.handle),De.set(e,[u,l,d,p,h,!1])),N}finally{n.stackRestore(v),g.forEach(P=>n._OrtReleaseTensor(P)),_.forEach(P=>n._OrtReleaseTensor(P)),$.forEach(P=>n._free(P)),w!==0&&n._OrtReleaseRunOptions(w),y.forEach(P=>n._free(P))}},qi=e=>{let t=le(),r=De.get(e);if(!r)throw new Error("invalid session id");let i=r[0],a=t._OrtEndProfiling(i);a===0&&ie("Can't get an profile file name."),t._OrtFree(a)},Vi=e=>{let t=[];for(let r of e){let i=r[2];!Array.isArray(i)&&"buffer"in i&&t.push(i.buffer)}return t}}),Ue,ye,et,mt,gt,Ut,Hr,qt,je,Ke,uo,Id,zd,Ed,Td,Cd,Ad,Rd,Bd=T(()=>{Ce(),Sd(),Ye(),tr(),Ue=()=>!!Y.wasm.proxy&&typeof document<"u",et=!1,mt=!1,gt=!1,qt=new Map,je=(e,t)=>{let r=qt.get(e);r?r.push(t):qt.set(e,[t])},Ke=()=>{if(et||!mt||gt||!ye)throw new Error("worker not ready")},uo=e=>{switch(e.data.type){case"init-wasm":et=!1,e.data.err?(gt=!0,Hr[1](e.data.err)):(mt=!0,Hr[0]()),Ut&&(URL.revokeObjectURL(Ut),Ut=void 0);break;case"init-ep":case"copy-from":case"create":case"release":case"run":case"end-profiling":{let t=qt.get(e.data.type);e.data.err?t.shift()[1](e.data.err):t.shift()[0](e.data.out);break}}},Id=async()=>{if(!mt){if(et)throw new Error("multiple calls to 'initWasm()' detected.");if(gt)throw new Error("previous call to 'initWasm()' failed.");if(et=!0,Ue())return new Promise((e,t)=>{ye==null||ye.terminate(),Ro().then(([r,i])=>{try{ye=i,ye.onerror=s=>t(s),ye.onmessage=uo,Hr=[e,t];let a={type:"init-wasm",in:Y};ye.postMessage(a),Ut=r}catch(a){t(a)}},t)});try{await yi(Y.wasm),await Oi(Y),mt=!0}catch(e){throw gt=!0,e}finally{et=!1}}},zd=async e=>{if(Ue())return Ke(),new Promise((t,r)=>{je("init-ep",[t,r]);let i={type:"init-ep",in:{epName:e,env:Y}};ye.postMessage(i)});await Mi(Y,e)},Ed=async e=>Ue()?(Ke(),new Promise((t,r)=>{je("copy-from",[t,r]);let i={type:"copy-from",in:{buffer:e}};ye.postMessage(i,[e.buffer])})):Yt(e),Td=async(e,t)=>{if(Ue()){if(t!=null&&t.preferredOutputLocation)throw new Error('session option "preferredOutputLocation" is not supported for proxy.');return Ke(),new Promise((r,i)=>{je("create",[r,i]);let a={type:"create",in:{model:e,options:{...t}}},s=[];e instanceof Uint8Array&&s.push(e.buffer),ye.postMessage(a,s)})}else return Pi(e,t)},Cd=async e=>{if(Ue())return Ke(),new Promise((t,r)=>{je("release",[t,r]);let i={type:"release",in:e};ye.postMessage(i)});Di(e)},Ad=async(e,t,r,i,a,s)=>{if(Ue()){if(r.some(n=>n[3]!=="cpu"))throw new Error("input tensor on GPU is not supported for proxy.");if(a.some(n=>n))throw new Error("pre-allocated output tensor is not supported for proxy.");return Ke(),new Promise((n,o)=>{je("run",[n,o]);let u=r,l={type:"run",in:{sessionId:e,inputIndices:t,inputs:u,outputIndices:i,options:s}};ye.postMessage(l,Vi(u))})}else return Ui(e,t,r,i,a,s)},Rd=async e=>{if(Ue())return Ke(),new Promise((t,r)=>{je("end-profiling",[t,r]);let i={type:"end-profiling",in:e};ye.postMessage(i)});qi(e)}}),jr,lo,Od,nh=T(()=>{Ce(),Bd(),V(),gi(),Po(),jr=(e,t)=>{switch(e.location){case"cpu":return[e.type,e.dims,e.data,"cpu"];case"gpu-buffer":return[e.type,e.dims,{gpuBuffer:e.gpuBuffer},"gpu-buffer"];case"ml-tensor":return[e.type,e.dims,{mlTensor:e.mlTensor},"ml-tensor"];default:throw new Error(`invalid data location: ${e.location} for ${t()}`)}},lo=e=>{switch(e[3]){case"cpu":return new pe(e[0],e[2],e[1]);case"gpu-buffer":{let t=e[0];if(!_i(t))throw new Error(`not supported data type: ${t} for deserializing GPU tensor`);let{gpuBuffer:r,download:i,dispose:a}=e[2];return pe.fromGpuBuffer(r,{dataType:t,dims:e[1],download:i,dispose:a})}case"ml-tensor":{let t=e[0];if(!vi(t))throw new Error(`not supported data type: ${t} for deserializing MLTensor tensor`);let{mlTensor:r,download:i,dispose:a}=e[2];return pe.fromMLTensor(r,{dataType:t,dims:e[1],download:i,dispose:a})}default:throw new Error(`invalid data location: ${e[3]}`)}},Od=class{async fetchModelAndCopyToWasmMemory(e){return Ed(await bi(e))}async loadModel(e,t){Oe();let r;typeof e=="string"?r=await this.fetchModelAndCopyToWasmMemory(e):r=e,[this.sessionId,this.inputNames,this.outputNames]=await Td(r,t),Te()}async dispose(){return Cd(this.sessionId)}async run(e,t,r){Oe();let i=[],a=[];Object.entries(e).forEach(p=>{let h=p[0],c=p[1],f=this.inputNames.indexOf(h);if(f===-1)throw new Error(`invalid input '${h}'`);i.push(c),a.push(f)});let s=[],n=[];Object.entries(t).forEach(p=>{let h=p[0],c=p[1],f=this.outputNames.indexOf(h);if(f===-1)throw new Error(`invalid output '${h}'`);s.push(c),n.push(f)});let o=i.map((p,h)=>jr(p,()=>`input "${this.inputNames[a[h]]}"`)),u=s.map((p,h)=>p?jr(p,()=>`output "${this.outputNames[n[h]]}"`):null),l=await Ad(this.sessionId,a,o,n,u,r),d={};for(let p=0;p<l.length;p++)d[this.outputNames[n[p]]]=s[p]??lo(l[p]);return Te(),d}startProfiling(){}endProfiling(){Rd(this.sessionId)}}}),Md={};er(Md,{OnnxruntimeWebAssemblyBackend:()=>li,initializeFlags:()=>ui,wasmBackend:()=>Pd});var ui,li,Pd,sh=T(()=>{Ce(),Bd(),nh(),tr(),ui=()=>{if((typeof Y.wasm.initTimeout!="number"||Y.wasm.initTimeout<0)&&(Y.wasm.initTimeout=0),Y.wasm.simd===!1&&console.warn('Deprecated property "env.wasm.simd" is set to false. non-SIMD build is no longer provided, and this setting will be ignored.'),typeof Y.wasm.proxy!="boolean"&&(Y.wasm.proxy=!1),typeof Y.wasm.trace!="boolean"&&(Y.wasm.trace=!1),typeof Y.wasm.numThreads!="number"||!Number.isInteger(Y.wasm.numThreads)||Y.wasm.numThreads<=0)if(typeof self<"u"&&!self.crossOriginIsolated)Y.wasm.numThreads=1;else{let e=typeof navigator>"u"?jd("node:os").cpus().length:navigator.hardwareConcurrency;Y.wasm.numThreads=Math.min(4,Math.ceil((e||1)/2))}Y.wasm.wasmPaths===void 0&&Ee&&Ee.indexOf("blob:")!==0&&(Y.wasm.wasmPaths=Ee.substring(0,Ee.lastIndexOf("/")+1))},li=class{async init(e){ui(),await Id(),await zd(e)}async createInferenceSessionHandler(e,t){let r=new Od;return await r.loadModel(e,t),Promise.resolve(r)}},Pd=new li});Ce();Ce();Ce();var oh="1.20.1";{let e=(sh(),pi(Md)).wasmBackend;it("webgpu",e,5),it("webnn",e,5),it("cpu",e,10),it("wasm",e,10)}Object.defineProperty(Y.versions,"web",{value:oh,enumerable:!0});/**
* @license
* Copyright 2021 Google LLC. All Rights Reserved.
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
* http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
* =============================================================================
*//**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 *//**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const ee=4096,Xe=1024,ne=ee/2+1,bt=ee-Xe,Be=512,we=1024,st=["drums","bass","other","vocals"],Vt=1e-10,Nt={exponent:3},xt=new Float32Array(ee);for(let e=0;e<ee;e++)xt[e]=.5-.5*Math.cos(2*Math.PI*e/ee);const po=Math.log2(ee),Dd=new Uint32Array(ee);for(let e=0;e<ee;e++){let t=0;for(let r=0;r<po;r++)t|=(e>>r&1)<<po-1-r;Dd[e]=t}const Ud=new Float64Array(ee/2),qd=new Float64Array(ee/2);for(let e=0;e<ee/2;e++)Ud[e]=Math.cos(2*Math.PI*e/ee),qd[e]=Math.sin(2*Math.PI*e/ee);function Vd(e,t,r){const i=ee;for(let s=0;s<i;s++){const n=Dd[s];if(n>s){let o=e[s];e[s]=e[n],e[n]=o,o=t[s],t[s]=t[n],t[n]=o}}const a=r?1:-1;for(let s=2;s<=i;s<<=1){const n=s>>1,o=i/s;for(let u=0;u<i;u+=s)for(let l=0;l<n;l++){const d=Ud[l*o],p=a*qd[l*o],h=u+l,c=h+n,f=e[c]*d-t[c]*p,m=e[c]*p+t[c]*d;e[c]=e[h]-f,t[c]=t[h]-m,e[h]+=f,t[h]+=m}}}const qe=new Float64Array(ee),Ve=new Float64Array(ee);function uh(e,t,r,i,a,s,n){for(let o=0;o<ee;o++){const u=r+o,l=xt[o];qe[o]=(u>=0&&u<e.length?e[u]:0)*l,Ve[o]=(u>=0&&u<t.length?t[u]:0)*l}Vd(qe,Ve,!1);for(let o=0;o<ne;o++){const u=ee-o&ee-1,l=qe[o],d=Ve[o],p=qe[u],h=Ve[u];i[o]=(l+p)/2,a[o]=(d-h)/2,s[o]=(d+h)/2,n[o]=(p-l)/2}}function lh(e,t,r,i,a,s){for(let n=0;n<ne;n++)qe[n]=e[n]-i[n],Ve[n]=t[n]+r[n];for(let n=ne;n<ee;n++){const o=ee-n;qe[n]=e[o]+i[o],Ve[n]=-t[o]+r[o]}Vd(qe,Ve,!0);for(let n=0;n<ee;n++)a[n]=qe[n]/ee,s[n]=Ve[n]/ee}function dh(e){return Math.ceil((bt+e)/Xe)}const Kr=["drums","bass","other"];async function ph(e,t,r,i){const a=e.length,s=dh(a),n=Math.ceil(s/Be),o=(s-1)*Xe+ee,u={};Kr.forEach(P=>{u[P]=new Float32Array(o)});const l=new Float32Array(o);for(let P=0;P<s;P++){const L=P*Xe;for(let F=0;F<ee;F++)l[L+F]+=xt[F]*xt[F]}const d=new Float32Array(Be*ne),p=new Float32Array(Be*ne),h=new Float32Array(Be*ne),c=new Float32Array(Be*ne),f=new Float32Array(2*Be*we),m=new Float64Array(ne),w=new Float64Array(ne),y=new Float64Array(ne),g=new Float64Array(ne),_=new Float64Array(ne),$=new Float64Array(ne),v=new Float64Array(ne),k=new Float64Array(ne),b=new Float64Array(ee),E=new Float64Array(ee),C={},A={};st.forEach(P=>{C[P]=new Float32Array(ne),A[P]=new Float32Array(ne)});let q=0;for(let P=0;P<n;P++){const L=P*Be,F=Math.min(Be,s-L);f.fill(0);for(let N=0;N<F;N++){uh(e,t,(L+N)*Xe-bt,m,w,y,g);const R=N*ne;for(let x=0;x<ne;x++)d[R+x]=m[x],p[R+x]=w[x],h[R+x]=y[x],c[R+x]=g[x];const U=N*we,H=Be*we+N*we;for(let x=0;x<we;x++)f[U+x]=Math.hypot(m[x],w[x]),f[H+x]=Math.hypot(y[x],g[x])}const Q={};for(const N of st)Q[N]=await r(N,f,1);for(let N=0;N<F;N++){const R=(L+N)*Xe,U=N*ne,H=N*we,x=Be*we+N*we;for(let z=0;z<we;z++){let D=Vt,j=Vt;for(const X of st){const oe=Q[X][H+z],be=Q[X][x+z];D+=Math.pow(oe,Nt.exponent),j+=Math.pow(be,Nt.exponent)}for(const X of st){const oe=Q[X][H+z],be=Q[X][x+z];C[X][z]=(Math.pow(oe,Nt.exponent)+Vt/4)/D,A[X][z]=(Math.pow(be,Nt.exponent)+Vt/4)/j}}for(const z of Kr){const D=C[z],j=A[z];let X=0,oe=0;for(let re=0;re<we;re++)X+=D[re],oe+=j[re];X/=we,oe/=we;for(let re=0;re<ne;re++){let Ae=re<we?D[re]:X,Re=re<we?j[re]:oe;_[re]=d[U+re]*Ae,$[re]=p[U+re]*Ae,v[re]=h[U+re]*Re,k[re]=c[U+re]*Re}lh(_,$,v,k,b,E);const be=u[z];for(let re=0;re<ee;re++)be[R+re]+=(b[re]+E[re])*.5*xt[re]}}const Z=P===n-1?a:Math.max(0,Math.min(a,(L+F)*Xe-bt));if(Z>q||P===n-1){const N={};for(const R of Kr){const U=new Float32Array(Z-q),H=u[R];for(let x=q;x<Z;x++){const z=l[bt+x];U[x-q]=z>1e-8?H[bt+x]/z:0}N[R]=U}i&&await i({from:q,to:Z,total:a,done:P+1,splits:n,stems:N}),q=Z}}}Y.wasm.wasmPaths=new URL("../ort/",self.location.href).href;Y.wasm.numThreads=self.crossOriginIsolated?Math.min(8,navigator.hardwareConcurrency||4):1;let Nd=null,tt=null,Lt="wasm";const Jt=[],rt=new Set;let Zr=!1;async function hh(e,t){const r=await fetch(new URL(`../models/${e}.fp16.onnx`,self.location.href));if(!r.ok)throw new Error(`couldn't get the ${e} model (${r.status})`);const i=Number(r.headers.get("content-length"))||0,a=r.body.getReader(),s=[];let n=0;for(;;){const{done:l,value:d}=await a.read();if(l)break;s.push(d),n+=d.length,t(d.length,i)}const o=new Uint8Array(n);let u=0;return s.forEach(l=>{o.set(l,u),u+=l.length}),o}async function ch(e){const t=new Float32Array(1048576);for(let l=0;l<t.length;l++)t[l]=Math.abs(Math.sin(l*.37))*.5;const r=()=>({x:new pe("float32",t,[2,1,512,1024])}),i=await kt.create(e,{executionProviders:["webgpu"]}),a=await kt.create(e,{executionProviders:["wasm"]}),s=(await i.run(r())).y.data,n=(await a.run(r())).y.data;let o=0,u=0;for(let l=0;l<s.length;l+=97)o+=Math.abs(s[l]-n[l]),u+=Math.abs(n[l]);return await i.release(),await a.release(),u>0&&o/u<.05}function Ld(){return tt||(tt=(async()=>{let e=0;const t=4*19714140,r={};for(const a of st)r[a]=await hh(a,s=>{e+=s,self.postMessage({type:"status",text:`Downloading the song splitter (first time only)… ${Math.round(e/t*100)}%`})});if(self.postMessage({type:"status",text:"Starting the song splitter…"}),self.navigator.gpu)try{if(await self.navigator.gpu.requestAdapter()){const s=ch(r.vocals),n=new Promise(o=>setTimeout(()=>o(!1),2e4));await Promise.race([s,n])&&(Lt="webgpu")}}catch{Lt="wasm"}const i={};for(const a of st)i[a]=await kt.create(r[a],{executionProviders:[Lt]});Nd=i,self.postMessage({type:"status",text:"",provider:Lt})})(),tt.catch(()=>{tt=null}),tt)}async function fh(e,t,r){return(await Nd[e].run({x:new pe("float32",t,[2,r,512,1024])})).y.data}async function mh(){if(!Zr){for(Zr=!0;Jt.length;){const e=Jt.shift();if(rt.has(e.id)){rt.delete(e.id);continue}try{await Ld(),await ph(e.left,e.right,fh,t=>{if(rt.has(e.id))throw new Error("cancelled");const r=Object.values(t.stems).map(i=>i.buffer);self.postMessage({type:"segment",id:e.id,...t},r)}),self.postMessage({type:"done",id:e.id})}catch(t){rt.has(e.id)?rt.delete(e.id):self.postMessage({type:"error",id:e.id,message:t&&t.message||String(t)})}}Zr=!1}}self.onmessage=e=>{const t=e.data;t.type==="split"?(Jt.push(t),t.urgent&&Jt.sort((r,i)=>(i.urgent?1:0)-(r.urgent?1:0)),mh()):t.type==="cancel"?rt.add(t.id):t.type==="warmup"&&Ld().catch(r=>self.postMessage({type:"status",text:"",error:r.message}))};
