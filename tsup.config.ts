import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      "documents/fa3": "src/documents/fa3/index.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    target: "node20",
    platform: "node",
    external: ["node-forge", "qrcode", "libxmljs2"],
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
    external: ["node-forge", "qrcode", "libxmljs2"],
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
