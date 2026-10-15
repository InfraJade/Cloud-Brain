import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "");
  const port = Number(env.PORT || 3000);
  // The CLOUD BRAIN backend (FastAPI proxy). Every /api call goes through it.
  const apiTarget = env.VITE_API_PROXY_TARGET || "http://localhost:8080";

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { "@": path.resolve(import.meta.dirname, "src") },
    },
    server: {
      port,
      strictPort: true,
      host: "0.0.0.0",
      proxy: { "/api": { target: apiTarget, changeOrigin: true } },
    },
    preview: {
      port,
      host: "0.0.0.0",
      proxy: { "/api": { target: apiTarget, changeOrigin: true } },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom", "react-router-dom", "@tanstack/react-query"],
            markdown: ["react-markdown", "remark-gfm"],
            ui: [
              "@radix-ui/react-alert-dialog",
              "@radix-ui/react-dialog",
              "@radix-ui/react-dropdown-menu",
              "@radix-ui/react-select",
              "lucide-react",
              "sonner",
            ],
          },
        },
      },
    },
  };
});
