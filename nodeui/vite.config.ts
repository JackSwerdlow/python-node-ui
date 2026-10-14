import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In dev, /api goes to `python main.py serve`.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
});
