import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// In development /api is proxied to the local backend so the panel and API
// share an origin, exactly like Firebase Hosting's /api rewrite in production.
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Accept only a real URL for the dev proxy target (guards against a
  // mis-parsed .env line); default to the local backend.
  const rawTarget = String(env.VITE_DEV_API_TARGET || "").trim().replace(/^["']|["']$/g, "");
  const target = /^https?:\/\/[^\s"']+$/i.test(rawTarget) ? rawTarget : "http://localhost:5000";
  // Stop a production build that still points at the placeholder backend URL.
  if (command === "build" && /YOUR_PROJECT_ID/.test(env.VITE_API_BASE_URL || ""))
    throw new Error('Run "npm run configure -- YOUR_PROJECT_ID" (or set VITE_API_BASE_URL in .env.production) before building.');
  return {
    plugins: [react()],
    server: { port: 5174, strictPort: true, proxy: { "/api": { target, changeOrigin: true } } },
    preview: { port: 5174, strictPort: true, proxy: { "/api": { target, changeOrigin: true } } },
  };
});
