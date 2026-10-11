# Original frontend build configuration

The imported Yeatle folder contained the Vite configuration, dependency lockfile,
and HTML entry point, but **did not include `src/main.jsx` or the rest of `src/`**.
There are no source maps in the supplied compiled assets.

The working frontend lives in `../build/`. The browser server and desktop app use
those files directly. You do not need to run Vite or install these dependencies
to play the game or package the desktop app.

`npm run build` in this folder currently fails because the original frontend
source is missing. Request the original `src/` and `public/` folders from the
creator before trying to rebuild it. Compiled files are not a replacement for
the original editable React code.

After obtaining those folders:

```sh
npm ci
npm run build
```

Then copy `dist/index.html`, `dist/assets/`, and `dist/ort/` into `../build/`.
Also copy any required static assets from the restored `public/` folder. Preserve
your existing `../build/Songs/` folder. The root project's desktop build commands
package the existing `build/` directory independently of this Vite project.
