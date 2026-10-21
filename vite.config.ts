import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: "/multimodal-behavior-analyzer/",
  build: { chunkSizeWarningLimit: 800 },
});
