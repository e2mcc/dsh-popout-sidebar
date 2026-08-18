/* Layout push: reserve space for the popout panel so the conversation column
   yields instead of being covered (same technique as better-sidebar's right
   panel). --dsh-popout-sidebar-width is set live by the panel component;
   --dsh-sidebar-width is better-sidebar's right panel. */
html #root {
  margin-right: calc(var(--dsh-sidebar-width, 0px) + var(--dsh-popout-sidebar-width, 0px));
  transition: margin-right var(--ds-transition-duration-slow, 200ms) var(--ds-ease-in-out, ease);
}
body[data-dsh-popout-dragging] #root {
  transition: none;
}
/* Reserve right-side clearance in the conversation header so the corner
   trigger never overlaps its right-aligned utilities (e.g. "Session log").
   The clearance only applies while the popout panel is closed. */
header:has([data-slot="conversation.session.header.utilities"]) {
  padding-right: max(28px, calc(60px - var(--dsh-popout-sidebar-width, 0px)));
  transition: padding-right var(--ds-transition-duration-slow, 200ms) var(--ds-ease-in-out, ease);
}
@media (prefers-reduced-motion: reduce) {
  html #root { transition: none; }
  header:has([data-slot="conversation.session.header.utilities"]) { transition: none; }
}
.artifacts-panel {
  position: fixed; top: 0; right: var(--dsh-sidebar-width, 0px); bottom: 0; width: 30vw; max-width: calc(100vw - 24px); min-width: 0;
  display: flex; flex-direction: column;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  border-left: 1px solid var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-shadow-lv2);
  pointer-events: auto; z-index: 9999;
  font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif);
  font-size: 13px; line-height: 1.5;
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
}
.artifacts-head {
  position: relative; display: flex; align-items: center; gap: 8px; padding: 10px 12px; flex: none;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
}
.artifacts-head-left { display: flex; align-items: center; gap: 4px; flex: none; }
.artifacts-title { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); white-space: nowrap; font-weight: 600; font-size: 13px; color: var(--dsw-alias-label-primary); }
.artifacts-spacer { flex: 1; }
.artifacts-toggle {
  display: inline-flex; align-items: center; justify-content: center; padding: 4px; line-height: 0;
  border: none; background: transparent; border-radius: 6px;
  color: var(--dsw-alias-label-secondary); cursor: pointer;
}
.artifacts-toggle:hover { color: var(--dsw-alias-label-primary); }
.artifacts-link { color: var(--dsw-alias-state-business-primary); text-decoration: none; font-size: 15px; padding: 2px 8px; border-radius: 6px; }
.artifacts-link:hover { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-iconbtn {
  background: transparent; border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary); border-radius: 6px; padding: 2px 8px;
  cursor: pointer; font-size: 12px;
}
.artifacts-iconbtn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-body { flex: 1 1 45%; min-height: 0; overflow-y: auto; }
.artifacts-empty { padding: 28px 16px; color: var(--dsw-alias-label-tertiary); text-align: center; }
.artifacts-item {
  display: block; width: 100%; text-align: left; padding: 9px 12px;
  border: none; border-bottom: 1px solid var(--dsw-alias-border-l2);
  background: transparent; color: inherit; cursor: pointer; font: inherit;
}
.artifacts-item:hover { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-item.is-active { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-item-row { display: flex; align-items: center; gap: 8px; }
.artifacts-badge { font-size: 10px; padding: 1px 6px; border-radius: 4px; flex: none; }
.artifacts-badge-create { background: var(--dsw-alias-state-success-tertiary); color: var(--dsw-alias-state-success-primary); }
.artifacts-badge-edit { background: var(--dsw-alias-state-warn-tertiary); color: var(--dsw-alias-state-warn-label); }
.artifacts-item-base { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.artifacts-item-full {
  color: var(--dsw-alias-label-tertiary); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  margin-top: 2px; font-family: var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}
.artifacts-preview { flex: 1 1 55%; min-height: 0; display: flex; flex-direction: column; }
.artifacts-pre {
  flex: 1; margin: 0; overflow: auto; padding: 12px;
  font-family: var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px; line-height: 1.55; white-space: pre;
  color: var(--dsw-alias-label-secondary);
}
.artifacts-hint { padding: 24px 16px; color: var(--dsw-alias-label-tertiary); text-align: center; }
.artifacts-error { padding: 16px; color: var(--dsw-alias-state-error-primary); font-family: var(--dsh-font-mono, monospace); word-break: break-all; }
.artifacts-corner-btn {
  position: fixed; top: 10px; right: calc(var(--dsh-sidebar-width, 0px) + var(--dsh-popout-sidebar-width, 0px) + 12px);
  z-index: 10000; width: 36px; height: 36px; padding: 0;
  border: none; background: transparent; color: var(--dsw-alias-label-secondary);
  cursor: pointer; align-items: center; justify-content: center; display: inline-flex;
  transition: right var(--ds-transition-duration-slow, 200ms) var(--ds-ease-in-out, ease), color .15s;
}
.artifacts-corner-btn:hover { color: var(--dsw-alias-label-primary); }
.artifacts-item { display: flex; align-items: stretch; padding: 0; cursor: default; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.artifacts-item:hover { background: var(--dsw-alias-interactive-bg-hover); }
/* Selected artifact: a left accent bar (list-item language) keeps it visually
   distinct from the file tree's rounded full-fill selection, so a lone selected
   artifact never reads as a file-tree row. */
.artifacts-item.is-active { background: var(--dsw-alias-interactive-bg-hover); box-shadow: inset 3px 0 0 var(--dsw-alias-state-business-primary); }
.artifacts-item-main { flex: 1; min-width: 0; text-align: left; padding: 9px 12px; border: none; background: transparent; color: inherit; cursor: pointer; font: inherit; }
.artifacts-item-actions { display: flex; align-items: center; gap: 2px; padding-right: 6px; opacity: 0; }
.artifacts-item:hover .artifacts-item-actions { opacity: 1; }
.artifacts-minibtn { border: none; background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer; font-size: 12px; padding: 2px 6px; border-radius: 4px; }
.artifacts-minibtn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.artifacts-notice { color: var(--dsw-alias-state-business-primary); font-size: 12px; }
.artifacts-preview-body { flex: 1; min-height: 0; overflow-y: auto; position: relative; }
.artifacts-img { display: block; max-width: 100%; max-height: 70vh; object-fit: contain; margin: 12px; }
/* iframe/embed are REPLACED elements: inset-0 without an explicit
   width/height keeps their intrinsic (small) size, so use width/height 100%
   instead. position:relative above is for the pdf.js renderer's absolute
   canvas container (a non-replaced div, which DOES stretch with inset-0). */
.artifacts-iframe { width: 100%; height: 100%; min-height: 360px; border: 0; background: #fff; }
.artifacts-pdf { width: 100%; height: 100%; min-height: 360px; border: 0; background: #fff; display: block; }
/* pdf.js renderer (sidebar): fills the preview area, no native toolbar. */
.artifacts-pdfview { position: absolute; top: 0; right: 0; bottom: 0; left: 0; display: flex; flex-direction: column; background: #525659; }
.artifacts-pdfview-bar { flex: none; display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 8px; background: var(--dsw-alias-bg-layer-1); border-bottom: 1px solid var(--dsw-alias-border-l2); }
.artifacts-pdfview-btn { min-width: 24px; height: 22px; border: 1px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-secondary); border-radius: 5px; cursor: pointer; font: inherit; font-size: 13px; line-height: 1; padding: 0 6px; }
.artifacts-pdfview-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.artifacts-pdfview-btn:disabled { opacity: .4; cursor: default; }
.artifacts-pdfview-zoom { font-size: 12px; color: var(--dsw-alias-label-secondary); min-width: 40px; text-align: center; }
.artifacts-pdfview-page { font-size: 12px; color: var(--dsw-alias-label-secondary); min-width: 44px; text-align: center; }
.artifacts-pdfview-spacer { flex: 1; }
.artifacts-pdfview-scroll { flex: 1; min-height: 0; overflow: auto; padding: 12px; }
.artifacts-pdfview-canvas { display: block; margin: 0 auto; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.35); }
.artifacts-markdown { padding: 12px 14px; line-height: 1.6; word-wrap: break-word; font-size: 13px; }
.artifacts-markdown h1, .artifacts-markdown h2, .artifacts-markdown h3, .artifacts-markdown h4, .artifacts-markdown h5, .artifacts-markdown h6 { margin: 14px 0 8px; line-height: 1.3; }
.artifacts-markdown h1 { font-size: 1.45em; border-bottom: 1px solid var(--dsw-alias-border-l2); padding-bottom: 6px; }
.artifacts-markdown h2 { font-size: 1.25em; border-bottom: 1px solid var(--dsw-alias-border-l1); padding-bottom: 4px; }
.artifacts-markdown code { background: var(--dsw-alias-bg-layer-1); padding: 1px 5px; border-radius: 4px; font-family: var(--dsh-font-mono, ui-monospace, monospace); font-size: 0.9em; }
.artifacts-markdown pre { background: var(--dsw-alias-bg-layer-1); padding: 10px 12px; border-radius: 6px; overflow: auto; }
.artifacts-markdown pre code { background: transparent; padding: 0; }
.artifacts-markdown img { max-width: 100%; }
.artifacts-markdown blockquote { border-left: 3px solid var(--dsw-alias-border-l2); margin: 8px 0; padding: 2px 12px; color: var(--dsw-alias-label-secondary); }
.artifacts-markdown ul, .artifacts-markdown ol { padding-left: 24px; }
.artifacts-markdown a { color: var(--dsw-alias-state-business-primary); }
.artifacts-diff { border-top: 1px solid var(--dsw-alias-border-l2); }
.artifacts-diff-block { border-bottom: 1px solid var(--dsw-alias-border-l1); }
.artifacts-diff-label { font-size: 11px; padding: 4px 12px; font-weight: 600; }
.artifacts-diff-del .artifacts-diff-label { color: var(--dsw-alias-state-error-primary); background: rgba(236,19,19,0.06); }
.artifacts-diff-add .artifacts-diff-label { color: var(--dsw-alias-state-success-primary); background: rgba(34,197,94,0.08); }
.artifacts-diff-pre { margin: 0; padding: 8px 12px; font: 12px/1.5 var(--dsh-font-mono, ui-monospace, monospace); white-space: pre-wrap; word-break: break-word; color: var(--dsw-alias-label-secondary); }
.artifacts-diff-del .artifacts-diff-pre { background: rgba(236,19,19,0.05); }
.artifacts-diff-add .artifacts-diff-pre { background: rgba(34,197,94,0.06); }
.artifacts-panel { transition: right var(--ds-transition-duration-slow, 200ms) var(--ds-ease-in-out, ease); }
.artifacts-panel.artifacts-resizing { transition: none; user-select: none; }

/* Resize handle on the panel's left edge */
.artifacts-resize { position: absolute; left: -4px; top: 0; bottom: 0; width: 8px; cursor: col-resize; z-index: 3; touch-action: none; }
.artifacts-resize::after { content: ''; position: absolute; left: 3px; top: 0; bottom: 0; width: 2px; background: transparent; transition: background .15s; }
.artifacts-resize:hover::after, .artifacts-resize:active::after { background: var(--dsw-alias-interactive-bg-hover-accent); }

/* Divider between the artifact list and the preview (drag to resize) */
.artifacts-splitter { flex: none; height: 6px; cursor: row-resize; position: relative; z-index: 2; touch-action: none; background: transparent; border-top: 1px solid var(--dsw-alias-border-l2); }
.artifacts-splitter::after { content: ''; position: absolute; left: 0; right: 0; top: 2px; height: 2px; background: transparent; transition: background .15s; }
.artifacts-splitter:hover::after, .artifacts-splitter.artifacts-splitting::after { background: var(--dsw-alias-interactive-bg-hover-accent); }
.artifacts-splitter.artifacts-splitting { user-select: none; }

/* Tabs (产物 / 文件树). The bottom border is the divider between the tab row
   (including the「文件树」label) and the artifact/file list below it. */
.artifacts-tabs { flex: none; display: flex; align-items: stretch; height: 32px; border-bottom: 2px solid #fff; background: var(--dsw-alias-bg-layer-1); }
.artifacts-tab { flex: 1; border: none; background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-tertiary); font: inherit; font-size: 12px; cursor: pointer; border-right: 1px solid var(--dsw-alias-border-l1); }
.artifacts-tab:hover { background: var(--dsw-alias-interactive-bg-hover-accent); }
.artifacts-tab.is-active { color: var(--dsw-alias-label-primary); background: transparent; }

/* File tree (文件树) — styled like better-sidebar's explorer */
.artifacts-tree { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.artifacts-tree-header { flex: none; justify-content: space-between; align-items: center; gap: 8px; height: 36px; padding: 0 8px 0 12px; display: flex; }
.artifacts-tree-root { font: var(--dsw-font-s-14); color: var(--dsw-alias-label-secondary); text-overflow: ellipsis; white-space: nowrap; overflow: hidden; }
.artifacts-tree-refresh { width: 24px; height: 24px; color: var(--dsw-alias-label-secondary); cursor: pointer; background: transparent; border: none; border-radius: 6px; flex: none; justify-content: center; align-items: center; display: inline-flex; padding: 0; }
.artifacts-tree-refresh:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.artifacts-tree-body { flex: 1; min-height: 0; overflow-y: auto; padding: 2px 6px 8px; }
.artifacts-tree-row { box-sizing: border-box; width: 100%; height: 34px; font: var(--dsw-font-s-14); color: var(--dsw-alias-label-primary); text-align: left; cursor: pointer; white-space: nowrap; background: transparent; border: none; border-radius: 8px; align-items: center; gap: 6px; padding: 0 8px; display: flex; animation: artifacts-row-in .15s var(--ds-ease-in-out, ease); }
.artifacts-tree-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-tree-dir { font: var(--dsw-font-s-strong-14); }
.artifacts-tree-hidden { opacity: .45; }
.artifacts-tree-name { flex: 1; min-width: 0; text-overflow: ellipsis; overflow: hidden; }
.artifacts-tree-row.is-selected { background: var(--dsw-alias-interactive-bg-active); }
.artifacts-tree-ref { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); height: 20px; color: var(--dsw-alias-label-tertiary); font: var(--dsw-font-xxxs-strong-11); cursor: pointer; border-radius: 999px; flex: none; align-items: center; padding: 0 8px; display: none; }
.artifacts-tree-ref:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.artifacts-tree-row:hover .artifacts-tree-ref, .artifacts-tree-row:focus-within .artifacts-tree-ref { display: inline-flex; }
.artifacts-tree-copied { font: var(--dsw-font-xxxs-11); color: var(--dsw-alias-label-tertiary); flex: none; }
.artifacts-tree-loading { cursor: default; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.artifacts-tree-error { cursor: default; color: var(--dsw-alias-state-error-primary); font-size: 12px; }
@keyframes artifacts-row-in { 0% { opacity: 0 } }

/* Settings section */
.artifacts-settings { display: flex; flex-direction: column; gap: 14px; width: 100%; height: 100%; min-height: 0; overflow-y: auto; padding-bottom: 24px; }
.artifacts-setintro { color: var(--dsw-alias-label-tertiary); margin: 0; padding: 0 2px; font-size: 13px; line-height: 20px; }
.artifacts-setgroup { border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-3); border-radius: 16px; padding: 6px 20px; display: flex; flex-direction: column; flex: none; }
.artifacts-setrow { border-bottom: 1px solid var(--dsw-alias-border-l2); justify-content: space-between; align-items: center; gap: 16px; padding: 12px 2px; display: flex; }
.artifacts-setrow:last-child { border-bottom: none; }
.artifacts-settext { flex-direction: column; gap: 4px; min-width: 0; display: flex; }
.artifacts-settitle { color: var(--dsw-alias-label-primary); font-size: 14px; line-height: 22px; }
.artifacts-setdesc { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.artifacts-switch { cursor: pointer; flex: none; display: inline-flex; position: relative; }
.artifacts-switch input { opacity: 0; width: 1px; height: 1px; margin: 0; position: absolute; }
.artifacts-switch-track { box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); border-radius: 10px; align-items: center; width: 36px; height: 20px; padding: 2px; transition: background .15s, border-color .15s; display: inline-flex; }
.artifacts-switch-thumb { background: var(--dsw-alias-label-secondary); border-radius: 50%; width: 14px; height: 14px; transition: transform .15s, background .15s; display: block; }
.artifacts-switch:hover .artifacts-switch-track { border-color: var(--dsw-alias-label-dimmed); }
.artifacts-switch input:checked + .artifacts-switch-track { border-color: var(--dsw-alias-button-primary-fill); background: var(--dsw-alias-button-primary-fill); }
.artifacts-switch input:checked + .artifacts-switch-track .artifacts-switch-thumb { background: var(--dsw-alias-bg-layer-3); transform: translate(16px); }
.artifacts-switch input:focus-visible + .artifacts-switch-track { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
.artifacts-setcontrol { flex: none; align-items: center; gap: 6px; display: flex; }
.artifacts-widthinput { width: 76px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; border-radius: 6px; padding: 4px 8px; }
.artifacts-suffix { color: var(--dsw-alias-label-secondary); font-size: 14px; line-height: 22px; }

/* Delete mode */
.artifacts-delete-hint { padding: 6px 12px; font-size: 12px; color: var(--dsw-alias-state-error-primary); background: rgba(236,19,19,0.08); border-bottom: 1px solid var(--dsw-alias-border-l2); flex: none; }
.artifacts-iconbtn.artifacts-delete-on { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); background: rgba(236,19,19,0.08); }
.artifacts-item.is-delete-marked { outline: 2px solid var(--dsw-alias-state-error-primary); outline-offset: -2px; background: rgba(236,19,19,0.06); }
.artifacts-item.is-delete-marked .artifacts-item-actions { opacity: 1; }
.artifacts-delete-x { color: var(--dsw-alias-state-error-primary); font-size: 16px; font-weight: 700; line-height: 1; }
.artifacts-delete-x:hover { background: rgba(236,19,19,0.12); color: var(--dsw-alias-state-error-primary); }

/* Code preview (syntax-highlighted via DSH's Shiki — token colors come from
   the app's global --shiki-token-* palette, matching the rest of DSH) */
.artifacts-code { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.artifacts-code-head { flex: none; display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.artifacts-code-lang { font-size: 11px; font-weight: 600; color: var(--dsw-alias-label-secondary); padding: 1px 8px; border-radius: 4px; background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1)); }
.artifacts-code-scroll { flex: 1; min-height: 0; overflow: auto; display: flex; align-items: flex-start; background: var(--shiki-background, var(--dsw-alias-markdown-code-block, var(--dsw-alias-bg-layer-1))); }
.artifacts-code-gutter { flex: none; min-width: 3em; margin: 0; padding: 12px 10px 12px 12px; text-align: right; color: var(--dsw-alias-label-tertiary); border-right: 1px solid var(--dsw-alias-border-l1); position: sticky; left: 0; user-select: none; background: var(--shiki-background, var(--dsw-alias-markdown-code-block, var(--dsw-alias-bg-layer-1))); font: 12px/1.6 var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); white-space: pre; }
.artifacts-code-pre { flex: 1; margin: 0; padding: 12px; background: var(--shiki-background, var(--dsw-alias-markdown-code-block, var(--dsw-alias-bg-layer-1))); color: var(--shiki-foreground, var(--dsw-alias-label-primary)); font: 12px/1.6 var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); white-space: pre; }
.artifacts-code-pre code { font: inherit; color: inherit; }
.artifacts-code-line { display: block; }

/* Token colors for the shared self-contained highlighter (markdown fenced
   code blocks). Palette matches the standalone page + DSH's --shiki-* hues. */
.tok-comment { color: #868e96; }
.tok-string { color: #2f9e44; }
.tok-number, .tok-bool, .tok-variable, .tok-hex, .tok-attr { color: #e8590c; }
.tok-keyword, .tok-important, .tok-atrule { color: #d6336c; }
.tok-function, .tok-decorator { color: #6741d9; }
.tok-class, .tok-builtin, .tok-tag, .tok-key { color: #1971c2; }
.tok-property { color: #495057; }
body[data-ds-dark-theme] .tok-comment { color: #adb5bd; }
body[data-ds-dark-theme] .tok-string { color: #69db7c; }
body[data-ds-dark-theme] .tok-number, body[data-ds-dark-theme] .tok-bool, body[data-ds-dark-theme] .tok-variable, body[data-ds-dark-theme] .tok-hex, body[data-ds-dark-theme] .tok-attr { color: #ffa94d; }
body[data-ds-dark-theme] .tok-keyword, body[data-ds-dark-theme] .tok-important, body[data-ds-dark-theme] .tok-atrule { color: #faa2c1; }
body[data-ds-dark-theme] .tok-function, body[data-ds-dark-theme] .tok-decorator { color: #b197fc; }
body[data-ds-dark-theme] .tok-class, body[data-ds-dark-theme] .tok-builtin, body[data-ds-dark-theme] .tok-tag, body[data-ds-dark-theme] .tok-key { color: #74c0fc; }
body[data-ds-dark-theme] .tok-property { color: #ced4da; }
