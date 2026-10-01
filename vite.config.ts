import process from "node:process";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;

// Configuración de Vite pensada para Tauri: https://v2.tauri.app/start/frontend/vite/
export default defineConfig(() => ({
  plugins: [react()],

  // 1. Que Vite no tape los errores de Rust en la terminal.
  clearScreen: false,
  // 2. Tauri espera un puerto fijo; si está ocupado, mejor fallar.
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. Vite no vigila src-tauri (eso lo hace Tauri).
      ignored: ["**/src-tauri/**"],
    },
  },
}));
