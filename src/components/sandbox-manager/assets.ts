import fsp from "node:fs/promises";

/**
 * 构建时 esbuild 把样式写到与 index.js 同目录。
 * 这里的 "panel.css" 是**构建产物文件名**，不是路由名；改构建输出时要同步 build.mjs。
 *
 * 不缓存：缓存会让改样式必须重启宿主才生效，而文件只有几 KB，每次读的代价可以忽略。
 */
const STYLESHEET_URL = new URL("./panel.css", import.meta.url);

export function readStylesheet(): Promise<string> {
  return fsp.readFile(STYLESHEET_URL, "utf8");
}
