# Third-party notices

The Unlicense in `LICENSE` applies to original Yeatle project code. It does
not replace the licenses of third-party libraries, models, borrowed code,
or the rights attached to music, video, and artwork.

The supplied compiled files retain their original license comments.

| Component | License | Reference |
| --- | --- | --- |
| React / React DOM 18.3.1 and Scheduler | MIT | [React license](https://github.com/facebook/react/blob/v18.3.1/LICENSE) |
| ONNX Runtime Web 1.20 | MIT | [ONNX Runtime license](https://github.com/microsoft/onnxruntime/blob/v1.20.0/LICENSE) |
| Google code embedded in the supplied separator worker | Apache-2.0 | Copyright 2019, 2020, and 2021 Google LLC; see preserved comments in `build/assets/separator.worker.js` and `licenses/Apache-2.0.txt` |
| Spleeter by Deezer Research | MIT | [Spleeter license](https://github.com/deezer/spleeter/blob/master/LICENSE) |
| Best-Practice Spleeter 4-stem ONNX conversion | Apache-2.0 | [Model card and attribution](https://huggingface.co/Best-Practice/spleeter-4stems-onnx) |
| Vite and its React plugin (development tools) | MIT | Their package licenses are installed with their dependencies |
| Electron desktop runtime | MIT, with separately licensed Chromium components | See `licenses/Electron-MIT.txt` and the runtime's bundled `LICENSES.chromium.html` |
| electron-updater and its runtime dependencies | MIT, with dependencies retaining their respective package licenses | See `licenses/electron-updater-MIT.txt` and the installed dependency license files |

License texts for redistributed runtime components are in `licenses/`.
Models are downloaded from the upstream host and are excluded from Git.
Song stems are excluded from Git and distributed separately, if available.

The original `server.js` says its sheet-reading and link-handling code was
borrowed from `tracker-player`. The supplied folder does not identify the
upstream repository or its license. That attribution is retained; no claim
is made that upstream code has become public domain.

Bundled images, sound effects, videos, tracker data, song audio, album
artwork, and artist names are not relicensed by this repository. Their
respective rights and terms continue to apply. Yeatle is an unofficial fan
project and does not claim affiliation with Yeat, Deezer, Apple, or other
services it uses.
