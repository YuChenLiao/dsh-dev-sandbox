/** sandbox-panel 组件自己的常量：轮询节奏、显示上限与全部可见文案。 */

export const SLOT_NAME = "settings.section";
export const PANEL_ID = "dev-sandbox";
export const PANEL_ORDER = 60;

export const POLL_INTERVAL_MS = 15_000;
export const TAIL_LIMIT = 24;

export const TEXTS = {
  navLabel: "沙箱",
  title: "沙箱",
  subtitle: "真实 DSH 实例，数据与插件都与当前环境隔离。工作环境可以读它们的对话，它们看不到这里的任何东西。",
  refresh: "刷新",
  create: "创建沙箱",
  creating: "处理中…",
  namePlaceholder: "名称（可选）",
  bundlesPlaceholder: "额外 bundle，逗号分隔（可选）",
  loading: "正在读取沙箱状态…",
  empty: "还没有沙箱。沙箱是一个完全独立的 DSH 实例：独立 home、独立 profile、独立端口，不带入当前对话，在里面装插件也不影响这里。",
  tail: "对话",
  collapse: "收起",
  open: "打开",
  stop: "停止",
  start: "启动",
  stopping: "正在停止…",
  starting: "正在启动…",
  confirmStop: "停止这个沙箱？进程会结束、端口会释放，home 与其中的对话都保留，之后可以再启动。",
  destroy: "销毁",
  confirmDestroy: "销毁这个沙箱？进程会结束，home 目录会删除，其中的对话与插件数据一起消失。停止只结束进程、保留数据；销毁会删掉一切。",
  noSessions: "这个沙箱还没有对话。在它自己的页面里发一条消息即可。",
  footnote: "首次启动要等宿主完成组合，通常十几秒。创建后会自动等它就绪再出现在列表里。",
  sessionsUnit: " 个会话",
  bundlesUnit: " 个 bundle",
  detail: "详情",
  back: "返回",
  live: "运行中",
  dead: "未运行",
  kvPort: "端口",
  kvPid: "进程",
  kvPolicy: "权限",
  kvSessions: "会话",
  kvBundles: "bundle",
  kvLive: "状态",
  clientGraph: "客户端图",
  recentEvents: "最近的对话",
  noClientGraph: "沙箱没有在监听，读不到客户端图。",
} as const;
