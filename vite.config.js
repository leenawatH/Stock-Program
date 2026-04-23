import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,       // ← เปิดให้เครื่องอื่นใน LAN เข้าถึงได้
    port: 5173,
    open: true,
    proxy: {
      "/api/yahoo": {
        target: "https://query1.finance.yahoo.com",
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/api\/yahoo/, ""),
        headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
      },
      "/api/finnhub": {
        target: "https://finnhub.io",
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/api\/finnhub/, ""),
      },
      "/api/anthropic": {
        target: "https://api.anthropic.com",
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/api\/anthropic/, ""),
      },
      "/api/fx": {
        target: "https://api.frankfurter.app",
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/api\/fx/, ""),
      },
    },
  },
});
