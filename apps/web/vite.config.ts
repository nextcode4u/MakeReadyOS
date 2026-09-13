import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export default defineConfig({
  define: {
    "import.meta.env.VITE_SW_VERSION": JSON.stringify(createHash("sha256").update(readFileSync(new URL("../../assets/sw.js", import.meta.url))).digest("hex").slice(0, 16)),
  },
  plugins: [react()],
  publicDir: "../../assets",
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }
          if (id.includes("@tanstack/react-query")) {
            return "query";
          }
          if (id.includes("react") || id.includes("react-dom")) {
            return "react";
          }
          return "vendor";
        },
      },
    },
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
