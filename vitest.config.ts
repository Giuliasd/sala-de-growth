import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Sem globals: usar imports explícitos (describe/it/expect de "vitest")
    globals: false,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  // Pasta isolada pra cache do vitest não poluir o build do Next
  cacheDir: "node_modules/.vitest",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
