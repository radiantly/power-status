import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// The API is served from the same origin in production (Caddy fronts both the
// static bundle and the Rust server), so the client always talks to /api.
// In dev, proxy that prefix to the Rust server on :3000.
export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
