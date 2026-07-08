import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    target: "node20",
    platform: "node",
    external: ["libxmljs2", "node-forge", "qrcode"],
  },
  {
    entry: {
      "cli/index": "src/cli/index.ts",
    },
    format: ["esm", "cjs"],
    dts: false,
    sourcemap: true,
    clean: false,
    treeshake: true,
    target: "node20",
    platform: "node",
    external: ["libxmljs2", "node-forge", "qrcode"],
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
