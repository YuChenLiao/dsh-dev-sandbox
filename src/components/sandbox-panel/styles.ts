/** 面板样式。全部用 currentColor 混合，亮暗主题自动跟随，不写死背景。 */
export const PANEL_CSS = `
.sbx-root { max-width: 860px; font-size: 13px; line-height: 1.6; color: inherit; }
.sbx-head { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 18px; }
.sbx-title { font-size: 15px; font-weight: 600; letter-spacing: .01em; }
.sbx-sub { margin-top: 4px; opacity: .6; font-size: 12px; max-width: 560px; }
.sbx-grow { flex: 1 1 auto; }
.sbx-btn { appearance: none; border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
  background: transparent; color: inherit; border-radius: 7px; padding: 5px 11px; font: inherit;
  font-size: 12px; cursor: pointer; transition: background .15s ease, border-color .15s ease, opacity .15s ease; }
.sbx-btn:hover { background: color-mix(in srgb, currentColor 8%, transparent); border-color: color-mix(in srgb, currentColor 34%, transparent); }
.sbx-btn:disabled { opacity: .45; cursor: default; }
.sbx-btn-primary { border-color: color-mix(in srgb, #0d9488 60%, transparent); color: #0d9488; }
.sbx-btn-primary:hover { background: color-mix(in srgb, #0d9488 12%, transparent); }
.sbx-btn-danger:hover { border-color: color-mix(in srgb, #dc2626 55%, transparent); color: #dc2626;
  background: color-mix(in srgb, #dc2626 8%, transparent); }
.sbx-form { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 14px 16px;
  border: 1px dashed color-mix(in srgb, currentColor 22%, transparent); border-radius: 10px; margin-bottom: 16px; }
.sbx-input { flex: 1 1 160px; min-width: 120px; background: transparent; color: inherit; font: inherit;
  font-size: 12px; border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 7px; padding: 6px 9px; outline: none; }
.sbx-input:focus { border-color: color-mix(in srgb, #0d9488 60%, transparent); }
.sbx-input::placeholder { opacity: .45; }
.sbx-empty { padding: 26px 18px; border: 1px dashed color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 10px; opacity: .72; font-size: 12px; }
.sbx-row { border: 1px solid color-mix(in srgb, currentColor 12%, transparent); border-radius: 10px;
  margin-bottom: 10px; overflow: hidden; background: color-mix(in srgb, currentColor 2%, transparent); }
.sbx-row-main { display: flex; align-items: center; gap: 12px; padding: 11px 14px; }
.sbx-dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto;
  background: color-mix(in srgb, currentColor 30%, transparent); }
.sbx-dot-live { background: #16a34a; box-shadow: 0 0 0 0 color-mix(in srgb, #16a34a 55%, transparent);
  animation: sbx-pulse 2.4s ease-out infinite; }
@keyframes sbx-pulse { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, #16a34a 45%, transparent); }
  70% { box-shadow: 0 0 0 6px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
.sbx-name { font-weight: 500; }
.sbx-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11.5px; opacity: .62; }
.sbx-meta { display: flex; gap: 12px; align-items: center; opacity: .72; font-size: 11.5px; }
.sbx-actions { display: flex; gap: 6px; margin-left: auto; }
.sbx-body { border-top: 1px solid color-mix(in srgb, currentColor 10%, transparent);
  padding: 10px 14px 12px; background: color-mix(in srgb, currentColor 1.5%, transparent); }
.sbx-ev { display: flex; gap: 10px; padding: 3px 0; font-size: 11.5px; }
.sbx-ev-type { flex: 0 0 132px; opacity: .55; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.sbx-ev-text { flex: 1 1 auto; white-space: pre-wrap; word-break: break-word; }
.sbx-err { margin: 10px 0 14px; padding: 9px 12px; border-radius: 8px; font-size: 12px;
  color: #b91c1c; background: color-mix(in srgb, #dc2626 8%, transparent);
  border: 1px solid color-mix(in srgb, #dc2626 28%, transparent); }
.sbx-note { margin-top: 16px; font-size: 11.5px; opacity: .5; }
`;
