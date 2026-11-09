# 项目结构与定位

这是一个 DSH 插件：host 半边注册 `/__sbx` 路由，client 半边在设置页注册一节面板。源码 TypeScript，`dist/` 是提交进仓库的构建产物。

## 文件树

```text
dsh-dev-sandbox/
├── .gitignore            # 忽略 node_modules 与本地环境文件，明确不放过 dist/
├── package.json          # main / exports / files，以及 dsh.bundle 与 dsh.client 声明
├── pnpm-lock.yaml        # 依赖锁，--frozen-lockfile 的判据
├── pnpm-workspace.yaml   # allowBuilds：决定 esbuild postinstall 是否执行
├── cordis.patch.yml      # 往 profile 里插入一个 host 行
├── build.mjs             # esbuild 三入口：host 出 ESM，client 出 ModuleLoader 可加载的 IIFE，样式出独立 CSS
├── tsconfig.json         # strict + noUncheckedIndexedAccess
├── icon.svg              # 插件图标
├── README.md             # 面向使用者：安装、面板、隔离边界、已知限制
├── AGENTS.md             # 本文件：结构索引与提交纪律
├── dist/
│   ├── index.js          # 构建产物，host 半侧
│   ├── client.js         # 构建产物，client 半侧
│   └── panel.css         # 构建产物，面板的外部样式表
└── src/
    ├── entries/          # 只做装配，不放逻辑
    │   ├── host.ts       # export apply(ctx)
    │   └── client.ts     # export const plugin = { inject, apply }
    ├── shared/           # 跨组件公共层，组件不得反向依赖
    │   ├── config.ts     # profile 名、默认 bundles、环境变量白名单、超时、日志正则
    │   ├── types.ts      # 账本记录、视图、输入输出形状
    │   ├── errors.ts     # SandboxError（带稳定 code）与 asMessage
    │   ├── paths.ts      # 沙箱根解析、越界校验、工作环境 home
    │   ├── process.ts    # 进程树终止、端口探测、环境白名单、spawnDsh、短命令执行
    │   ├── state.ts      # StateStore：串行队列 + 原子写
    │   ├── sessionLog.ts # 会话文件枚举、zstd 解压、事件摘要
    │   ├── http.ts       # sendJson / readJsonBody
    │   ├── routes.ts     # 路由前缀与样式表路径，host 与 client 共用
    │   └── api.ts        # 面板侧的 /__sbx 客户端
    └── components/
        ├── sandbox-manager/      # host 可注册组件
        │   ├── config.ts         # 实例目录名、profile 包名、启动参数、两套补丁
        │   ├── types.ts          # ManagerContext / HostContext / WebServerLike
        │   ├── profile.ts        # profile 清单、.env、凭据继承、官方包解析
        │   ├── boot.ts           # 起进程、解析地址、等就绪、失败自杀
        │   ├── lifecycle.ts      # create / stop / start / destroy
        │   ├── install.ts        # 把工作区插件 junction 进沙箱 profile
        │   ├── runProfile.ts     # headless 运行 profile：base + headless + 待测插件
        │   ├── prompt.ts         # 在沙箱里真跑一轮对话
        │   ├── status.ts         # 进程 / 会话 / 客户端图 / 日志错误
        │   ├── inspect.ts        # list / tail / log
        │   ├── reconfigure.ts    # dump-config 预检与回滚
        │   ├── assets.ts         # 读取构建产物 panel.css
        │   ├── routes.ts         # HTTP 路由表与入参校验
        │   ├── manager.ts        # 组装成 SandboxManager
        │   ├── tools.ts          # 交给模型的九个工具
        │   └── register.ts       # 注册工具与 /__sbx
        └── sandbox-panel/        # client 可注册组件
            ├── config.ts         # 槽位、组件排序、轮询间隔、全部中文文案 TEXTS
            ├── types.ts          # 面板本地类型
            ├── api.ts            # 动作绑定
            ├── hooks.ts          # useSandboxes
            ├── panel.css         # 全部样式，由 host 作为外部样式表提供
            ├── stylesheet.ts     # 注入 <link>，幂等
            ├── panel.ts          # 组合与动作编排
            ├── register.ts       # 双通道：better-sidebar 的 tab，否则 settings.section
            └── parts/
                ├── form.ts       # 新建表单
                ├── row.ts        # 实例行
                ├── detail.ts     # 沙箱详情：状态、客户端图、日志错误、最近对话
                └── events.ts     # 对话事件列表
```

## 按需求定位

| 想改什么 | 动哪里 |
| --- | --- |
| 面板文案、轮询间隔、显示上限 | `src/components/sandbox-panel/config.ts` |
| 面板视觉、布局、间距 | `src/components/sandbox-panel/panel.css` 与 `parts/` |
| 沙箱详情视图 | `src/components/sandbox-panel/parts/detail.ts` 与 `api.ts` 的 `fetchStatus` |
| 面板怎么取数据、怎么轮询 | `src/components/sandbox-panel/api.ts`、`hooks.ts` |
| 面板在设置页的位置 | `src/components/sandbox-panel/config.ts` 的 `PANEL_ORDER` |
| 面板入口（侧栏或设置页） | `src/components/sandbox-panel/register.ts` 的双通道 |
| 新增一个 JSON 接口 | `sandbox-manager/routes.ts` 的 dispatch 表加分支 |
| 新增一个静态资源路由 | `sandbox-manager/register.ts` 的 prefix handler 加分支，路径常量放 `shared/routes.ts` |
| 新增或修改给模型的工具 | `sandbox-manager/tools.ts`，逻辑落在对应组件文件 |
| 沙箱里怎么跑对话 | `sandbox-manager/prompt.ts` 与 `runProfile.ts`（headless 路线） |
| 创建、销毁的流程 | `src/components/sandbox-manager/lifecycle.ts` |
| 启动参数、端口策略 | `src/components/sandbox-manager/config.ts` 的 `BOOT_ARGS` |
| profile 里放什么、凭据怎么继承 | `src/components/sandbox-manager/profile.ts` |
| 改配置时的预检与回滚 | `src/components/sandbox-manager/reconfigure.ts` |
| 怎么读沙箱对话 | `src/shared/sessionLog.ts` |
| 子进程环境、进程树终止 | `src/shared/process.ts` 与 `src/shared/config.ts` 的 `KEEP_ENV` |
| 并发写账本 | `src/shared/state.ts` |
| 运行时依赖越界 | 先看 `build.mjs` 的 `external` 与 `packages`，再改 import |

## 阅读顺序

接手一次修改时的最短路径：

1. `package.json` 的三个字段：`main`、`exports`、`files`。
2. `src/entries/host.ts` 与 `src/entries/client.ts`，确认装配关系。
3. 按上表跳到具体文件。

改 client 图（`sandbox-panel/*.ts`、`shared/api.ts`、`entries/client.ts`、`build.mjs` 的 banner/footer）之后必须 bump `version` 并重装，宿主按版本缓存字节。只改 `panel.css` 不用 bump：`readStylesheet` 每次请求都读盘，`pnpm build` 之后刷新页面即可，不需要重启宿主。

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
- 「文件树」与 `git ls-files` 不一致。判定方法：先按第 1 步跑 `git add -N`，再跑 `git diff --name-status` 取 A/D/R 两侧的路径；`git ls-files` 仍含未暂存的删除项，对差前要扣掉 `git status` 里 ` D` 的路径。只改文件内容、不增删文件时不触发；根文件与 `src/` 同等对待。

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
- 构建产物有三个：`dist/index.js`（host 半侧）、`dist/client.js`（client 图）、`dist/panel.css`（外部样式表）。
- 改 client 图必须 bump `version`，宿主按版本缓存字节。只改 `panel.css` 不用 bump：`readStylesheet` 每次请求都读盘，`pnpm build` 之后刷新页面即可，不需要重启宿主。
- 构建 `pnpm build`，类型检查 `pnpm typecheck`。

## 平台

当前实现仅 Windows：进程树用 `taskkill /T`，官方包解析用 junction。改造成跨平台之前，不要在任何地方声称支持 macOS 或 Linux。
