import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` resolves to a throwing module outside Next's `react-server`
      // condition; stub it so server-only modules can be unit-tested under Node.
      "server-only": fileURLToPath(new URL("./vitest/server-only-stub.ts", import.meta.url)),
    },
  },
});
