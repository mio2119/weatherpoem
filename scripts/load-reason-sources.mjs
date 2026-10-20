import { build } from "vite";

export async function loadBundledModule(projectRoot, entry) {
  // The middleware SSR module runner can time out on Windows while resolving
  // ordinary source imports. A write-free SSR bundle avoids that transport.
  const result = await build({
    root: projectRoot,
    configFile: false,
    logLevel: "silent",
    ssr: { noExternal: true },
    build: { ssr: entry, write: false },
  });
  const output = Array.isArray(result)
    ? result.flatMap((item) => item.output)
    : result.output;
  const chunk = output.find((item) => item.type === "chunk" && item.isEntry);
  if (!chunk) throw new Error(`无法载入源模块：${entry}`);
  const encoded = Buffer.from(chunk.code).toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

export async function loadReasonSources(projectRoot) {
  const { POEMS } = await loadBundledModule(projectRoot, "src/data/poems.ts");
  const { CONTENT_VERSION, RULE_VERSION } = await loadBundledModule(
    projectRoot,
    "src/core/recommendation.ts",
  );
  return { POEMS, CONTENT_VERSION, RULE_VERSION };
}
