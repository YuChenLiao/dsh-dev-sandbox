// 构建：host 半边打成 ESM，client 半边打成 ModuleLoader 可加载的 IIFE。
// client 里的 react 保持 external，运行期由 ModuleLoader 注入的 require 提供。
import { build } from "esbuild";

const shared = {
  bundle: true,
  sourcemap: false,
  target: "es2022",
  logLevel: "info",
  minify: false,
};

await build({
  ...shared,
  entryPoints: ["src/entries/host.ts"],
  outfile: "dist/index.js",
  platform: "node",
  format: "esm",
  packages: "external",
});

await build({
  ...shared,
  entryPoints: ["src/entries/client.ts"],
  outfile: "dist/client.js",
  platform: "node",
  format: "iife",
  globalName: "__DSH_DEV_SANDBOX__",
  external: ["react"],
  banner: {
    js: 'window.__ModuleLoader__.load({ id: "dsh-dev-sandbox", factory(require) {',
  },
  footer: {
    js: 'return __DSH_DEV_SANDBOX__.plugin; } });',
  },
});
