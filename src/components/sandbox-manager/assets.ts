import fsp from "node:fs/promises";

/**
 * 构建时 esbuild 把样式写到与 index.js 同目录。
 * 这里的 "panel.css" 是**构建产物文件名**，不是路由名；改构建输出时要同步 build.mjs。
 */
const STYLESHEET_URL = new URL("./panel.css", import.meta.url);
let cached: string | undefined;

export async function readStylesheet(): Promise<string> {
  if (cached !== undefined) return cached;
  cached = await fsp.readFile(STYLESHEET_URL, "utf8");
  return cached;
}
