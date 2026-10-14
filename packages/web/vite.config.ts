import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset URLs: the app is served under Home Assistant's per-session
  // ingress path, which isn't known at build time.
  base: "./",
  build: { outDir: "dist", emptyOutDir: true, target: "es2022" },
  server: {
    // `npm run dev` here plus the mock server gives a full local app.
    proxy: { "/api": "http://localhost:8099" },
  },
});
