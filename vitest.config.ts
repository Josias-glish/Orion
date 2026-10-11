import { defineConfig } from "vitest/config";

// Pruebas automáticas: dominio y repositorios con SQLite en memoria (node:sqlite).
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts", "servidor/**/*.test.ts"],
    environment: "node",
    // Las máquinas de GitHub Actions varían en velocidad; el hash del PIN es lento a propósito.
    testTimeout: 30_000,
    // La carga de los 500 animales de CA-09 tarda unos segundos (más en Windows).
    hookTimeout: 60_000,
  },
});
