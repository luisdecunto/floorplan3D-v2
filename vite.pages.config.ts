import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL("./pages", import.meta.url)),
  base: process.env.PAGES_BASE_PATH ?? "/floorplan3D/",
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  plugins: [react()],
  define: { __BUILD_ID__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim()) },
  build: {
    outDir: fileURLToPath(new URL("./pages-dist", import.meta.url)),
    emptyOutDir: true,
    sourcemap: true,
  },
  resolve: {
    alias: {
      "@": projectRoot,
    },
  },
});
