# 提交纪律

## 强制：提交前必须经子代理审查

任何人（包括自动化代理）在 `git commit` 之前，必须把本次改动交给一个独立的子代理审查。只有审查结论为 `PASS` 才允许提交；`FAIL` 时先修，再重新送审。审查者不能是本次改动的作者。

当前会话无法派生子代理时（例如代理深度耗尽），由父代理执行同样的审查。**父代理同时是作者时，独立性要求没有被满足**，结论必须标为 `review: self-review`，不得写成 `PASS`；需要真正的独立结论时，换一个会话或交给人工确认。

## 审查者要做什么

1. **拿到被审内容。** 新增文件在暂存前不出现在 `git diff` 里。先跑 `git add -N $(git ls-files --others --exclude-standard)`（intent-to-add，只动 index），再读 `git status` 与 `git diff` 全文；仍未覆盖的文件逐个读全文。`git add -N` 是审查者唯一允许改动仓库状态的操作，`git add`、`commit`、`push` 一律禁止。
2. **先记哈希。** 记下 `dist/client.js` 与 `dist/index.js` 的 sha256。构建会覆盖工作区产物，没有这一步就分不清「作者提交的产物」与「审查者重新构建的产物」。
3. **构建与类型检查。** 在仓库根跑 `pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm build`，确认零错误。无网络时安装可能失败，这属于环境问题，必须在结论里与代码失败区分开。
4. **逐项核对阻塞项。**
5. **输出结论。** 第一行 `PASS` 或 `FAIL`，随后逐条列问题，带文件与行号；`FAIL` 必须说明为什么阻塞。

## 审查范围

审查对象是这次提交的内容，以 `git diff --cached --name-only` 或 `-N` 之后的 `git diff` 为准。仓库之外的改动无法从仓库取证，不作为审查依据，也不能因为有它存在就判 `PASS`。

## 阻塞项（任一命中即 FAIL）

- `pnpm install --frozen-lockfile`、`pnpm typecheck` 或 `pnpm build` 失败（环境问题除外，须注明）。
- 提交里 `src/` 有改动，但 `dist/` 的字节与重新构建的结果不一致。
- `dist/client.js` 字节变化，却没有 bump `package.json` 的 `version`。判据看产物，不看改了哪个源文件：`build.mjs` 的 banner/footer、`src/entries/client.ts`、以及任何被 client 图引用的模块，都会改产物字节。
- `dist/` 出现在 `.gitignore` 里，或 `git status` 把它判为忽略。
- 提交内容里出现凭据、token、真实的本机绝对路径，或 `.env` 变体（`.env.example` 除外）。文档举例一律用占位符（例如 `<repo>`、`%USERPROFILE%\.dsh`），本文件也受这条约束。
- `package.json` 的 `files` 与实际要发布的文件不一致，例如列了不存在的目录。
- 运行时依赖越界。host 图（`build.mjs` 里的 `packages: "external"`）只允许 `node:` 内置模块；client 图只允许 `react` 与仓库内模块，其余第三方包会被 bundle 进 `dist/client.js`。判据是 diff 里的裸 import，不是构建是否通过。
- 改了 `package.json` 的任何依赖字段（`dependencies`、`devDependencies`、`peerDependencies`、`pnpm.overrides`）却没有同步 `pnpm-lock.yaml`。判据就是第 3 步的 `--frozen-lockfile`。
- README 与实际行为不一致。只核这三项，逐条对代码：安装命令里的仓库地址、`/__sbx` 接口路径与方法、两个环境变量名。

## 不阻塞但要在结论里提示

- 本次改动触及面板视觉（`src/components/sandbox-panel/`）时，说明视觉有没有经过肉眼验证。有截图就附上；没有就写明只到槽位与接口层面，并列出待确认项：设置页出现「沙箱」一节、空态文案、创建后卡片出现、展开对话、销毁后卡片消失。
- `git diff` 里出现整文件重写且差异只有换行时提示：仓库没有 `.gitattributes`，跨平台提交会造成换行漂移。

## 提交信息

- 一个提交只做一件事。
- 前缀用 `feat:` / `fix:` / `docs:` / `chore:` / `refactor:`。
- 已经推送的提交不 amend。
- 写审查结论与被审 tree：

```text
feat: <摘要> (review: PASS, tree: <git write-tree 的前 12 位>)
```

tree 的取法：在真正 `git add <文件>` 之后、`git commit` 之前跑 `git write-tree`。`-N`（intent-to-add）状态与 `git commit -a` 下取到的都是**父提交的 tree**，命令照样 exit 0 且无警告，会让记录无法复算。

## 版本与产物

- `dist/` 提交进仓库：GitHub 安装时按 `files` 从仓库取这些文件，漏提交或忘记 build 会装出坏包。
- 改客户端产物必须 bump `version`，宿主按版本缓存字节，不 bump 会继续供旧产物。
- 构建 `pnpm build`，类型检查 `pnpm typecheck`。

## 平台

当前实现仅 Windows：进程树用 `taskkill /T`，官方包解析用 junction。改造成跨平台之前，不要在任何地方声称支持 macOS 或 Linux。
