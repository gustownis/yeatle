import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";

// the splitter's runtime files go to /ort/ as they are (see separator.worker.js)
const ORT_FILES = ["ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"];
function copyOrt() {
  return {
    name: "copy-onnx-runtime",
    buildStart() {
      fs.mkdirSync("public/ort", { recursive: true });
      ORT_FILES.forEach(f => fs.copyFileSync(`node_modules/onnxruntime-web/dist/${f}`, `public/ort/${f}`));
    }
  };
}

// relative paths so the page works from whatever folder the server serves
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    copyOrt(),
    // stamp each build onto the file links, so browsers never reuse an old copy
    {
      name: "cache-bust",
      transformIndexHtml: html => html.replace(/(assets\/yeatle\.(?:js|css))"/g, `$1?v=${Date.now()}"`)
    }
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // fixed names, so a rebuild just replaces the two files in build/assets
    rollupOptions: { output: { entryFileNames: "assets/yeatle.js", assetFileNames: "assets/yeatle[extname]" } }
  },
  // the splitter's worker and its WebAssembly runtime, under fixed names
  worker: {
    format: "es",
    rollupOptions: { output: { entryFileNames: "assets/[name].js", chunkFileNames: "assets/[name].js", assetFileNames: "assets/[name][extname]" } }
  },
  server: { proxy: { "/api": "http://localhost:3093", "/Songs": "http://localhost:3093", "/Images": "http://localhost:3093" } }
});
