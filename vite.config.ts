import vue from "@vitejs/plugin-vue";
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const host = process.env.TAURI_DEV_HOST;
const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as {
  version: string;
  weatherPoem?: { releaseChannel?: string };
};
const releaseChannel = packageJson.weatherPoem?.releaseChannel;

if (!["trial", "production"].includes(releaseChannel ?? "")) {
  throw new Error(
    "package.json weatherPoem.releaseChannel 必须是 trial 或 production",
  );
}

export default defineConfig({
  base: "./",
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __RELEASE_CHANNEL__: JSON.stringify(releaseChannel),
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || "127.0.0.1",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
