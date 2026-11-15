import type { NextConfig } from "next";
import { createHash } from "node:crypto";
import { mkdirSync, statfsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const onMountedNtfs =
  process.platform === "linux" &&
  [0x7366746e, 0x5346544e].includes(statfsSync(process.cwd()).type);
const config: NextConfig = {
  poweredByHeader: false,
  webpack(webpackConfig, { dev }) {
    if (
      dev &&
      onMountedNtfs &&
      webpackConfig.cache &&
      typeof webpackConfig.cache === "object"
    ) {
      const project = createHash("sha256")
        .update(process.cwd())
        .digest("hex")
        .slice(0, 16);
      const cacheDirectory = join(
        tmpdir(),
        `mobile-store-webpack-${process.getuid?.() ?? "local"}-${project}`,
      );
      mkdirSync(cacheDirectory, { recursive: true, mode: 0o700 });
      webpackConfig.cache = {
        ...webpackConfig.cache,
        cacheDirectory,
        compression: false,
      };
    }
    return webpackConfig;
  },
};
export default config;
