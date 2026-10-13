// Numerical reference from the v1.9.3 worker. Used only for regression comparisons.
/**
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
 */const ee=4096,Xe=1024,ne=ee/2+1,bt=ee-Xe,Be=512,we=1024,st=["drums","bass","other","vocals"],Vt=1e-10,Nt={exponent:3},xt=new Float32Array(ee);for(let e=0;e<ee;e++)xt[e]=.5-.5*Math.cos(2*Math.PI*e/ee);const po=Math.log2(ee),Dd=new Uint32Array(ee);for(let e=0;e<ee;e++){let t=0;for(let r=0;r<po;r++)t|=(e>>r&1)<<po-1-r;Dd[e]=t}const Ud=new Float64Array(ee/2),qd=new Float64Array(ee/2);for(let e=0;e<ee/2;e++)Ud[e]=Math.cos(2*Math.PI*e/ee),qd[e]=Math.sin(2*Math.PI*e/ee);function Vd(e,t,r){const i=ee;for(let s=0;s<i;s++){const n=Dd[s];if(n>s){let o=e[s];e[s]=e[n],e[n]=o,o=t[s],t[s]=t[n],t[n]=o}}const a=r?1:-1;for(let s=2;s<=i;s<<=1){const n=s>>1,o=i/s;for(let u=0;u<i;u+=s)for(let l=0;l<n;l++){const d=Ud[l*o],p=a*qd[l*o],h=u+l,c=h+n,f=e[c]*d-t[c]*p,m=e[c]*p+t[c]*d;e[c]=e[h]-f,t[c]=t[h]-m,e[h]+=f,t[h]+=m}}}const qe=new Float64Array(ee),Ve=new Float64Array(ee);function uh(e,t,r,i,a,s,n){for(let o=0;o<ee;o++){const u=r+o,l=xt[o];qe[o]=(u>=0&&u<e.length?e[u]:0)*l,Ve[o]=(u>=0&&u<t.length?t[u]:0)*l}Vd(qe,Ve,!1);for(let o=0;o<ne;o++){const u=ee-o&ee-1,l=qe[o],d=Ve[o],p=qe[u],h=Ve[u];i[o]=(l+p)/2,a[o]=(d-h)/2,s[o]=(d+h)/2,n[o]=(p-l)/2}}function lh(e,t,r,i,a,s){for(let n=0;n<ne;n++)qe[n]=e[n]-i[n],Ve[n]=t[n]+r[n];for(let n=ne;n<ee;n++){const o=ee-n;qe[n]=e[o]+i[o],Ve[n]=-t[o]+r[o]}Vd(qe,Ve,!0);for(let n=0;n<ee;n++)a[n]=qe[n]/ee,s[n]=Ve[n]/ee}function dh(e){return Math.ceil((bt+e)/Xe)}const Kr=["drums","bass","other"];async function ph(e,t,r,i){const a=e.length,s=dh(a),n=Math.ceil(s/Be),o=(s-1)*Xe+ee,u={};Kr.forEach(P=>{u[P]=new Float32Array(o)});const l=new Float32Array(o);for(let P=0;P<s;P++){const L=P*Xe;for(let F=0;F<ee;F++)l[L+F]+=xt[F]*xt[F]}const d=new Float32Array(Be*ne),p=new Float32Array(Be*ne),h=new Float32Array(Be*ne),c=new Float32Array(Be*ne),f=new Float32Array(2*Be*we),m=new Float64Array(ne),w=new Float64Array(ne),y=new Float64Array(ne),g=new Float64Array(ne),_=new Float64Array(ne),$=new Float64Array(ne),v=new Float64Array(ne),k=new Float64Array(ne),b=new Float64Array(ee),E=new Float64Array(ee),C={},A={};st.forEach(P=>{C[P]=new Float32Array(ne),A[P]=new Float32Array(ne)});let q=0;for(let P=0;P<n;P++){const L=P*Be,F=Math.min(Be,s-L);f.fill(0);for(let N=0;N<F;N++){uh(e,t,(L+N)*Xe-bt,m,w,y,g);const R=N*ne;for(let x=0;x<ne;x++)d[R+x]=m[x],p[R+x]=w[x],h[R+x]=y[x],c[R+x]=g[x];const U=N*we,H=Be*we+N*we;for(let x=0;x<we;x++)f[U+x]=Math.hypot(m[x],w[x]),f[H+x]=Math.hypot(y[x],g[x])}const Q={};for(const N of st)Q[N]=await r(N,f,1);for(let N=0;N<F;N++){const R=(L+N)*Xe,U=N*ne,H=N*we,x=Be*we+N*we;for(let z=0;z<we;z++){let D=Vt,j=Vt;for(const X of st){const oe=Q[X][H+z],be=Q[X][x+z];D+=Math.pow(oe,Nt.exponent),j+=Math.pow(be,Nt.exponent)}for(const X of st){const oe=Q[X][H+z],be=Q[X][x+z];C[X][z]=(Math.pow(oe,Nt.exponent)+Vt/4)/D,A[X][z]=(Math.pow(be,Nt.exponent)+Vt/4)/j}}for(const z of Kr){const D=C[z],j=A[z];let X=0,oe=0;for(let re=0;re<we;re++)X+=D[re],oe+=j[re];X/=we,oe/=we;for(let re=0;re<ne;re++){let Ae=re<we?D[re]:X,Re=re<we?j[re]:oe;_[re]=d[U+re]*Ae,$[re]=p[U+re]*Ae,v[re]=h[U+re]*Re,k[re]=c[U+re]*Re}lh(_,$,v,k,b,E);const be=u[z];for(let re=0;re<ee;re++)be[R+re]+=(b[re]+E[re])*.5*xt[re]}}const Z=P===n-1?a:Math.max(0,Math.min(a,(L+F)*Xe-bt));if(Z>q||P===n-1){const N={};for(const R of Kr){const U=new Float32Array(Z-q),H=u[R];for(let x=q;x<Z;x++){const z=l[bt+x];U[x-q]=z>1e-8?H[bt+x]/z:0}N[R]=U}i&&await i({from:q,to:Z,total:a,done:P+1,splits:n,stems:N}),q=Z}}}
module.exports={ph};
