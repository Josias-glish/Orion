import { defineConfig } from "vitest/config";

// Pruebas automáticas: dominio y repositorios con SQLite en memoria (node:sqlite).
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "node",
  },
});
