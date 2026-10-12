import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Minimal Vite config. The dev server proxies /api to the backend so the
// frontend can call the REST API without CORS fuss during development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: "http://localhost:8788",
        changeOrigin: true,
        configure: (proxy) => {
          // Tell the backend not to compress SSE responses — compression
          // buffers chunks and breaks real-time streaming through the proxy.
          proxy.on("proxyReq", (proxyReq, req) => {
            if (req.url?.includes("/generate/stream")) {
              proxyReq.setHeader("accept-encoding", "identity");
            }
          });
        },
      },
    },
  },
});
