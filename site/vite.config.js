import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

/**
 * Puts the demo's stand-in server in front of the app.
 *
 * Injected rather than imported, so no module the production build can reach
 * mentions it: `src/demo/` is unreferenced outside this mode and never enters
 * that build's graph at all.
 *
 * Both scripts are modules and neither is async, so they run in document order
 * -- which is the whole point of prepending this one. `head-prepend` is also
 * the default for a tag with no `injectTo`, but the ordering is the mechanism
 * here rather than an incidental, so it is stated.
 */
const demoServer = () => ({
  name: "demo-server",
  transformIndexHtml: {
    // Ahead of Vite's own HTML handling, which is what collects the page's
    // module scripts into the build. A tag added after that has been done is
    // left with the source path it was written with, and the built page asks
    // for a file that only exists before bundling.
    order: "pre",
    handler: () => [
      {
        tag: "script",
        attrs: { type: "module", src: "/src/demo/server.js" },
        injectTo: "head-prepend",
      },
    ],
  },
});

// The API is served from the same origin in production (Caddy fronts both the
// static bundle and the Rust server), so the client always talks to /api.
// In dev, proxy that prefix to the Rust server on :3000.
//
// `--mode demo` builds the copy published for people with no server to point
// at: the same site, answering its own requests from a fixture. It is served
// from a domain root, so it needs no `base` of its own.
export default defineConfig(({ mode }) => {
  const demo = mode === "demo";

  return {
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset()] }),
      tailwindcss(),
      demo && demoServer(),
    ],
    build: {
      outDir: demo ? "dist-demo" : "dist",
    },
    server: {
      proxy: {
        "/api": "http://localhost:3000",
      },
    },
  };
});
