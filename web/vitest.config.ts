import { defineConfig, configDefaults } from "vitest/config";
import path from "path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  // e2e/ is Playwright's (run via test:e2e), not vitest - keep it out of the unit run.
  test: { environment: "node", exclude: [...configDefaults.exclude, "e2e/**"] },
});
