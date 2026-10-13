import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // e2e コンテナからはサービス名 frontend でアクセスする
    allowedHosts: ["frontend"],
    proxy: {
      "/api": process.env.BACKEND_URL ?? "http://localhost:8000",
    },
  },
});
