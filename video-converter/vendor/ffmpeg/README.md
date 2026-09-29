Vendored copy of `@ffmpeg/ffmpeg@0.12.15` (`dist/esm/*.js`), MIT License,
https://github.com/ffmpegwasm/ffmpeg.wasm

It is served from this site (not a CDN) because the library starts a Web Worker
from `./worker.js`, and browsers only allow same-origin worker scripts. The large
`@ffmpeg/core` WASM binary is still fetched from a CDN at runtime.
