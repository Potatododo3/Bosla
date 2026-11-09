import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The student-search API is a separate Node process (server/serve.ts).
// In development Vite proxies /api to it; in production `npm start`
// serves the built app and the API from one process.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
  build: { target: "es2020", sourcemap: false },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
} as never);
