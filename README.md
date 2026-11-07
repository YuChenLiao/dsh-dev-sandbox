# dsh-dev-sandbox

在 DeepSeek Harness 里管理隔离的开发沙箱：为待测插件起一个真实、干净、互不干扰的 DSH 实例，并在侧栏（或设置页）直接创建、查看、停止和销毁它。

## 它解决什么

开发 DSH 插件时，真机验证通常只能把插件装进正在使用的 profile：它和工作会话、工作数据、工作配置混在一起，装坏了还要回滚。这个插件把真机验证搬进独立实例。每个沙箱有自己的 `DSH_HOME`、profile、端口和会话，装插件、改配置、崩溃都只影响它自己。

模型侧也可以通过同源 HTTP 接口驱动同一套动作（见「接口」），面板只是其中一种使用方式。

## 安装

```sh
dsh plugin --profile <profile> add github:YuChenLiao/dsh-dev-sandbox
```

`<profile>` 换成在用的 profile，例如 `desktop` 或 `web`。仓库里提交了 `dist/`，安装后不需要再构建，也不需要 git 之外的构建工具。

重启 `dsh` 后打开面板：装了 `dsh-better-sidebar` 就在侧栏找「沙箱」，否则在 设置 → 沙箱。卸载：

```sh
dsh plugin --profile <profile> remove dsh-dev-sandbox
```

## 面板能做什么

- **创建**：给一个名字，必要时填额外 bundle（逗号分隔）。端口不填，交给系统分配，避免和工作环境的端口撞车。
- **观察**：状态点（运行中呼吸、已停止静止）、端口、会话数、bundle 数、存在时长，15 秒自动刷新一次。
- **对话**：展开看最近 24 条事件，只读，来自沙箱自己的会话落盘文件。
- **打开**：带 token 打开沙箱自己的页面。
- **详情**：单个实例的运行期事实——进程、端口、权限档位、会话数、客户端图、启动日志里的错误。
- **停止 / 启动**：停止只结束进程、释放端口，home、profile 与对话全部保留；启动用同一份目录重新起进程，端口可能变。列表里停止的实例按钮会变成「启动」。
- **销毁**：结束整棵进程树、等端口释放、删除 home 目录。和停止的区别是它会删掉数据。

创建是同步等就绪的：宿主完成组合、监听起来之后才出现在列表里，通常十几秒。

## 隔离边界

真正做到的：

- 独立的 `DSH_HOME`、profile、workspace、端口和 token。
- 子进程环境只保留系统变量，所有 `DSH_*` 丢弃后显式重设，不会继承 `DSH_SESSION_ID`、`DSH_WEB_URL`、`DSH_PROFILE` 这类会误导插件的变量。
- 新实例里没有会话、没有设置、没有记忆、没有任何插件数据，profile 层只有一份空补丁。
- 模型凭据继承工作环境：创建时复制 `.credentials.yaml`，但剥掉 GUI 会话记录，沙箱启动时自己生成新的 browser-session。沙箱因此能直接调模型，而两边的浏览器登录态互不相通。凭据是创建那一刻的快照，工作环境刷新 token 后重建沙箱即可。
- 那份凭据是**同权限的明文副本**：它一直躺在沙箱 home 里直到实例被销毁，沙箱内任何进程都能读它。读不到源文件或格式变化时整份不继承，沙箱的 `boot.log` 里能 grep 到 `credentials: skipped`；写不进沙箱 home 时创建直接失败，不会留一个半配置的实例。
- 浏览器侧互不串：cookie 名与签名 audience 绑定 hostname 和端口，工作页面的登录态不会被带过去。

没做到的：

- **文件系统不隔离。** 同机同权限下，沙箱里的进程仍然能读工作环境的 `~/.dsh`。要挡住这一层需要 ACL 或容器，不在本插件范围内。
- **模型费用与网络不隔离。** 沙箱调模型花的是同一份额度。

## 工作原理

host 半边注册一条 `/__sbx` prefix 路由，client 半边在 `dsh-better-sidebar` 存在时注册一个侧栏 tab，并始终在 `settings.section` 注册一节作为兜底（侧栏没装或被关掉时仍进得去）。两面都只做装配，逻辑在组件目录里。两侧的服务依赖都走 `ctx.inject`：`ctx.get` 在服务未就绪时返回 `undefined`，会让路由或侧栏 tab 静默不注册。

创建一个实例的流程：

1. 在沙箱根下建实例目录、`home`、`workspace`、`agents`。
2. 写 profile 清单（只有 `dsh.profile.bundles`）和一份空补丁层。
3. 借用工作环境的官方包解析，让 `@deepseek-ai/*` 能被找到。
4. 以沙箱自己的环境启动 `dsh --profile sbx --port 0 --no-open`。
5. 从启动输出解析宿主报告的地址与 token。
6. 探活通过后写入账本 `state.json`。

销毁时用 `taskkill /T` 结束整棵进程树，轮询等端口释放，先把目录改名再删除——Windows 上直接删被占用的文件会失败。

账本读写走一条串行队列，两个并发创建不会互相覆盖记录。

## 接口

面板用的就是这组同源接口，路径前缀 `/__sbx`：

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/list` | 列出实例与状态 |
| `POST` | `/create` | `{ name?, bundles?, apiKey? }` |
| `POST` | `/stop` | `{ id }`，停进程、留数据 |
| `POST` | `/start` | `{ id }`，用已有目录重启，返回新端口与 token |
| `POST` | `/destroy` | `{ id }` |
| `POST` | `/config` | `{ id, bundles?, restart? }`，先过 `--dump-config` 预检，失败自动回滚 |
| `GET` | `/tail?id=&limit=` | 读沙箱对话 |
| `GET` | `/log?id=&lines=` | 读启动日志 |

`/config` 已实现但没有面板入口，改 bundles 目前走接口或直接编辑沙箱 profile。

## 给模型的工具

装上之后，工作会话里的模型可以直接操作沙箱，不必你手动点面板：

| 工具 | 作用 |
| --- | --- |
| `sandbox_create` | 建实例，返回端口、token 与就绪状态 |
| `sandbox_install` | 把工作区的插件 junction 进沙箱 profile |
| `sandbox_prompt` | 在沙箱里真跑一轮对话，返回回复与调用过的工具名 |
| `sandbox_status` | 进程、端口、会话数、客户端图、启动日志里的错误 |
| `sandbox_stop` | 停进程、释放端口，保留 home 与对话 |
| `sandbox_start` | 用已有目录重启，返回新端口与 token |
| `sandbox_destroy` | 销毁 |

入参只有实例 id 与包名或文本，没有路径、没有命令、没有环境变量。会话工作区、沙箱 policy、凭据位置都由插件内部决定，模型无从指定。

`sandbox_prompt` 走的是 headless profile（base + headless + 待测插件），不是 web 实例的 session API：旧版 dsh 的 `session/prompt` 只把消息入队、不驱动 turn，headless 才能稳定跑完一轮并把答案打到 stdout。因此它验证的是 **agent 侧行为**（工具、hook、persona），界面部分仍要在面板或沙箱页面里看。

每次 `sandbox_prompt` 花的是继承来的那份额度，一轮就是一次真实调用。

## 配置

两个环境变量，都要在启动 `dsh` 之前设进去：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `DSH_SANDBOX_ROOT` | `~/.dsh-dev-sandbox/instances` | 实例根目录，账本与所有实例都在它下面 |
| `DSH_SANDBOX_DSH_BIN` | 空，沿 `PATH` 找 `node_modules/@deepseek-ai/dsh/lib/bin.js` | 指定 `bin.js` 的绝对路径。PATH 上那份通常与桌面宿主不是同一个安装，测出来的结论不可移植，这时必须显式指定；都找不到时报 `dsh-bin-missing`，不会退回 shell |
| `DSH_SANDBOX_DSH_NODE` | 空，沿 `PATH` 找 `node` | 指定解释 bin.js 的 node；找不到时创建报 `node-missing`，不会退回 Electron 内置的 node |

桌面版的 `dsh` 在 `app.asar` 里，与 PATH 上的那份是两个安装。两者不一致时插件测出来的结论不可移植，这时把 `DSH_SANDBOX_DSH_BIN` 指向与宿主同版本的 `bin.js`。沙箱永远以 `node bin.js` 的形式启动，文本参数只作为 argv 传递，不经过任何 shell；选中的 node 与 dsh 路径写在每个实例的 `boot.log` 第一行。

## 目录结构

`src/` 分三层：`entries/` 只做装配，`shared/` 放跨组件逻辑，`components/` 下每个可注册组件一个目录，组件内再按 `config`、`types`、逻辑、`parts` 拆开。

```text
src/
  entries/              host.ts / client.ts，只装配
  shared/               配置、类型、错误、路径、进程、账本、会话日志、HTTP、面板客户端
  components/
    sandbox-manager/    host 可注册组件：控制面与 /__sbx 路由
    sandbox-panel/      client 可注册组件：设置页面板
```

完整文件树、每个文件的职责、以及「改某类需求该动哪个文件」的索引见 [AGENTS.md](AGENTS.md)。

## 开发

```sh
pnpm install
pnpm build      # esbuild：host 打 ESM，client 打 ModuleLoader 可加载的 IIFE，样式打成独立 CSS
pnpm typecheck  # tsc --noEmit，strict + noUncheckedIndexedAccess
```

几条约定：

- 组件自己的常量放各自 `config.ts`，跨组件的才进 `src/shared`。
- `src/entries` 只做装配，不放逻辑。
- 运行时只 import `node:` 内置模块；`react` 由 ModuleLoader 注入，是 external。
- 改客户端代码后必须 bump `version` 并重装：宿主按版本缓存字节，不 bump 会继续供旧产物。
- `dist/` 提交进仓库。GitHub 安装读的就是它；漏提交或忘了 build，装出来是坏的，而且要到运行时才发现。

## 已知限制

- **目前仅 Windows。** 进程树用 `taskkill /T`，官方包解析用 junction，macOS 与 Linux 上未适配。
- `/__sbx` 不做额外鉴权，只应绑 loopback。如果用反向代理把 GUI 暴露出去，这组接口会跟着暴露。
- 面板文案没有接 Client locale 服务，集中在 `src/components/sandbox-panel/config.ts` 的 `TEXTS` 里。
- 只支持创建、观察、销毁；把验证过的插件提升进工作 profile 的流程还没有。

## License

MIT，与 `package.json` 一致。
