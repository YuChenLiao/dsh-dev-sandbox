window.__ModuleLoader__.load({ id: "dsh-dev-sandbox", factory(require) {
"use strict";
var __DSH_DEV_SANDBOX__ = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/entries/client.ts
  var client_exports = {};
  __export(client_exports, {
    plugin: () => plugin
  });

  // src/components/sandbox-panel/config.ts
  var SLOT_NAME = "settings.section";
  var PANEL_ID = "dev-sandbox";
  var PANEL_ORDER = 60;
  var POLL_INTERVAL_MS = 15e3;
  var TAIL_LIMIT = 24;
  var TEXTS = {
    navLabel: "\u6C99\u7BB1",
    title: "\u6C99\u7BB1",
    subtitle: "\u771F\u5B9E DSH \u5B9E\u4F8B\uFF0C\u6570\u636E\u4E0E\u63D2\u4EF6\u90FD\u4E0E\u5F53\u524D\u73AF\u5883\u9694\u79BB\u3002\u5DE5\u4F5C\u73AF\u5883\u53EF\u4EE5\u8BFB\u5B83\u4EEC\u7684\u5BF9\u8BDD\uFF0C\u5B83\u4EEC\u770B\u4E0D\u5230\u8FD9\u91CC\u7684\u4EFB\u4F55\u4E1C\u897F\u3002",
    refresh: "\u5237\u65B0",
    create: "\u521B\u5EFA\u6C99\u7BB1",
    creating: "\u5904\u7406\u4E2D\u2026",
    namePlaceholder: "\u540D\u79F0\uFF08\u53EF\u9009\uFF09",
    bundlesPlaceholder: "\u989D\u5916 bundle\uFF0C\u9017\u53F7\u5206\u9694\uFF08\u53EF\u9009\uFF09",
    loading: "\u6B63\u5728\u8BFB\u53D6\u6C99\u7BB1\u72B6\u6001\u2026",
    empty: "\u8FD8\u6CA1\u6709\u6C99\u7BB1\u3002\u6C99\u7BB1\u662F\u4E00\u4E2A\u5B8C\u5168\u72EC\u7ACB\u7684 DSH \u5B9E\u4F8B\uFF1A\u72EC\u7ACB home\u3001\u72EC\u7ACB profile\u3001\u72EC\u7ACB\u7AEF\u53E3\uFF0C\u4E0D\u5E26\u5165\u5F53\u524D\u5BF9\u8BDD\uFF0C\u5728\u91CC\u9762\u88C5\u63D2\u4EF6\u4E5F\u4E0D\u5F71\u54CD\u8FD9\u91CC\u3002",
    tail: "\u5BF9\u8BDD",
    collapse: "\u6536\u8D77",
    open: "\u6253\u5F00",
    destroy: "\u9500\u6BC1",
    confirmDestroy: "\u9500\u6BC1\u8FD9\u4E2A\u6C99\u7BB1\uFF1F\u8FDB\u7A0B\u4F1A\u7ED3\u675F\uFF0Chome \u76EE\u5F55\u4F1A\u5220\u9664\uFF0C\u5176\u4E2D\u7684\u5BF9\u8BDD\u4E0E\u63D2\u4EF6\u6570\u636E\u4E00\u8D77\u6D88\u5931\u3002",
    noSessions: "\u8FD9\u4E2A\u6C99\u7BB1\u8FD8\u6CA1\u6709\u5BF9\u8BDD\u3002\u5728\u5B83\u81EA\u5DF1\u7684\u9875\u9762\u91CC\u53D1\u4E00\u6761\u6D88\u606F\u5373\u53EF\u3002",
    footnote: "\u9996\u6B21\u542F\u52A8\u8981\u7B49\u5BBF\u4E3B\u5B8C\u6210\u7EC4\u5408\uFF0C\u901A\u5E38\u5341\u51E0\u79D2\u3002\u521B\u5EFA\u540E\u4F1A\u81EA\u52A8\u7B49\u5B83\u5C31\u7EEA\u518D\u51FA\u73B0\u5728\u5217\u8868\u91CC\u3002",
    sessionsUnit: " \u4E2A\u4F1A\u8BDD",
    bundlesUnit: " \u4E2A bundle",
    detail: "\u8BE6\u60C5",
    back: "\u8FD4\u56DE",
    live: "\u8FD0\u884C\u4E2D",
    dead: "\u672A\u8FD0\u884C",
    kvPort: "\u7AEF\u53E3",
    kvPid: "\u8FDB\u7A0B",
    kvPolicy: "\u6743\u9650",
    kvSessions: "\u4F1A\u8BDD",
    kvBundles: "bundle",
    kvLive: "\u72B6\u6001",
    clientGraph: "\u5BA2\u6237\u7AEF\u56FE",
    recentEvents: "\u6700\u8FD1\u7684\u5BF9\u8BDD",
    noClientGraph: "\u6C99\u7BB1\u6CA1\u6709\u5728\u76D1\u542C\uFF0C\u8BFB\u4E0D\u5230\u5BA2\u6237\u7AEF\u56FE\u3002"
  };

  // src/components/sandbox-panel/panel.ts
  var import_react6 = __require("react");

  // src/shared/routes.ts
  var ROUTE_PREFIX = "/__sbx";
  var STYLESHEET_ROUTE = "panel.css";
  var PREFIX_PATTERN = new RegExp(`^${ROUTE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:/|$)`);
  function routeUrl(path) {
    return `${ROUTE_PREFIX}/${path.replace(/^\/+/, "")}`;
  }
  function stylesheetHref() {
    return routeUrl(STYLESHEET_ROUTE);
  }

  // src/shared/api.ts
  async function request(path, init) {
    const response = await fetch(routeUrl(path), {
      credentials: "same-origin",
      headers: init?.body ? { "content-type": "application/json" } : void 0,
      ...init
    });
    const payload = await response.json().catch(() => ({ ok: false, error: "\u54CD\u5E94\u4E0D\u662F JSON" }));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error ?? `\u8BF7\u6C42\u5931\u8D25\uFF08${response.status}\uFF09`);
    }
    return payload;
  }
  function apiGet(path) {
    return request(path);
  }
  function apiPost(path, body) {
    return request(path, { method: "POST", body: JSON.stringify(body) });
  }

  // src/components/sandbox-panel/api.ts
  var fetchList = () => apiGet("list");
  var createSandbox = (input) => apiPost("create", input);
  var destroySandbox = (id) => apiPost("destroy", { id });
  var fetchTail = (id, limit) => apiGet(`tail?id=${encodeURIComponent(id)}&limit=${limit}`);
  var fetchStatus = (id) => apiGet(`status?id=${encodeURIComponent(id)}`);

  // src/components/sandbox-panel/hooks.ts
  var import_react = __require("react");
  function useSandboxes() {
    const [items, setItems] = (0, import_react.useState)(null);
    const [error, setError] = (0, import_react.useState)("");
    const reload = (0, import_react.useCallback)(async () => {
      try {
        const data = await fetchList();
        setItems(data.sandboxes);
        setError("");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    }, []);
    (0, import_react.useEffect)(() => {
      void reload();
      const timer = setInterval(() => void reload(), POLL_INTERVAL_MS);
      return () => clearInterval(timer);
    }, [reload]);
    return { items, error, setError, reload };
  }

  // src/components/sandbox-panel/parts/form.ts
  var import_react2 = __require("react");
  function CreateForm({ busy, onCreate }) {
    const [name, setName] = (0, import_react2.useState)("");
    const [bundles, setBundles] = (0, import_react2.useState)("");
    const submit = () => {
      const list = bundles.split(",").map((item) => item.trim()).filter(Boolean);
      onCreate({ name: name.trim() || void 0, bundles: list.length ? list : void 0 });
      setName("");
      setBundles("");
    };
    return (0, import_react2.createElement)(
      "div",
      { className: "sbx-form" },
      (0, import_react2.createElement)("input", {
        className: "sbx-input",
        placeholder: TEXTS.namePlaceholder,
        value: name,
        onChange: (event) => setName(event.target.value)
      }),
      (0, import_react2.createElement)("input", {
        className: "sbx-input",
        placeholder: TEXTS.bundlesPlaceholder,
        value: bundles,
        onChange: (event) => setBundles(event.target.value)
      }),
      (0, import_react2.createElement)("button", {
        className: "sbx-btn sbx-btn-primary",
        type: "button",
        onClick: submit,
        disabled: busy
      }, busy ? TEXTS.creating : TEXTS.create)
    );
  }

  // src/components/sandbox-panel/parts/detail.ts
  var import_react4 = __require("react");

  // src/components/sandbox-panel/parts/events.ts
  var import_react3 = __require("react");
  function EventList({ events }) {
    if (!events || events.length === 0) {
      return (0, import_react3.createElement)("div", { className: "sbx-mono" }, TEXTS.noSessions);
    }
    return (0, import_react3.createElement)("div", null, events.map((event, index) => (0, import_react3.createElement)(
      "div",
      { key: index, className: "sbx-ev" },
      (0, import_react3.createElement)("span", { className: "sbx-ev-type" }, event.type),
      (0, import_react3.createElement)("span", { className: "sbx-ev-text" }, event.text)
    )));
  }

  // src/components/sandbox-panel/parts/detail.ts
  var row = (label, value) => (0, import_react4.createElement)(
    "div",
    { className: "sbx-kv", key: label },
    (0, import_react4.createElement)("span", { className: "sbx-kv-key" }, label),
    (0, import_react4.createElement)("span", { className: "sbx-kv-val" }, value)
  );
  function SandboxDetail(props) {
    const { sandbox } = props;
    const [status, setStatus] = (0, import_react4.useState)(null);
    const [events, setEvents] = (0, import_react4.useState)(null);
    const [error, setError] = (0, import_react4.useState)(null);
    const load = (0, import_react4.useCallback)(async () => {
      setError(null);
      try {
        const [next, tail] = await Promise.all([
          fetchStatus(sandbox.id),
          fetchTail(sandbox.id, TAIL_LIMIT)
        ]);
        setStatus(next);
        setEvents(tail.events);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    }, [sandbox.id]);
    (0, import_react4.useEffect)(() => {
      void load();
    }, [load]);
    const live = Boolean(status?.alive && status.listening);
    const body = () => {
      if (error) return (0, import_react4.createElement)("div", { className: "sbx-err" }, error);
      if (!status) return (0, import_react4.createElement)("div", { className: "sbx-empty" }, TEXTS.loading);
      return (0, import_react4.createElement)(
        "div",
        { className: "sbx-detail-body" },
        (0, import_react4.createElement)(
          "div",
          { className: "sbx-kvs" },
          row(TEXTS.kvLive, live ? TEXTS.live : TEXTS.dead),
          row(TEXTS.kvPort, `:${status.port}`),
          row(TEXTS.kvPid, String(status.pid)),
          row(TEXTS.kvPolicy, status.policy),
          row(TEXTS.kvSessions, String(status.sessions)),
          row(TEXTS.kvBundles, status.bundles.join(" \xB7 ") || "\u2014")
        ),
        (0, import_react4.createElement)("div", { className: "sbx-sub-title" }, TEXTS.clientGraph),
        status.clientEntries.length > 0 ? (0, import_react4.createElement)("div", { className: "sbx-chips" }, ...status.clientEntries.map((entry) => (0, import_react4.createElement)("span", { className: "sbx-chip", key: entry }, entry))) : (0, import_react4.createElement)("div", { className: "sbx-empty" }, TEXTS.noClientGraph),
        status.errors.length > 0 ? (0, import_react4.createElement)("div", { className: "sbx-err" }, ...status.errors.map((line) => (0, import_react4.createElement)("div", { key: line }, line))) : null,
        (0, import_react4.createElement)("div", { className: "sbx-sub-title" }, TEXTS.recentEvents),
        (0, import_react4.createElement)(EventList, { events: events ?? void 0 })
      );
    };
    return (0, import_react4.createElement)(
      "div",
      { className: "sbx-root sbx-detail" },
      (0, import_react4.createElement)(
        "div",
        { className: "sbx-head" },
        (0, import_react4.createElement)("button", { className: "sbx-btn", type: "button", onClick: props.onBack }, TEXTS.back),
        (0, import_react4.createElement)(
          "div",
          { className: "sbx-grow" },
          (0, import_react4.createElement)("div", { className: "sbx-title" }, sandbox.name),
          (0, import_react4.createElement)("div", { className: "sbx-sub" }, sandbox.id)
        ),
        (0, import_react4.createElement)("button", { className: "sbx-btn", type: "button", disabled: !live, onClick: props.onOpen }, TEXTS.open),
        (0, import_react4.createElement)(
          "button",
          { className: "sbx-btn", type: "button", disabled: props.busy, onClick: () => void load() },
          TEXTS.refresh
        ),
        (0, import_react4.createElement)(
          "button",
          { className: "sbx-btn sbx-btn-danger", type: "button", disabled: props.busy, onClick: props.onDestroy },
          TEXTS.destroy
        )
      ),
      body()
    );
  }

  // src/components/sandbox-panel/parts/row.ts
  var import_react5 = __require("react");
  var ago = (at) => {
    if (!at) return "";
    const seconds = Math.max(0, Math.round((Date.now() - at) / 1e3));
    if (seconds < 60) return `${seconds} \u79D2\u524D`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} \u5206\u949F\u524D`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)} \u5C0F\u65F6\u524D`;
    return `${Math.round(seconds / 86400)} \u5929\u524D`;
  };
  function SandboxRow(props) {
    const { sandbox, expanded, events, busy } = props;
    const live = sandbox.alive && sandbox.listening;
    return (0, import_react5.createElement)(
      "div",
      { className: "sbx-row" },
      (0, import_react5.createElement)(
        "div",
        { className: "sbx-row-main" },
        (0, import_react5.createElement)("span", { className: "sbx-dot" + (live ? " sbx-dot-live" : ""), "aria-hidden": true }),
        (0, import_react5.createElement)("span", { className: "sbx-name" }, sandbox.name),
        (0, import_react5.createElement)("span", { className: "sbx-mono" }, sandbox.id),
        (0, import_react5.createElement)(
          "div",
          { className: "sbx-meta" },
          (0, import_react5.createElement)("span", null, `:${sandbox.port}`),
          (0, import_react5.createElement)("span", null, `${sandbox.sessions}${TEXTS.sessionsUnit}`),
          (0, import_react5.createElement)("span", null, `${sandbox.bundles.length}${TEXTS.bundlesUnit}`),
          (0, import_react5.createElement)("span", null, ago(sandbox.createdAt))
        ),
        (0, import_react5.createElement)(
          "div",
          { className: "sbx-actions" },
          (0, import_react5.createElement)(
            "button",
            { className: "sbx-btn", type: "button", onClick: props.onToggle },
            expanded ? TEXTS.collapse : TEXTS.tail
          ),
          (0, import_react5.createElement)("button", { className: "sbx-btn", type: "button", disabled: !live, onClick: props.onOpen }, TEXTS.open),
          (0, import_react5.createElement)("button", { className: "sbx-btn", type: "button", onClick: props.onDetail }, TEXTS.detail),
          (0, import_react5.createElement)(
            "button",
            { className: "sbx-btn sbx-btn-danger", type: "button", disabled: busy, onClick: props.onDestroy },
            TEXTS.destroy
          )
        )
      ),
      expanded ? (0, import_react5.createElement)("div", { className: "sbx-body" }, (0, import_react5.createElement)(EventList, { events })) : null
    );
  }

  // src/components/sandbox-panel/panel.ts
  var openSandbox = (sandbox) => {
    window.open(
      `http://127.0.0.1:${sandbox.port}/?token=${encodeURIComponent(sandbox.token)}`,
      "_blank",
      "noopener"
    );
  };
  var asMessage = (caught) => caught instanceof Error ? caught.message : String(caught);
  function SandboxPanel() {
    const { items, error, setError, reload } = useSandboxes();
    const [busy, setBusy] = (0, import_react6.useState)(false);
    const [expanded, setExpanded] = (0, import_react6.useState)(null);
    const [selected, setSelected] = (0, import_react6.useState)(null);
    const [cache, setCache] = (0, import_react6.useState)({});
    const handleCreate = (0, import_react6.useCallback)(async (input) => {
      setBusy(true);
      try {
        await createSandbox(input);
        await reload();
      } catch (caught) {
        setError(asMessage(caught));
      } finally {
        setBusy(false);
      }
    }, [reload, setError]);
    const handleDestroy = (0, import_react6.useCallback)(async (id) => {
      if (!window.confirm(TEXTS.confirmDestroy)) return;
      setBusy(true);
      try {
        await destroySandbox(id);
        setExpanded((current) => current === id ? null : current);
        setSelected((current) => current === id ? null : current);
        await reload();
      } catch (caught) {
        setError(asMessage(caught));
      } finally {
        setBusy(false);
      }
    }, [reload, setError]);
    const handleToggle = (0, import_react6.useCallback)(async (id) => {
      if (expanded === id) {
        setExpanded(null);
        return;
      }
      setExpanded(id);
      try {
        const data = await fetchTail(id, TAIL_LIMIT);
        setCache((current) => ({ ...current, [id]: data.events }));
      } catch (caught) {
        setError(asMessage(caught));
      }
    }, [expanded, setError]);
    const picked = selected && items ? items.find((item) => item.id === selected) : void 0;
    if (picked) {
      return (0, import_react6.createElement)(SandboxDetail, {
        sandbox: picked,
        busy,
        onBack: () => setSelected(null),
        onOpen: () => openSandbox(picked),
        onDestroy: () => void handleDestroy(picked.id)
      });
    }
    const rows = () => {
      if (items === null) return (0, import_react6.createElement)("div", { className: "sbx-empty" }, TEXTS.loading);
      if (items.length === 0) return (0, import_react6.createElement)("div", { className: "sbx-empty" }, TEXTS.empty);
      return items.map((sandbox) => (0, import_react6.createElement)(SandboxRow, {
        key: sandbox.id,
        sandbox,
        expanded: expanded === sandbox.id,
        events: cache[sandbox.id],
        busy,
        onToggle: () => void handleToggle(sandbox.id),
        onOpen: () => openSandbox(sandbox),
        onDetail: () => setSelected(sandbox.id),
        onDestroy: () => void handleDestroy(sandbox.id)
      }));
    };
    return (0, import_react6.createElement)(
      "div",
      { className: "sbx-root" },
      (0, import_react6.createElement)(
        "div",
        { className: "sbx-head" },
        (0, import_react6.createElement)(
          "div",
          { className: "sbx-grow" },
          (0, import_react6.createElement)("div", { className: "sbx-title" }, TEXTS.title),
          (0, import_react6.createElement)("div", { className: "sbx-sub" }, TEXTS.subtitle)
        ),
        (0, import_react6.createElement)(
          "button",
          { className: "sbx-btn", type: "button", onClick: () => void reload(), disabled: busy },
          TEXTS.refresh
        )
      ),
      error ? (0, import_react6.createElement)("div", { className: "sbx-err" }, error) : null,
      (0, import_react6.createElement)(CreateForm, { busy, onCreate: (input) => void handleCreate(input) }),
      rows(),
      (0, import_react6.createElement)("div", { className: "sbx-note" }, TEXTS.footnote)
    );
  }

  // src/components/sandbox-panel/stylesheet.ts
  var STYLESHEET_ID = "dsh-dev-sandbox-style";
  function ensureStylesheet(doc = document) {
    if (doc.getElementById(STYLESHEET_ID)) return;
    const link = doc.createElement("link");
    link.id = STYLESHEET_ID;
    link.rel = "stylesheet";
    link.href = stylesheetHref();
    doc.head.appendChild(link);
  }

  // src/components/sandbox-panel/register.ts
  function registerPanel(ctx) {
    ensureStylesheet();
    let sidebar;
    try {
      sidebar = ctx.get?.("betterSidebar");
    } catch {
      sidebar = void 0;
    }
    if (sidebar && typeof sidebar.registerTab === "function") {
      sidebar.registerTab({ id: PANEL_ID, title: TEXTS.navLabel, component: SandboxPanel });
      return;
    }
    ctx.slots.inject(SLOT_NAME, () => ctx.slots.register(
      {
        name: SLOT_NAME,
        id: PANEL_ID,
        order: PANEL_ORDER,
        label: () => TEXTS.navLabel
      },
      SandboxPanel
    ));
  }

  // src/entries/client.ts
  var plugin = {
    inject: ["slots"],
    apply(ctx) {
      registerPanel(ctx);
    }
  };
  return __toCommonJS(client_exports);
})();
return __DSH_DEV_SANDBOX__.plugin; } });
