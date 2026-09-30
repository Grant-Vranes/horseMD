"use strict";
const electron = require("electron");
const node_url = require("node:url");
const node_path = require("node:path");
const fs = require("node:fs/promises");
const node_fs = require("node:fs");
const node_child_process = require("node:child_process");
const node_os = require("node:os");
const node_crypto = require("node:crypto");
const fs$1 = require("fs");
const promises = require("fs/promises");
const events = require("events");
const sysPath = require("path");
const node_stream = require("node:stream");
const os = require("os");
const buffer = require("buffer");
const posix = require("node:path/posix");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const sysPath__namespace = /* @__PURE__ */ _interopNamespaceDefault(sysPath);
const LOCAL_FONT_PERMISSION_NAMES = /* @__PURE__ */ new Set(["local-fonts", "unknown"]);
const ALLOWED_EXTERNAL_PROTOCOLS = /* @__PURE__ */ new Set(["https:", "http:", "mailto:"]);
const LOCAL_FONT_GRANT_TTL_MS = 5e3;
function getAllowedExternalUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(value);
    if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) return null;
    if ((parsed.protocol === "https:" || parsed.protocol === "http:") && !parsed.hostname) return null;
    return parsed.href;
  } catch {
    return null;
  }
}
function createLocalFontGrant(webContentsId, now2 = Date.now()) {
  return {
    webContentsId,
    expiresAt: now2 + LOCAL_FONT_GRANT_TTL_MS
  };
}
function isTrustedRendererUrl(candidate, currentUrl, devRendererUrl = "") {
  try {
    const requested = new URL(candidate);
    const current = new URL(currentUrl);
    if (devRendererUrl) {
      const dev = new URL(devRendererUrl);
      return requested.origin === dev.origin && current.origin === dev.origin;
    }
    if (requested.protocol !== "file:" || current.protocol !== "file:") return false;
    return !requested.pathname || requested.pathname === "/" || requested.pathname === current.pathname;
  } catch {
    return false;
  }
}
function canGrantLocalFonts({
  permission,
  webContentsId,
  trustedWebContentsId,
  requestingUrl,
  currentUrl,
  devRendererUrl,
  isMainFrame,
  grant,
  now: now2 = Date.now()
}) {
  return LOCAL_FONT_PERMISSION_NAMES.has(permission) && webContentsId === trustedWebContentsId && isMainFrame === true && grant?.webContentsId === trustedWebContentsId && grant.expiresAt >= now2 && isTrustedRendererUrl(requestingUrl, currentUrl, devRendererUrl);
}
const expandCustomPath = (raw, stem) => String(raw).replaceAll("${filename}", stem);
function resolveAttachmentTarget(docPath, mode, customPath) {
  const docDir = node_path.dirname(docPath);
  const stem = node_path.basename(docPath, node_path.extname(docPath));
  let dir;
  if (mode === "current") {
    dir = docDir;
  } else if (mode === "docname") {
    dir = node_path.join(docDir, `${stem}.assets`);
  } else if (mode === "custom") {
    const raw = String(customPath || "").trim();
    if (!raw) {
      dir = node_path.join(docDir, "assets");
    } else {
      const expanded = expandCustomPath(raw, stem);
      dir = node_path.isAbsolute(expanded) ? node_path.resolve(expanded) : node_path.resolve(docDir, expanded);
    }
  } else {
    dir = node_path.join(docDir, "assets");
  }
  const rel = node_path.relative(docDir, dir).split(node_path.sep).join("/");
  const prefix = rel === "" ? "" : rel + "/";
  return { dir, prefix };
}
const PDF_PAGE_SIZES = ["A4", "A3", "Letter", "Custom"];
const PDF_PAGINATION = ["none", "h1", "h2", "h3", "hr"];
const PDF_MARGIN_PRESETS = ["normal", "narrow", "wide", "custom"];
const PDF_DENSITY_PRESETS = ["comfort", "standard", "compact"];
const PDF_DENSITY_VALUES = Object.freeze({
  comfort: Object.freeze({ lineHeight: 1.9, para: 1.1, headingTop: 1.9, headingBottom: 0.7, list: 1, li: 0.4, blockquote: 1.2, blockquoteP: 0.4, pre: 1.2, figure: 1.3, img: 1.2, math: 1.3, hr: 2.2 }),
  standard: Object.freeze({ lineHeight: 1.75, para: 0.85, headingTop: 1.6, headingBottom: 0.6, list: 0.8, li: 0.32, blockquote: 1, blockquoteP: 0.3, pre: 1, figure: 1.1, img: 1, math: 1.1, hr: 1.8 }),
  compact: Object.freeze({ lineHeight: 1.4, para: 0.45, headingTop: 1.1, headingBottom: 0.4, list: 0.5, li: 0.18, blockquote: 0.7, blockquoteP: 0.2, pre: 0.7, figure: 0.7, img: 0.6, math: 0.8, hr: 1 })
});
const DEFAULT_PDF_OPTIONS = Object.freeze({
  pageSize: "A4",
  orientation: "portrait",
  marginPreset: "normal",
  margins: Object.freeze({ top: 20, right: 18, bottom: 20, left: 18 }),
  customWidth: 210,
  customHeight: 297,
  fontSizePt: 11,
  scale: 100,
  densityPreset: "standard",
  pagination: "none",
  includeToc: false,
  tocTitle: "Contents",
  tocDepth: 3,
  tocPageBreak: true,
  generateOutline: true,
  pageRanges: "",
  documentTitle: "",
  headerEnabled: false,
  headerText: "",
  includeTitle: true,
  includeDate: true,
  footerEnabled: true,
  footerText: "",
  includePageNumbers: true
});
const clamp$1 = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};
const marginForPreset = (preset) => {
  if (preset === "narrow") return { top: 10, right: 10, bottom: 10, left: 10 };
  if (preset === "wide") return { top: 25, right: 30, bottom: 25, left: 30 };
  return { top: 20, right: 18, bottom: 20, left: 18 };
};
function normalizePageRanges(value = "") {
  const input = String(value || "").trim();
  if (!input) return "";
  const ranges = input.split(",").map((part) => part.trim()).filter(Boolean);
  if (!ranges.length) return "";
  const normalized = ranges.map((part) => {
    const match = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error("invalid-page-range");
    const from = Number(match[1]);
    const to = Number(match[2] || match[1]);
    if (from < 1 || to < from) throw new Error("invalid-page-range");
    return from === to ? String(from) : `${from}-${to}`;
  });
  return normalized.join(", ");
}
function normalizePdfOptions(options = {}) {
  const pageSize = PDF_PAGE_SIZES.includes(options.pageSize) ? options.pageSize : DEFAULT_PDF_OPTIONS.pageSize;
  const marginPreset = PDF_MARGIN_PRESETS.includes(options.marginPreset) ? options.marginPreset : DEFAULT_PDF_OPTIONS.marginPreset;
  const presetMargins = marginForPreset(marginPreset);
  const suppliedMargins = marginPreset === "custom" ? options.margins || {} : presetMargins;
  return {
    pageSize,
    orientation: options.orientation === "landscape" ? "landscape" : "portrait",
    marginPreset,
    margins: {
      top: clamp$1(suppliedMargins.top, 0, 100, presetMargins.top),
      right: clamp$1(suppliedMargins.right, 0, 100, presetMargins.right),
      bottom: clamp$1(suppliedMargins.bottom, 0, 100, presetMargins.bottom),
      left: clamp$1(suppliedMargins.left, 0, 100, presetMargins.left)
    },
    customWidth: clamp$1(options.customWidth, 50, 1e3, DEFAULT_PDF_OPTIONS.customWidth),
    customHeight: clamp$1(options.customHeight, 50, 1e3, DEFAULT_PDF_OPTIONS.customHeight),
    fontSizePt: clamp$1(options.fontSizePt, 8, 24, DEFAULT_PDF_OPTIONS.fontSizePt),
    scale: clamp$1(options.scale, 50, 200, DEFAULT_PDF_OPTIONS.scale),
    densityPreset: PDF_DENSITY_PRESETS.includes(options.densityPreset) ? options.densityPreset : DEFAULT_PDF_OPTIONS.densityPreset,
    pagination: PDF_PAGINATION.includes(options.pagination) ? options.pagination : DEFAULT_PDF_OPTIONS.pagination,
    includeToc: options.includeToc === true,
    tocTitle: String(options.tocTitle || DEFAULT_PDF_OPTIONS.tocTitle).slice(0, 100),
    tocDepth: Math.round(clamp$1(options.tocDepth, 1, 6, DEFAULT_PDF_OPTIONS.tocDepth)),
    tocPageBreak: options.tocPageBreak !== false,
    generateOutline: options.generateOutline !== false,
    pageRanges: normalizePageRanges(options.pageRanges),
    documentTitle: String(options.documentTitle || "").slice(0, 300),
    headerEnabled: options.headerEnabled === true,
    headerText: String(options.headerText || "").slice(0, 300),
    includeTitle: options.includeTitle !== false,
    includeDate: options.includeDate === true,
    footerEnabled: options.footerEnabled !== false,
    footerText: String(options.footerText || "").slice(0, 300),
    includePageNumbers: options.includePageNumbers !== false
  };
}
const paginationCss = (pagination) => {
  if (/^h[1-3]$/.test(pagination)) {
    return `.doc ${pagination}:not(:first-child) { break-before: page; page-break-before: always; }`;
  }
  if (pagination === "hr") {
    return ".doc hr { border: 0; margin: 0; height: 0; break-after: page; page-break-after: always; }";
  }
  return "";
};
const densityRootVars = (preset) => {
  const d = PDF_DENSITY_VALUES[preset] || PDF_DENSITY_VALUES.standard;
  return `--hm-pdf-line-height:${d.lineHeight};--hm-pdf-para-margin:${d.para}em;--hm-pdf-heading-top:${d.headingTop}em;--hm-pdf-heading-bottom:${d.headingBottom}em;--hm-pdf-list-margin:${d.list}em;--hm-pdf-li-margin:${d.li}em;--hm-pdf-blockquote-margin:${d.blockquote}em;--hm-pdf-blockquote-p-margin:${d.blockquoteP}em;--hm-pdf-pre-margin:${d.pre}em;--hm-pdf-figure-margin:${d.figure}em;--hm-pdf-img-margin:${d.img}em;--hm-pdf-math-margin:${d.math}em;--hm-pdf-hr-margin:${d.hr}em;`;
};
const BASE_PDF_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .doc {
    font-family: 'Helvetica Neue', Helvetica, Arial, 'PingFang SC', 'Hiragino Sans GB',
      'Source Han Sans SC', 'Noto Sans SC', 'Microsoft YaHei', sans-serif;
    font-size: var(--hm-pdf-font-size, 11pt); line-height: var(--hm-pdf-line-height, 1.75); color: #2a2620;
    -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
    overflow-wrap: anywhere;
  }
  .doc > :first-child { margin-top: 0 !important; }
  .doc h1, .doc h2, .doc h3, .doc h4, .doc h5, .doc h6 {
    color: #16130e; font-weight: 700; line-height: 1.3; margin: var(--hm-pdf-heading-top, 1.6em) 0 var(--hm-pdf-heading-bottom, 0.6em);
    break-after: avoid; page-break-after: avoid; letter-spacing: 0;
  }
  .doc h1 { font-size: 2em; padding-bottom: 0.3em; border-bottom: 2px solid #e6e1d8; }
  .doc h2 { font-size: 1.5em; padding-bottom: 0.2em; border-bottom: 1px solid #ece7de; }
  .doc h3 { font-size: 1.25em; }
  .doc h4 { font-size: 1.05em; }
  .doc h5 { font-size: 1em; }
  .doc h6 { font-size: 0.92em; color: #6b655c; }
  .doc p { margin: var(--hm-pdf-para-margin, 0.85em) 0; }
  .doc a { color: #c86b35; text-decoration: none; border-bottom: 1px solid rgba(200,107,53,.35); }
  .doc strong { font-weight: 700; color: #16130e; }
  .doc em { font-style: italic; }
  .doc ul, .doc ol { margin: var(--hm-pdf-list-margin, 0.8em) 0; padding-left: 1.6em; }
  .doc li { margin: var(--hm-pdf-li-margin, 0.32em) 0; }
  .doc li::marker { color: #c86b35; }
  .doc blockquote {
    margin: var(--hm-pdf-blockquote-margin, 1em) 0; padding: 0.5em 1.1em; border-left: 3px solid #c86b35;
    background: rgba(200,107,53,.06); color: #6b655c; border-radius: 0 6px 6px 0;
    break-inside: avoid; page-break-inside: avoid;
  }
  .doc blockquote p { margin: var(--hm-pdf-blockquote-p-margin, 0.3em) 0; }
  .doc code {
    font-family: 'SF Mono', SFMono-Regular, Consolas, Monaco, monospace; font-size: 0.88em;
    background: #f4f1ea; padding: 0.12em 0.4em; border-radius: 4px; color: #b3431f;
  }
  .doc pre {
    background: #f4f1ea; border: 1px solid #e6e1d8; border-radius: 8px;
    padding: 14px 16px; margin: var(--hm-pdf-pre-margin, 1em) 0; overflow: hidden;
    break-inside: avoid; page-break-inside: avoid;
  }
  .doc pre code {
    background: none; padding: 0; color: #2a2620; font-size: 0.86em; line-height: 1.6;
    white-space: pre-wrap; word-break: break-word;
  }
  .doc pre.hm-pdf-code { padding-left: 0; }
  .doc pre.hm-pdf-code code { display: block; }
  .hm-code-line { display: block; white-space: pre-wrap; min-height: 1.6em; }
  .hm-code-line-num {
    display: inline-block; width: 2.6em; margin-right: 1em; text-align: right;
    color: #8a8478; font-size: 0.82em; user-select: none; -webkit-user-select: none;
    border-right: 1px solid #e6e1d8; padding-right: 0.9em;
    vertical-align: top;
  }
  .hm-code-line-text { white-space: pre-wrap; }
  .doc table {
    border-collapse: collapse; width: max-content; max-width: 100%; margin: 1em 0;
    font-size: 0.9em; table-layout: auto;
    break-inside: auto; page-break-inside: auto;
  }
  .doc table[data-hm-pdf-table-layout="measured"] { table-layout: fixed; }
  .doc table[data-hm-pdf-table-wide="true"] { width: 100% !important; }
  .doc thead { display: table-header-group; }
  .doc tr, .doc th, .doc td { break-inside: auto; page-break-inside: auto; }
  .doc th, .doc td {
    border: 1px solid #e6e1d8; padding: 0.28em 0.55em; line-height: 1.4;
    text-align: left; vertical-align: top;
    min-width: 0; overflow-wrap: anywhere; word-break: break-word; white-space: normal;
  }
  .doc th > p, .doc td > p {
    margin: 0; padding: 0; line-height: inherit;
  }
  .doc th { background: #f4f1ea; font-weight: 700; color: #16130e; }
  .doc tr:nth-child(even) td { background: #faf8f4; }
  .doc img, .doc svg { max-width: 100%; height: auto; display: block; margin: var(--hm-pdf-img-margin, 1em) auto; break-inside: avoid; }
  .doc img { border-radius: 6px; }
  .doc figure {
    margin: var(--hm-pdf-figure-margin, 1.1em) 0; text-align: center; break-inside: avoid; page-break-inside: avoid;
  }
  .doc .hm-pdf-diagram svg {
    width: auto; height: auto; max-width: 100%; max-height: 85vh; margin: 0 auto;
  }
  .doc math { font-size: 1.05em; }
  .doc math[display="block"] {
    display: inline-block; max-width: none; overflow: visible;
    font-size: 1.18em; break-inside: avoid; page-break-inside: avoid;
  }
  .doc .hm-pdf-math-wrap {
    max-width: 100%; margin: var(--hm-pdf-math-margin, 1.1em) 0;
    break-inside: avoid; page-break-inside: avoid;
  }
  .doc .hm-pdf-math-wrap math[display="block"] {
    display: block; margin: 0.18em auto; max-width: 100%;
  }
  .doc hr { border: none; border-top: 1px solid #e6e1d8; margin: var(--hm-pdf-hr-margin, 1.8em) 0; }
  .doc li:has(> input[type="checkbox"]) { list-style: none; }
  .doc input[type="checkbox"] {
    margin: 0 0.45em 0 -1.45em; opacity: 1; accent-color: #c86b35;
  }
  .pdf-toc { font-family: 'Helvetica Neue', Helvetica, Arial, 'PingFang SC', sans-serif; color: #2a2620; }
  .pdf-toc.break-after { break-after: page; page-break-after: always; }
  .pdf-toc.break-after + .doc { break-before: page; page-break-before: always; }
  .pdf-toc h1 { margin: 0 0 1.2em; font-size: 2em; color: #16130e; letter-spacing: 0; }
  .pdf-toc ol { list-style: none; margin: 0; padding-left: 0; }
  .pdf-toc ol ol { padding-left: 1.35em; }
  .pdf-toc li { margin: 0.45em 0; break-inside: avoid; }
  .pdf-toc a { color: inherit; text-decoration: none; border-bottom: 1px dotted #c8c1b7; }
`;
function buildPdfPrintStyles(page) {
  const { top, right, bottom, left } = page.margins;
  return `@page { size: ${page.width}mm ${page.height}mm; margin: ${top}mm ${right}mm ${bottom}mm ${left}mm; }
:root { --hm-pdf-font-size: ${page.fontSizePt}pt; ${densityRootVars(page.densityPreset)} }
${BASE_PDF_CSS}
${paginationCss(page.pagination)}`;
}
const PAGE_DIMENSIONS_MM = Object.freeze({
  A4: [210, 297],
  A3: [297, 420],
  Letter: [215.9, 279.4]
});
const escapeHtml$1 = (value) => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
function resolvePdfPage(options = {}) {
  const normalized = normalizePdfOptions(options);
  let [width, height] = normalized.pageSize === "Custom" ? [normalized.customWidth, normalized.customHeight] : PAGE_DIMENSIONS_MM[normalized.pageSize];
  if (normalized.orientation === "landscape") [width, height] = [height, width];
  return {
    ...normalized,
    width,
    height,
    printPageSize: {
      // Electron printToPDF custom Size values are inches.
      width: Number((width / 25.4).toFixed(4)),
      height: Number((height / 25.4).toFixed(4))
    }
  };
}
function buildPdfCss(options = {}) {
  const page = resolvePdfPage(options);
  return buildPdfPrintStyles(page);
}
const normalizeHeadings$1 = (headings, depth) => (Array.isArray(headings) ? headings : []).map((heading, index) => ({
  id: String(heading?.id || `hm-pdf-heading-${index + 1}`),
  level: Math.min(6, Math.max(1, Number(heading?.level) || 1)),
  text: String(heading?.text || "").trim()
})).filter((heading) => heading.text && heading.level <= depth);
function buildPdfToc(headings, options = {}) {
  const page = normalizePdfOptions(options);
  if (!page.includeToc) return "";
  const items = normalizeHeadings$1(headings, page.tocDepth);
  if (!items.length) return "";
  const root = { level: 0, children: [] };
  const stack = [root];
  for (const heading of items) {
    while (stack.length > 1 && stack.at(-1).level >= heading.level) stack.pop();
    const node = { ...heading, children: [] };
    stack.at(-1).children.push(node);
    stack.push(node);
  }
  const render = (nodes) => `<ol>${nodes.map((node) => `<li><a href="#${escapeHtml$1(node.id)}">${escapeHtml$1(node.text)}</a>${node.children.length ? render(node.children) : ""}</li>`).join("")}</ol>`;
  return `<nav class="pdf-toc${page.tocPageBreak ? " break-after" : ""}"><h1>${escapeHtml$1(page.tocTitle)}</h1>${render(root.children)}</nav>`;
}
function buildPdfDocument(source, options = {}) {
  const payload = typeof source === "string" ? { html: source, headings: [], title: "" } : source || {};
  const page = normalizePdfOptions(options);
  const title = page.documentTitle || payload.title || "HorseMD";
  const css = buildPdfCss(page);
  const toc = buildPdfToc(payload.headings, page);
  const csp = "default-src 'none'; img-src data: file: https: http:; style-src 'unsafe-inline'; font-src data: file:;";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>${escapeHtml$1(title)}</title><style>${css}</style></head><body>${toc}<main class="doc">${payload.html || ""}</main></body></html>`;
}
const templateStyle = "font-size:8px;color:#777;width:100%;padding:0 12mm;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;display:flex;justify-content:space-between;gap:12px;";
function buildPdfHeaderFooter(options = {}) {
  const page = normalizePdfOptions(options);
  const title = escapeHtml$1(page.documentTitle);
  const headerLeft = [page.includeTitle ? title : "", page.headerText ? escapeHtml$1(page.headerText) : ""].filter(Boolean).join(" · ");
  const headerRight = page.includeDate ? '<span class="date"></span>' : "";
  const footerLeft = page.footerText ? escapeHtml$1(page.footerText) : "";
  const footerRight = page.includePageNumbers ? '<span><span class="pageNumber"></span> / <span class="totalPages"></span></span>' : "";
  const headerTemplate = page.headerEnabled ? `<div style="${templateStyle}"><span>${headerLeft}</span>${headerRight}</div>` : "<span></span>";
  const footerTemplate = page.footerEnabled ? `<div style="${templateStyle}"><span>${footerLeft}</span>${footerRight}</div>` : "<span></span>";
  return {
    displayHeaderFooter: page.headerEnabled || page.footerEnabled,
    headerTemplate,
    footerTemplate
  };
}
const MAX_PDF_IMAGE_BYTES = 32 * 1024 * 1024;
const MAX_PDF_IMAGE_TOTAL_BYTES = 256 * 1024 * 1024;
const MIME_EXTENSIONS = Object.freeze({
  "image/avif": ".avif",
  "image/bmp": ".bmp",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/webp": ".webp"
});
const URL_EXTENSIONS = new Set(Object.values(MIME_EXTENSIONS));
const imageExtension = (src, contentType = "") => {
  const mime = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (MIME_EXTENSIONS[mime]) return MIME_EXTENSIONS[mime];
  try {
    const extension = node_path.extname(new URL(src).pathname).toLowerCase();
    if (URL_EXTENSIONS.has(extension)) return extension;
  } catch {
    const extension = node_path.extname(String(src || "")).toLowerCase();
    if (URL_EXTENSIONS.has(extension)) return extension;
  }
  return ".img";
};
const escapeHtmlAttribute = (value) => String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const localImagePath = (src) => {
  if (/^file:/i.test(src)) return node_url.fileURLToPath(src);
  if (/^[a-zA-Z]:[\\/]/.test(src) || src.startsWith("/")) return src;
  return null;
};
const stageLocalImage = async (src, target, maximumBytes) => {
  const sourcePath = localImagePath(src);
  if (!sourcePath) return null;
  const info = await fs.stat(sourcePath);
  if (!info.isFile() || info.size > maximumBytes) return null;
  await fs.copyFile(sourcePath, target);
  return info.size;
};
const readResponseBytes = async (response, maximumBytes) => {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length <= maximumBytes ? bytes : null;
  }
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return size ? Buffer.concat(chunks, size) : null;
};
const stageRemoteImage = async (src, assetsDir, basename, fetchImpl, signal, maximumBytes) => {
  if (!/^https?:/i.test(src) || typeof fetchImpl !== "function") return null;
  const response = await fetchImpl(src, {
    signal,
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
    }
  });
  if (!response?.ok) return null;
  const declaredSize = Number(response.headers?.get?.("content-length") || 0);
  if (declaredSize > maximumBytes) return null;
  const bytes = await readResponseBytes(response, maximumBytes);
  if (!bytes?.length) return null;
  const extension = imageExtension(src, response.headers?.get?.("content-type"));
  const filename = `${basename}${extension}`;
  const target = node_path.join(assetsDir, filename);
  await fs.writeFile(target, bytes);
  return { size: bytes.length, filename };
};
async function stagePdfImages(source, {
  assetsDir,
  fetchImpl,
  signal,
  maximumBytes = MAX_PDF_IMAGE_BYTES,
  maximumTotalBytes = MAX_PDF_IMAGE_TOTAL_BYTES
} = {}) {
  if (!source || typeof source === "string" || !Array.isArray(source.images) || !source.images.length) {
    return {
      source,
      stagedImages: 0,
      unresolvedImages: 0,
      stagedBytes: 0
    };
  }
  let html = String(source.html || "");
  let stagedImages = 0;
  let unresolvedImages = 0;
  let stagedBytes = 0;
  await fs.mkdir(assetsDir, { recursive: true });
  for (let index = 0; index < source.images.length; index += 1) {
    if (signal?.aborted) throw new Error("PDF preview canceled");
    const image = source.images[index];
    const placeholder = String(image?.placeholder || "");
    const src = String(image?.src || "");
    if (!placeholder || !src || !html.includes(placeholder)) continue;
    let replacement = src;
    let staged = null;
    const available = Math.max(0, Math.min(maximumBytes, maximumTotalBytes - stagedBytes));
    if (available > 0) {
      const basename = `image-${String(index + 1).padStart(4, "0")}`;
      try {
        if (localImagePath(src)) {
          const filename = `${basename}${imageExtension(src)}`;
          const size = await stageLocalImage(src, node_path.join(assetsDir, filename), available);
          if (size != null) staged = { size, filename };
        } else {
          staged = await stageRemoteImage(src, assetsDir, basename, fetchImpl, signal, available);
        }
        if (staged) replacement = `./${staged.filename}`;
      } catch {
        staged = null;
      }
    }
    if (!staged) {
      unresolvedImages += 1;
    } else {
      stagedImages += 1;
      stagedBytes += staged.size;
    }
    html = html.split(placeholder).join(escapeHtmlAttribute(replacement));
  }
  return {
    source: {
      ...source,
      html,
      images: void 0
    },
    stagedImages,
    unresolvedImages,
    stagedBytes
  };
}
function createLatestTaskRunner(worker) {
  const active = /* @__PURE__ */ new Map();
  const cancel = (key) => {
    const task = active.get(key);
    if (!task) return false;
    task.controller.abort();
    return true;
  };
  const run = (key, payload) => {
    const previous = active.get(key);
    if (previous) previous.controller.abort();
    const controller = new AbortController();
    const task = { controller };
    active.set(key, task);
    task.settled = (async () => {
      if (previous?.settled) await previous.settled.catch(() => {
      });
      if (controller.signal.aborted || active.get(key) !== task) return { stale: true };
      try {
        const value = await worker(payload, controller.signal);
        if (active.get(key) !== task || controller.signal.aborted) return { stale: true };
        return { stale: false, value };
      } catch (error) {
        if (controller.signal.aborted || active.get(key) !== task) return { stale: true };
        throw error;
      } finally {
        if (active.get(key) === task) active.delete(key);
      }
    })();
    return task.settled;
  };
  return { run, cancel };
}
const MAX_SAVE_DIR_ENTRIES = 200;
function resolveSaveDir(state, sourcePath) {
  if (sourcePath) {
    const remembered = state.saveDirs?.[sourcePath];
    if (remembered) return remembered;
    return node_path.dirname(sourcePath);
  }
  return state.lastSaveDir || "";
}
function withRecordedSaveDir(state, sourcePath, chosenDir) {
  if (!chosenDir) return state;
  const next = { saveDirs: { ...state.saveDirs || {} }, lastSaveDir: chosenDir };
  if (!sourcePath) return next;
  const entries = Object.entries(next.saveDirs).filter(([key]) => key !== sourcePath);
  entries.push([sourcePath, chosenDir]);
  while (entries.length > MAX_SAVE_DIR_ENTRIES) entries.shift();
  next.saveDirs = Object.fromEntries(entries);
  return next;
}
const FILE = "export-prefs.json";
let cache = null;
let loadPromise = null;
let writeQueue = Promise.resolve();
const filePath$1 = () => node_path.join(electron.app.getPath("userData"), FILE);
async function load() {
  if (cache) return cache;
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const parsed = JSON.parse(await fs.readFile(filePath$1(), "utf8"));
        const saveDirs = parsed?.saveDirs && typeof parsed.saveDirs === "object" ? Object.fromEntries(Object.entries(parsed.saveDirs).filter(([, value]) => typeof value === "string")) : {};
        cache = {
          saveDirs,
          lastSaveDir: typeof parsed?.lastSaveDir === "string" ? parsed.lastSaveDir : ""
        };
      } catch {
        cache = { saveDirs: {}, lastSaveDir: "" };
      }
      return cache;
    })();
  }
  return loadPromise;
}
function persist(state) {
  const serialized = JSON.stringify(state, null, 2);
  writeQueue = writeQueue.then(async () => {
    try {
      await fs.writeFile(filePath$1(), serialized, "utf8");
    } catch {
    }
  });
  return writeQueue;
}
async function getSaveDirFor(sourcePath) {
  return resolveSaveDir(await load(), sourcePath);
}
async function recordSaveDir(sourcePath, chosenDir) {
  cache = withRecordedSaveDir(await load(), sourcePath, chosenDir);
  await persist(cache);
}
const RESOURCE_WAIT_MS = 12e3;
const FONT_WAIT_MS = 1500;
const MAX_SOURCE_HTML$1 = 50 * 1024 * 1024;
const printableResourcesScript = `
  (() => {
    const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), ${RESOURCE_WAIT_MS}))
    const documentImages = [...document.images]
    const images = documentImages.map((image) => {
      if (image.complete) return Promise.resolve()
      return new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true })
        image.addEventListener('error', resolve, { once: true })
      })
    })
    // MathML has no useful CSS wrapping primitive: long expressions are one
    // unbreakable inline layout run. Never shrink them to an unreadable size.
    // Instead, PDF-only output clones the presentation row and breaks at its
    // top-level operators. The live editor and exported source HTML stay intact.
    const presentationRow = (math) =>
      math.querySelector(':scope > semantics > mrow') || math.querySelector(':scope > mrow')
    const breakOperator = (node) =>
      node?.nodeType === Node.ELEMENT_NODE && node.localName === 'mo' &&
      /^[+=\\-\\u00b1,;]$/.test((node.textContent || '').trim())
    const lineMath = (math, row, children, start, end) => {
      const line = math.cloneNode(false)
      line.setAttribute('display', 'block')
      const lineRow = row.cloneNode(false)
      children.slice(start, end).forEach((child) => lineRow.appendChild(child.cloneNode(true)))
      const semantics = math.querySelector(':scope > semantics')
      if (semantics) {
        const lineSemantics = semantics.cloneNode(false)
        lineSemantics.appendChild(lineRow)
        line.appendChild(lineSemantics)
      } else {
        line.appendChild(lineRow)
      }
      return line
    }
    const wrapDisplayMath = () => [...document.querySelectorAll('.doc math[display="block"]')]
      .reduce((wrapped, math) => {
        const parent = math.parentElement
        const available = parent?.getBoundingClientRect().width || document.documentElement.clientWidth
        if (!available || math.getBoundingClientRect().width <= available + 0.5) return wrapped
        const row = presentationRow(math)
        const children = row ? [...row.children] : []
        if (children.length < 3 || !children.some(breakOperator)) return wrapped

        const measure = document.createElement('span')
        measure.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;white-space:nowrap;left:-10000px;top:0'
        parent.appendChild(measure)
        const lines = []
        let start = 0
        try {
          while (start < children.length) {
            let lastFit = start
            let lastBreak = -1
            let finished = false
            for (let end = start + 1; end <= children.length; end += 1) {
              measure.replaceChildren(lineMath(math, row, children, start, end))
              if (measure.getBoundingClientRect().width <= available + 0.5 || end === start + 1) {
                lastFit = end
                if (breakOperator(children[end - 1])) lastBreak = end
                if (end === children.length) {
                  lines.push([start, end])
                  finished = true
                  break
                }
                continue
              }
              const next = lastBreak > start ? lastBreak : lastFit
              if (next <= start) return wrapped
              lines.push([start, next])
              start = next
              finished = true
              break
            }
            if (!finished) return wrapped
            if (lines.at(-1)?.[1] === children.length) break
          }
        } finally {
          measure.remove()
        }
        if (lines.length < 2) return wrapped
        const wrapper = document.createElement('div')
        wrapper.className = 'hm-pdf-math-wrap'
        lines.forEach(([start, end]) => wrapper.appendChild(lineMath(math, row, children, start, end)))
        math.replaceWith(wrapper)
        return wrapped + 1
      }, 0)
    const fonts = document.fonts?.ready
      ? Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, ${FONT_WAIT_MS}))])
      : Promise.resolve()
    return Promise.race([
      Promise.all(images).then(() => 'ready'),
      timeout
    ]).then(async (imageStatus) => {
      await fonts
      return {
        imageStatus,
        totalImages: documentImages.length,
        failedImages: documentImages.filter((image) => image.complete && !image.naturalWidth).length,
        pendingImages: documentImages.filter((image) => !image.complete).length,
        wrappedMath: wrapDisplayMath()
      }
    })
  })()
`;
function validateSource$1(source) {
  const html = typeof source === "string" ? source : source?.html;
  if (typeof html !== "string" || !html.trim()) throw new Error("PDF source is empty");
  if (html.length > MAX_SOURCE_HTML$1) throw new Error("PDF source is too large");
}
function createPdfExportService({ getMainWindow: getMainWindow2 }) {
  const previews = /* @__PURE__ */ new Map();
  const trackedSenders = /* @__PURE__ */ new WeakSet();
  const trackSender = (sender) => {
    if (trackedSenders.has(sender)) return;
    trackedSenders.add(sender);
    const senderId = sender.id;
    sender.once("destroyed", () => {
      previews.delete(senderId);
      previewTasks.cancel(senderId);
    });
  };
  const render = async ({ source, options }, signal) => {
    validateSource$1(source);
    const page = resolvePdfPage(options);
    const tempDir = node_path.join(electron.app.getPath("temp"), `horsemd-pdf-preview-${node_crypto.randomUUID()}`);
    const tempHtml = node_path.join(tempDir, "index.html");
    await fs.mkdir(tempDir, { recursive: true });
    let window2 = null;
    let printing = false;
    const abort = () => {
      if (!printing && window2 && !window2.isDestroyed()) window2.destroy();
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      const prepared = await stagePdfImages(source, {
        assetsDir: tempDir,
        fetchImpl: (url, init) => electron.net.fetch(url, init),
        signal
      });
      await fs.writeFile(tempHtml, buildPdfDocument(prepared.source, page), "utf8");
      if (signal.aborted) throw new Error("PDF preview canceled");
      window2 = new electron.BrowserWindow({
        show: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true
        }
      });
      window2.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      await window2.loadFile(tempHtml);
      const resources = await window2.webContents.executeJavaScript(printableResourcesScript, true);
      const headerFooter = buildPdfHeaderFooter(page);
      printing = true;
      let pdf;
      try {
        pdf = await window2.webContents.printToPDF({
          printBackground: true,
          pageSize: page.printPageSize,
          scale: page.scale / 100,
          pageRanges: page.pageRanges,
          preferCSSPageSize: true,
          generateTaggedPDF: page.generateOutline,
          generateDocumentOutline: page.generateOutline,
          ...headerFooter
        });
      } finally {
        printing = false;
      }
      return {
        pdf,
        warnings: {
          resourceTimeout: resources?.imageStatus === "timeout" && Number(resources?.pendingImages || 0) > 0,
          pendingImages: Number(resources?.pendingImages || 0),
          failedImages: Number(resources?.failedImages || 0),
          totalImages: Number(resources?.totalImages || 0),
          wrappedMath: Number(resources?.wrappedMath || 0),
          stagedImages: Number(prepared.stagedImages || 0),
          unresolvedImages: Number(prepared.unresolvedImages || 0)
        }
      };
    } finally {
      signal.removeEventListener("abort", abort);
      if (window2 && !window2.isDestroyed()) window2.destroy();
      fs.rm(tempDir, { recursive: true, force: true }).catch(() => {
      });
    }
  };
  const previewTasks = createLatestTaskRunner(render);
  const createPreview = async (event, { source, options, defaultName, sourcePath } = {}) => {
    trackSender(event.sender);
    const senderId = event.sender.id;
    const result = await previewTasks.run(senderId, { source, options });
    if (result.stale) return { ok: false, stale: true };
    const { pdf, warnings } = result.value;
    const token = node_crypto.randomUUID();
    previews.set(senderId, {
      token,
      pdf,
      defaultName: String(defaultName || "Untitled.pdf"),
      sourcePath: typeof sourcePath === "string" ? sourcePath : ""
    });
    return { ok: true, token, data: pdf, warnings };
  };
  const savePreview = async (event, { token } = {}) => {
    const preview = previews.get(event.sender.id);
    if (!preview || preview.token !== token) return { ok: false, error: "PDF preview expired" };
    const fileName = preview.defaultName || "Untitled.pdf";
    const startDir = await getSaveDirFor(preview.sourcePath);
    const result = await electron.dialog.showSaveDialog(getMainWindow2(), {
      defaultPath: startDir ? node_path.join(startDir, fileName) : fileName,
      filters: [{ name: "PDF", extensions: ["pdf"] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await fs.writeFile(result.filePath, preview.pdf);
    await recordSaveDir(preview.sourcePath, node_path.dirname(result.filePath));
    electron.shell.openPath(result.filePath);
    return { path: result.filePath };
  };
  const disposePreview = (event, token) => {
    const preview = previews.get(event.sender.id);
    if (!preview || token && preview.token !== token) return false;
    previews.delete(event.sender.id);
    return true;
  };
  return { createPreview, savePreview, disposePreview };
}
const PANDOC_FORMATS = Object.freeze({
  docx: { extension: "docx", label: "Word" },
  epub: { extension: "epub", label: "EPUB" },
  latex: { extension: "tex", label: "LaTeX" },
  odt: { extension: "odt", label: "OpenDocument" },
  rtf: { extension: "rtf", label: "Rich Text" },
  txt: { extension: "txt", label: "Plain Text" }
});
function parsePandocVersion(output = "") {
  const first = String(output).split(/\r?\n/, 1)[0].trim();
  const match = first.match(/^pandoc(?:\.exe)?\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
function buildPandocArgs({ outputPath, sourceDir }) {
  const args = ["--from=gfm+tex_math_dollars", "--standalone", "--output", outputPath];
  if (sourceDir) args.push(`--resource-path=${sourceDir}`);
  return args;
}
function summarizePandocStderr(output = "", limit = 4e3) {
  const value = String(output).trim();
  if (!value) return null;
  const maximum = Math.max(100, Number(limit) || 4e3);
  return value.length > maximum ? `${value.slice(0, maximum)}…` : value;
}
const DEFAULT_OUTPUT_LIMIT = 64 * 1024;
const appendLimited = (chunks, size, chunk, limit) => {
  if (size >= limit) return size;
  const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  const take = Math.min(bytes.length, limit - size);
  if (take > 0) chunks.push(bytes.subarray(0, take));
  return size + take;
};
function runSubprocess({
  executable,
  args = [],
  input = null,
  cwd,
  env,
  timeoutMs = 12e4,
  outputLimit = DEFAULT_OUTPUT_LIMIT
}) {
  if (!executable || !Array.isArray(args)) return Promise.reject(new Error("Invalid subprocess request"));
  return new Promise((resolve, reject) => {
    const child = node_child_process.spawn(executable, args.map(String), {
      cwd,
      env,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const stdout = [];
    const stderr = [];
    let stdoutSize = 0;
    let stderrSize = 0;
    let timedOut = false;
    let settled = false;
    let forceKillTimer = null;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      forceKillTimer = setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
      }, 2e3);
      forceKillTimer.unref?.();
    }, Math.max(100, Number(timeoutMs) || 12e4));
    child.stdout.on("data", (chunk) => {
      stdoutSize = appendLimited(stdout, stdoutSize, chunk, outputLimit);
    });
    child.stderr.on("data", (chunk) => {
      stderrSize = appendLimited(stderr, stderrSize, chunk, outputLimit);
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      reject(error);
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      resolve({
        code,
        signal,
        timedOut,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8")
      });
    });
    if (input == null) {
      child.stdin.end();
      return;
    }
    child.stdin.on("error", () => {
    });
    child.stdin.end(String(input), "utf8");
  });
}
const MAX_MARKDOWN_BYTES = 50 * 1024 * 1024;
const CONFIG_FILE = "document-tools.json";
const executableName = (path) => /^pandoc(?:\.exe)?$/i.test(node_path.basename(String(path || "")));
const candidatePaths = (configuredPath = "") => {
  const names = process.platform === "win32" ? ["pandoc.exe", "pandoc"] : ["pandoc"];
  const fromPath = String(process.env.PATH || "").split(node_path.delimiter).filter(Boolean).flatMap((dir) => names.map((name) => node_path.join(dir, name)));
  const common = process.platform === "darwin" ? ["/opt/homebrew/bin/pandoc", "/usr/local/bin/pandoc", "/usr/bin/pandoc"] : process.platform === "win32" ? [
    node_path.join(process.env.LOCALAPPDATA || "", "Pandoc", "pandoc.exe"),
    node_path.join(process.env.PROGRAMFILES || "", "Pandoc", "pandoc.exe")
  ] : ["/usr/local/bin/pandoc", "/usr/bin/pandoc", "/snap/bin/pandoc"];
  return [...new Set([configuredPath, ...fromPath, ...common].filter(Boolean))];
};
const probePandoc = async (path) => {
  if (!executableName(path) || !node_path.isAbsolute(path)) return null;
  try {
    const info = await fs.stat(path);
    if (!info.isFile()) return null;
    const result = await runSubprocess({ executable: path, args: ["--version"], timeoutMs: 5e3 });
    if (result.timedOut || result.code !== 0) return null;
    const version = parsePandocVersion(result.stdout);
    return version ? { available: true, path, version } : null;
  } catch {
    return null;
  }
};
function createPandocExportService({ getMainWindow: getMainWindow2, getUserDataPath = () => electron.app.getPath("userData") }) {
  let configuredPath = "";
  let configLoaded = false;
  const configPath = () => node_path.join(getUserDataPath(), CONFIG_FILE);
  const loadConfig = async () => {
    if (configLoaded) return;
    configLoaded = true;
    try {
      const parsed = JSON.parse(await fs.readFile(configPath(), "utf8"));
      configuredPath = typeof parsed.pandocPath === "string" ? parsed.pandocPath : "";
    } catch {
      configuredPath = "";
    }
  };
  const saveConfig = async () => {
    const target = configPath();
    const temp = `${target}.tmp`;
    await fs.mkdir(node_path.dirname(target), { recursive: true });
    await fs.writeFile(temp, JSON.stringify({ version: 1, pandocPath: configuredPath }, null, 2), "utf8");
    await fs.rename(temp, target);
  };
  const detect = async () => {
    await loadConfig();
    for (const path of candidatePaths(configuredPath)) {
      const result = await probePandoc(path);
      if (result) return { ...result, custom: path === configuredPath && !!configuredPath };
    }
    return { available: false, path: null, version: null, custom: false };
  };
  const chooseExecutable = async () => {
    const result = await electron.dialog.showOpenDialog(getMainWindow2(), {
      title: "Select Pandoc executable",
      properties: ["openFile"],
      filters: process.platform === "win32" ? [{ name: "Pandoc", extensions: ["exe"] }] : [{ name: "All Files", extensions: ["*"] }]
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const selected = await probePandoc(result.filePaths[0]);
    if (!selected) return { ok: false, error: "The selected file is not a valid Pandoc executable." };
    configuredPath = selected.path;
    await saveConfig();
    return { ok: true, ...selected, custom: true };
  };
  const exportDocument = async ({ markdown, format, defaultName, sourcePath } = {}) => {
    const descriptor = PANDOC_FORMATS[format];
    if (!descriptor) return { ok: false, code: "unsupported-format", error: "Unsupported Pandoc format." };
    const content = String(markdown || "");
    if (!content.trim()) return { ok: false, code: "empty-document", error: "The document is empty." };
    if (Buffer.byteLength(content, "utf8") > MAX_MARKDOWN_BYTES) {
      return { ok: false, code: "document-too-large", error: "The document is too large to export." };
    }
    const detected = await detect();
    if (!detected.available) return { ok: false, code: "not-installed", error: "Pandoc is not installed or could not be found." };
    const safeBase = String(defaultName || "Untitled").replace(/[\\/:*?"<>|]/g, "-").replace(/\.[^.]+$/, "") || "Untitled";
    const startDir = await getSaveDirFor(sourcePath);
    const save = await electron.dialog.showSaveDialog(getMainWindow2(), {
      defaultPath: startDir ? node_path.join(startDir, `${safeBase}.${descriptor.extension}`) : `${safeBase}.${descriptor.extension}`,
      filters: [{ name: descriptor.label, extensions: [descriptor.extension] }]
    });
    if (save.canceled || !save.filePath) return { canceled: true };
    await recordSaveDir(sourcePath, node_path.dirname(save.filePath));
    const sourceDir = typeof sourcePath === "string" && node_path.isAbsolute(sourcePath) ? node_path.dirname(sourcePath) : null;
    try {
      const result = await runSubprocess({
        executable: detected.path,
        args: buildPandocArgs({ outputPath: save.filePath, sourceDir }),
        input: content,
        cwd: sourceDir || void 0,
        timeoutMs: 12e4,
        env: process.env
      });
      if (result.timedOut) return { ok: false, code: "timeout", error: "Pandoc timed out after 2 minutes." };
      if (result.code !== 0) {
        return { ok: false, code: "pandoc-failed", error: result.stderr.trim() || `Pandoc exited with code ${result.code}.` };
      }
      electron.shell.showItemInFolder(save.filePath);
      return {
        ok: true,
        path: save.filePath,
        version: detected.version,
        warning: summarizePandocStderr(result.stderr)
      };
    } catch (error) {
      return { ok: false, code: "start-failed", error: error?.message || String(error) };
    }
  };
  return { detect, chooseExecutable, exportDocument };
}
const HTML_THEMES = ["clean", "paper", "reading", "night"];
const HTML_WIDTHS = ["compact", "standard", "wide", "full"];
const DEFAULT_HTML_OPTIONS = Object.freeze({
  theme: "clean",
  contentWidth: "standard",
  fontSizePx: 17,
  lineHeight: 1.8,
  includeDocumentTitle: false,
  includeToc: false,
  tocDepth: 3,
  tocTitle: "Contents"
});
const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};
function normalizeHtmlOptions(options = {}) {
  return {
    theme: HTML_THEMES.includes(options.theme) ? options.theme : DEFAULT_HTML_OPTIONS.theme,
    contentWidth: HTML_WIDTHS.includes(options.contentWidth) ? options.contentWidth : DEFAULT_HTML_OPTIONS.contentWidth,
    fontSizePx: clamp(options.fontSizePx, 12, 24, DEFAULT_HTML_OPTIONS.fontSizePx),
    lineHeight: clamp(options.lineHeight, 1.4, 2.4, DEFAULT_HTML_OPTIONS.lineHeight),
    includeDocumentTitle: options.includeDocumentTitle === true,
    includeToc: options.includeToc === true,
    tocDepth: Math.round(clamp(options.tocDepth, 1, 6, DEFAULT_HTML_OPTIONS.tocDepth)),
    tocTitle: String(options.tocTitle || DEFAULT_HTML_OPTIONS.tocTitle).slice(0, 100)
  };
}
const THEMES = Object.freeze({
  clean: { bg: "#ffffff", page: "#ffffff", text: "#25282d", muted: "#6d737c", line: "#dfe2e6", soft: "#f4f5f6", accent: "#3f6f59", code: "#f2f3f4" },
  paper: { bg: "#eeece6", page: "#fbfaf6", text: "#302d28", muted: "#746e65", line: "#d8d2c7", soft: "#f2eee5", accent: "#6c7650", code: "#f0ece3" },
  reading: { bg: "#eef1ef", page: "#fdfefd", text: "#26302c", muted: "#69746f", line: "#d7ded9", soft: "#eef3f0", accent: "#2f7357", code: "#edf2ef" },
  night: { bg: "#17191c", page: "#202327", text: "#e7e8e9", muted: "#a4a8ad", line: "#3b3f45", soft: "#282c31", accent: "#8fc6a6", code: "#292d32" }
});
const WIDTHS = Object.freeze({ compact: "680px", standard: "820px", wide: "1040px", full: "none" });
const escapeHtml = (value) => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const normalizeHeadings = (headings, depth) => (Array.isArray(headings) ? headings : []).map((heading, index) => ({
  id: String(heading?.id || `hm-html-heading-${index + 1}`),
  level: Math.min(6, Math.max(1, Number(heading?.level) || 1)),
  text: String(heading?.text || "").trim()
})).filter((heading) => heading.text && heading.level <= depth);
function buildHtmlToc(headings, options = {}) {
  const page = normalizeHtmlOptions(options);
  if (!page.includeToc) return "";
  const items = normalizeHeadings(headings, page.tocDepth);
  if (!items.length) return "";
  const root = { level: 0, children: [] };
  const stack = [root];
  for (const heading of items) {
    while (stack.length > 1 && stack.at(-1).level >= heading.level) stack.pop();
    const node = { ...heading, children: [] };
    stack.at(-1).children.push(node);
    stack.push(node);
  }
  const render = (nodes) => `<ol>${nodes.map((node) => `<li><a href="#${escapeHtml(node.id)}">${escapeHtml(node.text)}</a>${node.children.length ? render(node.children) : ""}</li>`).join("")}</ol>`;
  return `<nav class="hm-html-toc"><h2>${escapeHtml(page.tocTitle)}</h2>${render(root.children)}</nav>`;
}
function buildHtmlDocument(source, options = {}) {
  const payload = typeof source === "string" ? { html: source, headings: [], title: "" } : source || {};
  const page = normalizeHtmlOptions(options);
  const theme = THEMES[page.theme];
  const title = String(payload.title || "HorseMD");
  const maxWidth = WIDTHS[page.contentWidth];
  const shellWidth = maxWidth === "none" ? "width:calc(100% - 40px);max-width:none;" : `width:min(calc(100% - 40px),${maxWidth});max-width:${maxWidth};`;
  const cover = page.includeDocumentTitle && title ? `<header class="hm-html-cover"><h1>${escapeHtml(title)}</h1></header>` : "";
  const toc = buildHtmlToc(payload.headings, page);
  const csp = "default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'";
  const css = `
    :root{color-scheme:${page.theme === "night" ? "dark" : "light"};--bg:${theme.bg};--page:${theme.page};--text:${theme.text};--muted:${theme.muted};--line:${theme.line};--soft:${theme.soft};--accent:${theme.accent};--code:${theme.code};--content-width:${maxWidth};--font-size:${page.fontSizePx}px;--line-height:${page.lineHeight}}
    *{box-sizing:border-box}html{scroll-behavior:smooth;background:var(--bg)}body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC","PingFang SC",sans-serif;font-size:var(--font-size);line-height:var(--line-height);letter-spacing:0}
    .hm-html-shell{${shellWidth}margin:32px auto;min-height:calc(100vh - 64px);padding:clamp(30px,6vw,72px);background:var(--page);box-shadow:0 10px 34px rgba(20,24,22,.08)}
    .hm-html-cover{padding-bottom:2rem;margin-bottom:2.5rem;border-bottom:1px solid var(--line)}.hm-html-cover h1{margin:0;font-size:2.4em;line-height:1.18}
    .doc{overflow-wrap:anywhere}.doc>*:first-child{margin-top:0}.doc>*:last-child{margin-bottom:0}
    h1,h2,h3,h4,h5,h6{line-height:1.3;margin:1.8em 0 .65em;font-weight:650;letter-spacing:0;scroll-margin-top:24px}h1{font-size:2em}h2{font-size:1.6em;border-bottom:1px solid var(--line);padding-bottom:.3em}h3{font-size:1.3em}h4{font-size:1.12em}h5,h6{font-size:1em}
    p{margin:.75em 0}a{color:var(--accent);text-decoration-thickness:1px;text-underline-offset:.18em}hr{border:0;border-top:1px solid var(--line);margin:2.2em 0}blockquote{margin:1.1em 0;padding:.2em 1em;border-left:3px solid var(--accent);color:var(--muted);background:var(--soft)}
    ul,ol{padding-left:1.6em}li{margin:.22em 0}li>p{margin:.15em 0}input[type="checkbox"]{accent-color:var(--accent)}li:has(>input[type="checkbox"]){display:grid;grid-template-columns:auto minmax(0,1fr);align-items:start;column-gap:.55em;list-style:none}li>input[type="checkbox"]{margin:.55em 0 0;opacity:1}li>input[type="checkbox"]+p{margin:.15em 0}
    code{font-family:"SFMono-Regular",Consolas,"Liberation Mono",monospace;font-size:.9em;background:var(--code);border:1px solid var(--line);border-radius:4px;padding:.12em .34em}pre{overflow:auto;margin:1.2em 0;padding:1em 1.1em;background:var(--code);border:1px solid var(--line);border-radius:6px;line-height:1.55}pre code{padding:0;border:0;background:transparent;font-size:.88em;white-space:pre}
    table{border-collapse:collapse;width:max-content;max-width:100%;margin:1.25em 0;background:var(--page)}th,td{border:1px solid var(--line);padding:.42em .68em;text-align:left;vertical-align:top}th{background:var(--soft);font-weight:650}td p,th p{margin:0}
    img,svg{display:block;max-width:100%;height:auto;margin:1.4em auto}figure{margin:1.5em 0;overflow:auto}math[display="block"]{display:block;max-width:100%;overflow-x:auto;overflow-y:hidden;margin:1.4em auto;padding:.2em 0}
    .hm-html-toc{margin:0 0 3rem;padding:1.25rem 1.4rem;border:1px solid var(--line);background:var(--soft)}.hm-html-toc h2{margin:0 0 .8rem;padding:0;border:0;font-size:1.15em}.hm-html-toc ol{list-style:none;margin:.25em 0;padding-left:0}.hm-html-toc ol ol{padding-left:1.2em}.hm-html-toc li{margin:.25em 0}.hm-html-toc a{color:var(--text);text-decoration:none}.hm-html-toc a:hover{color:var(--accent);text-decoration:underline}
    @media(max-width:720px){.hm-html-shell{width:100%;max-width:none;margin:0;min-height:100vh;padding:24px 20px;box-shadow:none}.hm-html-cover h1{font-size:2em}}
    @media print{html,body{background:#fff}.hm-html-shell{width:auto;max-width:none;margin:0;padding:0;box-shadow:none}}
  `;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>${escapeHtml(title)}</title><style>${css}</style></head><body><main class="hm-html-shell">${cover}${toc}<article class="doc">${payload.html || ""}</article></main></body></html>`;
}
const MAX_SOURCE_HTML = 50 * 1024 * 1024;
const MAX_EMBEDDED_IMAGE_BYTES = 48 * 1024 * 1024;
const MIME = { ".avif": "image/avif", ".bmp": "image/bmp", ".gif": "image/gif", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp" };
const validateSource = (source) => {
  if (!source || typeof source.html !== "string" || !source.html.trim()) throw new Error("HTML source is empty");
  if (source.html.length > MAX_SOURCE_HTML) throw new Error("HTML source is too large");
};
const embedStagedImages = async (source, directory) => {
  let html = source.html;
  const files = await fs.readdir(directory).catch(() => []);
  for (const file of files) {
    if (!/^image-\d{4}\./.test(file)) continue;
    const bytes = await fs.readFile(node_path.join(directory, file));
    const mime = MIME[node_path.extname(file).toLowerCase()] || "application/octet-stream";
    html = html.split(`./${file}`).join(`data:${mime};base64,${bytes.toString("base64")}`);
  }
  return { ...source, html };
};
function createHtmlExportService({ getMainWindow: getMainWindow2 }) {
  const previews = /* @__PURE__ */ new Map();
  const trackedSenders = /* @__PURE__ */ new WeakSet();
  const trackSender = (sender) => {
    if (trackedSenders.has(sender)) return;
    trackedSenders.add(sender);
    const senderId = sender.id;
    sender.once("destroyed", () => {
      previews.delete(senderId);
      tasks.cancel(senderId);
    });
  };
  const render = async ({ source, options }, signal) => {
    validateSource(source);
    const tempDir = node_path.join(electron.app.getPath("temp"), `horsemd-html-preview-${node_crypto.randomUUID()}`);
    await fs.mkdir(tempDir, { recursive: true });
    try {
      const prepared = await stagePdfImages(source, {
        assetsDir: tempDir,
        fetchImpl: (url, init) => electron.net.fetch(url, init),
        signal,
        maximumTotalBytes: MAX_EMBEDDED_IMAGE_BYTES
      });
      if (signal.aborted) throw new Error("HTML preview canceled");
      const embedded = await embedStagedImages(prepared.source, tempDir);
      return {
        html: buildHtmlDocument(embedded, options),
        warnings: {
          stagedImages: prepared.stagedImages,
          unresolvedImages: prepared.unresolvedImages
        }
      };
    } finally {
      fs.rm(tempDir, { recursive: true, force: true }).catch(() => {
      });
    }
  };
  const tasks = createLatestTaskRunner(render);
  const createPreview = async (event, { source, options, defaultName, sourcePath } = {}) => {
    trackSender(event.sender);
    const result = await tasks.run(event.sender.id, { source, options });
    if (result.stale) return { ok: false, stale: true };
    const token = node_crypto.randomUUID();
    previews.set(event.sender.id, {
      token,
      html: result.value.html,
      defaultName: String(defaultName || "Untitled.html"),
      sourcePath: typeof sourcePath === "string" ? sourcePath : ""
    });
    return { ok: true, token, html: result.value.html, warnings: result.value.warnings };
  };
  const savePreview = async (event, { token } = {}) => {
    const preview = previews.get(event.sender.id);
    if (!preview || preview.token !== token) return { ok: false, error: "HTML preview expired" };
    const fileName = preview.defaultName || "Untitled.html";
    const startDir = await getSaveDirFor(preview.sourcePath);
    const result = await electron.dialog.showSaveDialog(getMainWindow2(), {
      defaultPath: startDir ? node_path.join(startDir, fileName) : fileName,
      filters: [{ name: "HTML", extensions: ["html"] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await fs.writeFile(result.filePath, preview.html, "utf8");
    await recordSaveDir(preview.sourcePath, node_path.dirname(result.filePath));
    await electron.shell.openPath(result.filePath);
    return { path: result.filePath };
  };
  const disposePreview = (event, token) => {
    const preview = previews.get(event.sender.id);
    if (!preview || token && preview.token !== token) return false;
    previews.delete(event.sender.id);
    return true;
  };
  return { createPreview, savePreview, disposePreview };
}
function registerDocumentIpc(ipcMain, { getMainWindow: getMainWindow2, getUserDataPath, markdownExtensions, isTrustedSender }) {
  const pdfExport = createPdfExportService({ getMainWindow: getMainWindow2 });
  const htmlExport = createHtmlExportService({ getMainWindow: getMainWindow2 });
  const pandocExport = createPandocExportService({ getMainWindow: getMainWindow2, getUserDataPath });
  const trusted = (event) => !isTrustedSender || isTrustedSender(event);
  ipcMain.handle("dialog:openFiles", async () => {
    const res = await electron.dialog.showOpenDialog(getMainWindow2(), {
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Markdown", extensions: markdownExtensions },
        { name: "All Files", extensions: ["*"] }
      ]
    });
    return res.canceled ? [] : res.filePaths;
  });
  ipcMain.handle("dialog:openAttachments", async () => {
    const res = await electron.dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      title: "Attach Files"
    });
    return res.canceled ? [] : res.filePaths;
  });
  ipcMain.handle("dialog:openFolder", async () => {
    const res = await electron.dialog.showOpenDialog(getMainWindow2(), { properties: ["openDirectory"] });
    return res.canceled ? null : res.filePaths[0];
  });
  ipcMain.handle("dialog:saveAs", async (_event, defaultName, opts) => {
    if (process.env.HORSEMD_TEST_SAVE_AS_DIR) {
      return node_path.join(process.env.HORSEMD_TEST_SAVE_AS_DIR, defaultName || "Untitled.md");
    }
    const res = await electron.dialog.showSaveDialog(getMainWindow2(), {
      defaultPath: defaultName || "Untitled.md",
      filters: opts?.filters || [{ name: "Markdown", extensions: ["md", "markdown"] }]
    });
    return res.canceled ? null : res.filePath;
  });
  ipcMain.handle("pdf:preview", (event, payload) => trusted(event) ? pdfExport.createPreview(event, payload) : { ok: false, error: "Untrusted renderer." });
  ipcMain.handle("pdf:savePreview", (event, payload) => trusted(event) ? pdfExport.savePreview(event, payload) : { ok: false, error: "Untrusted renderer." });
  ipcMain.handle("pdf:disposePreview", (event, token) => trusted(event) ? pdfExport.disposePreview(event, token) : false);
  ipcMain.handle("html:preview", (event, payload) => trusted(event) ? htmlExport.createPreview(event, payload) : { ok: false, error: "Untrusted renderer." });
  ipcMain.handle("html:savePreview", (event, payload) => trusted(event) ? htmlExport.savePreview(event, payload) : { ok: false, error: "Untrusted renderer." });
  ipcMain.handle("html:disposePreview", (event, token) => trusted(event) ? htmlExport.disposePreview(event, token) : false);
  ipcMain.handle("pandoc:detect", (event) => trusted(event) ? pandocExport.detect() : { available: false, path: null, version: null, error: "Untrusted renderer." });
  ipcMain.handle("pandoc:selectExecutable", (event) => trusted(event) ? pandocExport.chooseExecutable() : { ok: false, error: "Untrusted renderer." });
  ipcMain.handle("pandoc:export", (event, payload) => trusted(event) ? pandocExport.exportDocument(payload) : { ok: false, error: "Untrusted renderer." });
}
const IGNORED_DIRS = /* @__PURE__ */ new Set([".git", "node_modules", ".DS_Store", ".obsidian", ".horsemd", "out", "dist"]);
const MAX_DIR_ENTRIES = 2e3;
async function readDirectoryTree(dir, { showHidden = false, markdownPattern } = {}) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const nodes = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") && !showHidden && entry.name !== ".gitignore") continue;
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;
    const full = node_path.join(dir, entry.name);
    if (entry.isDirectory()) {
      nodes.push({ name: entry.name, path: full, type: "dir", children: null });
    } else if (entry.isFile() && (!markdownPattern || markdownPattern.test(entry.name))) {
      nodes.push({ name: entry.name, path: full, type: "file" });
    }
  }
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return nodes.length > MAX_DIR_ENTRIES ? nodes.slice(0, MAX_DIR_ENTRIES) : nodes;
}
async function collectMarkdownFiles(root, dir, acc, depth, options) {
  if (depth > 12 || acc.length >= 5e3) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") && !options.showHidden) continue;
    const full = node_path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      await collectMarkdownFiles(root, full, acc, depth + 1, options);
    } else if (entry.isFile() && (!options.markdownPattern || options.markdownPattern.test(entry.name))) {
      if (acc.length >= 5e3) return;
      acc.push({
        name: entry.name,
        path: full,
        rel: full.slice(root.length + 1).replace(/\\/g, "/")
      });
    }
  }
}
async function listMarkdownFiles(root, options = {}) {
  const acc = [];
  await collectMarkdownFiles(root, root, acc, 0, {
    showHidden: false,
    ...options
  });
  return acc;
}
function nextDuplicatePath(path, pathExists = node_fs.existsSync) {
  const dir = node_path.dirname(path);
  const ext = node_path.extname(path);
  const stem = node_path.basename(path, ext);
  let target = node_path.join(dir, `${stem} copy${ext}`);
  let index = 2;
  while (pathExists(target)) target = node_path.join(dir, `${stem} copy ${index++}${ext}`);
  return target;
}
async function classifyFileSystemPaths(paths, { stat = fs.stat } = {}) {
  if (!Array.isArray(paths)) return [];
  const seen = /* @__PURE__ */ new Set();
  const classified = [];
  for (const path of paths.slice(0, 200)) {
    if (typeof path !== "string" || !path || seen.has(path)) continue;
    seen.add(path);
    try {
      const entry = await stat(path);
      if (entry.isDirectory()) classified.push({ path, type: "dir" });
      else if (entry.isFile()) classified.push({ path, type: "file" });
    } catch {
    }
  }
  return classified;
}
function registerFileSystemIpc(ipcMain, { shell, markdownPattern }) {
  let showHidden = false;
  ipcMain.handle("fs:readFile", async (_event, path) => {
    const buf = await fs.readFile(path);
    const head = buf.subarray(0, 8192);
    for (let i = 0; i < head.length; i++) {
      if (head[i] === 0) throw new Error("ERR_BINARY_FILE");
    }
    const content = buf.toString("utf8");
    const stat = await fs.stat(path);
    return { content, mtimeMs: stat.mtimeMs };
  });
  ipcMain.handle("fs:writeFile", async (_event, path, content) => {
    await fs.writeFile(path, content, "utf8");
    const stat = await fs.stat(path);
    return { mtimeMs: stat.mtimeMs };
  });
  ipcMain.handle("fs:writeBinary", async (_event, path, base64) => {
    await fs.writeFile(path, Buffer.from(String(base64 || ""), "base64"));
    const stat = await fs.stat(path);
    return { mtimeMs: stat.mtimeMs };
  });
  ipcMain.handle("fs:rename", async (_event, oldPath, newPath) => {
    if (node_fs.existsSync(newPath) && newPath.toLowerCase() !== oldPath.toLowerCase()) {
      throw new Error("A file or folder with that name already exists.");
    }
    await fs.rename(oldPath, newPath);
    return true;
  });
  ipcMain.handle("fs:delete", async (_event, path) => {
    await shell.trashItem(path);
    return true;
  });
  ipcMain.handle("fs:createFile", async (_event, path, content = "") => {
    await fs.writeFile(path, content, { flag: "wx" });
    return true;
  });
  ipcMain.handle("fs:createDir", async (_event, path) => {
    await fs.mkdir(path, { recursive: true });
    return true;
  });
  ipcMain.handle("settings:setShowHidden", (_event, value) => {
    showHidden = Boolean(value);
    return true;
  });
  ipcMain.handle(
    "fs:readDir",
    async (_event, dir) => readDirectoryTree(dir, { showHidden, markdownPattern })
  );
  ipcMain.handle(
    "fs:listFiles",
    async (_event, root) => listMarkdownFiles(root, { showHidden, markdownPattern })
  );
  ipcMain.handle("fs:openFolderTree", async (_event, dir) => ({
    root: { name: node_path.basename(dir), path: dir, type: "dir" },
    children: await readDirectoryTree(dir, { showHidden, markdownPattern })
  }));
  ipcMain.handle(
    "fs:classifyPaths",
    async (_event, paths) => classifyFileSystemPaths(paths)
  );
  ipcMain.handle("fs:duplicate", async (_event, path) => {
    const target = nextDuplicatePath(path);
    await fs.copyFile(path, target, node_fs.constants.COPYFILE_EXCL);
    return target;
  });
}
const EntryTypes = {
  FILE_TYPE: "files",
  DIR_TYPE: "directories",
  FILE_DIR_TYPE: "files_directories",
  EVERYTHING_TYPE: "all"
};
const defaultOptions$2 = {
  root: ".",
  fileFilter: (_entryInfo) => true,
  directoryFilter: (_entryInfo) => true,
  type: EntryTypes.FILE_TYPE,
  lstat: false,
  depth: 2147483648,
  alwaysStat: false,
  highWaterMark: 4096
};
Object.freeze(defaultOptions$2);
const RECURSIVE_ERROR_CODE = "READDIRP_RECURSIVE_ERROR";
const NORMAL_FLOW_ERRORS = /* @__PURE__ */ new Set(["ENOENT", "EPERM", "EACCES", "ELOOP", RECURSIVE_ERROR_CODE]);
const ALL_TYPES = [
  EntryTypes.DIR_TYPE,
  EntryTypes.EVERYTHING_TYPE,
  EntryTypes.FILE_DIR_TYPE,
  EntryTypes.FILE_TYPE
];
const DIR_TYPES = /* @__PURE__ */ new Set([
  EntryTypes.DIR_TYPE,
  EntryTypes.EVERYTHING_TYPE,
  EntryTypes.FILE_DIR_TYPE
]);
const FILE_TYPES = /* @__PURE__ */ new Set([
  EntryTypes.EVERYTHING_TYPE,
  EntryTypes.FILE_DIR_TYPE,
  EntryTypes.FILE_TYPE
]);
const isNormalFlowError = (error) => NORMAL_FLOW_ERRORS.has(error.code);
const wantBigintFsStats = process.platform === "win32";
const emptyFn = (_entryInfo) => true;
const normalizeFilter = (filter) => {
  if (filter === void 0)
    return emptyFn;
  if (typeof filter === "function")
    return filter;
  if (typeof filter === "string") {
    const fl = filter.trim();
    return (entry) => entry.basename === fl;
  }
  if (Array.isArray(filter)) {
    const trItems = filter.map((item) => item.trim());
    return (entry) => trItems.some((f) => entry.basename === f);
  }
  return emptyFn;
};
class ReaddirpStream extends node_stream.Readable {
  constructor(options = {}) {
    super({
      objectMode: true,
      autoDestroy: true,
      highWaterMark: options.highWaterMark
    });
    const opts = { ...defaultOptions$2, ...options };
    const { root, type } = opts;
    this._fileFilter = normalizeFilter(opts.fileFilter);
    this._directoryFilter = normalizeFilter(opts.directoryFilter);
    const statMethod = opts.lstat ? fs.lstat : fs.stat;
    if (wantBigintFsStats) {
      this._stat = (path) => statMethod(path, { bigint: true });
    } else {
      this._stat = statMethod;
    }
    this._maxDepth = opts.depth ?? defaultOptions$2.depth;
    this._wantsDir = type ? DIR_TYPES.has(type) : false;
    this._wantsFile = type ? FILE_TYPES.has(type) : false;
    this._wantsEverything = type === EntryTypes.EVERYTHING_TYPE;
    this._root = node_path.resolve(root);
    this._isDirent = !opts.alwaysStat;
    this._statsProp = this._isDirent ? "dirent" : "stats";
    this._rdOptions = { encoding: "utf8", withFileTypes: this._isDirent };
    this.parents = [this._exploreDir(root, 1)];
    this.reading = false;
    this.parent = void 0;
  }
  async _read(batch) {
    if (this.reading)
      return;
    this.reading = true;
    try {
      while (!this.destroyed && batch > 0) {
        const par = this.parent;
        const fil = par && par.files;
        if (fil && fil.length > 0) {
          const { path, depth } = par;
          const slice = fil.splice(0, batch).map((dirent) => this._formatEntry(dirent, path));
          const awaited = await Promise.all(slice);
          for (const entry of awaited) {
            if (!entry)
              continue;
            if (this.destroyed)
              return;
            const entryType = await this._getEntryType(entry);
            if (entryType === "directory" && this._directoryFilter(entry)) {
              if (depth <= this._maxDepth) {
                this.parents.push(this._exploreDir(entry.fullPath, depth + 1));
              }
              if (this._wantsDir) {
                this.push(entry);
                batch--;
              }
            } else if ((entryType === "file" || this._includeAsFile(entry)) && this._fileFilter(entry)) {
              if (this._wantsFile) {
                this.push(entry);
                batch--;
              }
            }
          }
        } else {
          const parent = this.parents.pop();
          if (!parent) {
            this.push(null);
            break;
          }
          this.parent = await parent;
          if (this.destroyed)
            return;
        }
      }
    } catch (error) {
      this.destroy(error);
    } finally {
      this.reading = false;
    }
  }
  async _exploreDir(path, depth) {
    let files;
    try {
      files = await fs.readdir(path, this._rdOptions);
    } catch (error) {
      this._onError(error);
    }
    return { files, depth, path };
  }
  async _formatEntry(dirent, path) {
    let entry;
    const basename = this._isDirent ? dirent.name : dirent;
    try {
      const fullPath = node_path.resolve(node_path.join(path, basename));
      entry = { path: node_path.relative(this._root, fullPath), fullPath, basename };
      entry[this._statsProp] = this._isDirent ? dirent : await this._stat(fullPath);
    } catch (err) {
      this._onError(err);
      return;
    }
    return entry;
  }
  _onError(err) {
    if (isNormalFlowError(err) && !this.destroyed) {
      this.emit("warn", err);
    } else {
      this.destroy(err);
    }
  }
  async _getEntryType(entry) {
    if (!entry && this._statsProp in entry) {
      return "";
    }
    const stats = entry[this._statsProp];
    if (stats.isFile())
      return "file";
    if (stats.isDirectory())
      return "directory";
    if (stats && stats.isSymbolicLink()) {
      const full = entry.fullPath;
      try {
        const entryRealPath = await fs.realpath(full);
        const entryRealPathStats = await fs.lstat(entryRealPath);
        if (entryRealPathStats.isFile()) {
          return "file";
        }
        if (entryRealPathStats.isDirectory()) {
          const len = entryRealPath.length;
          if (full.startsWith(entryRealPath) && full.substr(len, 1) === node_path.sep) {
            const recursiveError = new Error(`Circular symlink detected: "${full}" points to "${entryRealPath}"`);
            recursiveError.code = RECURSIVE_ERROR_CODE;
            return this._onError(recursiveError);
          }
          return "directory";
        }
      } catch (error) {
        this._onError(error);
        return "";
      }
    }
  }
  _includeAsFile(entry) {
    const stats = entry && entry[this._statsProp];
    return stats && this._wantsEverything && !stats.isDirectory();
  }
}
function readdirp(root, options = {}) {
  let type = options.entryType || options.type;
  if (type === "both")
    type = EntryTypes.FILE_DIR_TYPE;
  if (type)
    options.type = type;
  if (!root) {
    throw new Error("readdirp: root argument is required. Usage: readdirp(root, options)");
  } else if (typeof root !== "string") {
    throw new TypeError("readdirp: root argument must be a string. Usage: readdirp(root, options)");
  } else if (type && !ALL_TYPES.includes(type)) {
    throw new Error(`readdirp: Invalid type passed. Use one of ${ALL_TYPES.join(", ")}`);
  }
  options.root = root;
  return new ReaddirpStream(options);
}
const STR_DATA = "data";
const STR_END = "end";
const STR_CLOSE = "close";
const EMPTY_FN = () => {
};
const pl = process.platform;
const isWindows = pl === "win32";
const isMacos = pl === "darwin";
const isLinux = pl === "linux";
const isFreeBSD = pl === "freebsd";
const isIBMi = os.type() === "OS400";
const EVENTS = {
  ALL: "all",
  READY: "ready",
  ADD: "add",
  CHANGE: "change",
  ADD_DIR: "addDir",
  UNLINK: "unlink",
  UNLINK_DIR: "unlinkDir",
  RAW: "raw",
  ERROR: "error"
};
const EV = EVENTS;
const THROTTLE_MODE_WATCH = "watch";
const statMethods = { lstat: promises.lstat, stat: promises.stat };
const KEY_LISTENERS = "listeners";
const KEY_ERR = "errHandlers";
const KEY_RAW = "rawEmitters";
const HANDLER_KEYS = [KEY_LISTENERS, KEY_ERR, KEY_RAW];
const binaryExtensions = /* @__PURE__ */ new Set([
  "3dm",
  "3ds",
  "3g2",
  "3gp",
  "7z",
  "a",
  "aac",
  "adp",
  "afdesign",
  "afphoto",
  "afpub",
  "ai",
  "aif",
  "aiff",
  "alz",
  "ape",
  "apk",
  "appimage",
  "ar",
  "arj",
  "asf",
  "au",
  "avi",
  "bak",
  "baml",
  "bh",
  "bin",
  "bk",
  "bmp",
  "btif",
  "bz2",
  "bzip2",
  "cab",
  "caf",
  "cgm",
  "class",
  "cmx",
  "cpio",
  "cr2",
  "cur",
  "dat",
  "dcm",
  "deb",
  "dex",
  "djvu",
  "dll",
  "dmg",
  "dng",
  "doc",
  "docm",
  "docx",
  "dot",
  "dotm",
  "dra",
  "DS_Store",
  "dsk",
  "dts",
  "dtshd",
  "dvb",
  "dwg",
  "dxf",
  "ecelp4800",
  "ecelp7470",
  "ecelp9600",
  "egg",
  "eol",
  "eot",
  "epub",
  "exe",
  "f4v",
  "fbs",
  "fh",
  "fla",
  "flac",
  "flatpak",
  "fli",
  "flv",
  "fpx",
  "fst",
  "fvt",
  "g3",
  "gh",
  "gif",
  "graffle",
  "gz",
  "gzip",
  "h261",
  "h263",
  "h264",
  "icns",
  "ico",
  "ief",
  "img",
  "ipa",
  "iso",
  "jar",
  "jpeg",
  "jpg",
  "jpgv",
  "jpm",
  "jxr",
  "key",
  "ktx",
  "lha",
  "lib",
  "lvp",
  "lz",
  "lzh",
  "lzma",
  "lzo",
  "m3u",
  "m4a",
  "m4v",
  "mar",
  "mdi",
  "mht",
  "mid",
  "midi",
  "mj2",
  "mka",
  "mkv",
  "mmr",
  "mng",
  "mobi",
  "mov",
  "movie",
  "mp3",
  "mp4",
  "mp4a",
  "mpeg",
  "mpg",
  "mpga",
  "mxu",
  "nef",
  "npx",
  "numbers",
  "nupkg",
  "o",
  "odp",
  "ods",
  "odt",
  "oga",
  "ogg",
  "ogv",
  "otf",
  "ott",
  "pages",
  "pbm",
  "pcx",
  "pdb",
  "pdf",
  "pea",
  "pgm",
  "pic",
  "png",
  "pnm",
  "pot",
  "potm",
  "potx",
  "ppa",
  "ppam",
  "ppm",
  "pps",
  "ppsm",
  "ppsx",
  "ppt",
  "pptm",
  "pptx",
  "psd",
  "pya",
  "pyc",
  "pyo",
  "pyv",
  "qt",
  "rar",
  "ras",
  "raw",
  "resources",
  "rgb",
  "rip",
  "rlc",
  "rmf",
  "rmvb",
  "rpm",
  "rtf",
  "rz",
  "s3m",
  "s7z",
  "scpt",
  "sgi",
  "shar",
  "snap",
  "sil",
  "sketch",
  "slk",
  "smv",
  "snk",
  "so",
  "stl",
  "suo",
  "sub",
  "swf",
  "tar",
  "tbz",
  "tbz2",
  "tga",
  "tgz",
  "thmx",
  "tif",
  "tiff",
  "tlz",
  "ttc",
  "ttf",
  "txz",
  "udf",
  "uvh",
  "uvi",
  "uvm",
  "uvp",
  "uvs",
  "uvu",
  "viv",
  "vob",
  "war",
  "wav",
  "wax",
  "wbmp",
  "wdp",
  "weba",
  "webm",
  "webp",
  "whl",
  "wim",
  "wm",
  "wma",
  "wmv",
  "wmx",
  "woff",
  "woff2",
  "wrm",
  "wvx",
  "xbm",
  "xif",
  "xla",
  "xlam",
  "xls",
  "xlsb",
  "xlsm",
  "xlsx",
  "xlt",
  "xltm",
  "xltx",
  "xm",
  "xmind",
  "xpi",
  "xpm",
  "xwd",
  "xz",
  "z",
  "zip",
  "zipx"
]);
const isBinaryPath = (filePath2) => binaryExtensions.has(sysPath__namespace.extname(filePath2).slice(1).toLowerCase());
const foreach = (val, fn) => {
  if (val instanceof Set) {
    val.forEach(fn);
  } else {
    fn(val);
  }
};
const addAndConvert = (main, prop, item) => {
  let container = main[prop];
  if (!(container instanceof Set)) {
    main[prop] = container = /* @__PURE__ */ new Set([container]);
  }
  container.add(item);
};
const clearItem = (cont) => (key) => {
  const set = cont[key];
  if (set instanceof Set) {
    set.clear();
  } else {
    delete cont[key];
  }
};
const delFromSet = (main, prop, item) => {
  const container = main[prop];
  if (container instanceof Set) {
    container.delete(item);
  } else if (container === item) {
    delete main[prop];
  }
};
const isEmptySet = (val) => val instanceof Set ? val.size === 0 : !val;
const FsWatchInstances = /* @__PURE__ */ new Map();
function createFsWatchInstance(path, options, listener, errHandler, emitRaw) {
  const handleEvent = (rawEvent, evPath) => {
    listener(path);
    emitRaw(rawEvent, evPath, { watchedPath: path });
    if (evPath && path !== evPath) {
      fsWatchBroadcast(sysPath__namespace.resolve(path, evPath), KEY_LISTENERS, sysPath__namespace.join(path, evPath));
    }
  };
  try {
    return fs$1.watch(path, {
      persistent: options.persistent
    }, handleEvent);
  } catch (error) {
    errHandler(error);
    return void 0;
  }
}
const fsWatchBroadcast = (fullPath, listenerType, val1, val2, val3) => {
  const cont = FsWatchInstances.get(fullPath);
  if (!cont)
    return;
  foreach(cont[listenerType], (listener) => {
    listener(val1, val2, val3);
  });
};
const setFsWatchListener = (path, fullPath, options, handlers) => {
  const { listener, errHandler, rawEmitter } = handlers;
  let cont = FsWatchInstances.get(fullPath);
  let watcher;
  if (!options.persistent) {
    watcher = createFsWatchInstance(path, options, listener, errHandler, rawEmitter);
    if (!watcher)
      return;
    return watcher.close.bind(watcher);
  }
  if (cont) {
    addAndConvert(cont, KEY_LISTENERS, listener);
    addAndConvert(cont, KEY_ERR, errHandler);
    addAndConvert(cont, KEY_RAW, rawEmitter);
  } else {
    watcher = createFsWatchInstance(
      path,
      options,
      fsWatchBroadcast.bind(null, fullPath, KEY_LISTENERS),
      errHandler,
      // no need to use broadcast here
      fsWatchBroadcast.bind(null, fullPath, KEY_RAW)
    );
    if (!watcher)
      return;
    watcher.on(EV.ERROR, async (error) => {
      const broadcastErr = fsWatchBroadcast.bind(null, fullPath, KEY_ERR);
      if (cont)
        cont.watcherUnusable = true;
      if (isWindows && error.code === "EPERM") {
        try {
          const fd = await promises.open(path, "r");
          await fd.close();
          broadcastErr(error);
        } catch (err) {
        }
      } else {
        broadcastErr(error);
      }
    });
    cont = {
      listeners: listener,
      errHandlers: errHandler,
      rawEmitters: rawEmitter,
      watcher
    };
    FsWatchInstances.set(fullPath, cont);
  }
  return () => {
    delFromSet(cont, KEY_LISTENERS, listener);
    delFromSet(cont, KEY_ERR, errHandler);
    delFromSet(cont, KEY_RAW, rawEmitter);
    if (isEmptySet(cont.listeners)) {
      cont.watcher.close();
      FsWatchInstances.delete(fullPath);
      HANDLER_KEYS.forEach(clearItem(cont));
      cont.watcher = void 0;
      Object.freeze(cont);
    }
  };
};
const FsWatchFileInstances = /* @__PURE__ */ new Map();
const setFsWatchFileListener = (path, fullPath, options, handlers) => {
  const { listener, rawEmitter } = handlers;
  let cont = FsWatchFileInstances.get(fullPath);
  const copts = cont && cont.options;
  if (copts && (copts.persistent < options.persistent || copts.interval > options.interval)) {
    fs$1.unwatchFile(fullPath);
    cont = void 0;
  }
  if (cont) {
    addAndConvert(cont, KEY_LISTENERS, listener);
    addAndConvert(cont, KEY_RAW, rawEmitter);
  } else {
    cont = {
      listeners: listener,
      rawEmitters: rawEmitter,
      options,
      watcher: fs$1.watchFile(fullPath, options, (curr, prev) => {
        foreach(cont.rawEmitters, (rawEmitter2) => {
          rawEmitter2(EV.CHANGE, fullPath, { curr, prev });
        });
        const currmtime = curr.mtimeMs;
        if (curr.size !== prev.size || currmtime > prev.mtimeMs || currmtime === 0) {
          foreach(cont.listeners, (listener2) => listener2(path, curr));
        }
      })
    };
    FsWatchFileInstances.set(fullPath, cont);
  }
  return () => {
    delFromSet(cont, KEY_LISTENERS, listener);
    delFromSet(cont, KEY_RAW, rawEmitter);
    if (isEmptySet(cont.listeners)) {
      FsWatchFileInstances.delete(fullPath);
      fs$1.unwatchFile(fullPath);
      cont.options = cont.watcher = void 0;
      Object.freeze(cont);
    }
  };
};
class NodeFsHandler {
  constructor(fsW) {
    this.fsw = fsW;
    this._boundHandleError = (error) => fsW._handleError(error);
  }
  /**
   * Watch file for changes with fs_watchFile or fs_watch.
   * @param path to file or dir
   * @param listener on fs change
   * @returns closer for the watcher instance
   */
  _watchWithNodeFs(path, listener) {
    const opts = this.fsw.options;
    const directory = sysPath__namespace.dirname(path);
    const basename = sysPath__namespace.basename(path);
    const parent = this.fsw._getWatchedDir(directory);
    parent.add(basename);
    const absolutePath = sysPath__namespace.resolve(path);
    const options = {
      persistent: opts.persistent
    };
    if (!listener)
      listener = EMPTY_FN;
    let closer;
    if (opts.usePolling) {
      const enableBin = opts.interval !== opts.binaryInterval;
      options.interval = enableBin && isBinaryPath(basename) ? opts.binaryInterval : opts.interval;
      closer = setFsWatchFileListener(path, absolutePath, options, {
        listener,
        rawEmitter: this.fsw._emitRaw
      });
    } else {
      closer = setFsWatchListener(path, absolutePath, options, {
        listener,
        errHandler: this._boundHandleError,
        rawEmitter: this.fsw._emitRaw
      });
    }
    return closer;
  }
  /**
   * Watch a file and emit add event if warranted.
   * @returns closer for the watcher instance
   */
  _handleFile(file, stats, initialAdd) {
    if (this.fsw.closed) {
      return;
    }
    const dirname = sysPath__namespace.dirname(file);
    const basename = sysPath__namespace.basename(file);
    const parent = this.fsw._getWatchedDir(dirname);
    let prevStats = stats;
    if (parent.has(basename))
      return;
    const listener = async (path, newStats) => {
      if (!this.fsw._throttle(THROTTLE_MODE_WATCH, file, 5))
        return;
      if (!newStats || newStats.mtimeMs === 0) {
        try {
          const newStats2 = await promises.stat(file);
          if (this.fsw.closed)
            return;
          const at = newStats2.atimeMs;
          const mt = newStats2.mtimeMs;
          if (!at || at <= mt || mt !== prevStats.mtimeMs) {
            this.fsw._emit(EV.CHANGE, file, newStats2);
          }
          if ((isMacos || isLinux || isFreeBSD) && prevStats.ino !== newStats2.ino) {
            this.fsw._closeFile(path);
            prevStats = newStats2;
            const closer2 = this._watchWithNodeFs(file, listener);
            if (closer2)
              this.fsw._addPathCloser(path, closer2);
          } else {
            prevStats = newStats2;
          }
        } catch (error) {
          this.fsw._remove(dirname, basename);
        }
      } else if (parent.has(basename)) {
        const at = newStats.atimeMs;
        const mt = newStats.mtimeMs;
        if (!at || at <= mt || mt !== prevStats.mtimeMs) {
          this.fsw._emit(EV.CHANGE, file, newStats);
        }
        prevStats = newStats;
      }
    };
    const closer = this._watchWithNodeFs(file, listener);
    if (!(initialAdd && this.fsw.options.ignoreInitial) && this.fsw._isntIgnored(file)) {
      if (!this.fsw._throttle(EV.ADD, file, 0))
        return;
      this.fsw._emit(EV.ADD, file, stats);
    }
    return closer;
  }
  /**
   * Handle symlinks encountered while reading a dir.
   * @param entry returned by readdirp
   * @param directory path of dir being read
   * @param path of this item
   * @param item basename of this item
   * @returns true if no more processing is needed for this entry.
   */
  async _handleSymlink(entry, directory, path, item) {
    if (this.fsw.closed) {
      return;
    }
    const full = entry.fullPath;
    const dir = this.fsw._getWatchedDir(directory);
    if (!this.fsw.options.followSymlinks) {
      this.fsw._incrReadyCount();
      let linkPath;
      try {
        linkPath = await promises.realpath(path);
      } catch (e) {
        this.fsw._emitReady();
        return true;
      }
      if (this.fsw.closed)
        return;
      if (dir.has(item)) {
        if (this.fsw._symlinkPaths.get(full) !== linkPath) {
          this.fsw._symlinkPaths.set(full, linkPath);
          this.fsw._emit(EV.CHANGE, path, entry.stats);
        }
      } else {
        dir.add(item);
        this.fsw._symlinkPaths.set(full, linkPath);
        this.fsw._emit(EV.ADD, path, entry.stats);
      }
      this.fsw._emitReady();
      return true;
    }
    if (this.fsw._symlinkPaths.has(full)) {
      return true;
    }
    this.fsw._symlinkPaths.set(full, true);
  }
  _handleRead(directory, initialAdd, wh, target, dir, depth, throttler) {
    directory = sysPath__namespace.join(directory, "");
    throttler = this.fsw._throttle("readdir", directory, 1e3);
    if (!throttler)
      return;
    const previous = this.fsw._getWatchedDir(wh.path);
    const current = /* @__PURE__ */ new Set();
    let stream = this.fsw._readdirp(directory, {
      fileFilter: (entry) => wh.filterPath(entry),
      directoryFilter: (entry) => wh.filterDir(entry)
    });
    if (!stream)
      return;
    stream.on(STR_DATA, async (entry) => {
      if (this.fsw.closed) {
        stream = void 0;
        return;
      }
      const item = entry.path;
      let path = sysPath__namespace.join(directory, item);
      current.add(item);
      if (entry.stats.isSymbolicLink() && await this._handleSymlink(entry, directory, path, item)) {
        return;
      }
      if (this.fsw.closed) {
        stream = void 0;
        return;
      }
      if (item === target || !target && !previous.has(item)) {
        this.fsw._incrReadyCount();
        path = sysPath__namespace.join(dir, sysPath__namespace.relative(dir, path));
        this._addToNodeFs(path, initialAdd, wh, depth + 1);
      }
    }).on(EV.ERROR, this._boundHandleError);
    return new Promise((resolve, reject) => {
      if (!stream)
        return reject();
      stream.once(STR_END, () => {
        if (this.fsw.closed) {
          stream = void 0;
          return;
        }
        const wasThrottled = throttler ? throttler.clear() : false;
        resolve(void 0);
        previous.getChildren().filter((item) => {
          return item !== directory && !current.has(item);
        }).forEach((item) => {
          this.fsw._remove(directory, item);
        });
        stream = void 0;
        if (wasThrottled)
          this._handleRead(directory, false, wh, target, dir, depth, throttler);
      });
    });
  }
  /**
   * Read directory to add / remove files from `@watched` list and re-read it on change.
   * @param dir fs path
   * @param stats
   * @param initialAdd
   * @param depth relative to user-supplied path
   * @param target child path targeted for watch
   * @param wh Common watch helpers for this path
   * @param realpath
   * @returns closer for the watcher instance.
   */
  async _handleDir(dir, stats, initialAdd, depth, target, wh, realpath) {
    const parentDir = this.fsw._getWatchedDir(sysPath__namespace.dirname(dir));
    const tracked = parentDir.has(sysPath__namespace.basename(dir));
    if (!(initialAdd && this.fsw.options.ignoreInitial) && !target && !tracked) {
      this.fsw._emit(EV.ADD_DIR, dir, stats);
    }
    parentDir.add(sysPath__namespace.basename(dir));
    this.fsw._getWatchedDir(dir);
    let throttler;
    let closer;
    const oDepth = this.fsw.options.depth;
    if ((oDepth == null || depth <= oDepth) && !this.fsw._symlinkPaths.has(realpath)) {
      if (!target) {
        await this._handleRead(dir, initialAdd, wh, target, dir, depth, throttler);
        if (this.fsw.closed)
          return;
      }
      closer = this._watchWithNodeFs(dir, (dirPath, stats2) => {
        if (stats2 && stats2.mtimeMs === 0)
          return;
        this._handleRead(dirPath, false, wh, target, dir, depth, throttler);
      });
    }
    return closer;
  }
  /**
   * Handle added file, directory, or glob pattern.
   * Delegates call to _handleFile / _handleDir after checks.
   * @param path to file or ir
   * @param initialAdd was the file added at watch instantiation?
   * @param priorWh depth relative to user-supplied path
   * @param depth Child path actually targeted for watch
   * @param target Child path actually targeted for watch
   */
  async _addToNodeFs(path, initialAdd, priorWh, depth, target) {
    const ready = this.fsw._emitReady;
    if (this.fsw._isIgnored(path) || this.fsw.closed) {
      ready();
      return false;
    }
    const wh = this.fsw._getWatchHelpers(path);
    if (priorWh) {
      wh.filterPath = (entry) => priorWh.filterPath(entry);
      wh.filterDir = (entry) => priorWh.filterDir(entry);
    }
    try {
      const stats = await statMethods[wh.statMethod](wh.watchPath);
      if (this.fsw.closed)
        return;
      if (this.fsw._isIgnored(wh.watchPath, stats)) {
        ready();
        return false;
      }
      const follow = this.fsw.options.followSymlinks;
      let closer;
      if (stats.isDirectory()) {
        const absPath = sysPath__namespace.resolve(path);
        const targetPath = follow ? await promises.realpath(path) : path;
        if (this.fsw.closed)
          return;
        closer = await this._handleDir(wh.watchPath, stats, initialAdd, depth, target, wh, targetPath);
        if (this.fsw.closed)
          return;
        if (absPath !== targetPath && targetPath !== void 0) {
          this.fsw._symlinkPaths.set(absPath, targetPath);
        }
      } else if (stats.isSymbolicLink()) {
        const targetPath = follow ? await promises.realpath(path) : path;
        if (this.fsw.closed)
          return;
        const parent = sysPath__namespace.dirname(wh.watchPath);
        this.fsw._getWatchedDir(parent).add(wh.watchPath);
        this.fsw._emit(EV.ADD, wh.watchPath, stats);
        closer = await this._handleDir(parent, stats, initialAdd, depth, path, wh, targetPath);
        if (this.fsw.closed)
          return;
        if (targetPath !== void 0) {
          this.fsw._symlinkPaths.set(sysPath__namespace.resolve(path), targetPath);
        }
      } else {
        closer = this._handleFile(wh.watchPath, stats, initialAdd);
      }
      ready();
      if (closer)
        this.fsw._addPathCloser(path, closer);
      return false;
    } catch (error) {
      if (this.fsw._handleError(error)) {
        ready();
        return path;
      }
    }
  }
}
/*! chokidar - MIT License (c) 2012 Paul Miller (paulmillr.com) */
const SLASH = "/";
const SLASH_SLASH = "//";
const ONE_DOT = ".";
const TWO_DOTS = "..";
const STRING_TYPE = "string";
const BACK_SLASH_RE = /\\/g;
const DOUBLE_SLASH_RE = /\/\//;
const DOT_RE = /\..*\.(sw[px])$|~$|\.subl.*\.tmp/;
const REPLACER_RE = /^\.[/\\]/;
function arrify(item) {
  return Array.isArray(item) ? item : [item];
}
const isMatcherObject = (matcher) => typeof matcher === "object" && matcher !== null && !(matcher instanceof RegExp);
function createPattern(matcher) {
  if (typeof matcher === "function")
    return matcher;
  if (typeof matcher === "string")
    return (string) => matcher === string;
  if (matcher instanceof RegExp)
    return (string) => matcher.test(string);
  if (typeof matcher === "object" && matcher !== null) {
    return (string) => {
      if (matcher.path === string)
        return true;
      if (matcher.recursive) {
        const relative = sysPath__namespace.relative(matcher.path, string);
        if (!relative) {
          return false;
        }
        return !relative.startsWith("..") && !sysPath__namespace.isAbsolute(relative);
      }
      return false;
    };
  }
  return () => false;
}
function normalizePath$2(path) {
  if (typeof path !== "string")
    throw new Error("string expected");
  path = sysPath__namespace.normalize(path);
  path = path.replace(/\\/g, "/");
  let prepend = false;
  if (path.startsWith("//"))
    prepend = true;
  const DOUBLE_SLASH_RE2 = /\/\//;
  while (path.match(DOUBLE_SLASH_RE2))
    path = path.replace(DOUBLE_SLASH_RE2, "/");
  if (prepend)
    path = "/" + path;
  return path;
}
function matchPatterns(patterns, testString, stats) {
  const path = normalizePath$2(testString);
  for (let index = 0; index < patterns.length; index++) {
    const pattern = patterns[index];
    if (pattern(path, stats)) {
      return true;
    }
  }
  return false;
}
function anymatch(matchers, testString) {
  if (matchers == null) {
    throw new TypeError("anymatch: specify first argument");
  }
  const matchersArray = arrify(matchers);
  const patterns = matchersArray.map((matcher) => createPattern(matcher));
  {
    return (testString2, stats) => {
      return matchPatterns(patterns, testString2, stats);
    };
  }
}
const unifyPaths = (paths_) => {
  const paths = arrify(paths_).flat();
  if (!paths.every((p) => typeof p === STRING_TYPE)) {
    throw new TypeError(`Non-string provided as watch path: ${paths}`);
  }
  return paths.map(normalizePathToUnix);
};
const toUnix = (string) => {
  let str = string.replace(BACK_SLASH_RE, SLASH);
  let prepend = false;
  if (str.startsWith(SLASH_SLASH)) {
    prepend = true;
  }
  while (str.match(DOUBLE_SLASH_RE)) {
    str = str.replace(DOUBLE_SLASH_RE, SLASH);
  }
  if (prepend) {
    str = SLASH + str;
  }
  return str;
};
const normalizePathToUnix = (path) => toUnix(sysPath__namespace.normalize(toUnix(path)));
const normalizeIgnored = (cwd = "") => (path) => {
  if (typeof path === "string") {
    return normalizePathToUnix(sysPath__namespace.isAbsolute(path) ? path : sysPath__namespace.join(cwd, path));
  } else {
    return path;
  }
};
const getAbsolutePath = (path, cwd) => {
  if (sysPath__namespace.isAbsolute(path)) {
    return path;
  }
  return sysPath__namespace.join(cwd, path);
};
const EMPTY_SET = Object.freeze(/* @__PURE__ */ new Set());
class DirEntry {
  constructor(dir, removeWatcher) {
    this.path = dir;
    this._removeWatcher = removeWatcher;
    this.items = /* @__PURE__ */ new Set();
  }
  add(item) {
    const { items } = this;
    if (!items)
      return;
    if (item !== ONE_DOT && item !== TWO_DOTS)
      items.add(item);
  }
  async remove(item) {
    const { items } = this;
    if (!items)
      return;
    items.delete(item);
    if (items.size > 0)
      return;
    const dir = this.path;
    try {
      await promises.readdir(dir);
    } catch (err) {
      if (this._removeWatcher) {
        this._removeWatcher(sysPath__namespace.dirname(dir), sysPath__namespace.basename(dir));
      }
    }
  }
  has(item) {
    const { items } = this;
    if (!items)
      return;
    return items.has(item);
  }
  getChildren() {
    const { items } = this;
    if (!items)
      return [];
    return [...items.values()];
  }
  dispose() {
    this.items.clear();
    this.path = "";
    this._removeWatcher = EMPTY_FN;
    this.items = EMPTY_SET;
    Object.freeze(this);
  }
}
const STAT_METHOD_F = "stat";
const STAT_METHOD_L = "lstat";
class WatchHelper {
  constructor(path, follow, fsw) {
    this.fsw = fsw;
    const watchPath = path;
    this.path = path = path.replace(REPLACER_RE, "");
    this.watchPath = watchPath;
    this.fullWatchPath = sysPath__namespace.resolve(watchPath);
    this.dirParts = [];
    this.dirParts.forEach((parts) => {
      if (parts.length > 1)
        parts.pop();
    });
    this.followSymlinks = follow;
    this.statMethod = follow ? STAT_METHOD_F : STAT_METHOD_L;
  }
  entryPath(entry) {
    return sysPath__namespace.join(this.watchPath, sysPath__namespace.relative(this.watchPath, entry.fullPath));
  }
  filterPath(entry) {
    const { stats } = entry;
    if (stats && stats.isSymbolicLink())
      return this.filterDir(entry);
    const resolvedPath = this.entryPath(entry);
    return this.fsw._isntIgnored(resolvedPath, stats) && this.fsw._hasReadPermissions(stats);
  }
  filterDir(entry) {
    return this.fsw._isntIgnored(this.entryPath(entry), entry.stats);
  }
}
class FSWatcher extends events.EventEmitter {
  // Not indenting methods for history sake; for now.
  constructor(_opts = {}) {
    super();
    this.closed = false;
    this._closers = /* @__PURE__ */ new Map();
    this._ignoredPaths = /* @__PURE__ */ new Set();
    this._throttled = /* @__PURE__ */ new Map();
    this._streams = /* @__PURE__ */ new Set();
    this._symlinkPaths = /* @__PURE__ */ new Map();
    this._watched = /* @__PURE__ */ new Map();
    this._pendingWrites = /* @__PURE__ */ new Map();
    this._pendingUnlinks = /* @__PURE__ */ new Map();
    this._readyCount = 0;
    this._readyEmitted = false;
    const awf = _opts.awaitWriteFinish;
    const DEF_AWF = { stabilityThreshold: 2e3, pollInterval: 100 };
    const opts = {
      // Defaults
      persistent: true,
      ignoreInitial: false,
      ignorePermissionErrors: false,
      interval: 100,
      binaryInterval: 300,
      followSymlinks: true,
      usePolling: false,
      // useAsync: false,
      atomic: true,
      // NOTE: overwritten later (depends on usePolling)
      ..._opts,
      // Change format
      ignored: _opts.ignored ? arrify(_opts.ignored) : arrify([]),
      awaitWriteFinish: awf === true ? DEF_AWF : typeof awf === "object" ? { ...DEF_AWF, ...awf } : false
    };
    if (isIBMi)
      opts.usePolling = true;
    if (opts.atomic === void 0)
      opts.atomic = !opts.usePolling;
    const envPoll = process.env.CHOKIDAR_USEPOLLING;
    if (envPoll !== void 0) {
      const envLower = envPoll.toLowerCase();
      if (envLower === "false" || envLower === "0")
        opts.usePolling = false;
      else if (envLower === "true" || envLower === "1")
        opts.usePolling = true;
      else
        opts.usePolling = !!envLower;
    }
    const envInterval = process.env.CHOKIDAR_INTERVAL;
    if (envInterval)
      opts.interval = Number.parseInt(envInterval, 10);
    let readyCalls = 0;
    this._emitReady = () => {
      readyCalls++;
      if (readyCalls >= this._readyCount) {
        this._emitReady = EMPTY_FN;
        this._readyEmitted = true;
        process.nextTick(() => this.emit(EVENTS.READY));
      }
    };
    this._emitRaw = (...args) => this.emit(EVENTS.RAW, ...args);
    this._boundRemove = this._remove.bind(this);
    this.options = opts;
    this._nodeFsHandler = new NodeFsHandler(this);
    Object.freeze(opts);
  }
  _addIgnoredPath(matcher) {
    if (isMatcherObject(matcher)) {
      for (const ignored of this._ignoredPaths) {
        if (isMatcherObject(ignored) && ignored.path === matcher.path && ignored.recursive === matcher.recursive) {
          return;
        }
      }
    }
    this._ignoredPaths.add(matcher);
  }
  _removeIgnoredPath(matcher) {
    this._ignoredPaths.delete(matcher);
    if (typeof matcher === "string") {
      for (const ignored of this._ignoredPaths) {
        if (isMatcherObject(ignored) && ignored.path === matcher) {
          this._ignoredPaths.delete(ignored);
        }
      }
    }
  }
  // Public methods
  /**
   * Adds paths to be watched on an existing FSWatcher instance.
   * @param paths_ file or file list. Other arguments are unused
   */
  add(paths_, _origAdd, _internal) {
    const { cwd } = this.options;
    this.closed = false;
    this._closePromise = void 0;
    let paths = unifyPaths(paths_);
    if (cwd) {
      paths = paths.map((path) => {
        const absPath = getAbsolutePath(path, cwd);
        return absPath;
      });
    }
    paths.forEach((path) => {
      this._removeIgnoredPath(path);
    });
    this._userIgnored = void 0;
    if (!this._readyCount)
      this._readyCount = 0;
    this._readyCount += paths.length;
    Promise.all(paths.map(async (path) => {
      const res = await this._nodeFsHandler._addToNodeFs(path, !_internal, void 0, 0, _origAdd);
      if (res)
        this._emitReady();
      return res;
    })).then((results) => {
      if (this.closed)
        return;
      results.forEach((item) => {
        if (item)
          this.add(sysPath__namespace.dirname(item), sysPath__namespace.basename(_origAdd || item));
      });
    });
    return this;
  }
  /**
   * Close watchers or start ignoring events from specified paths.
   */
  unwatch(paths_) {
    if (this.closed)
      return this;
    const paths = unifyPaths(paths_);
    const { cwd } = this.options;
    paths.forEach((path) => {
      if (!sysPath__namespace.isAbsolute(path) && !this._closers.has(path)) {
        if (cwd)
          path = sysPath__namespace.join(cwd, path);
        path = sysPath__namespace.resolve(path);
      }
      this._closePath(path);
      this._addIgnoredPath(path);
      if (this._watched.has(path)) {
        this._addIgnoredPath({
          path,
          recursive: true
        });
      }
      this._userIgnored = void 0;
    });
    return this;
  }
  /**
   * Close watchers and remove all listeners from watched paths.
   */
  close() {
    if (this._closePromise) {
      return this._closePromise;
    }
    this.closed = true;
    this.removeAllListeners();
    const closers = [];
    this._closers.forEach((closerList) => closerList.forEach((closer) => {
      const promise = closer();
      if (promise instanceof Promise)
        closers.push(promise);
    }));
    this._streams.forEach((stream) => stream.destroy());
    this._userIgnored = void 0;
    this._readyCount = 0;
    this._readyEmitted = false;
    this._watched.forEach((dirent) => dirent.dispose());
    this._closers.clear();
    this._watched.clear();
    this._streams.clear();
    this._symlinkPaths.clear();
    this._throttled.clear();
    this._closePromise = closers.length ? Promise.all(closers).then(() => void 0) : Promise.resolve();
    return this._closePromise;
  }
  /**
   * Expose list of watched paths
   * @returns for chaining
   */
  getWatched() {
    const watchList = {};
    this._watched.forEach((entry, dir) => {
      const key = this.options.cwd ? sysPath__namespace.relative(this.options.cwd, dir) : dir;
      const index = key || ONE_DOT;
      watchList[index] = entry.getChildren().sort();
    });
    return watchList;
  }
  emitWithAll(event, args) {
    this.emit(event, ...args);
    if (event !== EVENTS.ERROR)
      this.emit(EVENTS.ALL, event, ...args);
  }
  // Common helpers
  // --------------
  /**
   * Normalize and emit events.
   * Calling _emit DOES NOT MEAN emit() would be called!
   * @param event Type of event
   * @param path File or directory path
   * @param stats arguments to be passed with event
   * @returns the error if defined, otherwise the value of the FSWatcher instance's `closed` flag
   */
  async _emit(event, path, stats) {
    if (this.closed)
      return;
    const opts = this.options;
    if (isWindows)
      path = sysPath__namespace.normalize(path);
    if (opts.cwd)
      path = sysPath__namespace.relative(opts.cwd, path);
    const args = [path];
    if (stats != null)
      args.push(stats);
    const awf = opts.awaitWriteFinish;
    let pw;
    if (awf && (pw = this._pendingWrites.get(path))) {
      pw.lastChange = /* @__PURE__ */ new Date();
      return this;
    }
    if (opts.atomic) {
      if (event === EVENTS.UNLINK) {
        this._pendingUnlinks.set(path, [event, ...args]);
        setTimeout(() => {
          this._pendingUnlinks.forEach((entry, path2) => {
            this.emit(...entry);
            this.emit(EVENTS.ALL, ...entry);
            this._pendingUnlinks.delete(path2);
          });
        }, typeof opts.atomic === "number" ? opts.atomic : 100);
        return this;
      }
      if (event === EVENTS.ADD && this._pendingUnlinks.has(path)) {
        event = EVENTS.CHANGE;
        this._pendingUnlinks.delete(path);
      }
    }
    if (awf && (event === EVENTS.ADD || event === EVENTS.CHANGE) && this._readyEmitted) {
      const awfEmit = (err, stats2) => {
        if (err) {
          event = EVENTS.ERROR;
          args[0] = err;
          this.emitWithAll(event, args);
        } else if (stats2) {
          if (args.length > 1) {
            args[1] = stats2;
          } else {
            args.push(stats2);
          }
          this.emitWithAll(event, args);
        }
      };
      this._awaitWriteFinish(path, awf.stabilityThreshold, event, awfEmit);
      return this;
    }
    if (event === EVENTS.CHANGE) {
      const isThrottled = !this._throttle(EVENTS.CHANGE, path, 50);
      if (isThrottled)
        return this;
    }
    if (opts.alwaysStat && stats === void 0 && (event === EVENTS.ADD || event === EVENTS.ADD_DIR || event === EVENTS.CHANGE)) {
      const fullPath = opts.cwd ? sysPath__namespace.join(opts.cwd, path) : path;
      let stats2;
      try {
        stats2 = await promises.stat(fullPath);
      } catch (err) {
      }
      if (!stats2 || this.closed)
        return;
      args.push(stats2);
    }
    this.emitWithAll(event, args);
    return this;
  }
  /**
   * Common handler for errors
   * @returns The error if defined, otherwise the value of the FSWatcher instance's `closed` flag
   */
  _handleError(error) {
    const code = error && error.code;
    if (error && code !== "ENOENT" && code !== "ENOTDIR" && (!this.options.ignorePermissionErrors || code !== "EPERM" && code !== "EACCES")) {
      this.emit(EVENTS.ERROR, error);
    }
    return error || this.closed;
  }
  /**
   * Helper utility for throttling
   * @param actionType type being throttled
   * @param path being acted upon
   * @param timeout duration of time to suppress duplicate actions
   * @returns tracking object or false if action should be suppressed
   */
  _throttle(actionType, path, timeout) {
    if (!this._throttled.has(actionType)) {
      this._throttled.set(actionType, /* @__PURE__ */ new Map());
    }
    const action = this._throttled.get(actionType);
    if (!action)
      throw new Error("invalid throttle");
    const actionPath = action.get(path);
    if (actionPath) {
      actionPath.count++;
      return false;
    }
    let timeoutObject;
    const clear = () => {
      const item = action.get(path);
      const count = item ? item.count : 0;
      action.delete(path);
      clearTimeout(timeoutObject);
      if (item)
        clearTimeout(item.timeoutObject);
      return count;
    };
    timeoutObject = setTimeout(clear, timeout);
    const thr = { timeoutObject, clear, count: 0 };
    action.set(path, thr);
    return thr;
  }
  _incrReadyCount() {
    return this._readyCount++;
  }
  /**
   * Awaits write operation to finish.
   * Polls a newly created file for size variations. When files size does not change for 'threshold' milliseconds calls callback.
   * @param path being acted upon
   * @param threshold Time in milliseconds a file size must be fixed before acknowledging write OP is finished
   * @param event
   * @param awfEmit Callback to be called when ready for event to be emitted.
   */
  _awaitWriteFinish(path, threshold, event, awfEmit) {
    const awf = this.options.awaitWriteFinish;
    if (typeof awf !== "object")
      return;
    const pollInterval = awf.pollInterval;
    let timeoutHandler;
    let fullPath = path;
    if (this.options.cwd && !sysPath__namespace.isAbsolute(path)) {
      fullPath = sysPath__namespace.join(this.options.cwd, path);
    }
    const now2 = /* @__PURE__ */ new Date();
    const writes = this._pendingWrites;
    function awaitWriteFinishFn(prevStat) {
      fs$1.stat(fullPath, (err, curStat) => {
        if (err || !writes.has(path)) {
          if (err && err.code !== "ENOENT")
            awfEmit(err);
          return;
        }
        const now22 = Number(/* @__PURE__ */ new Date());
        if (prevStat && curStat.size !== prevStat.size) {
          writes.get(path).lastChange = now22;
        }
        const pw = writes.get(path);
        const df = now22 - pw.lastChange;
        if (df >= threshold) {
          writes.delete(path);
          awfEmit(void 0, curStat);
        } else {
          timeoutHandler = setTimeout(awaitWriteFinishFn, pollInterval, curStat);
        }
      });
    }
    if (!writes.has(path)) {
      writes.set(path, {
        lastChange: now2,
        cancelWait: () => {
          writes.delete(path);
          clearTimeout(timeoutHandler);
          return event;
        }
      });
      timeoutHandler = setTimeout(awaitWriteFinishFn, pollInterval);
    }
  }
  /**
   * Determines whether user has asked to ignore this path.
   */
  _isIgnored(path, stats) {
    if (this.options.atomic && DOT_RE.test(path))
      return true;
    if (!this._userIgnored) {
      const { cwd } = this.options;
      const ign = this.options.ignored;
      const ignored = (ign || []).map(normalizeIgnored(cwd));
      const ignoredPaths = [...this._ignoredPaths];
      const list = [...ignoredPaths.map(normalizeIgnored(cwd)), ...ignored];
      this._userIgnored = anymatch(list);
    }
    return this._userIgnored(path, stats);
  }
  _isntIgnored(path, stat2) {
    return !this._isIgnored(path, stat2);
  }
  /**
   * Provides a set of common helpers and properties relating to symlink handling.
   * @param path file or directory pattern being watched
   */
  _getWatchHelpers(path) {
    return new WatchHelper(path, this.options.followSymlinks, this);
  }
  // Directory helpers
  // -----------------
  /**
   * Provides directory tracking objects
   * @param directory path of the directory
   */
  _getWatchedDir(directory) {
    const dir = sysPath__namespace.resolve(directory);
    if (!this._watched.has(dir))
      this._watched.set(dir, new DirEntry(dir, this._boundRemove));
    return this._watched.get(dir);
  }
  // File helpers
  // ------------
  /**
   * Check for read permissions: https://stackoverflow.com/a/11781404/1358405
   */
  _hasReadPermissions(stats) {
    if (this.options.ignorePermissionErrors)
      return true;
    return Boolean(Number(stats.mode) & 256);
  }
  /**
   * Handles emitting unlink events for
   * files and directories, and via recursion, for
   * files and directories within directories that are unlinked
   * @param directory within which the following item is located
   * @param item      base path of item/directory
   */
  _remove(directory, item, isDirectory) {
    const path = sysPath__namespace.join(directory, item);
    const fullPath = sysPath__namespace.resolve(path);
    isDirectory = isDirectory != null ? isDirectory : this._watched.has(path) || this._watched.has(fullPath);
    if (!this._throttle("remove", path, 100))
      return;
    if (!isDirectory && this._watched.size === 1) {
      this.add(directory, item, true);
    }
    const wp = this._getWatchedDir(path);
    const nestedDirectoryChildren = wp.getChildren();
    nestedDirectoryChildren.forEach((nested) => this._remove(path, nested));
    const parent = this._getWatchedDir(directory);
    const wasTracked = parent.has(item);
    parent.remove(item);
    if (this._symlinkPaths.has(fullPath)) {
      this._symlinkPaths.delete(fullPath);
    }
    let relPath = path;
    if (this.options.cwd)
      relPath = sysPath__namespace.relative(this.options.cwd, path);
    if (this.options.awaitWriteFinish && this._pendingWrites.has(relPath)) {
      const event = this._pendingWrites.get(relPath).cancelWait();
      if (event === EVENTS.ADD)
        return;
    }
    this._watched.delete(path);
    this._watched.delete(fullPath);
    const eventName = isDirectory ? EVENTS.UNLINK_DIR : EVENTS.UNLINK;
    if (wasTracked && !this._isIgnored(path))
      this._emit(eventName, path);
    this._closePath(path);
  }
  /**
   * Closes all watchers for a path
   */
  _closePath(path) {
    this._closeFile(path);
    const dir = sysPath__namespace.dirname(path);
    this._getWatchedDir(dir).remove(sysPath__namespace.basename(path));
  }
  /**
   * Closes only file-specific watchers
   */
  _closeFile(path) {
    const closers = this._closers.get(path);
    if (!closers)
      return;
    closers.forEach((closer) => closer());
    this._closers.delete(path);
  }
  _addPathCloser(path, closer) {
    if (!closer)
      return;
    let list = this._closers.get(path);
    if (!list) {
      list = [];
      this._closers.set(path, list);
    }
    list.push(closer);
  }
  _readdirp(root, opts) {
    if (this.closed)
      return;
    const options = { type: EVENTS.ALL, alwaysStat: true, lstat: true, ...opts, depth: 0 };
    let stream = readdirp(root, options);
    this._streams.add(stream);
    stream.once(STR_CLOSE, () => {
      stream = void 0;
    });
    stream.once(STR_END, () => {
      if (stream) {
        this._streams.delete(stream);
        stream = void 0;
      }
    });
    return stream;
  }
}
function watch(paths, options = {}) {
  const watcher = new FSWatcher(options);
  watcher.add(paths);
  return watcher;
}
const chokidar = { watch, FSWatcher };
const WATCH_IGNORE_RE = /(^|[\\/])(\.(git|obsidian|horsemd)|node_modules)([\\/]|$)/;
function isAbsoluteWatchPath(path) {
  return /^\//.test(path) || /^[a-zA-Z]:[\\/]/.test(path) || /^\\\\/.test(path);
}
function isRestrictedWatchRoot(path) {
  const normalized = (path || "").replace(/[\\/]+$/, "");
  if (normalized === "" || normalized === "/" || normalized === "." || normalized === "..") return true;
  if (!isAbsoluteWatchPath(normalized)) return true;
  return /^\/(dev|proc|System\/Volumes|private\/var\/(db|folders)|\.vol)(\/|$)/.test(normalized);
}
function registerWatcherIpc(ipcMain, { sendToRenderer: sendToRenderer2, watcherFactory = chokidar }) {
  const folderWatchers = /* @__PURE__ */ new Map();
  const fileWatchers = /* @__PURE__ */ new Map();
  const isEnospc = (error) => error?.code === "ENOSPC" || /ENOSPC|System limit for number of file watchers/i.test(String(error?.message || error));
  const watchFolder = (dir, depth) => watcherFactory.watch(dir, {
    ignored: (path) => WATCH_IGNORE_RE.test(path) || isRestrictedWatchRoot(path),
    ignoreInitial: true,
    depth,
    followSymlinks: false,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }
  });
  ipcMain.handle("watch:start", async (_event, dir) => {
    if (folderWatchers.has(dir)) return true;
    if (isRestrictedWatchRoot(dir)) return false;
    const entry = { watcher: null, timer: null, degraded: false };
    const attach = (watcher) => {
      entry.watcher = watcher;
      const ping = () => {
        clearTimeout(entry.timer);
        entry.timer = setTimeout(() => sendToRenderer2("watch:changed", dir), 120);
      };
      watcher.on("add", ping).on("unlink", ping).on("addDir", ping).on("unlinkDir", ping);
      watcher.on("error", async (error) => {
        if (!isEnospc(error)) {
          console.error("watch:start error (ignored):", error?.message || error);
          return;
        }
        if (entry.degraded) return;
        entry.degraded = true;
        console.warn(
          `File watcher limit reached for ${dir} (ENOSPC). Falling back to shallow watching (depth 2). To watch large workspaces fully, raise the kernel limit: sudo sysctl fs.inotify.max_user_watches=524288`
        );
        clearTimeout(entry.timer);
        try {
          await entry.watcher.close();
        } catch {
        }
        try {
          attach(watchFolder(dir, 2));
        } catch (rebuildError) {
          console.error("watch:start rebuild after ENOSPC failed:", rebuildError?.message || rebuildError);
        }
      });
    };
    attach(watchFolder(dir, 12));
    folderWatchers.set(dir, entry);
    return true;
  });
  ipcMain.handle("watch:stop", async (_event, dir) => {
    const entry = folderWatchers.get(dir);
    if (entry) {
      clearTimeout(entry.timer);
      await entry.watcher.close();
      folderWatchers.delete(dir);
    }
    return true;
  });
  ipcMain.handle("watch:file", async (_event, path) => {
    if (fileWatchers.has(path)) return true;
    const watcher = watcherFactory.watch(path, {
      ignoreInitial: true,
      usePolling: true,
      interval: 1e3,
      binaryInterval: 1200,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }
    });
    const entry = { watcher, timer: null };
    const notify = () => {
      clearTimeout(entry.timer);
      entry.timer = setTimeout(async () => {
        let mtimeMs = 0;
        try {
          mtimeMs = (await fs.stat(path)).mtimeMs;
        } catch {
        }
        sendToRenderer2("file:changed", { path, mtimeMs });
      }, 80);
    };
    watcher.on("change", notify).on("add", notify);
    watcher.on("error", (error) => console.error("watch:file error (ignored):", error?.message || error));
    fileWatchers.set(path, entry);
    return true;
  });
  ipcMain.handle("watch:unfile", async (_event, path) => {
    const entry = fileWatchers.get(path);
    if (entry) {
      clearTimeout(entry.timer);
      await entry.watcher.close();
      fileWatchers.delete(path);
    }
    return true;
  });
}
const SYNC_WORKSPACE_DIR = ".horsemd";
const SYNC_WORKSPACE_FILE = "workspace.json";
const REGISTRY_VERSION = 1;
const MARKER_VERSION = 1;
const normalizePath$1 = (path) => node_path.resolve(path).replace(/[\\/]+$/, "");
const markerPathFor = (rootPath) => node_path.join(rootPath, SYNC_WORKSPACE_DIR, SYNC_WORKSPACE_FILE);
const registryPathFor = (userDataPath) => node_path.join(userDataPath, "sync", "workspace-registry.json");
function isWorkspaceId(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value);
}
function normalizeEntry(entry) {
  if (!entry || !isWorkspaceId(entry.workspaceId) || typeof entry.rootPath !== "string") return null;
  const rootPath = normalizePath$1(entry.rootPath);
  if (!isAbsoluteWatchPath(rootPath) || isRestrictedWatchRoot(rootPath)) return null;
  return {
    workspaceId: entry.workspaceId,
    rootPath,
    connectionId: typeof entry.connectionId === "string" ? entry.connectionId : null,
    createdAt: typeof entry.createdAt === "string" ? entry.createdAt : (/* @__PURE__ */ new Date(0)).toISOString(),
    updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : (/* @__PURE__ */ new Date(0)).toISOString()
  };
}
function displayEntry(entry) {
  return {
    ...entry,
    name: node_path.basename(entry.rootPath) || entry.rootPath,
    status: "local-only"
  };
}
async function readJson(path, fallback) {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw new Error(`Could not read HorseMD sync metadata: ${error?.message || error}`);
  }
}
async function writeJsonAtomically(path, value) {
  const dir = node_path.dirname(path);
  await fs.mkdir(dir, { recursive: true, mode: 448 });
  const temp = `${path}.${process.pid}.${node_crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", mode: 384 });
  await fs.rename(temp, path);
}
async function readWorkspaceRegistry(userDataPath) {
  const raw = await readJson(registryPathFor(userDataPath), { version: REGISTRY_VERSION, workspaces: [] });
  const entries = Array.isArray(raw?.workspaces) ? raw.workspaces.map(normalizeEntry).filter(Boolean) : [];
  const seenIds = /* @__PURE__ */ new Set();
  const seenPaths = /* @__PURE__ */ new Set();
  return entries.filter((entry) => {
    const key = entry.rootPath.toLowerCase();
    if (seenIds.has(entry.workspaceId) || seenPaths.has(key)) return false;
    seenIds.add(entry.workspaceId);
    seenPaths.add(key);
    return true;
  });
}
async function writeWorkspaceRegistry(userDataPath, entries) {
  await writeJsonAtomically(registryPathFor(userDataPath), {
    version: REGISTRY_VERSION,
    workspaces: entries
  });
}
async function validateRoot(rootPath) {
  if (typeof rootPath !== "string" || !isAbsoluteWatchPath(rootPath)) {
    throw new Error("请选择一个有效的本地文件夹。");
  }
  const normalized = normalizePath$1(rootPath);
  if (isRestrictedWatchRoot(normalized)) throw new Error("这个位置不能作为同步文件夹。");
  let stat;
  try {
    stat = await fs.stat(normalized);
  } catch {
    throw new Error("所选文件夹不存在或无法访问。");
  }
  if (!stat.isDirectory()) throw new Error("请选择文件夹，而不是文件。");
  return normalized;
}
async function readMarker(rootPath) {
  const marker = await readJson(markerPathFor(rootPath), null);
  if (!marker) return null;
  if (!isWorkspaceId(marker.workspaceId)) throw new Error("这个文件夹的 HorseMD 同步标记无效。");
  return marker;
}
async function createMarker(rootPath) {
  const dir = node_path.join(rootPath, SYNC_WORKSPACE_DIR);
  const path = markerPathFor(rootPath);
  await fs.mkdir(dir, { recursive: true, mode: 448 });
  const marker = {
    version: MARKER_VERSION,
    workspaceId: node_crypto.randomUUID(),
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  try {
    await fs.writeFile(path, JSON.stringify(marker, null, 2) + "\n", {
      encoding: "utf8",
      mode: 384,
      flag: "wx"
    });
    return marker;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    return readMarker(rootPath);
  }
}
async function writeMarker(rootPath, marker) {
  await writeJsonAtomically(markerPathFor(rootPath), marker);
}
async function adoptSyncWorkspace(userDataPath, rootPath) {
  const normalizedRoot = await validateRoot(rootPath);
  const registry = await readWorkspaceRegistry(userDataPath);
  const rootKey = normalizedRoot.toLowerCase();
  const existingAtPath = registry.find((entry2) => entry2.rootPath.toLowerCase() === rootKey);
  const marker = await readMarker(normalizedRoot) || await createMarker(normalizedRoot);
  if (existingAtPath && existingAtPath.workspaceId !== marker.workspaceId) {
    throw new Error("这个文件夹的同步身份已变化。请先停止管理后再重新添加。");
  }
  const duplicate = registry.find(
    (entry2) => entry2.workspaceId === marker.workspaceId && entry2.rootPath.toLowerCase() !== rootKey
  );
  if (duplicate) {
    throw new Error(`该文件夹是“${duplicate.rootPath}”的副本，不能同时作为同一个同步工作区。`);
  }
  const now2 = (/* @__PURE__ */ new Date()).toISOString();
  const entry = {
    workspaceId: marker.workspaceId,
    rootPath: normalizedRoot,
    createdAt: existingAtPath?.createdAt || marker.createdAt || now2,
    updatedAt: now2
  };
  const next = [...registry.filter((item) => item.rootPath.toLowerCase() !== rootKey), entry];
  await writeWorkspaceRegistry(userDataPath, next);
  return displayEntry(entry);
}
async function unregisterSyncWorkspace(userDataPath, rootPath) {
  const normalizedRoot = await validateRoot(rootPath);
  const registry = await readWorkspaceRegistry(userDataPath);
  const next = registry.filter((entry) => entry.rootPath.toLowerCase() !== normalizedRoot.toLowerCase());
  await writeWorkspaceRegistry(userDataPath, next);
  return true;
}
async function bindSyncWorkspace(userDataPath, rootPath, connectionId) {
  const normalizedRoot = await validateRoot(rootPath);
  const registry = await readWorkspaceRegistry(userDataPath);
  const index = registry.findIndex((entry) => entry.rootPath.toLowerCase() === normalizedRoot.toLowerCase());
  if (index < 0) throw new Error("请先将这个文件夹添加为 HorseMD 同步文件夹。");
  registry[index] = { ...registry[index], connectionId, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
  await writeWorkspaceRegistry(userDataPath, registry);
  return displayEntry(registry[index]);
}
async function joinSyncWorkspace(userDataPath, rootPath, remoteWorkspaceId) {
  if (!isWorkspaceId(remoteWorkspaceId)) throw new Error("远端工作区身份无效。");
  const normalizedRoot = await validateRoot(rootPath);
  const registry = await readWorkspaceRegistry(userDataPath);
  const rootKey = normalizedRoot.toLowerCase();
  const index = registry.findIndex((entry) => entry.rootPath.toLowerCase() === rootKey);
  if (index < 0) throw new Error("请先将这个文件夹添加为 HorseMD 同步文件夹。");
  const duplicate = registry.find((entry) => entry.workspaceId === remoteWorkspaceId && entry.rootPath.toLowerCase() !== rootKey);
  if (duplicate) throw new Error(`“${duplicate.rootPath}”已使用这个远端工作区。`);
  const marker = await readMarker(normalizedRoot);
  await writeMarker(normalizedRoot, { version: MARKER_VERSION, workspaceId: remoteWorkspaceId, createdAt: marker?.createdAt || (/* @__PURE__ */ new Date()).toISOString() });
  registry[index] = { ...registry[index], workspaceId: remoteWorkspaceId, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
  await writeWorkspaceRegistry(userDataPath, registry);
  return displayEntry(registry[index]);
}
function registerSyncWorkspaceIpc(ipcMain, { getUserDataPath, isTrustedSender }) {
  const trusted = (event) => {
    if (isTrustedSender?.(event)) return;
    throw new Error("Untrusted renderer.");
  };
  ipcMain.handle("sync:workspaceList", async (event) => {
    trusted(event);
    const entries = await readWorkspaceRegistry(getUserDataPath());
    return entries.map(displayEntry);
  });
  ipcMain.handle("sync:workspaceAdopt", async (event, rootPath) => {
    trusted(event);
    return adoptSyncWorkspace(getUserDataPath(), rootPath);
  });
  ipcMain.handle("sync:workspaceRemove", async (event, rootPath) => {
    trusted(event);
    return unregisterSyncWorkspace(getUserDataPath(), rootPath);
  });
}
const STORE_VERSION = 1;
const storePathFor = (userDataPath) => node_path.join(userDataPath, "sync", "credentials.json");
class CredentialStore {
  constructor({ userDataPath, safeStorage }) {
    this.userDataPath = userDataPath;
    this.safeStorage = safeStorage;
  }
  assertAvailable() {
    if (!this.safeStorage?.isEncryptionAvailable?.()) {
      throw new Error("当前系统无法安全保存同步密码，请先启用系统钥匙串或凭据服务。");
    }
  }
  async readAll() {
    try {
      const raw = JSON.parse(await fs.readFile(storePathFor(this.userDataPath), "utf8"));
      return raw?.version === STORE_VERSION && raw.items && typeof raw.items === "object" ? raw.items : {};
    } catch (error) {
      if (error?.code === "ENOENT") return {};
      throw new Error(`无法读取同步凭据：${error?.message || error}`);
    }
  }
  async writeAll(items) {
    const path = storePathFor(this.userDataPath);
    await fs.mkdir(node_path.dirname(path), { recursive: true, mode: 448 });
    const temp = `${path}.${process.pid}.${node_crypto.randomUUID()}.tmp`;
    await fs.writeFile(temp, JSON.stringify({ version: STORE_VERSION, items }, null, 2) + "\n", {
      encoding: "utf8",
      mode: 384
    });
    await fs.rename(temp, path);
  }
  async set(id, value) {
    this.assertAvailable();
    const items = await this.readAll();
    items[id] = this.safeStorage.encryptString(JSON.stringify(value)).toString("base64");
    await this.writeAll(items);
  }
  async get(id) {
    this.assertAvailable();
    const encrypted = (await this.readAll())[id];
    if (!encrypted) return null;
    try {
      return JSON.parse(this.safeStorage.decryptString(Buffer.from(encrypted, "base64")));
    } catch {
      throw new Error("同步凭据无法解密，请重新连接云端。");
    }
  }
  async remove(id) {
    const items = await this.readAll();
    delete items[id];
    await this.writeAll(items);
  }
}
const VERSION = 1;
const filePath = (userDataPath) => node_path.join(userDataPath, "sync", "connections.json");
function normalizeUserAgent(value) {
  const userAgent = String(value || "").trim();
  if (/[\r\n]/.test(userAgent)) throw new Error("User-Agent 不能包含换行。");
  if (userAgent.length > 256) throw new Error("User-Agent 不能超过 256 个字符。");
  return userAgent;
}
function publicConnection(entry) {
  const { credentialId, ...publicEntry } = entry;
  return publicEntry;
}
async function readConnections(userDataPath) {
  try {
    const raw = JSON.parse(await fs.readFile(filePath(userDataPath), "utf8"));
    return Array.isArray(raw?.connections) ? raw.connections.filter((item) => item?.id && ["webdav", "s3"].includes(item.type)) : [];
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw new Error(`无法读取云端连接：${error?.message || error}`);
  }
}
async function writeConnections(userDataPath, connections) {
  const path = filePath(userDataPath);
  await fs.mkdir(node_path.dirname(path), { recursive: true, mode: 448 });
  const temp = `${path}.${process.pid}.${node_crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, JSON.stringify({ version: VERSION, connections }, null, 2) + "\n", {
    encoding: "utf8",
    mode: 384
  });
  await fs.rename(temp, path);
}
class ConnectionRegistry {
  constructor({ userDataPath, credentialStore, createWebDavProvider, createS3Provider }) {
    this.userDataPath = userDataPath;
    this.credentialStore = credentialStore;
    this.createWebDavProvider = createWebDavProvider;
    this.createS3Provider = createS3Provider;
  }
  async list() {
    return (await readConnections(this.userDataPath)).map(publicConnection);
  }
  async addWebDav({ name, endpoint, username, password, allowInsecure = false, userAgent = "" }) {
    const trimmedName = String(name || "").trim();
    if (!trimmedName) throw new Error("请填写连接名称。");
    if (!String(endpoint || "").trim()) throw new Error("请填写 WebDAV 地址。");
    if (!String(password || "")) throw new Error("请填写 WebDAV 密码或应用专用密码。");
    const normalizedUserAgent = normalizeUserAgent(userAgent);
    const provider = this.createWebDavProvider({ endpoint, username, password, allowInsecure, userAgent: normalizedUserAgent });
    await provider.testConnection();
    const id = node_crypto.randomUUID();
    const credentialId = `webdav:${id}`;
    await this.credentialStore.set(credentialId, { password: String(password) });
    const connections = await readConnections(this.userDataPath);
    const connection = {
      id,
      type: "webdav",
      name: trimmedName,
      endpoint: String(endpoint).trim(),
      username: String(username || ""),
      userAgent: normalizedUserAgent,
      allowInsecure: Boolean(allowInsecure),
      credentialId,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    connections.push(connection);
    await writeConnections(this.userDataPath, connections);
    return publicConnection(connection);
  }
  async addS3({ name, endpoint, bucket, region, accessKeyId, secretAccessKey, allowInsecure = false, userAgent = "" }) {
    const trimmedName = String(name || "").trim();
    if (!trimmedName) throw new Error("请填写连接名称。");
    if (!String(endpoint || "").trim()) throw new Error("请填写 S3 Endpoint。");
    if (!String(bucket || "").trim()) throw new Error("请填写 Bucket 名称。");
    if (!String(region || "").trim()) throw new Error("请填写 Region。");
    if (!String(accessKeyId || "").trim() || !String(secretAccessKey || "")) {
      throw new Error("请填写 S3 Access Key 和 Secret Key。");
    }
    const normalizedUserAgent = normalizeUserAgent(userAgent);
    const provider = this.createS3Provider({ endpoint, bucket, region, accessKeyId, secretAccessKey, allowInsecure, userAgent: normalizedUserAgent });
    await provider.testConnection();
    const id = node_crypto.randomUUID();
    const credentialId = `s3:${id}`;
    await this.credentialStore.set(credentialId, { secretAccessKey: String(secretAccessKey) });
    const connections = await readConnections(this.userDataPath);
    const connection = {
      id,
      type: "s3",
      name: trimmedName,
      endpoint: String(endpoint).trim(),
      bucket: String(bucket).trim(),
      region: String(region).trim(),
      accessKeyId: String(accessKeyId).trim(),
      userAgent: normalizedUserAgent,
      allowInsecure: Boolean(allowInsecure),
      credentialId,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    connections.push(connection);
    await writeConnections(this.userDataPath, connections);
    return publicConnection(connection);
  }
  async update(id, config) {
    const connections = await readConnections(this.userDataPath);
    const index = connections.findIndex((connection) => connection.id === id);
    if (index < 0) throw new Error("找不到云端连接。");
    const current = connections[index];
    const credential = await this.credentialStore.get(current.credentialId);
    if (current.type === "webdav") {
      const name = String(config.name || "").trim();
      const endpoint = String(config.endpoint || "").trim();
      const username = String(config.username || "");
      const password = String(config.password || "") || credential?.password;
      if (!name) throw new Error("请填写连接名称。");
      if (!endpoint) throw new Error("请填写 WebDAV 地址。");
      if (!password) throw new Error("请填写 WebDAV 密码或应用专用密码。");
      const allowInsecure = Boolean(config.allowInsecure);
      const userAgent = normalizeUserAgent(config.userAgent ?? current.userAgent);
      await this.createWebDavProvider({ endpoint, username, password, allowInsecure, userAgent }).testConnection();
      const next = { ...current, name, endpoint, username, userAgent, allowInsecure, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
      if (password !== credential?.password) await this.credentialStore.set(current.credentialId, { password });
      connections[index] = next;
      await writeConnections(this.userDataPath, connections);
      return publicConnection(next);
    }
    if (current.type === "s3") {
      const name = String(config.name || "").trim();
      const endpoint = String(config.endpoint || "").trim();
      const bucket = String(config.bucket || "").trim();
      const region = String(config.region || "").trim();
      const accessKeyId = String(config.accessKeyId || "").trim();
      const secretAccessKey = String(config.secretAccessKey || "") || credential?.secretAccessKey;
      if (!name) throw new Error("请填写连接名称。");
      if (!endpoint) throw new Error("请填写 S3 Endpoint。");
      if (!bucket) throw new Error("请填写 Bucket 名称。");
      if (!region) throw new Error("请填写 Region。");
      if (!accessKeyId || !secretAccessKey) throw new Error("请填写 S3 Access Key 和 Secret Key。");
      const allowInsecure = Boolean(config.allowInsecure);
      const userAgent = normalizeUserAgent(config.userAgent ?? current.userAgent);
      await this.createS3Provider({ endpoint, bucket, region, accessKeyId, secretAccessKey, allowInsecure, userAgent }).testConnection();
      const next = { ...current, name, endpoint, bucket, region, accessKeyId, userAgent, allowInsecure, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
      if (secretAccessKey !== credential?.secretAccessKey) await this.credentialStore.set(current.credentialId, { secretAccessKey });
      connections[index] = next;
      await writeConnections(this.userDataPath, connections);
      return publicConnection(next);
    }
    throw new Error("不支持的云端连接类型。");
  }
  async remove(id) {
    const connections = await readConnections(this.userDataPath);
    const current = connections.find((connection) => connection.id === id);
    if (!current) return false;
    await writeConnections(this.userDataPath, connections.filter((connection) => connection.id !== id));
    await this.credentialStore.remove(current.credentialId);
    return true;
  }
  async test(id) {
    const provider = await this.createProvider(id);
    return provider.testConnection();
  }
  async createProvider(id, options = {}) {
    const connection = (await readConnections(this.userDataPath)).find((item) => item.id === id);
    if (!connection) throw new Error("找不到云端连接。");
    const credential = await this.credentialStore.get(connection.credentialId);
    if (connection.type === "webdav") {
      if (!credential?.password) throw new Error("云端密码不可用，请重新连接。");
      return this.createWebDavProvider({ ...connection, ...options, password: credential.password });
    }
    if (connection.type === "s3") {
      if (!credential?.secretAccessKey) throw new Error("S3 密钥不可用，请重新连接。");
      return this.createS3Provider({ ...connection, ...options, secretAccessKey: credential.secretAccessKey });
    }
    throw new Error("不支持的云端连接类型。");
  }
}
const nameStartChar = ":A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD";
const nameChar = nameStartChar + "\\-.\\d\\u00B7\\u0300-\\u036F\\u203F-\\u2040";
const nameRegexp = "[" + nameStartChar + "][" + nameChar + "]*";
const regexName = new RegExp("^" + nameRegexp + "$");
function getAllMatches(string, regex) {
  const matches = [];
  let match = regex.exec(string);
  while (match) {
    const allmatches = [];
    allmatches.startIndex = regex.lastIndex - match[0].length;
    const len = match.length;
    for (let index = 0; index < len; index++) {
      allmatches.push(match[index]);
    }
    matches.push(allmatches);
    match = regex.exec(string);
  }
  return matches;
}
const isName = function(string) {
  const match = regexName.exec(string);
  return !(match === null || typeof match === "undefined");
};
function isExist(v) {
  return typeof v !== "undefined";
}
const DANGEROUS_PROPERTY_NAMES = [
  // '__proto__',
  // 'constructor',
  // 'prototype',
  "hasOwnProperty",
  "toString",
  "valueOf",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__"
];
const criticalProperties = ["__proto__", "constructor", "prototype"];
const defaultOptions$1 = {
  allowBooleanAttributes: false,
  //A tag can have attributes without any value
  unpairedTags: []
};
function validate(xmlData, options) {
  options = Object.assign({}, defaultOptions$1, options);
  const tags = [];
  let tagFound = false;
  let reachedRoot = false;
  if (xmlData[0] === "\uFEFF") {
    xmlData = xmlData.substr(1);
  }
  for (let i = 0; i < xmlData.length; i++) {
    if (xmlData[i] === "<" && xmlData[i + 1] === "?") {
      i += 2;
      i = readPI(xmlData, i);
      if (i.err) return i;
    } else if (xmlData[i] === "<") {
      let tagStartPos = i;
      i++;
      if (xmlData[i] === "!") {
        i = readCommentAndCDATA(xmlData, i);
        continue;
      } else {
        let closingTag = false;
        if (xmlData[i] === "/") {
          closingTag = true;
          i++;
        }
        let tagName = "";
        for (; i < xmlData.length && xmlData[i] !== ">" && xmlData[i] !== " " && xmlData[i] !== "	" && xmlData[i] !== "\n" && xmlData[i] !== "\r"; i++) {
          tagName += xmlData[i];
        }
        tagName = tagName.trim();
        if (tagName[tagName.length - 1] === "/") {
          tagName = tagName.substring(0, tagName.length - 1);
          i--;
        }
        if (!validateTagName(tagName)) {
          let msg;
          if (tagName.trim().length === 0) {
            msg = "Invalid space after '<'.";
          } else {
            msg = "Tag '" + tagName + "' is an invalid name.";
          }
          return getErrorObject("InvalidTag", msg, getLineNumberForPosition(xmlData, i));
        }
        const result = readAttributeStr(xmlData, i);
        if (result === false) {
          return getErrorObject("InvalidAttr", "Attributes for '" + tagName + "' have open quote.", getLineNumberForPosition(xmlData, i));
        }
        let attrStr = result.value;
        i = result.index;
        if (attrStr[attrStr.length - 1] === "/") {
          const attrStrStart = i - attrStr.length;
          attrStr = attrStr.substring(0, attrStr.length - 1);
          const isValid = validateAttributeString(attrStr, options);
          if (isValid === true) {
            tagFound = true;
          } else {
            return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, attrStrStart + isValid.err.line));
          }
        } else if (closingTag) {
          if (!result.tagClosed) {
            return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' doesn't have proper closing.", getLineNumberForPosition(xmlData, i));
          } else if (attrStr.trim().length > 0) {
            return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' can't have attributes or invalid starting.", getLineNumberForPosition(xmlData, tagStartPos));
          } else if (tags.length === 0) {
            return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' has not been opened.", getLineNumberForPosition(xmlData, tagStartPos));
          } else {
            const otg = tags.pop();
            if (tagName !== otg.tagName) {
              let openPos = getLineNumberForPosition(xmlData, otg.tagStartPos);
              return getErrorObject(
                "InvalidTag",
                "Expected closing tag '" + otg.tagName + "' (opened in line " + openPos.line + ", col " + openPos.col + ") instead of closing tag '" + tagName + "'.",
                getLineNumberForPosition(xmlData, tagStartPos)
              );
            }
            if (tags.length == 0) {
              reachedRoot = true;
            }
          }
        } else {
          const isValid = validateAttributeString(attrStr, options);
          if (isValid !== true) {
            return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, i - attrStr.length + isValid.err.line));
          }
          if (reachedRoot === true) {
            return getErrorObject("InvalidXml", "Multiple possible root nodes found.", getLineNumberForPosition(xmlData, i));
          } else if (options.unpairedTags.indexOf(tagName) !== -1) ;
          else {
            tags.push({ tagName, tagStartPos });
          }
          tagFound = true;
        }
        for (i++; i < xmlData.length; i++) {
          if (xmlData[i] === "<") {
            if (xmlData[i + 1] === "!") {
              i++;
              i = readCommentAndCDATA(xmlData, i);
              continue;
            } else if (xmlData[i + 1] === "?") {
              i = readPI(xmlData, ++i);
              if (i.err) return i;
            } else {
              break;
            }
          } else if (xmlData[i] === "&") {
            const afterAmp = validateAmpersand(xmlData, i);
            if (afterAmp == -1)
              return getErrorObject("InvalidChar", "char '&' is not expected.", getLineNumberForPosition(xmlData, i));
            i = afterAmp;
          } else {
            if (reachedRoot === true && !isWhiteSpace(xmlData[i])) {
              return getErrorObject("InvalidXml", "Extra text at the end", getLineNumberForPosition(xmlData, i));
            }
          }
        }
        if (xmlData[i] === "<") {
          i--;
        }
      }
    } else {
      if (isWhiteSpace(xmlData[i])) {
        continue;
      }
      return getErrorObject("InvalidChar", "char '" + xmlData[i] + "' is not expected.", getLineNumberForPosition(xmlData, i));
    }
  }
  if (!tagFound) {
    return getErrorObject("InvalidXml", "Start tag expected.", 1);
  } else if (tags.length == 1) {
    return getErrorObject("InvalidTag", "Unclosed tag '" + tags[0].tagName + "'.", getLineNumberForPosition(xmlData, tags[0].tagStartPos));
  } else if (tags.length > 0) {
    return getErrorObject("InvalidXml", "Invalid '" + JSON.stringify(tags.map((t) => t.tagName), null, 4).replace(/\r?\n/g, "") + "' found.", { line: 1, col: 1 });
  }
  return true;
}
function isWhiteSpace(char) {
  return char === " " || char === "	" || char === "\n" || char === "\r";
}
function readPI(xmlData, i) {
  const start = i;
  for (; i < xmlData.length; i++) {
    if (xmlData[i] == "?" || xmlData[i] == " ") {
      const tagname = xmlData.substr(start, i - start);
      if (i > 5 && tagname === "xml") {
        return getErrorObject("InvalidXml", "XML declaration allowed only at the start of the document.", getLineNumberForPosition(xmlData, i));
      } else if (xmlData[i] == "?" && xmlData[i + 1] == ">") {
        i++;
        break;
      } else {
        continue;
      }
    }
  }
  return i;
}
function readCommentAndCDATA(xmlData, i) {
  if (xmlData.length > i + 5 && xmlData[i + 1] === "-" && xmlData[i + 2] === "-") {
    for (i += 3; i < xmlData.length; i++) {
      if (xmlData[i] === "-" && xmlData[i + 1] === "-" && xmlData[i + 2] === ">") {
        i += 2;
        break;
      }
    }
  } else if (xmlData.length > i + 8 && xmlData[i + 1] === "D" && xmlData[i + 2] === "O" && xmlData[i + 3] === "C" && xmlData[i + 4] === "T" && xmlData[i + 5] === "Y" && xmlData[i + 6] === "P" && xmlData[i + 7] === "E") {
    let angleBracketsCount = 1;
    for (i += 8; i < xmlData.length; i++) {
      if (xmlData[i] === "<") {
        angleBracketsCount++;
      } else if (xmlData[i] === ">") {
        angleBracketsCount--;
        if (angleBracketsCount === 0) {
          break;
        }
      }
    }
  } else if (xmlData.length > i + 9 && xmlData[i + 1] === "[" && xmlData[i + 2] === "C" && xmlData[i + 3] === "D" && xmlData[i + 4] === "A" && xmlData[i + 5] === "T" && xmlData[i + 6] === "A" && xmlData[i + 7] === "[") {
    for (i += 8; i < xmlData.length; i++) {
      if (xmlData[i] === "]" && xmlData[i + 1] === "]" && xmlData[i + 2] === ">") {
        i += 2;
        break;
      }
    }
  }
  return i;
}
const doubleQuote = '"';
const singleQuote = "'";
function readAttributeStr(xmlData, i) {
  let attrStr = "";
  let startChar = "";
  let tagClosed = false;
  for (; i < xmlData.length; i++) {
    if (xmlData[i] === doubleQuote || xmlData[i] === singleQuote) {
      if (startChar === "") {
        startChar = xmlData[i];
      } else if (startChar !== xmlData[i]) ;
      else {
        startChar = "";
      }
    } else if (xmlData[i] === ">") {
      if (startChar === "") {
        tagClosed = true;
        break;
      }
    }
    attrStr += xmlData[i];
  }
  if (startChar !== "") {
    return false;
  }
  return {
    value: attrStr,
    index: i,
    tagClosed
  };
}
const validAttrStrRegxp = new RegExp(`(\\s*)([^\\s=]+)(\\s*=)?(\\s*(['"])(([\\s\\S])*?)\\5)?`, "g");
function validateAttributeString(attrStr, options) {
  const matches = getAllMatches(attrStr, validAttrStrRegxp);
  const attrNames = {};
  for (let i = 0; i < matches.length; i++) {
    if (matches[i][1].length === 0) {
      return getErrorObject("InvalidAttr", "Attribute '" + matches[i][2] + "' has no space in starting.", getPositionFromMatch(matches[i]));
    } else if (matches[i][3] !== void 0 && matches[i][4] === void 0) {
      return getErrorObject("InvalidAttr", "Attribute '" + matches[i][2] + "' is without value.", getPositionFromMatch(matches[i]));
    } else if (matches[i][3] === void 0 && !options.allowBooleanAttributes) {
      return getErrorObject("InvalidAttr", "boolean attribute '" + matches[i][2] + "' is not allowed.", getPositionFromMatch(matches[i]));
    }
    const attrName = matches[i][2];
    if (!validateAttrName(attrName)) {
      return getErrorObject("InvalidAttr", "Attribute '" + attrName + "' is an invalid name.", getPositionFromMatch(matches[i]));
    }
    if (!Object.prototype.hasOwnProperty.call(attrNames, attrName)) {
      attrNames[attrName] = 1;
    } else {
      return getErrorObject("InvalidAttr", "Attribute '" + attrName + "' is repeated.", getPositionFromMatch(matches[i]));
    }
  }
  return true;
}
function validateNumberAmpersand(xmlData, i) {
  let re = /\d/;
  if (xmlData[i] === "x") {
    i++;
    re = /[\da-fA-F]/;
  }
  for (; i < xmlData.length; i++) {
    if (xmlData[i] === ";")
      return i;
    if (!xmlData[i].match(re))
      break;
  }
  return -1;
}
function validateAmpersand(xmlData, i) {
  i++;
  if (xmlData[i] === ";")
    return -1;
  if (xmlData[i] === "#") {
    i++;
    return validateNumberAmpersand(xmlData, i);
  }
  let count = 0;
  for (; i < xmlData.length; i++, count++) {
    if (xmlData[i].match(/\w/) && count < 20)
      continue;
    if (xmlData[i] === ";")
      break;
    return -1;
  }
  return i;
}
function getErrorObject(code, message, lineNumber) {
  return {
    err: {
      code,
      msg: message,
      line: lineNumber.line || lineNumber,
      col: lineNumber.col
    }
  };
}
function validateAttrName(attrName) {
  return isName(attrName);
}
function validateTagName(tagname) {
  return isName(tagname);
}
function getLineNumberForPosition(xmlData, index) {
  const lines = xmlData.substring(0, index).split(/\r?\n/);
  return {
    line: lines.length,
    // column number is last line's length + 1, because column numbering starts at 1:
    col: lines[lines.length - 1].length + 1
  };
}
function getPositionFromMatch(match) {
  return match.startIndex + match[1].length;
}
const CURRENCY = {
  cent: "¢",
  pound: "£",
  curren: "¤",
  yen: "¥",
  euro: "€",
  dollar: "$",
  fnof: "ƒ",
  inr: "₹",
  af: "؋",
  birr: "ብር",
  peso: "₱",
  rub: "₽",
  won: "₩",
  yuan: "¥",
  cedil: "¸"
};
const XML = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"'
};
const COMMON_HTML = {
  nbsp: " ",
  copy: "©",
  reg: "®",
  trade: "™",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  bull: "•",
  para: "¶",
  sect: "§",
  deg: "°",
  frac12: "½",
  frac14: "¼",
  frac34: "¾"
};
const ENTITY_ACTION = Object.freeze({
  /** Resolve and expand the entity normally. */
  ALLOW: "allow",
  /** Silently skip this entity — it will not be registered. */
  BLOCK: "block",
  /** Throw an error, aborting entity registration entirely. */
  THROW: "throw"
});
const SPECIAL_CHARS = new Set("!?\\\\/[]$%{}^&*()<>|+");
function validateEntityName$1(name) {
  if (name[0] === "#") {
    throw new Error(`[EntityReplacer] Invalid character '#' in entity name: "${name}"`);
  }
  for (const ch of name) {
    if (SPECIAL_CHARS.has(ch)) {
      throw new Error(`[EntityReplacer] Invalid character '${ch}' in entity name: "${name}"`);
    }
  }
  return name;
}
function mergeEntityMaps(...maps) {
  const out = /* @__PURE__ */ Object.create(null);
  for (const map of maps) {
    if (!map) continue;
    for (const key of Object.keys(map)) {
      const raw = map[key];
      if (typeof raw === "string") {
        out[key] = raw;
      } else if (raw && typeof raw === "object" && raw.val !== void 0) {
        const val = raw.val;
        if (typeof val === "string") {
          out[key] = val;
        }
      }
    }
  }
  return out;
}
const LIMIT_TIER_EXTERNAL = "external";
const LIMIT_TIER_BASE = "base";
const LIMIT_TIER_ALL = "all";
function parseLimitTiers(raw) {
  if (!raw || raw === LIMIT_TIER_EXTERNAL) return /* @__PURE__ */ new Set([LIMIT_TIER_EXTERNAL]);
  if (raw === LIMIT_TIER_ALL) return /* @__PURE__ */ new Set([LIMIT_TIER_ALL]);
  if (raw === LIMIT_TIER_BASE) return /* @__PURE__ */ new Set([LIMIT_TIER_BASE]);
  if (Array.isArray(raw)) return new Set(raw);
  return /* @__PURE__ */ new Set([LIMIT_TIER_EXTERNAL]);
}
const NCR_LEVEL = Object.freeze({ allow: 0, leave: 1, remove: 2, throw: 3 });
const XML10_ALLOWED_C0 = /* @__PURE__ */ new Set([9, 10, 13]);
function parseNCRConfig(ncr) {
  if (!ncr) {
    return { xmlVersion: 1, onLevel: NCR_LEVEL.allow, nullLevel: NCR_LEVEL.remove };
  }
  const xmlVersion = ncr.xmlVersion === 1.1 ? 1.1 : 1;
  const onLevel = NCR_LEVEL[ncr.onNCR] ?? NCR_LEVEL.allow;
  const nullLevel = NCR_LEVEL[ncr.nullNCR] ?? NCR_LEVEL.remove;
  const clampedNull = Math.max(nullLevel, NCR_LEVEL.remove);
  return { xmlVersion, onLevel, nullLevel: clampedNull };
}
class EntityDecoder {
  /**
   * @param {object} [options]
   * @param {object|null}  [options.namedEntities]        — extra named entities merged into base map
   * @param {object}  [options.limit]                 — security limits
   * @param {number}       [options.limit.maxTotalExpansions=0]  — 0 = unlimited
   * @param {number}       [options.limit.maxExpandedLength=0]   — 0 = unlimited
   * @param {'external'|'base'|'all'|string[]} [options.limit.applyLimitsTo='external']
   *   Which entity tiers count against the security limits:
   *   - 'external' (default) — only input/runtime + persistent external entities
   *   - 'base'               — only DEFAULT_XML_ENTITIES + namedEntities
   *   - 'all'                — every entity regardless of tier
   *   - string[]             — explicit combination, e.g. ['external', 'base']
   * @param {((resolved: string, original: string) => string)|null} [options.postCheck=null]
   * @param {string[]} [options.remove=[]] — entity names (e.g. ['nbsp', '#13']) to delete (replace with empty string)
   * @param {string[]} [options.leave=[]]  — entity names to keep as literal (unchanged in output)
   * @param {object}   [options.ncr]       — Numeric Character Reference controls
   * @param {1.0|1.1}  [options.ncr.xmlVersion=1.0]
   *   XML version governing which codepoint ranges are restricted:
   *   - 1.0 — C0 controls U+0001–U+001F (except U+0009/000A/000D) are prohibited
   *   - 1.1 — C0 controls are allowed when written as NCRs; C1 (U+007F–U+009F) decoded as-is
   * @param {'allow'|'leave'|'remove'|'throw'} [options.ncr.onNCR='allow']
   *   Base action for numeric references. Severity order: allow < leave < remove < throw.
   *   For codepoint ranges that carry a minimum level (surrogates → remove, XML 1.0 C0 → remove),
   *   the effective action is max(onNCR, rangeMinimum).
   * @param {'remove'|'throw'} [options.ncr.nullNCR='remove']
   *   Action for U+0000 (null). 'allow' and 'leave' are clamped to 'remove' since null is never safe.
   * @param {((name: string, value: string) => 'allow'|'block'|'throw')|null} [options.onExternalEntity=null]
   *   Hook called when an external entity is registered via `setExternalEntities()` or
   *   `addExternalEntity()`. Return `ENTITY_ACTION.ALLOW` to accept the entity,
   *   `ENTITY_ACTION.BLOCK` to silently skip it, or `ENTITY_ACTION.THROW` to abort with an error.
   * @param {((name: string, value: string) => 'allow'|'block'|'throw')|null} [options.onInputEntity=null]
   *   Hook called when an input entity is registered via `addInputEntities()`. Return
   *   `ENTITY_ACTION.ALLOW` to accept, `ENTITY_ACTION.BLOCK` to silently skip, or
   *   `ENTITY_ACTION.THROW` to abort with an error.
   */
  constructor(options = {}) {
    this._limit = options.limit || {};
    this._maxTotalExpansions = this._limit.maxTotalExpansions || 0;
    this._maxExpandedLength = this._limit.maxExpandedLength || 0;
    this._postCheck = typeof options.postCheck === "function" ? options.postCheck : (r) => r;
    this._limitTiers = parseLimitTiers(this._limit.applyLimitsTo ?? LIMIT_TIER_EXTERNAL);
    this._numericAllowed = options.numericAllowed ?? true;
    this._baseMap = mergeEntityMaps(XML, options.namedEntities || null);
    this._externalMap = /* @__PURE__ */ Object.create(null);
    this._inputMap = /* @__PURE__ */ Object.create(null);
    this._totalExpansions = 0;
    this._expandedLength = 0;
    this._removeSet = new Set(options.remove && Array.isArray(options.remove) ? options.remove : []);
    this._leaveSet = new Set(options.leave && Array.isArray(options.leave) ? options.leave : []);
    const ncrCfg = parseNCRConfig(options.ncr);
    this._ncrXmlVersion = ncrCfg.xmlVersion;
    this._ncrOnLevel = ncrCfg.onLevel;
    this._ncrNullLevel = ncrCfg.nullLevel;
    this._onExternalEntity = typeof options.onExternalEntity === "function" ? options.onExternalEntity : null;
    this._onInputEntity = typeof options.onInputEntity === "function" ? options.onInputEntity : null;
  }
  // -------------------------------------------------------------------------
  // Private: registration hook dispatch
  // -------------------------------------------------------------------------
  /**
   * Invoke a registration hook for a single entity name/value pair.
   * Returns true when the entity should be accepted, false when it should be
   * silently skipped (BLOCK), and throws when the hook returns THROW.
   *
   * @param {((name: string, value: string) => 'allow'|'block'|'throw')|null} hook
   * @param {string} name
   * @param {string} value
   * @param {string} context  — used in error messages ('external' | 'input')
   * @returns {boolean}  true = accept, false = skip
   */
  _applyRegistrationHook(hook, name, value, context) {
    if (!hook) return true;
    const action = hook(name, value);
    if (action === ENTITY_ACTION.BLOCK) return false;
    if (action === ENTITY_ACTION.THROW) {
      throw new Error(
        `[EntityDecoder] Registration of ${context} entity "&${name};" was rejected by hook`
      );
    }
    return true;
  }
  // -------------------------------------------------------------------------
  // Persistent external entity registration
  // -------------------------------------------------------------------------
  /**
   * Replace the full set of persistent external entities.
   * All keys are validated — throws on invalid characters.
   * If `onExternalEntity` is set, it is called once per entry; entries that
   * return `ENTITY_ACTION.BLOCK` are silently omitted, `ENTITY_ACTION.THROW`
   * aborts the whole call.
   * @param {Record<string, string | { regex?: RegExp, val: string }>} map
   */
  setExternalEntities(map) {
    if (map) {
      for (const key of Object.keys(map)) {
        validateEntityName$1(key);
      }
    }
    if (!this._onExternalEntity) {
      this._externalMap = mergeEntityMaps(map);
      return;
    }
    const flat = mergeEntityMaps(map);
    const filtered = /* @__PURE__ */ Object.create(null);
    for (const [name, value] of Object.entries(flat)) {
      if (this._applyRegistrationHook(this._onExternalEntity, name, value, "external")) {
        filtered[name] = value;
      }
    }
    this._externalMap = filtered;
  }
  /**
   * Add a single persistent external entity.
   * If `onExternalEntity` is set it is called before the entity is stored;
   * `ENTITY_ACTION.BLOCK` silently skips storage, `ENTITY_ACTION.THROW` raises.
   * @param {string} key
   * @param {string} value
   */
  addExternalEntity(key, value) {
    validateEntityName$1(key);
    if (typeof value === "string" && value.indexOf("&") === -1) {
      if (this._applyRegistrationHook(this._onExternalEntity, key, value, "external")) {
        this._externalMap[key] = value;
      }
    }
  }
  // -------------------------------------------------------------------------
  // Input / runtime entity registration (per document)
  // -------------------------------------------------------------------------
  /**
   * Inject DOCTYPE entities for the current document.
   * Also resets per-document expansion counters.
   * If `onInputEntity` is set it is called once per entry; entries returning
   * `ENTITY_ACTION.BLOCK` are silently omitted, `ENTITY_ACTION.THROW` aborts.
   * @param {Record<string, string | { regx?: RegExp, regex?: RegExp, val: string }>} map
   */
  addInputEntities(map) {
    this._totalExpansions = 0;
    this._expandedLength = 0;
    if (!this._onInputEntity) {
      this._inputMap = mergeEntityMaps(map);
      return;
    }
    const flat = mergeEntityMaps(map);
    const filtered = /* @__PURE__ */ Object.create(null);
    for (const [name, value] of Object.entries(flat)) {
      if (this._applyRegistrationHook(this._onInputEntity, name, value, "input")) {
        filtered[name] = value;
      }
    }
    this._inputMap = filtered;
  }
  // -------------------------------------------------------------------------
  // Per-document reset
  // -------------------------------------------------------------------------
  /**
   * Wipe input/runtime entities and reset counters.
   * Call this before processing each new document.
   * @returns {this}
   */
  reset() {
    this._inputMap = /* @__PURE__ */ Object.create(null);
    this._totalExpansions = 0;
    this._expandedLength = 0;
    return this;
  }
  // -------------------------------------------------------------------------
  // XML version (can be set after construction, e.g. once parser reads <?xml?>)
  // -------------------------------------------------------------------------
  /**
   * Update the XML version used for NCR classification.
   * Call this as soon as the document's `<?xml version="...">` declaration is parsed.
   * @param {1.0|1.1|number} version
   */
  setXmlVersion(version) {
    this._ncrXmlVersion = version === 1.1 ? 1.1 : 1;
  }
  // -------------------------------------------------------------------------
  // Primary API
  // -------------------------------------------------------------------------
  /**
   * Replace all entity references in `str` in a single pass.
   *
   * @param {string} str
   * @returns {string}
   */
  decode(str) {
    if (typeof str !== "string" || str.length === 0) return str;
    if (str.indexOf("&") === -1) return str;
    const original = str;
    const chunks = [];
    const len = str.length;
    let last = 0;
    let i = 0;
    const limitExpansions = this._maxTotalExpansions > 0;
    const limitLength = this._maxExpandedLength > 0;
    const checkLimits = limitExpansions || limitLength;
    while (i < len) {
      if (str.charCodeAt(i) !== 38) {
        i++;
        continue;
      }
      let j = i + 1;
      while (j < len && str.charCodeAt(j) !== 59 && j - i <= 32) j++;
      if (j >= len || str.charCodeAt(j) !== 59) {
        i++;
        continue;
      }
      const token = str.slice(i + 1, j);
      if (token.length === 0) {
        i++;
        continue;
      }
      let replacement;
      let tier;
      if (this._removeSet.has(token)) {
        replacement = "";
        if (tier === void 0) {
          tier = LIMIT_TIER_EXTERNAL;
        }
      } else if (this._leaveSet.has(token)) {
        i++;
        continue;
      } else if (token.charCodeAt(0) === 35) {
        const ncrResult = this._resolveNCR(token);
        if (ncrResult === void 0) {
          i++;
          continue;
        }
        replacement = ncrResult;
        tier = LIMIT_TIER_BASE;
      } else {
        const resolved = this._resolveName(token);
        replacement = resolved?.value;
        tier = resolved?.tier;
      }
      if (replacement === void 0) {
        i++;
        continue;
      }
      if (i > last) chunks.push(str.slice(last, i));
      chunks.push(replacement);
      last = j + 1;
      i = last;
      if (checkLimits && this._tierCounts(tier)) {
        if (limitExpansions) {
          this._totalExpansions++;
          if (this._totalExpansions > this._maxTotalExpansions) {
            throw new Error(
              `[EntityReplacer] Entity expansion count limit exceeded: ${this._totalExpansions} > ${this._maxTotalExpansions}`
            );
          }
        }
        if (limitLength) {
          const delta = replacement.length - (token.length + 2);
          if (delta > 0) {
            this._expandedLength += delta;
            if (this._expandedLength > this._maxExpandedLength) {
              throw new Error(
                `[EntityReplacer] Expanded content length limit exceeded: ${this._expandedLength} > ${this._maxExpandedLength}`
              );
            }
          }
        }
      }
    }
    if (last < len) chunks.push(str.slice(last));
    const result = chunks.length === 0 ? str : chunks.join("");
    return this._postCheck(result, original);
  }
  // -------------------------------------------------------------------------
  // Private: limit tier check
  // -------------------------------------------------------------------------
  /**
   * Returns true if a resolved entity of the given tier should count
   * against the expansion/length limits.
   * @param {string} tier  — LIMIT_TIER_EXTERNAL | LIMIT_TIER_BASE
   * @returns {boolean}
   */
  _tierCounts(tier) {
    if (this._limitTiers.has(LIMIT_TIER_ALL)) return true;
    return this._limitTiers.has(tier);
  }
  // -------------------------------------------------------------------------
  // Private: entity resolution
  // -------------------------------------------------------------------------
  /**
   * Resolve a named entity token (without & and ;).
   * Priority: inputMap > externalMap > baseMap
   * Returns the resolved value tagged with its limit tier.
   *
   * @param {string} name
   * @returns {{ value: string, tier: string }|undefined}
   */
  _resolveName(name) {
    if (name in this._inputMap) return { value: this._inputMap[name], tier: LIMIT_TIER_EXTERNAL };
    if (name in this._externalMap) return { value: this._externalMap[name], tier: LIMIT_TIER_EXTERNAL };
    if (name in this._baseMap) return { value: this._baseMap[name], tier: LIMIT_TIER_BASE };
    return void 0;
  }
  /**
   * Classify a codepoint and return the minimum action level that must be applied.
   * Returns -1 when no minimum is imposed (normal allow path).
   *
   * Ranges checked (in priority order):
   *   1. U+0000            — null, governed by nullNCR (always ≥ remove)
   *   2. U+D800–U+DFFF     — surrogates, always prohibited (min: remove)
   *   3. U+0001–U+001F \ {0x09,0x0A,0x0D}  — XML 1.0 restricted C0 (min: remove)
   *      (skipped in XML 1.1 — C0 controls are allowed when written as NCRs)
   *
   * @param {number} cp  — codepoint
   * @returns {number}   — minimum NCR_LEVEL value, or -1 for no restriction
   */
  _classifyNCR(cp) {
    if (cp === 0) return this._ncrNullLevel;
    if (cp >= 55296 && cp <= 57343) return NCR_LEVEL.remove;
    if (this._ncrXmlVersion === 1) {
      if (cp >= 1 && cp <= 31 && !XML10_ALLOWED_C0.has(cp)) return NCR_LEVEL.remove;
    }
    return -1;
  }
  /**
   * Execute a resolved NCR action.
   *
   * @param {number} action   — NCR_LEVEL value
   * @param {string} token    — raw token (e.g. '#38') for error messages
   * @param {number} cp       — codepoint, used only for error messages
   * @returns {string|undefined}
   *   - decoded character string  → 'allow'
   *   - ''                        → 'remove'
   *   - undefined                 → 'leave' (caller must skip past '&' only)
   *   - throws Error              → 'throw'
   */
  _applyNCRAction(action, token, cp) {
    switch (action) {
      case NCR_LEVEL.allow:
        return String.fromCodePoint(cp);
      case NCR_LEVEL.remove:
        return "";
      case NCR_LEVEL.leave:
        return void 0;
      // signal: keep literal
      case NCR_LEVEL.throw:
        throw new Error(
          `[EntityDecoder] Prohibited numeric character reference &${token}; (U+${cp.toString(16).toUpperCase().padStart(4, "0")})`
        );
      default:
        return String.fromCodePoint(cp);
    }
  }
  /**
   * Full NCR resolution pipeline for a numeric token.
   *
   * Steps:
   *   1. Parse the codepoint (decimal or hex).
   *   2. Validate the raw codepoint range (NaN, <0, >0x10FFFF).
   *   3. If numericAllowed is false and no minimum restriction applies → leave as-is.
   *   4. Classify the codepoint to find the minimum required action level.
   *   5. Resolve effective action = max(onNCR, minimum).
   *   6. Apply and return.
   *
   * @param {string} token  — e.g. '#38', '#x26', '#X26'
   * @returns {string|undefined}
   *   - string (incl. '')  — replacement ('' = remove)
   *   - undefined          — leave original &token; as-is
   */
  _resolveNCR(token) {
    const second = token.charCodeAt(1);
    let cp;
    if (second === 120 || second === 88) {
      cp = parseInt(token.slice(2), 16);
    } else {
      cp = parseInt(token.slice(1), 10);
    }
    if (Number.isNaN(cp) || cp < 0 || cp > 1114111) return void 0;
    const minimum = this._classifyNCR(cp);
    if (!this._numericAllowed && minimum < NCR_LEVEL.remove) return void 0;
    const effective = minimum === -1 ? this._ncrOnLevel : Math.max(this._ncrOnLevel, minimum);
    return this._applyNCRAction(effective, token, cp);
  }
}
const defaultOnDangerousProperty = (name) => {
  if (DANGEROUS_PROPERTY_NAMES.includes(name)) {
    return "__" + name;
  }
  return name;
};
const defaultOptions = {
  preserveOrder: false,
  attributeNamePrefix: "@_",
  attributesGroupName: false,
  textNodeName: "#text",
  ignoreAttributes: true,
  removeNSPrefix: false,
  // remove NS from tag name or attribute name if true
  allowBooleanAttributes: false,
  //a tag can have attributes without any value
  //ignoreRootElement : false,
  parseTagValue: true,
  parseAttributeValue: false,
  trimValues: true,
  //Trim string values of tag and attributes
  cdataPropName: false,
  numberParseOptions: {
    hex: true,
    leadingZeros: true,
    eNotation: true,
    unicode: false
  },
  tagValueProcessor: function(tagName, val) {
    return val;
  },
  attributeValueProcessor: function(attrName, val) {
    return val;
  },
  stopNodes: [],
  //nested tags will not be parsed even for errors
  alwaysCreateTextNode: false,
  isArray: () => false,
  commentPropName: false,
  unpairedTags: [],
  processEntities: true,
  htmlEntities: false,
  entityDecoder: null,
  ignoreDeclaration: false,
  ignorePiTags: false,
  transformTagName: false,
  transformAttributeName: false,
  updateTag: function(tagName, jPath, attrs) {
    return tagName;
  },
  // skipEmptyListItem: false
  captureMetaData: false,
  maxNestedTags: 100,
  strictReservedNames: true,
  jPath: true,
  // if true, pass jPath string to callbacks; if false, pass matcher instance
  onDangerousProperty: defaultOnDangerousProperty
};
function validatePropertyName(propertyName, optionName) {
  if (typeof propertyName !== "string") {
    return;
  }
  const normalized = propertyName.toLowerCase();
  if (DANGEROUS_PROPERTY_NAMES.some((dangerous) => normalized === dangerous.toLowerCase())) {
    throw new Error(
      `[SECURITY] Invalid ${optionName}: "${propertyName}" is a reserved JavaScript keyword that could cause prototype pollution`
    );
  }
  if (criticalProperties.some((dangerous) => normalized === dangerous.toLowerCase())) {
    throw new Error(
      `[SECURITY] Invalid ${optionName}: "${propertyName}" is a reserved JavaScript keyword that could cause prototype pollution`
    );
  }
}
function normalizeProcessEntities(value, htmlEntities) {
  if (typeof value === "boolean") {
    return {
      enabled: value,
      // true or false
      maxEntitySize: 1e4,
      maxExpansionDepth: 1e4,
      maxTotalExpansions: Infinity,
      maxExpandedLength: 1e5,
      maxEntityCount: 1e3,
      allowedTags: null,
      tagFilter: null,
      appliesTo: "all"
    };
  }
  if (typeof value === "object" && value !== null) {
    return {
      enabled: value.enabled !== false,
      maxEntitySize: Math.max(1, value.maxEntitySize ?? 1e4),
      maxExpansionDepth: Math.max(1, value.maxExpansionDepth ?? 1e4),
      maxTotalExpansions: Math.max(1, value.maxTotalExpansions ?? Infinity),
      maxExpandedLength: Math.max(1, value.maxExpandedLength ?? 1e5),
      maxEntityCount: Math.max(1, value.maxEntityCount ?? 1e3),
      allowedTags: value.allowedTags ?? null,
      tagFilter: value.tagFilter ?? null,
      appliesTo: value.appliesTo ?? "all"
    };
  }
  return normalizeProcessEntities(true);
}
const buildOptions = function(options) {
  const built = Object.assign({}, defaultOptions, options);
  const propertyNameOptions = [
    { value: built.attributeNamePrefix, name: "attributeNamePrefix" },
    { value: built.attributesGroupName, name: "attributesGroupName" },
    { value: built.textNodeName, name: "textNodeName" },
    { value: built.cdataPropName, name: "cdataPropName" },
    { value: built.commentPropName, name: "commentPropName" }
  ];
  for (const { value, name } of propertyNameOptions) {
    if (value) {
      validatePropertyName(value, name);
    }
  }
  if (built.onDangerousProperty === null) {
    built.onDangerousProperty = defaultOnDangerousProperty;
  }
  built.processEntities = normalizeProcessEntities(built.processEntities, built.htmlEntities);
  built.unpairedTagsSet = new Set(built.unpairedTags);
  if (built.stopNodes && Array.isArray(built.stopNodes)) {
    built.stopNodes = built.stopNodes.map((node) => {
      if (typeof node === "string" && node.startsWith("*.")) {
        return ".." + node.substring(2);
      }
      return node;
    });
  }
  return built;
};
let METADATA_SYMBOL$1;
if (typeof Symbol !== "function") {
  METADATA_SYMBOL$1 = "@@xmlMetadata";
} else {
  METADATA_SYMBOL$1 = Symbol("XML Node Metadata");
}
class XmlNode {
  constructor(tagname) {
    this.tagname = tagname;
    this.child = [];
    this[":@"] = /* @__PURE__ */ Object.create(null);
  }
  add(key, val) {
    if (key === "__proto__") key = "#__proto__";
    this.child.push({ [key]: val });
  }
  addChild(node, startIndex) {
    if (node.tagname === "__proto__") node.tagname = "#__proto__";
    if (node[":@"] && Object.keys(node[":@"]).length > 0) {
      this.child.push({ [node.tagname]: node.child, [":@"]: node[":@"] });
    } else {
      this.child.push({ [node.tagname]: node.child });
    }
    if (startIndex !== void 0) {
      this.child[this.child.length - 1][METADATA_SYMBOL$1] = { startIndex };
    }
  }
  /** symbol used for metadata */
  static getMetaDataSymbol() {
    return METADATA_SYMBOL$1;
  }
}
const nameStartChar10 = ":A-Za-z_À-ÖØ-öø-˿Ͱ-ͽͿ-҆҈-῿‌-‍⁰-↏Ⰰ-⿯、-퟿豈-﷏ﷰ-�";
const nameChar10 = nameStartChar10 + "\\-\\.\\d·̀-ͯ‿-⁀";
const nameStartChar11 = ":A-Za-z_À-˿Ͱ-ͽͿ-҆҈-῿‌-‍⁰-↏Ⰰ-⿯、-퟿豈-﷏ﷰ-�𐀀-󯿿";
const nameChar11 = nameStartChar11 + "\\-\\.\\d·̀-ͯ҇‿-⁀";
const buildRegexes = (startChar, char, flags = "") => {
  const ncStart = startChar.replace(":", "");
  const ncChar = char.replace(":", "");
  const ncNamePat = `[${ncStart}][${ncChar}]*`;
  return {
    name: new RegExp(`^[${startChar}][${char}]*$`, flags),
    ncName: new RegExp(`^${ncNamePat}$`, flags),
    qName: new RegExp(`^${ncNamePat}(?::${ncNamePat})?$`, flags),
    nmToken: new RegExp(`^[${char}]+$`, flags),
    nmTokens: new RegExp(`^[${char}]+(?:\\s+[${char}]+)*$`, flags)
  };
};
const regexes10 = buildRegexes(nameStartChar10, nameChar10);
const regexes11 = buildRegexes(nameStartChar11, nameChar11, "u");
const nameStartCharAscii = ":A-Za-z_";
const nameCharAscii = nameStartCharAscii + "\\-\\.\\d";
const regexesAscii = buildRegexes(nameStartCharAscii, nameCharAscii);
const getRegexes = (xmlVersion = "1.0", asciiOnly = false) => {
  if (asciiOnly) return regexesAscii;
  return xmlVersion === "1.1" ? regexes11 : regexes10;
};
const qName = (str, { xmlVersion = "1.0", asciiOnly = false } = {}) => getRegexes(xmlVersion, asciiOnly).qName.test(str);
class DocTypeReader {
  constructor(options, xmlVersion) {
    this.suppressValidationErr = !options;
    this.options = options;
    this.xmlVersion = xmlVersion || 1;
  }
  setXmlVersion(xmlVersion = 1) {
    this.xmlVersion = xmlVersion;
  }
  readDocType(xmlData, i) {
    const entities = /* @__PURE__ */ Object.create(null);
    let entityCount = 0;
    if (xmlData[i + 3] === "O" && xmlData[i + 4] === "C" && xmlData[i + 5] === "T" && xmlData[i + 6] === "Y" && xmlData[i + 7] === "P" && xmlData[i + 8] === "E") {
      i = i + 9;
      let angleBracketsCount = 1;
      let hasBody = false, comment = false;
      let exp = "";
      for (; i < xmlData.length; i++) {
        if (xmlData[i] === "<" && !comment) {
          if (hasBody && hasSeq(xmlData, "!ENTITY", i)) {
            i += 7;
            let entityName, val;
            [entityName, val, i] = this.readEntityExp(xmlData, i + 1, this.suppressValidationErr);
            if (val.indexOf("&") === -1) {
              if (this.options.enabled !== false && this.options.maxEntityCount != null && entityCount >= this.options.maxEntityCount) {
                throw new Error(
                  `Entity count (${entityCount + 1}) exceeds maximum allowed (${this.options.maxEntityCount})`
                );
              }
              entities[entityName] = val;
              entityCount++;
            }
          } else if (hasBody && hasSeq(xmlData, "!ELEMENT", i)) {
            i += 8;
            const { index } = this.readElementExp(xmlData, i + 1);
            i = index;
          } else if (hasBody && hasSeq(xmlData, "!ATTLIST", i)) {
            i += 8;
          } else if (hasBody && hasSeq(xmlData, "!NOTATION", i)) {
            i += 9;
            const { index } = this.readNotationExp(xmlData, i + 1, this.suppressValidationErr);
            i = index;
          } else if (hasSeq(xmlData, "!--", i)) comment = true;
          else throw new Error(`Invalid DOCTYPE`);
          angleBracketsCount++;
          exp = "";
        } else if (xmlData[i] === ">") {
          if (comment) {
            if (xmlData[i - 1] === "-" && xmlData[i - 2] === "-") {
              comment = false;
              angleBracketsCount--;
            }
          } else {
            angleBracketsCount--;
          }
          if (angleBracketsCount === 0) {
            break;
          }
        } else if (xmlData[i] === "[") {
          hasBody = true;
        } else {
          exp += xmlData[i];
        }
      }
      if (angleBracketsCount !== 0) {
        throw new Error(`Unclosed DOCTYPE`);
      }
    } else {
      throw new Error(`Invalid Tag instead of DOCTYPE`);
    }
    return { entities, i };
  }
  readEntityExp(xmlData, i) {
    i = skipWhitespace(xmlData, i);
    const startIndex = i;
    while (i < xmlData.length && !/\s/.test(xmlData[i]) && xmlData[i] !== '"' && xmlData[i] !== "'") {
      i++;
    }
    let entityName = xmlData.substring(startIndex, i);
    validateEntityName(entityName, { xmlVersion: this.xmlVersion });
    i = skipWhitespace(xmlData, i);
    if (!this.suppressValidationErr) {
      if (xmlData.substring(i, i + 6).toUpperCase() === "SYSTEM") {
        throw new Error("External entities are not supported");
      } else if (xmlData[i] === "%") {
        throw new Error("Parameter entities are not supported");
      }
    }
    let entityValue = "";
    [i, entityValue] = this.readIdentifierVal(xmlData, i, "entity");
    if (this.options.enabled !== false && this.options.maxEntitySize != null && entityValue.length > this.options.maxEntitySize) {
      throw new Error(
        `Entity "${entityName}" size (${entityValue.length}) exceeds maximum allowed size (${this.options.maxEntitySize})`
      );
    }
    i--;
    return [entityName, entityValue, i];
  }
  readNotationExp(xmlData, i) {
    i = skipWhitespace(xmlData, i);
    const startIndex = i;
    while (i < xmlData.length && !/\s/.test(xmlData[i])) {
      i++;
    }
    let notationName = xmlData.substring(startIndex, i);
    !this.suppressValidationErr && validateEntityName(notationName, { xmlVersion: this.xmlVersion });
    i = skipWhitespace(xmlData, i);
    const identifierType = xmlData.substring(i, i + 6).toUpperCase();
    if (!this.suppressValidationErr && identifierType !== "SYSTEM" && identifierType !== "PUBLIC") {
      throw new Error(`Expected SYSTEM or PUBLIC, found "${identifierType}"`);
    }
    i += identifierType.length;
    i = skipWhitespace(xmlData, i);
    let publicIdentifier = null;
    let systemIdentifier = null;
    if (identifierType === "PUBLIC") {
      [i, publicIdentifier] = this.readIdentifierVal(xmlData, i, "publicIdentifier");
      i = skipWhitespace(xmlData, i);
      if (xmlData[i] === '"' || xmlData[i] === "'") {
        [i, systemIdentifier] = this.readIdentifierVal(xmlData, i, "systemIdentifier");
      }
    } else if (identifierType === "SYSTEM") {
      [i, systemIdentifier] = this.readIdentifierVal(xmlData, i, "systemIdentifier");
      if (!this.suppressValidationErr && !systemIdentifier) {
        throw new Error("Missing mandatory system identifier for SYSTEM notation");
      }
    }
    return { notationName, publicIdentifier, systemIdentifier, index: --i };
  }
  readIdentifierVal(xmlData, i, type) {
    let identifierVal = "";
    const startChar = xmlData[i];
    if (startChar !== '"' && startChar !== "'") {
      throw new Error(`Expected quoted string, found "${startChar}"`);
    }
    i++;
    const startIndex = i;
    while (i < xmlData.length && xmlData[i] !== startChar) {
      i++;
    }
    identifierVal = xmlData.substring(startIndex, i);
    if (xmlData[i] !== startChar) {
      throw new Error(`Unterminated ${type} value`);
    }
    i++;
    return [i, identifierVal];
  }
  readElementExp(xmlData, i) {
    i = skipWhitespace(xmlData, i);
    const startIndex = i;
    while (i < xmlData.length && !/\s/.test(xmlData[i])) {
      i++;
    }
    let elementName = xmlData.substring(startIndex, i);
    if (!this.suppressValidationErr && !qName(elementName, { xmlVersion: this.xmlVersion })) {
      throw new Error(`Invalid element name: "${elementName}"`);
    }
    i = skipWhitespace(xmlData, i);
    let contentModel = "";
    if (xmlData[i] === "E" && hasSeq(xmlData, "MPTY", i)) i += 4;
    else if (xmlData[i] === "A" && hasSeq(xmlData, "NY", i)) i += 2;
    else if (xmlData[i] === "(") {
      i++;
      const startIndex2 = i;
      while (i < xmlData.length && xmlData[i] !== ")") {
        i++;
      }
      contentModel = xmlData.substring(startIndex2, i);
      if (xmlData[i] !== ")") {
        throw new Error("Unterminated content model");
      }
    } else if (!this.suppressValidationErr) {
      throw new Error(`Invalid Element Expression, found "${xmlData[i]}"`);
    }
    return {
      elementName,
      contentModel: contentModel.trim(),
      index: i
    };
  }
  readAttlistExp(xmlData, i) {
    i = skipWhitespace(xmlData, i);
    let startIndex = i;
    while (i < xmlData.length && !/\s/.test(xmlData[i])) {
      i++;
    }
    let elementName = xmlData.substring(startIndex, i);
    validateEntityName(elementName, { xmlVersion: this.xmlVersion });
    i = skipWhitespace(xmlData, i);
    startIndex = i;
    while (i < xmlData.length && !/\s/.test(xmlData[i])) {
      i++;
    }
    let attributeName = xmlData.substring(startIndex, i);
    if (!validateEntityName(attributeName, { xmlVersion: this.xmlVersion })) {
      throw new Error(`Invalid attribute name: "${attributeName}"`);
    }
    i = skipWhitespace(xmlData, i);
    let attributeType = "";
    if (xmlData.substring(i, i + 8).toUpperCase() === "NOTATION") {
      attributeType = "NOTATION";
      i += 8;
      i = skipWhitespace(xmlData, i);
      if (xmlData[i] !== "(") {
        throw new Error(`Expected '(', found "${xmlData[i]}"`);
      }
      i++;
      let allowedNotations = [];
      while (i < xmlData.length && xmlData[i] !== ")") {
        const startIndex2 = i;
        while (i < xmlData.length && xmlData[i] !== "|" && xmlData[i] !== ")") {
          i++;
        }
        let notation = xmlData.substring(startIndex2, i);
        notation = notation.trim();
        if (!validateEntityName(notation, { xmlVersion: this.xmlVersion })) {
          throw new Error(`Invalid notation name: "${notation}"`);
        }
        allowedNotations.push(notation);
        if (xmlData[i] === "|") {
          i++;
          i = skipWhitespace(xmlData, i);
        }
      }
      if (xmlData[i] !== ")") {
        throw new Error("Unterminated list of notations");
      }
      i++;
      attributeType += " (" + allowedNotations.join("|") + ")";
    } else {
      const startIndex2 = i;
      while (i < xmlData.length && !/\s/.test(xmlData[i])) {
        i++;
      }
      attributeType += xmlData.substring(startIndex2, i);
      const validTypes = ["CDATA", "ID", "IDREF", "IDREFS", "ENTITY", "ENTITIES", "NMTOKEN", "NMTOKENS"];
      if (!this.suppressValidationErr && !validTypes.includes(attributeType.toUpperCase())) {
        throw new Error(`Invalid attribute type: "${attributeType}"`);
      }
    }
    i = skipWhitespace(xmlData, i);
    let defaultValue = "";
    if (xmlData.substring(i, i + 8).toUpperCase() === "#REQUIRED") {
      defaultValue = "#REQUIRED";
      i += 8;
    } else if (xmlData.substring(i, i + 7).toUpperCase() === "#IMPLIED") {
      defaultValue = "#IMPLIED";
      i += 7;
    } else {
      [i, defaultValue] = this.readIdentifierVal(xmlData, i, "ATTLIST");
    }
    return {
      elementName,
      attributeName,
      attributeType,
      defaultValue,
      index: i
    };
  }
}
const skipWhitespace = (data, index) => {
  while (index < data.length && /\s/.test(data[index])) {
    index++;
  }
  return index;
};
function hasSeq(data, seq, i) {
  for (let j = 0; j < seq.length; j++) {
    if (seq[j] !== data[i + j + 1]) return false;
  }
  return true;
}
function validateEntityName(name, xmlVersion) {
  if (qName(name, { xmlVersion }))
    return name;
  else
    throw new Error(`Invalid entity name ${name}`);
}
const SCRIPT_ZEROS = [
  // Basic Latin (ASCII) — included for completeness / pass-through
  48,
  // 0-9
  // Arabic scripts
  1632,
  // Arabic-Indic ٠١٢٣٤٥٦٧٨٩
  1776,
  // Extended Arabic-Indic (Urdu/Persian/Sindhi) ۰۱۲۳
  // Indic scripts
  2406,
  // Devanagari ०१२३४५६७८९
  2534,
  // Bengali ০১২৩৪৫৬৭৮৯
  2662,
  // Gurmukhi ੦੧੨੩੪੫੬੭੮੯
  2790,
  // Gujarati ૦૧૨૩૪૫૬૭૮૯
  2918,
  // Odia ୦୧୨୩୪୫୬୭୮୯
  3046,
  // Tamil ௦௧௨௩௪௫௬௭௮௯
  3174,
  // Telugu ౦౧౨౩౪౫౬౭౮౯
  3302,
  // Kannada ೦೧೨೩೪೫೬೭೮೯
  3430,
  // Malayalam ൦൧൨൩൪൫൬൭൮൯
  3558,
  // Sinhala Archaic ෦෧෨෩෪෫෬෭෮෯
  // Southeast Asian scripts
  3664,
  // Thai ๐๑๒๓๔๕๖๗๘๙
  3792,
  // Lao ໐໑໒໓໔໕໖໗໘໙
  3872,
  // Tibetan ༠༡༢༣༤༥༦༧༨༩
  4160,
  // Myanmar ၀၁၂၃၄၅၆၇၈၉
  4240,
  // Myanmar Shan ႐႑႒႓႔႕႖႗႘႙
  6112,
  // Khmer ០១២៣៤៥៦៧៨៩
  6160,
  // Mongolian ᠐᠑᠒᠓᠔᠕᠖᠗᠘᠙
  6470,
  // Limbu ᥆᥇᥈᥉᥊᥋᥌᥍᥎᥏
  6608,
  // New Tai Lue ᧐᧑᧒᧓᧔᧕᧖᧗᧘᧙
  6784,
  // Tai Tham Hora ᪀᪁᪂᪃᪄᪅᪆᪇᪈᪉
  6800,
  // Tai Tham Tham ᪐᪑᪒᪓᪔᪕᪖᪗᪘᪙
  6992,
  // Balinese ᭐᭑᭒᭓᭔᭕᭖᭗᭘᭙
  7088,
  // Sundanese ᮰᮱᮲᮳᮴᮵᮶᮷᮸᮹
  7232,
  // Lepcha ᱀᱁᱂᱃᱄᱅᱆᱇᱈᱉
  7248,
  // Ol Chiki ᱐᱑᱒᱓᱔᱕᱖᱗᱘᱙
  // Fullwidth (CJK context)
  65296,
  // Fullwidth ０１２３４５６７８９
  // Mathematical digit variants (Unicode math block)
  120782,
  // Mathematical Bold
  120792,
  // Mathematical Double-Struck
  120802,
  // Mathematical Sans-Serif
  120812,
  // Mathematical Sans-Serif Bold
  120822,
  // Mathematical Monospace
  // Other scripts
  66720,
  // Osmanya 𐒠𐒡𐒢𐒣𐒤𐒥𐒦𐒧𐒨𐒩
  68912,
  // Hanifi Rohingya 𐴰𐴱𐴲𐴳𐴴𐴵𐴶𐴷𐴸𐴹
  69734,
  // Brahmi 𑁦𑁧𑁨𑁩𑁪𑁫𑁬𑁭𑁮𑁯
  69872,
  // Sora Sompeng 𑃰𑃱𑃲𑃳𑃴𑃵𑃶𑃷𑃸𑃹
  69942,
  // Chakma 𑄶𑄷𑄸𑄹𑄺𑄻𑄼𑄽𑄾𑄿
  70096,
  // Sharada 𑇐𑇑𑇒𑇓𑇔𑇕𑇖𑇗𑇘𑇙
  70384,
  // Khudawadi 𑋰𑋱𑋲𑋳𑋴𑋵𑋶𑋷𑋸𑋹
  70736,
  // Newa 𑑐𑑑𑑒𑑓𑑔𑑕𑑖𑑗𑑘𑑙
  70864,
  // Tirhuta 𑓐𑓑𑓒𑓓𑓔𑓕𑓖𑓗𑓘𑓙
  71248,
  // Modi 𑙐𑙑𑙒𑙓𑙔𑙕𑙖𑙗𑙘𑙙
  71360,
  // Takri 𑛀𑛁𑛂𑛃𑛄𑛅𑛆𑛇𑛈𑛉
  71472,
  // Ahom 𑜰𑜱𑜲𑜳𑜴𑜵𑜶𑜷𑜸𑜹
  71904,
  // Warang Citi 𑣠𑣡𑣢𑣣𑣤𑣥𑣦𑣧𑣨𑣩
  72016,
  // Dives Akuru 𑥐𑥑𑥒𑥓𑥔𑥕𑥖𑥗𑥘𑥙
  72688,
  // Khitan Small Script 𑯰𑯱𑯲𑯳𑯴𑯵𑯶𑯷𑯸𑯹
  72784,
  // Bhaiksuki 𑱐𑱑𑱒𑱓𑱔𑱕𑱖𑱗𑱘𑱙
  73040,
  // Masaram Gondi 𑵐𑵑𑵒𑵓𑵔𑵕𑵖𑵗𑵘𑵙
  73120,
  // Gunjala Gondi 𑶠𑶡𑶢𑶣𑶤𑶥𑶦𑶧𑶨𑶩
  73552,
  // Kawi 𑽐𑽑𑽒𑽓𑽔𑽕𑽖𑽗𑽘𑽙
  92768,
  // Mro 𖩠𖩡𖩢𖩣𖩤𖩥𖩦𖩧𖩨𖩩
  92864,
  // Tangsa 𖫀𖫁𖫂𖫃𖫄𖫅𖫆𖫇𖫈𖫉
  93008,
  // Pahawh Hmong 𖭐𖭑𖭒𖭓𖭔𖭕𖭖𖭗𖭘𖭙
  123200,
  // Nyiakeng Puachue Hmong 𞅀𞅁𞅂𞅃𞅄𞅅𞅆𞅇𞅈𞅉
  123632,
  // Wancho 𞋰𞋱𞋲𞋳𞋴𞋵𞋶𞋷𞋸𞋹
  124144,
  // Nag Mundari 𞓰𞓱𞓲𞓳𞓴𞓵𞓶𞓷𞓸𞓹
  125264,
  // Adlam 𞥐𞥑𞥒𞥓𞥔𞥕𞥖𞥗𞥘𞥙
  130032
  // Segmented digit symbols 🯰🯱🯲🯳🯴🯵🯶🯷🯸🯹
];
const NOT_DIGIT = 255;
const HIGH_MAP = /* @__PURE__ */ new Map();
const LOW_MAX = 65535;
const LOW_MIN = 1632;
const TABLE_OFFSET = LOW_MIN;
const TABLE_SIZE = LOW_MAX - LOW_MIN + 1;
const TABLE = new Uint8Array(TABLE_SIZE).fill(NOT_DIGIT);
for (const zero of SCRIPT_ZEROS) {
  for (let d = 0; d < 10; d++) {
    const cp = zero + d;
    if (cp <= LOW_MAX) {
      TABLE[cp - TABLE_OFFSET] = d;
    } else {
      HIGH_MAP.set(cp, d);
    }
  }
}
const CHAR_0 = 48;
const CHAR_9 = 57;
const CHAR_MINUS = 45;
const MINUS_SET = /* @__PURE__ */ new Set([8722, 65293, 65123]);
function anynum(str) {
  if (typeof str !== "string") return str;
  const len = str.length;
  if (len === 0) return str;
  let firstHit = -1;
  for (let i = 0; i < len; i++) {
    const cc = str.charCodeAt(i);
    if (cc >= CHAR_0 && cc <= CHAR_9 || cc === CHAR_MINUS) continue;
    if (cc < TABLE_OFFSET) {
      if (MINUS_SET.has(cc)) {
        firstHit = i;
        break;
      }
      continue;
    }
    if (cc >= 55296 && cc <= 56319) {
      if (i + 1 < len) {
        const low = str.charCodeAt(i + 1);
        if (low >= 56320 && low <= 57343) {
          const cp = 65536 + (cc - 55296 << 10) + (low - 56320);
          if (HIGH_MAP.has(cp)) {
            firstHit = i;
            break;
          }
        }
      }
      continue;
    }
    if (TABLE[cc - TABLE_OFFSET] !== NOT_DIGIT || MINUS_SET.has(cc)) {
      firstHit = i;
      break;
    }
  }
  if (firstHit === -1) return str;
  const chars = [];
  if (firstHit > 0) chars.push(str.slice(0, firstHit));
  for (let i = firstHit; i < len; i++) {
    const cc = str.charCodeAt(i);
    if (cc >= CHAR_0 && cc <= CHAR_9 || cc === CHAR_MINUS) {
      chars.push(str[i]);
      continue;
    }
    if (cc < TABLE_OFFSET) {
      chars.push(MINUS_SET.has(cc) ? "-" : str[i]);
      continue;
    }
    if (cc >= 55296 && cc <= 56319) {
      if (i + 1 < len) {
        const low = str.charCodeAt(i + 1);
        if (low >= 56320 && low <= 57343) {
          const cp = 65536 + (cc - 55296 << 10) + (low - 56320);
          const d2 = HIGH_MAP.get(cp);
          if (d2 !== void 0) {
            chars.push(String.fromCharCode(d2 + 48));
            i++;
            continue;
          }
        }
      }
      chars.push(str[i]);
      continue;
    }
    if (MINUS_SET.has(cc)) {
      chars.push("-");
      continue;
    }
    const d = TABLE[cc - TABLE_OFFSET];
    chars.push(d !== NOT_DIGIT ? String.fromCharCode(d + 48) : str[i]);
  }
  return chars.join("");
}
const hexRegex = /^[-+]?0x[a-fA-F0-9]+$/;
const binRegex = /^0b[01]+$/;
const octRegex = /^0o[0-7]+$/;
const numRegex = /^([\-\+])?(0*)([0-9]*(\.[0-9]*)?)$/;
const consider = {
  hex: true,
  binary: false,
  octal: false,
  leadingZeros: true,
  decimalPoint: ".",
  eNotation: true,
  //skipLike: /regex/,
  infinity: "original",
  // "null", "infinity" (Infinity type), "string" ("Infinity" (the string literal))
  unicode: false
};
function toNumber(str, options = {}) {
  options = Object.assign({}, consider, options);
  if (!str || typeof str !== "string") return str;
  let trimmedStr = str.trim();
  if (trimmedStr.length === 0) return str;
  else if (options.skipLike !== void 0 && options.skipLike.test(trimmedStr)) return str;
  else if (trimmedStr === "0") return 0;
  if (options.unicode) {
    trimmedStr = anynum(trimmedStr);
    if (trimmedStr === "0") return 0;
  }
  if (options.hex && hexRegex.test(trimmedStr)) {
    return parse_int(trimmedStr, 16);
  } else if (options.binary && binRegex.test(trimmedStr)) {
    return parse_int(trimmedStr, 2);
  } else if (options.octal && octRegex.test(trimmedStr)) {
    return parse_int(trimmedStr, 8);
  } else if (!isFinite(trimmedStr)) {
    return handleInfinity(str, Number(trimmedStr), options);
  } else if (trimmedStr.includes("e") || trimmedStr.includes("E")) {
    return resolveEnotation(str, trimmedStr, options);
  } else {
    const match = numRegex.exec(trimmedStr);
    if (match) {
      const sign = match[1] || "";
      const leadingZeros = match[2];
      let numTrimmedByZeros = trimZeros(match[3]);
      const decimalAdjacentToLeadingZeros = sign ? (
        // 0., -00., 000.
        str[leadingZeros.length + 1] === "."
      ) : str[leadingZeros.length] === ".";
      if (!options.leadingZeros && (leadingZeros.length > 1 || leadingZeros.length === 1 && !decimalAdjacentToLeadingZeros)) {
        return str;
      } else {
        const num = Number(trimmedStr);
        const parsedStr = String(num);
        if (num === 0) return num;
        if (parsedStr.search(/[eE]/) !== -1) {
          if (options.eNotation) return num;
          else return str;
        } else if (trimmedStr.indexOf(".") !== -1) {
          if (parsedStr === "0") return num;
          else if (parsedStr === numTrimmedByZeros) return num;
          else if (parsedStr === `${sign}${numTrimmedByZeros}`) return num;
          else return str;
        }
        let n = leadingZeros ? numTrimmedByZeros : trimmedStr;
        if (leadingZeros) {
          return n === parsedStr || sign + n === parsedStr ? num : str;
        } else {
          return n === parsedStr || n === sign + parsedStr ? num : str;
        }
      }
    } else {
      return str;
    }
  }
}
const eNotationRegx = /^([-+])?(0*)(\d*(\.\d*)?[eE][-\+]?\d+)$/;
function resolveEnotation(str, trimmedStr, options) {
  if (!options.eNotation) return str;
  const notation = trimmedStr.match(eNotationRegx);
  if (notation) {
    let sign = notation[1] || "";
    const eChar = notation[3].indexOf("e") === -1 ? "E" : "e";
    const leadingZeros = notation[2];
    const eAdjacentToLeadingZeros = sign ? (
      // 0E.
      str[leadingZeros.length + 1] === eChar
    ) : str[leadingZeros.length] === eChar;
    if (leadingZeros.length > 1 && eAdjacentToLeadingZeros) return str;
    else if (leadingZeros.length === 1 && (notation[3].startsWith(`.${eChar}`) || notation[3][0] === eChar)) {
      return Number(trimmedStr);
    } else if (leadingZeros.length > 0) {
      if (options.leadingZeros && !eAdjacentToLeadingZeros) {
        trimmedStr = (notation[1] || "") + notation[3];
        return Number(trimmedStr);
      } else return str;
    } else {
      return Number(trimmedStr);
    }
  } else {
    return str;
  }
}
function trimZeros(numStr) {
  if (numStr && numStr.indexOf(".") !== -1) {
    numStr = numStr.replace(/0+$/, "");
    if (numStr === ".") numStr = "0";
    else if (numStr[0] === ".") numStr = "0" + numStr;
    else if (numStr[numStr.length - 1] === ".") numStr = numStr.substring(0, numStr.length - 1);
    return numStr;
  }
  return numStr;
}
function parse_int(numStr, base) {
  const str = numStr.trim();
  if (base === 2 || base === 8) numStr = str.substring(2);
  if (parseInt) return parseInt(numStr, base);
  else if (Number.parseInt) return Number.parseInt(numStr, base);
  else if (window && window.parseInt) return window.parseInt(numStr, base);
  else throw new Error("parseInt, Number.parseInt, window.parseInt are not supported");
}
function handleInfinity(str, num, options) {
  const isPositive = num === Infinity;
  switch (options.infinity.toLowerCase()) {
    case "null":
      return null;
    case "infinity":
      return num;
    // Return Infinity or -Infinity
    case "string":
      return isPositive ? "Infinity" : "-Infinity";
    case "original":
    default:
      return str;
  }
}
function getIgnoreAttributesFn(ignoreAttributes) {
  if (typeof ignoreAttributes === "function") {
    return ignoreAttributes;
  }
  if (Array.isArray(ignoreAttributes)) {
    return (attrName) => {
      for (const pattern of ignoreAttributes) {
        if (typeof pattern === "string" && attrName === pattern) {
          return true;
        }
        if (pattern instanceof RegExp && pattern.test(attrName)) {
          return true;
        }
      }
    };
  }
  return () => false;
}
class Expression {
  /**
   * Create a new Expression
   * @param {string} pattern - Pattern string (e.g., "root.users.user", "..user[id]")
   * @param {Object} options - Configuration options
   * @param {string} options.separator - Path separator (default: '.')
   */
  constructor(pattern, options = {}, data) {
    this.pattern = pattern;
    this.separator = options.separator || ".";
    this.segments = this._parse(pattern);
    this.data = data;
    this._hasDeepWildcard = this.segments.some((seg) => seg.type === "deep-wildcard");
    this._hasAttributeCondition = this.segments.some((seg) => seg.attrName !== void 0);
    this._hasPositionSelector = this.segments.some((seg) => seg.position !== void 0);
  }
  /**
   * Parse pattern string into segments
   * @private
   * @param {string} pattern - Pattern to parse
   * @returns {Array} Array of segment objects
   */
  _parse(pattern) {
    const segments = [];
    let i = 0;
    let currentPart = "";
    while (i < pattern.length) {
      if (pattern[i] === this.separator) {
        if (i + 1 < pattern.length && pattern[i + 1] === this.separator) {
          if (currentPart.trim()) {
            segments.push(this._parseSegment(currentPart.trim()));
            currentPart = "";
          }
          segments.push({ type: "deep-wildcard" });
          i += 2;
        } else {
          if (currentPart.trim()) {
            segments.push(this._parseSegment(currentPart.trim()));
          }
          currentPart = "";
          i++;
        }
      } else {
        currentPart += pattern[i];
        i++;
      }
    }
    if (currentPart.trim()) {
      segments.push(this._parseSegment(currentPart.trim()));
    }
    return segments;
  }
  /**
   * Parse a single segment
   * @private
   * @param {string} part - Segment string (e.g., "user", "ns::user", "user[id]", "ns::user:first")
   * @returns {Object} Segment object
   */
  _parseSegment(part) {
    const segment = { type: "tag" };
    let bracketContent = null;
    let withoutBrackets = part;
    const bracketMatch = part.match(/^([^\[]+)(\[[^\]]*\])(.*)$/);
    if (bracketMatch) {
      withoutBrackets = bracketMatch[1] + bracketMatch[3];
      if (bracketMatch[2]) {
        const content = bracketMatch[2].slice(1, -1);
        if (content) {
          bracketContent = content;
        }
      }
    }
    let namespace = void 0;
    let tagAndPosition = withoutBrackets;
    if (withoutBrackets.includes("::")) {
      const nsIndex = withoutBrackets.indexOf("::");
      namespace = withoutBrackets.substring(0, nsIndex).trim();
      tagAndPosition = withoutBrackets.substring(nsIndex + 2).trim();
      if (!namespace) {
        throw new Error(`Invalid namespace in pattern: ${part}`);
      }
    }
    let tag = void 0;
    let positionMatch = null;
    if (tagAndPosition.includes(":")) {
      const colonIndex = tagAndPosition.lastIndexOf(":");
      const tagPart = tagAndPosition.substring(0, colonIndex).trim();
      const posPart = tagAndPosition.substring(colonIndex + 1).trim();
      const isPositionKeyword = ["first", "last", "odd", "even"].includes(posPart) || /^nth\(\d+\)$/.test(posPart);
      if (isPositionKeyword) {
        tag = tagPart;
        positionMatch = posPart;
      } else {
        tag = tagAndPosition;
      }
    } else {
      tag = tagAndPosition;
    }
    if (!tag) {
      throw new Error(`Invalid segment pattern: ${part}`);
    }
    segment.tag = tag;
    if (namespace) {
      segment.namespace = namespace;
    }
    if (bracketContent) {
      if (bracketContent.includes("=")) {
        const eqIndex = bracketContent.indexOf("=");
        segment.attrName = bracketContent.substring(0, eqIndex).trim();
        segment.attrValue = bracketContent.substring(eqIndex + 1).trim();
      } else {
        segment.attrName = bracketContent.trim();
      }
    }
    if (positionMatch) {
      const nthMatch = positionMatch.match(/^nth\((\d+)\)$/);
      if (nthMatch) {
        segment.position = "nth";
        segment.positionValue = parseInt(nthMatch[1], 10);
      } else {
        segment.position = positionMatch;
      }
    }
    return segment;
  }
  /**
   * Get the number of segments
   * @returns {number}
   */
  get length() {
    return this.segments.length;
  }
  /**
   * Check if expression contains deep wildcard
   * @returns {boolean}
   */
  hasDeepWildcard() {
    return this._hasDeepWildcard;
  }
  /**
   * Check if expression has attribute conditions
   * @returns {boolean}
   */
  hasAttributeCondition() {
    return this._hasAttributeCondition;
  }
  /**
   * Check if expression has position selectors
   * @returns {boolean}
   */
  hasPositionSelector() {
    return this._hasPositionSelector;
  }
  /**
   * Get string representation
   * @returns {string}
   */
  toString() {
    return this.pattern;
  }
}
class ExpressionSet {
  constructor() {
    this._byDepthAndTag = /* @__PURE__ */ new Map();
    this._wildcardByDepth = /* @__PURE__ */ new Map();
    this._deepWildcards = [];
    this._deepByTerminalTag = /* @__PURE__ */ new Map();
    this._patterns = /* @__PURE__ */ new Set();
    this._sealed = false;
  }
  /**
   * Add an Expression to the set.
   * Duplicate patterns (same pattern string) are silently ignored.
   *
   * @param {import('./Expression.js').default} expression - A pre-constructed Expression instance
   * @returns {this} for chaining
   * @throws {TypeError} if called after seal()
   *
   * @example
   * set.add(new Expression('root.users.user'));
   * set.add(new Expression('..script'));
   */
  add(expression) {
    if (this._sealed) {
      throw new TypeError(
        "ExpressionSet is sealed. Create a new ExpressionSet to add more expressions."
      );
    }
    if (this._patterns.has(expression.pattern)) return this;
    this._patterns.add(expression.pattern);
    if (expression.hasDeepWildcard()) {
      const lastSeg2 = expression.segments[expression.segments.length - 1];
      if (lastSeg2 && lastSeg2.type !== "deep-wildcard" && lastSeg2.tag !== "*") {
        const tag2 = lastSeg2.tag;
        if (!this._deepByTerminalTag.has(tag2)) this._deepByTerminalTag.set(tag2, []);
        this._deepByTerminalTag.get(tag2).push(expression);
      } else {
        this._deepWildcards.push(expression);
      }
      return this;
    }
    const depth = expression.length;
    const lastSeg = expression.segments[expression.segments.length - 1];
    const tag = lastSeg?.tag;
    if (!tag || tag === "*") {
      if (!this._wildcardByDepth.has(depth)) this._wildcardByDepth.set(depth, []);
      this._wildcardByDepth.get(depth).push(expression);
    } else {
      const key = `${depth}:${tag}`;
      if (!this._byDepthAndTag.has(key)) this._byDepthAndTag.set(key, []);
      this._byDepthAndTag.get(key).push(expression);
    }
    return this;
  }
  /**
   * Add multiple expressions at once.
   *
   * @param {import('./Expression.js').default[]} expressions - Array of Expression instances
   * @returns {this} for chaining
   *
   * @example
   * set.addAll([
   *   new Expression('root.users.user'),
   *   new Expression('root.config.setting'),
   * ]);
   */
  addAll(expressions) {
    for (const expr of expressions) this.add(expr);
    return this;
  }
  /**
   * Check whether a pattern string is already present in the set.
   *
   * @param {import('./Expression.js').default} expression
   * @returns {boolean}
   */
  has(expression) {
    return this._patterns.has(expression.pattern);
  }
  /**
   * Number of expressions in the set.
   * @type {number}
   */
  get size() {
    return this._patterns.size;
  }
  /**
   * Seal the set against further modifications.
   * Useful to prevent accidental mutations after config is built.
   * Calling add() or addAll() on a sealed set throws a TypeError.
   *
   * @returns {this}
   */
  seal() {
    this._sealed = true;
    return this;
  }
  /**
   * Whether the set has been sealed.
   * @type {boolean}
   */
  get isSealed() {
    return this._sealed;
  }
  /**
   * Test whether the matcher's current path matches any expression in the set.
   *
   * Evaluation order (cheapest → most expensive):
   *  1. Exact depth + tag bucket  — O(1) lookup, typically 0–2 expressions
   *  2. Depth-only wildcard bucket — O(1) lookup, rare
   *  3. Deep-wildcard list         — always checked, but usually small
   *
   * @param {import('./Matcher.js').default} matcher - Matcher instance (or readOnly view)
   * @returns {boolean} true if any expression matches the current path
   *
   * @example
   * if (stopNodes.matchesAny(matcher)) {
   *   // handle stop node
   * }
   */
  matchesAny(matcher) {
    return this.findMatch(matcher) !== null;
  }
  /**
  * Find and return the first Expression that matches the matcher's current path.
  *
  * Uses the same evaluation order as matchesAny (cheapest → most expensive):
  *  1. Exact depth + tag bucket
  *  2. Depth-only wildcard bucket
  *  3. Deep-wildcard list
  *
  * @param {import('./Matcher.js').default} matcher - Matcher instance (or readOnly view)
  * @returns {import('./Expression.js').default | null} the first matching Expression, or null
  *
  * @example
  * const expr = stopNodes.findMatch(matcher);
  * if (expr) {
  *   // access expr.config, expr.pattern, etc.
  * }
  */
  findMatch(matcher) {
    const depth = matcher.getDepth();
    const tag = matcher.getCurrentTag();
    const exactKey = `${depth}:${tag}`;
    const exactBucket = this._byDepthAndTag.get(exactKey);
    if (exactBucket) {
      for (let i = 0; i < exactBucket.length; i++) {
        if (matcher.matches(exactBucket[i])) return exactBucket[i];
      }
    }
    const wildcardBucket = this._wildcardByDepth.get(depth);
    if (wildcardBucket) {
      for (let i = 0; i < wildcardBucket.length; i++) {
        if (matcher.matches(wildcardBucket[i])) return wildcardBucket[i];
      }
    }
    const deepBucket = this._deepByTerminalTag.get(tag);
    if (deepBucket) {
      for (let i = 0; i < deepBucket.length; i++) {
        if (matcher.matches(deepBucket[i])) return deepBucket[i];
      }
    }
    for (let i = 0; i < this._deepWildcards.length; i++) {
      if (matcher.matches(this._deepWildcards[i])) return this._deepWildcards[i];
    }
    return null;
  }
}
class MatcherView {
  /**
   * @param {Matcher} matcher - The parent Matcher instance to read from.
   */
  constructor(matcher) {
    this._matcher = matcher;
  }
  /**
   * Get the path separator used by the parent matcher.
   * @returns {string}
   */
  get separator() {
    return this._matcher.separator;
  }
  /**
   * Get current tag name.
   * @returns {string|undefined}
   */
  getCurrentTag() {
    const path = this._matcher.path;
    return path.length > 0 ? path[path.length - 1].tag : void 0;
  }
  /**
   * Get current namespace.
   * @returns {string|undefined}
   */
  getCurrentNamespace() {
    const path = this._matcher.path;
    return path.length > 0 ? path[path.length - 1].namespace : void 0;
  }
  /**
   * Get current node's attribute value.
   * @param {string} attrName
   * @returns {*}
   */
  getAttrValue(attrName) {
    const path = this._matcher.path;
    if (path.length === 0) return void 0;
    return path[path.length - 1].values?.[attrName];
  }
  /**
   * Check if current node has an attribute.
   * @param {string} attrName
   * @returns {boolean}
   */
  hasAttr(attrName) {
    const path = this._matcher.path;
    if (path.length === 0) return false;
    const current = path[path.length - 1];
    return current.values !== void 0 && attrName in current.values;
  }
  /**
   * Get the value of a "kept" attribute from the nearest ancestor (or
   * current node) that declared it via `push(tag, attrs, ns, { keep: [...] })`.
   * @param {string} attrName
   * @returns {*}
   */
  getAnyParentAttr(attrName) {
    return this._matcher.getAnyParentAttr(attrName);
  }
  /**
   * Check whether any ancestor (or the current node) kept the given
   * attribute via `push(tag, attrs, ns, { keep: [...] })`.
   * @param {string} attrName
   * @returns {boolean}
   */
  hasAnyParentAttr(attrName) {
    return this._matcher.hasAnyParentAttr(attrName);
  }
  /**
   * Get current node's sibling position (child index in parent).
   * @returns {number}
   */
  getPosition() {
    const path = this._matcher.path;
    if (path.length === 0) return -1;
    return path[path.length - 1].position ?? 0;
  }
  /**
   * Get current node's repeat counter (occurrence count of this tag name).
   * @returns {number}
   */
  getCounter() {
    const path = this._matcher.path;
    if (path.length === 0) return -1;
    return path[path.length - 1].counter ?? 0;
  }
  /**
   * Get current node's sibling index (alias for getPosition).
   * @returns {number}
   * @deprecated Use getPosition() or getCounter() instead
   */
  getIndex() {
    return this.getPosition();
  }
  /**
   * Get current path depth.
   * @returns {number}
   */
  getDepth() {
    return this._matcher.path.length;
  }
  /**
   * Get path as string.
   * @param {string} [separator] - Optional separator (uses default if not provided)
   * @param {boolean} [includeNamespace=true]
   * @returns {string}
   */
  toString(separator, includeNamespace = true) {
    return this._matcher.toString(separator, includeNamespace);
  }
  /**
   * Get path as array of tag names.
   * @returns {string[]}
   */
  toArray() {
    return this._matcher.path.map((n) => n.tag);
  }
  /**
   * Match current path against an Expression.
   * @param {Expression} expression
   * @returns {boolean}
   */
  matches(expression) {
    return this._matcher.matches(expression);
  }
  /**
   * Match any expression in the given set against the current path.
   * @param {ExpressionSet} exprSet
   * @returns {boolean}
   */
  matchesAny(exprSet) {
    return exprSet.matchesAny(this._matcher);
  }
}
class Matcher {
  /**
   * Create a new Matcher.
   * @param {Object} [options={}]
   * @param {string} [options.separator='.'] - Default path separator
   */
  constructor(options = {}) {
    this.separator = options.separator || ".";
    this.path = [];
    this.siblingStacks = [];
    this._pathStringCache = null;
    this._view = new MatcherView(this);
    this._keptAttrs = [];
  }
  /**
   * Push a new tag onto the path.
   * @param {string} tagName
   * @param {Object|null} [attrValues=null]
   * @param {string|null} [namespace=null]
   * @param {Object|null} [options=null]
   * @param {string[]} [options.keep] - Names of attributes (from attrValues)
   */
  push(tagName, attrValues = null, namespace = null, options = null) {
    this._pathStringCache = null;
    if (this.path.length > 0) {
      this.path[this.path.length - 1].values = void 0;
    }
    const currentLevel = this.path.length;
    let level = this.siblingStacks[currentLevel];
    if (!level) {
      level = { counts: /* @__PURE__ */ new Map(), total: 0 };
      this.siblingStacks[currentLevel] = level;
    }
    const siblingKey = namespace ? `${namespace}:${tagName}` : tagName;
    const counter = level.counts.get(siblingKey) || 0;
    const position = level.total;
    level.counts.set(siblingKey, counter + 1);
    level.total++;
    const node = {
      tag: tagName,
      position,
      counter
    };
    if (namespace !== null && namespace !== void 0) {
      node.namespace = namespace;
    }
    if (attrValues !== null && attrValues !== void 0) {
      node.values = attrValues;
    }
    this.path.push(node);
    const depth = this.path.length;
    const keep = options !== null ? options.keep : null;
    if (keep !== null && keep !== void 0 && keep.length > 0 && attrValues) {
      for (let i = 0; i < keep.length; i++) {
        const name = keep[i];
        if (attrValues[name] !== void 0) {
          this._keptAttrs.push({ depth, name, value: attrValues[name] });
        }
      }
    }
  }
  /**
   * Pop the last tag from the path.
   * @returns {Object|undefined} The popped node
   */
  pop() {
    if (this.path.length === 0) return void 0;
    this._pathStringCache = null;
    const node = this.path.pop();
    if (this.siblingStacks.length > this.path.length + 1) {
      this.siblingStacks.length = this.path.length + 1;
    }
    const poppedDepth = this.path.length + 1;
    while (this._keptAttrs.length > 0 && this._keptAttrs[this._keptAttrs.length - 1].depth >= poppedDepth) {
      this._keptAttrs.pop();
    }
    return node;
  }
  /**
   * Update current node's attribute values.
   * Useful when attributes are parsed after push.
   * @param {Object} attrValues
   */
  updateCurrent(attrValues) {
    if (this.path.length > 0) {
      const current = this.path[this.path.length - 1];
      if (attrValues !== null && attrValues !== void 0) {
        current.values = attrValues;
      }
    }
  }
  /**
   * Get current tag name.
   * @returns {string|undefined}
   */
  getCurrentTag() {
    return this.path.length > 0 ? this.path[this.path.length - 1].tag : void 0;
  }
  /**
   * Get current namespace.
   * @returns {string|undefined}
   */
  getCurrentNamespace() {
    return this.path.length > 0 ? this.path[this.path.length - 1].namespace : void 0;
  }
  /**
   * Get current node's attribute value.
   * @param {string} attrName
   * @returns {*}
   */
  getAttrValue(attrName) {
    if (this.path.length === 0) return void 0;
    return this.path[this.path.length - 1].values?.[attrName];
  }
  /**
   * Check if current node has an attribute.
   * @param {string} attrName
   * @returns {boolean}
   */
  hasAttr(attrName) {
    if (this.path.length === 0) return false;
    const current = this.path[this.path.length - 1];
    return current.values !== void 0 && attrName in current.values;
  }
  /**
   * Get the value of a "kept" attribute from the nearest ancestor (or
   * current node) that declared it via `push(tag, attrs, ns, { keep: [...] })`.
   * Unlike getAttrValue(), this works regardless of how deep the path has
   * gone since the attribute was pushed — but only for attribute names that
   * were explicitly marked with `keep` at push time. Cost is proportional to
   * the number of currently-kept attributes (typically 0-3), not path depth.
   * @param {string} attrName
   * @returns {*} the value, or undefined if no ancestor kept this attribute
   */
  getAnyParentAttr(attrName) {
    const kept = this._keptAttrs;
    for (let i = kept.length - 1; i >= 0; i--) {
      if (kept[i].name === attrName) return kept[i].value;
    }
    return void 0;
  }
  /**
   * Check whether any ancestor (or the current node) kept the given
   * attribute via `push(tag, attrs, ns, { keep: [...] })`.
   * @param {string} attrName
   * @returns {boolean}
   */
  hasAnyParentAttr(attrName) {
    const kept = this._keptAttrs;
    for (let i = kept.length - 1; i >= 0; i--) {
      if (kept[i].name === attrName) return true;
    }
    return false;
  }
  /**
   * Get current node's sibling position (child index in parent).
   * @returns {number}
   */
  getPosition() {
    if (this.path.length === 0) return -1;
    return this.path[this.path.length - 1].position ?? 0;
  }
  /**
   * Get current node's repeat counter (occurrence count of this tag name).
   * @returns {number}
   */
  getCounter() {
    if (this.path.length === 0) return -1;
    return this.path[this.path.length - 1].counter ?? 0;
  }
  /**
   * Get current node's sibling index (alias for getPosition).
   * @returns {number}
   * @deprecated Use getPosition() or getCounter() instead
   */
  getIndex() {
    return this.getPosition();
  }
  /**
   * Get current path depth.
   * @returns {number}
   */
  getDepth() {
    return this.path.length;
  }
  /**
   * Get path as string.
   * @param {string} [separator] - Optional separator (uses default if not provided)
   * @param {boolean} [includeNamespace=true]
   * @returns {string}
   */
  toString(separator, includeNamespace = true) {
    const sep2 = separator || this.separator;
    const isDefault = sep2 === this.separator && includeNamespace === true;
    if (isDefault) {
      if (this._pathStringCache !== null) {
        return this._pathStringCache;
      }
      const result = this.path.map(
        (n) => n.namespace ? `${n.namespace}:${n.tag}` : n.tag
      ).join(sep2);
      this._pathStringCache = result;
      return result;
    }
    return this.path.map(
      (n) => includeNamespace && n.namespace ? `${n.namespace}:${n.tag}` : n.tag
    ).join(sep2);
  }
  /**
   * Get path as array of tag names.
   * @returns {string[]}
   */
  toArray() {
    return this.path.map((n) => n.tag);
  }
  /**
   * Reset the path to empty.
   */
  reset() {
    this._pathStringCache = null;
    this.path = [];
    this.siblingStacks = [];
    this._keptAttrs = [];
  }
  /**
   * Match current path against an Expression.
   * @param {Expression} expression
   * @returns {boolean}
   */
  matches(expression) {
    const segments = expression.segments;
    if (segments.length === 0) {
      return false;
    }
    if (expression.hasDeepWildcard()) {
      return this._matchWithDeepWildcard(segments);
    }
    return this._matchSimple(segments);
  }
  /**
   * @private
   */
  _matchSimple(segments) {
    if (this.path.length !== segments.length) {
      return false;
    }
    for (let i = 0; i < segments.length; i++) {
      if (!this._matchSegment(segments[i], this.path[i], i === this.path.length - 1)) {
        return false;
      }
    }
    return true;
  }
  /**
   * @private
   */
  _matchWithDeepWildcard(segments) {
    let pathIdx = this.path.length - 1;
    let segIdx = segments.length - 1;
    while (segIdx >= 0 && pathIdx >= 0) {
      const segment = segments[segIdx];
      if (segment.type === "deep-wildcard") {
        segIdx--;
        if (segIdx < 0) {
          return true;
        }
        const nextSeg = segments[segIdx];
        let found = false;
        for (let i = pathIdx; i >= 0; i--) {
          if (this._matchSegment(nextSeg, this.path[i], i === this.path.length - 1)) {
            pathIdx = i - 1;
            segIdx--;
            found = true;
            break;
          }
        }
        if (!found) {
          return false;
        }
      } else {
        if (!this._matchSegment(segment, this.path[pathIdx], pathIdx === this.path.length - 1)) {
          return false;
        }
        pathIdx--;
        segIdx--;
      }
    }
    return segIdx < 0;
  }
  /**
   * @private
   */
  _matchSegment(segment, node, isCurrentNode) {
    if (segment.tag !== "*" && segment.tag !== node.tag) {
      return false;
    }
    if (segment.namespace !== void 0) {
      if (segment.namespace !== "*" && segment.namespace !== node.namespace) {
        return false;
      }
    }
    if (segment.attrName !== void 0) {
      if (!isCurrentNode) {
        return false;
      }
      if (!node.values || !(segment.attrName in node.values)) {
        return false;
      }
      if (segment.attrValue !== void 0) {
        if (String(node.values[segment.attrName]) !== String(segment.attrValue)) {
          return false;
        }
      }
    }
    if (segment.position !== void 0) {
      if (!isCurrentNode) {
        return false;
      }
      const counter = node.counter ?? 0;
      if (segment.position === "first" && counter !== 0) {
        return false;
      } else if (segment.position === "odd" && counter % 2 !== 1) {
        return false;
      } else if (segment.position === "even" && counter % 2 !== 0) {
        return false;
      } else if (segment.position === "nth" && counter !== segment.positionValue) {
        return false;
      }
    }
    return true;
  }
  /**
   * Match any expression in the given set against the current path.
   * @param {ExpressionSet} exprSet
   * @returns {boolean}
   */
  matchesAny(exprSet) {
    return exprSet.matchesAny(this);
  }
  /**
   * Create a snapshot of current state.
   * @returns {Object}
   */
  snapshot() {
    return {
      path: this.path.map((node) => ({ ...node })),
      siblingStacks: this.siblingStacks.map((level) => level ? { counts: new Map(level.counts), total: level.total } : level),
      keptAttrs: this._keptAttrs.map((entry) => ({ ...entry }))
    };
  }
  /**
   * Restore state from snapshot.
   * @param {Object} snapshot
   */
  restore(snapshot) {
    this._pathStringCache = null;
    this.path = snapshot.path.map((node) => ({ ...node }));
    this.siblingStacks = snapshot.siblingStacks.map((level) => level ? { counts: new Map(level.counts), total: level.total } : level);
    this._keptAttrs = (snapshot.keptAttrs || []).map((entry) => ({ ...entry }));
  }
  /**
   * Return the read-only {@link MatcherView} for this matcher.
   *
   * The same instance is returned on every call — no allocation occurs.
   * It always reflects the current parser state and is safe to pass to
   * user callbacks without risk of accidental mutation.
   *
   * @returns {MatcherView}
   *
   * @example
   * const view = matcher.readOnly();
   * // pass view to callbacks — it stays in sync automatically
   * view.matches(expr);       // ✓
   * view.getCurrentTag();     // ✓
   * // view.push(...)         // ✗ method does not exist — caught by TypeScript
   */
  readOnly() {
    return this._view;
  }
}
const HTML_PATTERNS = [
  {
    id: "html-script-open",
    description: "<script opening tag",
    pattern: /<script[\s>/]/i
  },
  {
    id: "html-script-close",
    description: "<\/script closing tag",
    pattern: /<\/script[\s>]/i
  },
  {
    id: "html-javascript-protocol",
    description: "javascript: URI scheme (with optional whitespace/encoding)",
    // Handles j&#x61;vascript:, j\u0061vascript:, and whitespace variants
    pattern: /j[\t\n\r ]*a[\t\n\r ]*v[\t\n\r ]*a[\t\n\r ]*s[\t\n\r ]*c[\t\n\r ]*r[\t\n\r ]*i[\t\n\r ]*p[\t\n\r ]*t[\t\n\r ]*:/i
  },
  {
    id: "html-vbscript-protocol",
    description: "vbscript: URI scheme",
    pattern: /vbscript[\t\n\r ]*:/i
  },
  {
    id: "html-data-html",
    description: "data:text/html URI — can execute scripts in browsers",
    pattern: /data[\t\n\r ]*:[\t\n\r ]*text\/html/i
  },
  {
    id: "html-data-xhtml",
    description: "data:application/xhtml+xml URI",
    pattern: /data[\t\n\r ]*:[\t\n\r ]*application\/xhtml/i
  },
  {
    id: "html-data-svg",
    description: "data:image/svg+xml URI — can execute scripts",
    pattern: /data[\t\n\r ]*:[\t\n\r ]*image\/svg\+xml/i
  },
  {
    id: "html-inline-event-handler",
    description: "Inline event handler attributes: onclick=, onerror=, onload=, etc.",
    // \bon ensures we match a word boundary so "phonetic=" is not caught
    pattern: /\bon\w{1,30}\s*=/i
  },
  {
    id: "html-entity-obfuscated-script",
    description: "HTML-entity-encoded <script (e.g. &#x3C;script or &lt;script)",
    // Entities include optional trailing semicolon: &#x3C; or &#x3C (both valid in HTML5)
    pattern: /(?:&#x0*3[Cc];?|&#0*60;?|&lt;)\s*script/i
  },
  {
    id: "html-entity-obfuscated-javascript",
    description: 'HTML-entity-encoded javascript: (partial — catches common &#106; or &#x6a; for "j")',
    pattern: /(?:&#x0*6[Aa];?|&#0*106;?)\s*(?:&#x0*61;?|a)[\s\S]{0,80}script\s*:/i
  },
  {
    id: "html-style-expression",
    description: "CSS expression() — IE-era code execution in style attributes",
    pattern: /style[\s\S]{0,20}expression\s*\(/i
  },
  {
    id: "html-object-embed",
    description: "<object or <embed tags that can load active content",
    pattern: /<(?:object|embed)[\s>/]/i
  },
  {
    id: "html-base-tag",
    description: "<base href= — can hijack all relative URLs on a page",
    pattern: /<base[\s>]/i
  },
  {
    id: "html-meta-refresh",
    description: '<meta http-equiv="refresh" — can redirect users',
    pattern: /<meta[\s\S]{0,40}http-equiv[\s\S]{0,20}refresh/i
  },
  {
    id: "html-srcdoc",
    description: "srcdoc= attribute on iframes — embeds HTML that can run scripts",
    pattern: /srcdoc\s*=/i
  },
  {
    id: "html-iframe",
    description: "<iframe tag",
    pattern: /<iframe[\s>/]/i
  },
  {
    id: "html-form",
    description: "<form tag — can be used for phishing / credential harvesting injection",
    pattern: /<form[\s>/]/i
  }
];
const XML_PATTERNS = [
  {
    id: "xml-cdata-injection",
    description: "CDATA section injection: <![CDATA[ breaks out of text node context",
    pattern: /<!\[CDATA\[/i
  },
  {
    id: "xml-cdata-close",
    description: "CDATA close sequence: ]]> can terminate an enclosing CDATA section",
    pattern: /\]\]>/
  },
  {
    id: "xml-processing-instruction",
    description: "XML processing instruction: <?xml-stylesheet or <?php etc.",
    pattern: /<\?(?:xml[\- ]|php|asp)/i
  },
  {
    id: "xml-doctype-injection",
    description: "DOCTYPE declaration embedded in content — can define entities",
    // Match <!DOCTYPE followed by end-of-string, whitespace, or [ (internal subset)
    pattern: /<!DOCTYPE(?:[\s[]|$)/i
  },
  {
    id: "xml-entity-system",
    description: "SYSTEM keyword — used in external entity declarations (XXE)",
    pattern: /\bSYSTEM\s+["']/i
  },
  {
    id: "xml-entity-public",
    description: "PUBLIC keyword — used in external entity declarations (XXE)",
    pattern: /\bPUBLIC\s+["']/i
  },
  {
    id: "xml-entity-declaration",
    description: "<!ENTITY declaration — defines entities, potential XXE or entity expansion",
    pattern: /<!ENTITY[\s%]/i
  },
  {
    id: "xml-billion-laughs",
    description: "Entity reference chaining / billion laughs: repeated &eX; style references",
    // Heuristic: 3+ consecutive entity refs suggests expansion attack
    pattern: /(?:&\w{1,20};){3,}/
  },
  {
    id: "xml-namespace-confusion",
    description: "xmlns: attribute injection — can redefine namespaces to confuse parsers",
    pattern: /\bxmlns\s*(?::\w{1,40})?\s*=/i
  },
  {
    id: "xml-comment-injection",
    description: "<!-- comment injection — can hide content from some parsers",
    pattern: /<!--/
  },
  {
    id: "xml-comment-close",
    description: "--> closes an enclosing XML comment",
    pattern: /-->/
  },
  {
    id: "xml-pi-close",
    description: "?> closes an enclosing processing instruction",
    pattern: /\?>/
  }
];
const SVG_PATTERNS = [
  {
    id: "svg-script-element",
    description: "<script element inside SVG executes JavaScript",
    pattern: /<script[\s>/]/i
  },
  {
    id: "svg-xlink-href-javascript",
    description: "xlink:href with javascript: — classic SVG XSS via <a> or <use>",
    pattern: /xlink\s*:\s*href\s*=\s*["']?\s*javascript\s*:/i
  },
  {
    id: "svg-href-javascript",
    description: "href= with javascript: in SVG context (<a>, <animate>, etc.)",
    pattern: /href\s*=\s*["']?\s*javascript\s*:/i
  },
  {
    id: "svg-foreignobject",
    description: "<foreignObject embeds HTML inside SVG — can execute scripts",
    pattern: /<foreignObject[\s>/]/i
  },
  {
    id: "svg-use-external",
    description: "<use xlink:href or href pointing to external resource (non-fragment URL)",
    // Match <use with href= where the value starts with a non-# character (external URL)
    // [\"'][^#] catches quoted values not starting with #; [^\"'#\s>] catches unquoted
    pattern: /<use[\s\S]{0,60}(?:xlink\s*:\s*)?href\s*=\s*(?:["'][^#]|[^"'#\s>])/i
  },
  {
    id: "svg-animate-href",
    description: '<animate attributeName="href" — can dynamically change href to javascript:',
    pattern: /<animate[\s\S]{0,80}attributeName\s*=\s*["'][\s]*href["']/i
  },
  {
    id: "svg-animate-xlinkhref",
    description: '<animate attributeName="xlink:href"',
    pattern: /<animate[\s\S]{0,80}attributeName\s*=\s*["'][\s]*xlink\s*:\s*href["']/i
  },
  {
    id: "svg-set-javascript",
    description: '<set to="javascript:..." — sets an attribute to a javascript: URI',
    pattern: /<set[\s\S]{0,80}to\s*=\s*["']?\s*javascript\s*:/i
  },
  {
    id: "svg-event-handler",
    description: "SVG-specific event handler attributes: onload=, onerror=, onactivate=, etc.",
    pattern: /\bon(?:load|error|activate|begin|end|repeat|focus|blur|click|mouse\w{1,20}|key\w{1,20})\s*=/i
  },
  {
    id: "svg-handler-generic",
    description: "Generic on* handler catch-all for SVG attributes",
    pattern: /\bon\w{1,30}\s*=/i
  },
  {
    id: "svg-filter-feimage",
    description: "<feImage href= — filter primitive that can load external resources",
    pattern: /<feImage[\s\S]{0,80}(?:xlink\s*:\s*)?href\s*=/i
  },
  {
    id: "svg-image-external",
    description: "<image xlink:href with http/https or javascript protocol",
    pattern: /<image[\s\S]{0,80}(?:xlink\s*:\s*)?href\s*=\s*["']?\s*(?:https?|javascript)\s*:/i
  },
  {
    id: "svg-style-javascript",
    description: "style= attribute containing javascript: (e.g. background:url(javascript:...))",
    pattern: /style\s*=[\s\S]{0,60}javascript\s*:/i
  }
];
const SQL_PATTERNS = [
  {
    id: "sql-block-comment-open",
    description: "SQL block comment open: /* ... */ — unusual in legitimate user text",
    pattern: /\/\*/
  },
  {
    id: "sql-union-select",
    description: "UNION SELECT — most common SQL injection aggregation attack",
    pattern: /\bUNION\s{1,20}(?:ALL\s{1,20})?SELECT\b/i
  },
  {
    id: "sql-drop-table",
    description: "DROP TABLE — destructive DDL injection",
    pattern: /\bDROP\s{1,20}TABLE\b/i
  },
  {
    id: "sql-drop-database",
    description: "DROP DATABASE — destructive DDL injection",
    pattern: /\bDROP\s{1,20}DATABASE\b/i
  },
  {
    id: "sql-insert-into",
    description: "INSERT INTO — data injection",
    pattern: /\bINSERT\s{1,20}INTO\b/i
  },
  {
    id: "sql-delete-from",
    description: "DELETE FROM — data deletion injection",
    pattern: /\bDELETE\s{1,20}FROM\b/i
  },
  {
    id: "sql-update-set",
    description: "UPDATE ... SET — data modification injection",
    // Allows arbitrary content between UPDATE and SET (table name, alias, etc.)
    pattern: /\bUPDATE\b[\s\S]{1,60}\bSET\b/i
  },
  {
    id: "sql-exec-xp",
    description: "EXEC xp_ — MSSQL extended stored procedure execution",
    pattern: /\bEXEC(?:UTE)?\s{1,20}xp_/i
  },
  {
    id: "sql-tautology-string",
    description: `Classic string tautology: ' OR '1'='1 or " OR "1"="1"`,
    // Last quote is optional — injection may truncate it: ' OR '1'='1--
    pattern: /'\s{0,10}OR\s{0,10}'[^']{0,20}'\s*=\s*'[^']{0,20}/i
  },
  {
    id: "sql-tautology-numeric",
    description: "Numeric tautology: OR 1=1",
    pattern: /\bOR\s{1,10}1\s*=\s*1\b/i
  },
  {
    id: "sql-always-true-zero",
    description: "Numeric tautology: OR 0=0",
    pattern: /\bOR\s{1,10}0\s*=\s*0\b/i
  },
  {
    id: "sql-sleep-benchmark",
    description: "Time-based blind injection: SLEEP() or BENCHMARK()",
    pattern: /\b(?:SLEEP|BENCHMARK)\s*\(/i
  },
  {
    id: "sql-waitfor-delay",
    description: "MSSQL time-based blind injection: WAITFOR DELAY",
    pattern: /\bWAITFOR\s{1,20}DELAY\b/i
  },
  {
    id: "sql-char-function",
    description: "CHAR() function — used to obfuscate injected strings",
    pattern: /\bCHAR\s*\(\s*\d{1,3}/i
  },
  {
    id: "sql-information-schema",
    description: "INFORMATION_SCHEMA — reconnaissance query for table/column enumeration",
    pattern: /\bINFORMATION_SCHEMA\b/i
  }
];
const SHELL_PATTERNS = [
  {
    id: "shell-path-traversal-unix",
    description: "Unix path traversal: ../  — climbing the directory tree",
    pattern: /\.\.\//
  },
  {
    id: "shell-path-traversal-windows",
    description: "Windows path traversal: ..\\ — climbing the directory tree",
    pattern: /\.\.\\/
  },
  {
    id: "shell-path-traversal-encoded",
    description: "URL-encoded path traversal: %2e%2e or %2f variants",
    pattern: /%2e%2e|%2f\.\.|\.\.%2f/i
  },
  {
    id: "shell-null-byte",
    description: "Null byte injection: \\x00 or %00 — truncates strings in C-backed functions",
    pattern: /\x00|%00/
  },
  {
    id: "shell-semicolon",
    description: "Semicolon command separator: cmd1; cmd2",
    pattern: /;/
  },
  {
    id: "shell-pipe",
    description: "Pipe operator: cmd1 | cmd2",
    pattern: /\|/
  },
  {
    id: "shell-and-operator",
    description: "AND operator: cmd1 && cmd2",
    pattern: /&&/
  },
  {
    id: "shell-or-operator",
    description: "OR operator: cmd1 || cmd2",
    pattern: /\|\|/
  },
  {
    id: "shell-backtick",
    description: "Backtick command substitution: `cmd`",
    pattern: /`/
  },
  {
    id: "shell-dollar-paren",
    description: "Dollar-paren command substitution: $(cmd)",
    pattern: /\$\(/
  },
  {
    id: "shell-dollar-brace",
    description: "Dollar-brace variable expansion: ${var} — can be abused for injection",
    pattern: /\$\{/
  },
  {
    id: "shell-redirect-out",
    description: "Output redirection: cmd > file or cmd >> file",
    pattern: />{1,2}/
  },
  {
    id: "shell-redirect-in",
    description: "Input redirection: cmd < file",
    pattern: /</
  },
  {
    id: "shell-newline-injection",
    description: "Newline injection: \\n or \\r — can inject new shell commands",
    pattern: /[\n\r]/
  },
  {
    id: "shell-glob-star",
    description: "Glob expansion: * or ? — can expand to unintended files",
    // Only flag when combined with path separators to reduce false positives
    pattern: /[/\\][*?]/
  },
  {
    id: "shell-absolute-root",
    description: "Absolute root path injection: string starting with / or \\ (Windows UNC)",
    pattern: /^(?:\/|\\\\)/
  },
  {
    id: "shell-windows-drive",
    description: "Windows drive letter path injection: C:\\ or D:/",
    pattern: /^[a-zA-Z]:[/\\]/
  },
  {
    id: "shell-curl-wget",
    description: "curl/wget with URL or flags — can exfiltrate data or download payloads",
    // Require a URL scheme (http/https/ftp) or a flag (-) to reduce false positives
    // "curl is a tool" won't match; "curl http://..." or "curl -s ..." will
    pattern: /\b(?:curl|wget)\s+(?:https?:\/\/|ftp:\/\/|-)/i
  }
];
const REDOS_PATTERNS = [
  {
    id: "redos-nested-quantifier-plus",
    description: "Nested + quantifier inside a group with outer quantifier: (a+)+, (.+b)*, etc.",
    // Matches any group containing a + quantifier, with an outer * or + — catches (a+)+, (.+b)*, etc.
    pattern: /\([^)]*\+[^)]*\)[+*]/
  },
  {
    id: "redos-nested-quantifier-star",
    description: "Nested * quantifier: (a*)* or (a*)+ — catastrophic backtracking",
    pattern: /\([^)]*\*[^)]*\)[*+]/
  },
  {
    id: "redos-nested-groups",
    description: "Doubly nested quantified groups: ((a+)+) — guaranteed catastrophic",
    pattern: /\(\([^)]{0,40}\)[+*]\)[+*]/
  },
  {
    id: "redos-alternation-overlap",
    description: "Overlapping alternation under quantifier: (a|a)+ — ambiguous NFA paths",
    // Detect repeated identical alternatives under a quantifier
    pattern: /\(([^|()]{1,20})\|(?:\1)(?:\|[^|()]{1,20}){0,5}\)[+*?]{1,2}/
  },
  {
    id: "redos-star-plus-concat",
    description: "(x*x)+ pattern — triggers super-linear backtracking",
    pattern: /\([^)]{0,10}\*[^)]{0,10}\)[+*]/
  },
  {
    id: "redos-dot-star-greedy",
    description: "(.*){n,} or (.+){n,} — repeated greedy dot quantifiers",
    pattern: /\(\.[*+]\)\{?\d/
  },
  {
    id: "redos-large-repetition",
    description: "Very large fixed or range repetition count {1000,} or {1000,n} — denial of service via backtracking",
    // Matches { followed by 4+ digits (≥1000), then optional ,digits }
    pattern: /\{\d{4,}(?:,\d*)?\}/
  },
  {
    id: "redos-catastrophic-alternation",
    description: "Long alternation with many similar branches — polynomial backtracking risk",
    // Heuristic: 10+ pipe-separated alternatives in a single group
    pattern: /\([^)]{0,200}(?:\|[^|)]{0,50}){9,}\)/
  }
];
const sep = `["'\\s]*:`;
const NOSQL_PATTERNS = [
  // ─── MongoDB $ operator injection ────────────────────────────────────────
  {
    id: "nosql-where-operator",
    description: "$where — executes arbitrary JavaScript server-side in MongoDB",
    pattern: new RegExp(`\\$where${sep}`, "i")
  },
  {
    id: "nosql-ne-operator",
    description: '$ne — "not equal" operator used to bypass equality checks',
    pattern: new RegExp(`\\$ne${sep}`, "i")
  },
  {
    id: "nosql-gt-operator",
    description: '$gt — "greater than" used to bypass password/value checks',
    pattern: new RegExp(`\\$gte?${sep}`, "i")
  },
  {
    id: "nosql-lt-operator",
    description: '$lt / $lte — "less than" bypass variants',
    pattern: new RegExp(`\\$lte?${sep}`, "i")
  },
  {
    id: "nosql-regex-operator",
    description: "$regex — can be used to extract data character by character (blind injection)",
    pattern: new RegExp(`\\$regex${sep}`, "i")
  },
  {
    id: "nosql-or-operator",
    description: "$or — logical OR; used to create always-true conditions",
    pattern: new RegExp(`\\$or${sep}\\s*\\[`, "i")
  },
  {
    id: "nosql-and-operator",
    description: "$and — logical AND operator injection",
    pattern: new RegExp(`\\$and${sep}\\s*\\[`, "i")
  },
  {
    id: "nosql-nor-operator",
    description: "$nor — logical NOR operator injection",
    pattern: new RegExp(`\\$nor${sep}\\s*\\[`, "i")
  },
  {
    id: "nosql-exists-operator",
    description: "$exists — can enumerate fields to determine schema",
    pattern: new RegExp(`\\$exists${sep}`, "i")
  },
  {
    id: "nosql-in-operator",
    description: "$in — matches any value in a list; can enumerate values",
    pattern: new RegExp(`\\$in${sep}\\s*\\[`, "i")
  },
  {
    id: "nosql-expr-operator",
    description: "$expr — allows aggregation expressions in queries (MongoDB 3.6+)",
    pattern: new RegExp(`\\$expr${sep}`, "i")
  },
  {
    id: "nosql-function-operator",
    description: "$function — executes arbitrary JavaScript in MongoDB 4.4+",
    pattern: new RegExp(`\\$function${sep}`, "i")
  },
  {
    id: "nosql-accumulator-operator",
    description: "$accumulator — custom aggregation with arbitrary JS execution",
    pattern: new RegExp(`\\$accumulator${sep}`, "i")
  },
  // ─── Prototype pollution ─────────────────────────────────────────────────
  {
    id: "nosql-proto-pollution",
    description: "__proto__ — prototype pollution via object key injection",
    pattern: /__proto__/
  },
  {
    id: "nosql-constructor-prototype",
    description: "constructor.prototype — alternative prototype pollution vector (dot notation or JSON key)",
    // Matches dot-notation (obj.constructor.prototype) and JSON key adjacency
    // ("constructor": {"prototype": ...})
    pattern: /constructor[\s"':.,{\[]*prototype/i
  },
  {
    id: "nosql-proto-bracket",
    description: '["__proto__"] — bracket-notation prototype pollution',
    pattern: /\[["']__proto__["']\]/
  }
];
const LOG_PATTERNS = [
  // ─── CRLF / newline injection ─────────────────────────────────────────────
  {
    id: "log-crlf-injection",
    description: "CRLF injection: literal \\r or \\n embeds fake log lines",
    pattern: /[\r\n]/
  },
  {
    id: "log-url-encoded-crlf",
    description: "URL-encoded CRLF: %0d, %0a, %0D, %0A — decoded by some log parsers",
    pattern: /%0[dDaA]/
  },
  {
    id: "log-unicode-newline",
    description: "Unicode newline variants: U+2028 (line separator), U+2029 (paragraph separator)",
    pattern: /[\u2028\u2029]/
  },
  // ─── Log4Shell / JNDI injection (CVE-2021-44228) ─────────────────────────
  {
    id: "log-log4shell-jndi",
    description: "Log4Shell: ${jndi:...} triggers remote code execution in Apache Log4j",
    pattern: /\$\{jndi\s*:/i
  },
  {
    id: "log-log4shell-obfuscated",
    description: "Obfuscated Log4Shell: ${::-j}... lookup-bypass prefix used to evade WAF detection",
    // ${::- is the Log4j lookup-bypass escape sequence; presence alone is suspicious
    pattern: /\$\{::-/
  },
  {
    id: "log-log4j-lookup",
    description: "Log4j lookup syntax: ${env:...}, ${sys:...}, ${ctx:...} — data exfiltration",
    pattern: /\$\{(?:env|sys|ctx|main|map|sd|web|docker|k8s|spring)\s*:/i
  },
  // ─── Server-Side Template Injection (SSTI) in log messages ───────────────
  {
    id: "log-ssti-double-brace",
    description: "SSTI double-brace: {{expression}} — Jinja2, Twig, Handlebars, etc.",
    pattern: /\{\{[\s\S]{0,80}\}\}/
  },
  {
    id: "log-ssti-hash-brace",
    description: "SSTI hash-brace: #{expression} — Thymeleaf, Velocity, Ruby ERB",
    pattern: /#\{[\s\S]{0,80}\}/
  },
  {
    id: "log-ssti-dollar-brace",
    description: "SSTI/EL injection: ${expression with operators or method calls} — JSP EL, Freemarker, SpEL",
    // Require that the ${...} content looks like an expression, not a plain variable name.
    // Flags if the content contains: . ( * + operators, or known SSTI keywords.
    // This avoids flagging ${PATH}, ${HOME} etc. (plain shell variables).
    pattern: /\$\{[^}]*(?:\.|\(|\*|\+|\bclass\b|\bruntime\b|\bprocess\b|\bexec\b)[^}]{0,80}\}/i
  },
  {
    id: "log-ssti-percent-tag",
    description: "SSTI ERB/ASP tag: <%= expression %> — Ruby ERB, ASP",
    pattern: /<%=[\s\S]{0,80}%>/
  },
  // ─── Null byte ────────────────────────────────────────────────────────────
  {
    id: "log-null-byte",
    description: "Null byte: \\x00 or %00 — can truncate log entries in C-backed loggers",
    pattern: /\x00|%00/
  },
  // ─── ANSI escape injection ────────────────────────────────────────────────
  {
    id: "log-ansi-escape",
    description: "ANSI escape sequence: ESC[ — can manipulate terminal output when logs are tailed",
    pattern: /\x1b\[/
  }
];
const SQL_STRICT_EXTRA = [
  {
    id: "sql-line-comment",
    description: "SQL line comment: -- followed by whitespace or end of string",
    pattern: /--(?:\s|$)/
  },
  {
    id: "sql-stacked-query",
    description: "Stacked queries: semicolon immediately followed by a SQL keyword",
    pattern: /;\s{0,10}(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC)\b/i
  },
  {
    id: "sql-hex-encoding",
    description: "Hex-encoded string injection: 0x41414141 style (MySQL)",
    pattern: /\b0x[0-9a-f]{4,}/i
  }
];
const SQL_STRICT_PATTERNS = [...SQL_PATTERNS, ...SQL_STRICT_EXTRA];
HTML_PATTERNS.label = "HTML";
XML_PATTERNS.label = "XML";
SVG_PATTERNS.label = "SVG";
SQL_PATTERNS.label = "SQL";
SQL_STRICT_PATTERNS.label = "SQL-STRICT";
SHELL_PATTERNS.label = "SHELL";
REDOS_PATTERNS.label = "REDOS";
NOSQL_PATTERNS.label = "NOSQL";
LOG_PATTERNS.label = "LOG";
function assertString(value) {
  if (typeof value !== "string") {
    throw new TypeError(
      `is-unsafe: first argument must be a string, got ${typeof value}`
    );
  }
}
function assertContext(context) {
  if (context instanceof RegExp) return;
  if (Array.isArray(context)) {
    if (context.length === 0) {
      throw new TypeError("is-unsafe: context must not be an empty array");
    }
    if (Array.isArray(context[0])) {
      for (const list of context) {
        if (!Array.isArray(list) || list.length === 0) {
          throw new TypeError(
            "is-unsafe: each context in the array must be a non-empty pattern array (PatternList)"
          );
        }
      }
    }
    return;
  }
  throw new TypeError(
    `is-unsafe: second argument must be a PatternList (e.g. HTML), an array of PatternLists (e.g. [HTML, XML]), or a RegExp. Got: ${typeof context}`
  );
}
function normalise(context) {
  if (context instanceof RegExp) return { lists: null, regex: context };
  if (Array.isArray(context[0])) return { lists: context, regex: null };
  return { lists: [context], regex: null };
}
function matchList(value, list) {
  const label = list.label ?? "CUSTOM";
  for (const rule of list) {
    if (rule.pattern.test(value)) {
      return { context: label, id: rule.id, description: rule.description, pattern: rule.pattern };
    }
  }
  return null;
}
function isUnsafe(value, context) {
  assertString(value);
  assertContext(context);
  const { lists, regex } = normalise(context);
  if (regex) return regex.test(value);
  for (const list of lists) {
    if (matchList(value, list) !== null) return true;
  }
  return false;
}
function extractRawAttributes(prefixedAttrs, options) {
  if (!prefixedAttrs) return {};
  const attrs = options.attributesGroupName ? prefixedAttrs[options.attributesGroupName] : prefixedAttrs;
  if (!attrs) return {};
  const rawAttrs = {};
  for (const key in attrs) {
    if (key.startsWith(options.attributeNamePrefix)) {
      const rawName = key.substring(options.attributeNamePrefix.length);
      rawAttrs[rawName] = attrs[key];
    } else {
      rawAttrs[key] = attrs[key];
    }
  }
  return rawAttrs;
}
function extractNamespace(rawTagName) {
  if (!rawTagName || typeof rawTagName !== "string") return void 0;
  const colonIndex = rawTagName.indexOf(":");
  if (colonIndex !== -1 && colonIndex > 0) {
    const ns = rawTagName.substring(0, colonIndex);
    if (ns !== "xmlns") {
      return ns;
    }
  }
  return void 0;
}
class OrderedObjParser {
  constructor(options, externalEntities) {
    this.options = options;
    this.currentNode = null;
    this.tagsNodeStack = [];
    this.parseXml = parseXml;
    this.parseTextData = parseTextData;
    this.resolveNameSpace = resolveNameSpace;
    this.buildAttributesMap = buildAttributesMap;
    this.isItStopNode = isItStopNode;
    this.replaceEntitiesValue = replaceEntitiesValue;
    this.readStopNodeData = readStopNodeData;
    this.saveTextToParentTag = saveTextToParentTag;
    this.addChild = addChild;
    this.ignoreAttributesFn = getIgnoreAttributesFn(this.options.ignoreAttributes);
    this.entityExpansionCount = 0;
    this.currentExpandedLength = 0;
    let namedEntities = { ...XML };
    if (this.options.entityDecoder) {
      this.entityDecoder = this.options.entityDecoder;
    } else {
      if (typeof this.options.htmlEntities === "object") namedEntities = this.options.htmlEntities;
      else if (this.options.htmlEntities === true) namedEntities = { ...COMMON_HTML, ...CURRENCY };
      this.entityDecoder = new EntityDecoder({
        namedEntities: { ...namedEntities, ...externalEntities },
        numericAllowed: this.options.htmlEntities,
        limit: {
          maxTotalExpansions: this.options.processEntities.maxTotalExpansions,
          maxExpandedLength: this.options.processEntities.maxExpandedLength,
          applyLimitsTo: this.options.processEntities.appliesTo
        },
        // onExternalEntity: (name, value) => isUnsafe(value) ? 'block' : 'allow',
        onInputEntity: (name, value) => (
          //TODO: VALID_CONTEXTS.HTML should be set only if this.options.htmlEntities
          isUnsafe(value, [HTML_PATTERNS, XML_PATTERNS]) ? ENTITY_ACTION.BLOCK : ENTITY_ACTION.ALLOW
        )
        //postCheck: resolved => resolved
      });
    }
    this.matcher = new Matcher();
    this.readonlyMatcher = this.matcher.readOnly();
    this.isCurrentNodeStopNode = false;
    this.stopNodeExpressionsSet = new ExpressionSet();
    const stopNodesOpts = this.options.stopNodes;
    if (stopNodesOpts && stopNodesOpts.length > 0) {
      for (let i = 0; i < stopNodesOpts.length; i++) {
        const stopNodeExp = stopNodesOpts[i];
        if (typeof stopNodeExp === "string") {
          this.stopNodeExpressionsSet.add(new Expression(stopNodeExp));
        } else if (stopNodeExp instanceof Expression) {
          this.stopNodeExpressionsSet.add(stopNodeExp);
        }
      }
      this.stopNodeExpressionsSet.seal();
    }
  }
}
function parseTextData(val, tagName, jPath, dontTrim, hasAttributes, isLeafNode, escapeEntities) {
  const options = this.options;
  if (val !== void 0) {
    if (options.trimValues && !dontTrim) {
      val = val.trim();
    }
    if (val.length > 0) {
      if (!escapeEntities) val = this.replaceEntitiesValue(val, tagName, jPath);
      const jPathOrMatcher = options.jPath ? jPath.toString() : jPath;
      const newval = options.tagValueProcessor(tagName, val, jPathOrMatcher, hasAttributes, isLeafNode);
      if (newval === null || newval === void 0) {
        return val;
      } else if (typeof newval !== typeof val || newval !== val) {
        return newval;
      } else if (options.trimValues) {
        return parseValue(val, options.parseTagValue, options.numberParseOptions);
      } else {
        const trimmedVal = val.trim();
        if (trimmedVal === val) {
          return parseValue(val, options.parseTagValue, options.numberParseOptions);
        } else {
          return val;
        }
      }
    }
  }
}
function resolveNameSpace(tagname) {
  if (this.options.removeNSPrefix) {
    const tags = tagname.split(":");
    const prefix = tagname.charAt(0) === "/" ? "/" : "";
    if (tags[0] === "xmlns") {
      return "";
    }
    if (tags.length === 2) {
      tagname = prefix + tags[1];
    }
  }
  return tagname;
}
const attrsRegx = new RegExp(`([^\\s=]+)\\s*(=\\s*(['"])([\\s\\S]*?)\\3)?`, "gm");
function buildAttributesMap(attrStr, jPath, tagName, force = false) {
  const options = this.options;
  if (force === true || options.ignoreAttributes !== true && typeof attrStr === "string") {
    const matches = getAllMatches(attrStr, attrsRegx);
    const len = matches.length;
    const attrs = {};
    const processedVals = new Array(len);
    let hasRawAttrs = false;
    const rawAttrsForMatcher = {};
    for (let i = 0; i < len; i++) {
      const attrName = this.resolveNameSpace(matches[i][1]);
      const oldVal = matches[i][4];
      if (attrName.length && oldVal !== void 0) {
        let val = oldVal;
        if (options.trimValues) val = val.trim();
        val = this.replaceEntitiesValue(val, tagName, this.readonlyMatcher);
        processedVals[i] = val;
        rawAttrsForMatcher[attrName] = val;
        hasRawAttrs = true;
      }
    }
    if (hasRawAttrs && typeof jPath === "object" && jPath.updateCurrent) {
      jPath.updateCurrent(rawAttrsForMatcher);
    }
    const jPathStr = options.jPath ? jPath.toString() : this.readonlyMatcher;
    let hasAttrs = false;
    for (let i = 0; i < len; i++) {
      const attrName = this.resolveNameSpace(matches[i][1]);
      if (this.ignoreAttributesFn(attrName, jPathStr)) continue;
      let aName = options.attributeNamePrefix + attrName;
      if (attrName.length) {
        if (options.transformAttributeName) {
          aName = options.transformAttributeName(aName);
        }
        aName = sanitizeName(aName, options);
        if (matches[i][4] !== void 0) {
          const oldVal = processedVals[i];
          const newVal = options.attributeValueProcessor(attrName, oldVal, jPathStr);
          if (newVal === null || newVal === void 0) {
            attrs[aName] = oldVal;
          } else if (typeof newVal !== typeof oldVal || newVal !== oldVal) {
            attrs[aName] = newVal;
          } else {
            attrs[aName] = parseValue(oldVal, options.parseAttributeValue, options.numberParseOptions);
          }
          hasAttrs = true;
        } else if (options.allowBooleanAttributes) {
          attrs[aName] = true;
          hasAttrs = true;
        }
      }
    }
    if (!hasAttrs) return;
    if (options.attributesGroupName && !options.preserveOrder) {
      const attrCollection = {};
      attrCollection[options.attributesGroupName] = attrs;
      return attrCollection;
    }
    return attrs;
  }
}
const parseXml = function(xmlData) {
  xmlData = xmlData.replace(/\r\n?/g, "\n");
  const xmlObj = new XmlNode("!xml");
  let currentNode = xmlObj;
  let textData = "";
  this.matcher.reset();
  this.entityDecoder.reset();
  this.entityExpansionCount = 0;
  this.currentExpandedLength = 0;
  const options = this.options;
  const docTypeReader = new DocTypeReader(options.processEntities);
  const xmlLen = xmlData.length;
  for (let i = 0; i < xmlLen; i++) {
    const ch = xmlData[i];
    if (ch === "<") {
      const c1 = xmlData.charCodeAt(i + 1);
      if (c1 === 47) {
        const closeIndex = findClosingIndex(xmlData, ">", i, "Closing Tag is not closed.");
        let tagName = xmlData.substring(i + 2, closeIndex).trim();
        if (options.removeNSPrefix) {
          const colonIndex = tagName.indexOf(":");
          if (colonIndex !== -1) {
            tagName = tagName.substr(colonIndex + 1);
          }
        }
        tagName = transformTagName(options.transformTagName, tagName, "", options).tagName;
        if (currentNode) {
          textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
        }
        const lastTagName = this.matcher.getCurrentTag();
        if (tagName && options.unpairedTagsSet.has(tagName)) {
          throw new Error(`Unpaired tag can not be used as closing tag: </${tagName}>`);
        }
        if (lastTagName && options.unpairedTagsSet.has(lastTagName)) {
          this.matcher.pop();
          this.tagsNodeStack.pop();
        }
        this.matcher.pop();
        this.isCurrentNodeStopNode = false;
        currentNode = this.tagsNodeStack.pop();
        textData = "";
        i = closeIndex;
      } else if (c1 === 63) {
        let tagData = readTagExp(xmlData, i, false, "?>");
        if (!tagData) throw new Error("Pi Tag is not closed.");
        textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
        const attsMap = this.buildAttributesMap(tagData.tagExp, this.matcher, tagData.tagName, true);
        if (attsMap) {
          const ver = attsMap[this.options.attributeNamePrefix + "version"];
          this.entityDecoder.setXmlVersion(Number(ver) || 1);
          docTypeReader.setXmlVersion(Number(ver) || 1);
        }
        if (options.ignoreDeclaration && tagData.tagName === "?xml" || options.ignorePiTags) ;
        else {
          const childNode = new XmlNode(tagData.tagName);
          childNode.add(options.textNodeName, "");
          if (tagData.tagName !== tagData.tagExp && tagData.attrExpPresent && options.ignoreAttributes !== true) {
            childNode[":@"] = attsMap;
          }
          this.addChild(currentNode, childNode, this.readonlyMatcher, i);
        }
        i = tagData.closeIndex + 1;
      } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 45 && xmlData.charCodeAt(i + 3) === 45) {
        const endIndex = findClosingIndex(xmlData, "-->", i + 4, "Comment is not closed.");
        if (options.commentPropName) {
          const comment = xmlData.substring(i + 4, endIndex - 2);
          textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
          currentNode.add(options.commentPropName, [{ [options.textNodeName]: comment }]);
        }
        i = endIndex;
      } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 68) {
        const result = docTypeReader.readDocType(xmlData, i);
        this.entityDecoder.addInputEntities(result.entities);
        i = result.i;
      } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 91) {
        const closeIndex = findClosingIndex(xmlData, "]]>", i, "CDATA is not closed.") - 2;
        const tagExp = xmlData.substring(i + 9, closeIndex);
        textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
        let val = this.parseTextData(tagExp, currentNode.tagname, this.readonlyMatcher, true, false, true, true);
        if (val == void 0) val = "";
        if (options.cdataPropName) {
          currentNode.add(options.cdataPropName, [{ [options.textNodeName]: tagExp }]);
        } else {
          currentNode.add(options.textNodeName, val);
        }
        i = closeIndex + 2;
      } else {
        let result = readTagExp(xmlData, i, options.removeNSPrefix);
        if (!result) {
          const context = xmlData.substring(Math.max(0, i - 50), Math.min(xmlLen, i + 50));
          throw new Error(`readTagExp returned undefined at position ${i}. Context: "${context}"`);
        }
        let tagName = result.tagName;
        const rawTagName = result.rawTagName;
        let tagExp = result.tagExp;
        let attrExpPresent = result.attrExpPresent;
        let closeIndex = result.closeIndex;
        ({ tagName, tagExp } = transformTagName(options.transformTagName, tagName, tagExp, options));
        if (options.strictReservedNames && (tagName === options.commentPropName || tagName === options.cdataPropName || tagName === options.textNodeName || tagName === options.attributesGroupName)) {
          throw new Error(`Invalid tag name: ${tagName}`);
        }
        if (currentNode && textData) {
          if (currentNode.tagname !== "!xml") {
            textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher, false);
          }
        }
        const lastTag = currentNode;
        if (lastTag && options.unpairedTagsSet.has(lastTag.tagname)) {
          currentNode = this.tagsNodeStack.pop();
          this.matcher.pop();
        }
        let isSelfClosing = false;
        if (tagExp.length > 0 && tagExp.lastIndexOf("/") === tagExp.length - 1) {
          isSelfClosing = true;
          if (tagName[tagName.length - 1] === "/") {
            tagName = tagName.substr(0, tagName.length - 1);
            tagExp = tagName;
          } else {
            tagExp = tagExp.substr(0, tagExp.length - 1);
          }
          attrExpPresent = tagName !== tagExp;
        }
        let prefixedAttrs = null;
        let namespace = void 0;
        namespace = extractNamespace(rawTagName);
        if (tagName !== xmlObj.tagname) {
          this.matcher.push(tagName, {}, namespace);
        }
        if (tagName !== tagExp && attrExpPresent) {
          prefixedAttrs = this.buildAttributesMap(tagExp, this.matcher, tagName);
          if (prefixedAttrs) {
            extractRawAttributes(prefixedAttrs, options);
          }
        }
        if (tagName !== xmlObj.tagname) {
          this.isCurrentNodeStopNode = this.isItStopNode();
        }
        const startIndex = i;
        if (this.isCurrentNodeStopNode) {
          let tagContent = "";
          if (isSelfClosing) {
            i = result.closeIndex;
          } else if (options.unpairedTagsSet.has(tagName)) {
            i = result.closeIndex;
          } else {
            const result2 = this.readStopNodeData(xmlData, rawTagName, closeIndex + 1);
            if (!result2) throw new Error(`Unexpected end of ${rawTagName}`);
            i = result2.i;
            tagContent = result2.tagContent;
          }
          const childNode = new XmlNode(tagName);
          if (prefixedAttrs) {
            childNode[":@"] = prefixedAttrs;
          }
          childNode.add(options.textNodeName, tagContent);
          this.matcher.pop();
          this.isCurrentNodeStopNode = false;
          this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
        } else {
          if (isSelfClosing) {
            ({ tagName, tagExp } = transformTagName(options.transformTagName, tagName, tagExp, options));
            const childNode = new XmlNode(tagName);
            if (prefixedAttrs) {
              childNode[":@"] = prefixedAttrs;
            }
            this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
            this.matcher.pop();
            this.isCurrentNodeStopNode = false;
          } else if (options.unpairedTagsSet.has(tagName)) {
            const childNode = new XmlNode(tagName);
            if (prefixedAttrs) {
              childNode[":@"] = prefixedAttrs;
            }
            this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
            this.matcher.pop();
            this.isCurrentNodeStopNode = false;
            i = result.closeIndex;
            continue;
          } else {
            const childNode = new XmlNode(tagName);
            if (this.tagsNodeStack.length > options.maxNestedTags) {
              throw new Error("Maximum nested tags exceeded");
            }
            this.tagsNodeStack.push(currentNode);
            if (prefixedAttrs) {
              childNode[":@"] = prefixedAttrs;
            }
            this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
            currentNode = childNode;
          }
          textData = "";
          i = closeIndex;
        }
      }
    } else {
      textData += xmlData[i];
    }
  }
  return xmlObj.child;
};
function addChild(currentNode, childNode, matcher, startIndex) {
  if (!this.options.captureMetaData) startIndex = void 0;
  const jPathOrMatcher = this.options.jPath ? matcher.toString() : matcher;
  const result = this.options.updateTag(childNode.tagname, jPathOrMatcher, childNode[":@"]);
  if (result === false) ;
  else if (typeof result === "string") {
    childNode.tagname = result;
    currentNode.addChild(childNode, startIndex);
  } else {
    currentNode.addChild(childNode, startIndex);
  }
}
function replaceEntitiesValue(val, tagName, jPath) {
  const entityConfig = this.options.processEntities;
  if (!entityConfig || !entityConfig.enabled) {
    return val;
  }
  if (entityConfig.allowedTags) {
    const jPathOrMatcher = this.options.jPath ? jPath.toString() : jPath;
    const allowed = Array.isArray(entityConfig.allowedTags) ? entityConfig.allowedTags.includes(tagName) : entityConfig.allowedTags(tagName, jPathOrMatcher);
    if (!allowed) {
      return val;
    }
  }
  if (entityConfig.tagFilter) {
    const jPathOrMatcher = this.options.jPath ? jPath.toString() : jPath;
    if (!entityConfig.tagFilter(tagName, jPathOrMatcher)) {
      return val;
    }
  }
  return this.entityDecoder.decode(val);
}
function saveTextToParentTag(textData, parentNode, matcher, isLeafNode) {
  if (textData) {
    if (isLeafNode === void 0) isLeafNode = parentNode.child.length === 0;
    textData = this.parseTextData(
      textData,
      parentNode.tagname,
      matcher,
      false,
      parentNode[":@"] ? Object.keys(parentNode[":@"]).length !== 0 : false,
      isLeafNode
    );
    if (textData !== void 0 && textData !== "")
      parentNode.add(this.options.textNodeName, textData);
    textData = "";
  }
  return textData;
}
function isItStopNode() {
  if (this.stopNodeExpressionsSet.size === 0) return false;
  return this.matcher.matchesAny(this.stopNodeExpressionsSet);
}
function tagExpWithClosingIndex(xmlData, i, closingChar = ">") {
  let attrBoundary = 0;
  const len = xmlData.length;
  const closeCode0 = closingChar.charCodeAt(0);
  const closeCode1 = closingChar.length > 1 ? closingChar.charCodeAt(1) : -1;
  let result = "";
  let segmentStart = i;
  for (let index = i; index < len; index++) {
    const code = xmlData.charCodeAt(index);
    if (attrBoundary) {
      if (code === attrBoundary) attrBoundary = 0;
    } else if (code === 34 || code === 39) {
      attrBoundary = code;
    } else if (code === closeCode0) {
      if (closeCode1 !== -1) {
        if (xmlData.charCodeAt(index + 1) === closeCode1) {
          result += xmlData.substring(segmentStart, index);
          return { data: result, index };
        }
      } else {
        result += xmlData.substring(segmentStart, index);
        return { data: result, index };
      }
    } else if (code === 9 && !attrBoundary) {
      result += xmlData.substring(segmentStart, index) + " ";
      segmentStart = index + 1;
    }
  }
}
function findClosingIndex(xmlData, str, i, errMsg) {
  const closingIndex = xmlData.indexOf(str, i);
  if (closingIndex === -1) {
    throw new Error(errMsg);
  } else {
    return closingIndex + str.length - 1;
  }
}
function findClosingChar(xmlData, char, i, errMsg) {
  const closingIndex = xmlData.indexOf(char, i);
  if (closingIndex === -1) throw new Error(errMsg);
  return closingIndex;
}
function readTagExp(xmlData, i, removeNSPrefix, closingChar = ">") {
  const result = tagExpWithClosingIndex(xmlData, i + 1, closingChar);
  if (!result) return;
  let tagExp = result.data;
  const closeIndex = result.index;
  const separatorIndex = tagExp.search(/\s/);
  let tagName = tagExp;
  let attrExpPresent = true;
  if (separatorIndex !== -1) {
    tagName = tagExp.substring(0, separatorIndex);
    tagExp = tagExp.substring(separatorIndex + 1).trimStart();
  }
  const rawTagName = tagName;
  if (removeNSPrefix) {
    const colonIndex = tagName.indexOf(":");
    if (colonIndex !== -1) {
      tagName = tagName.substr(colonIndex + 1);
      attrExpPresent = tagName !== result.data.substr(colonIndex + 1);
    }
  }
  return {
    tagName,
    tagExp,
    closeIndex,
    attrExpPresent,
    rawTagName
  };
}
function readStopNodeData(xmlData, tagName, i) {
  const startIndex = i;
  let openTagCount = 1;
  const xmllen = xmlData.length;
  for (; i < xmllen; i++) {
    if (xmlData[i] === "<") {
      const c1 = xmlData.charCodeAt(i + 1);
      if (c1 === 47) {
        const closeIndex = findClosingChar(xmlData, ">", i, `${tagName} is not closed`);
        let closeTagName = xmlData.substring(i + 2, closeIndex).trim();
        if (closeTagName === tagName) {
          openTagCount--;
          if (openTagCount === 0) {
            return {
              tagContent: xmlData.substring(startIndex, i),
              i: closeIndex
            };
          }
        }
        i = closeIndex;
      } else if (c1 === 63) {
        const closeIndex = findClosingIndex(xmlData, "?>", i + 1, "StopNode is not closed.");
        i = closeIndex;
      } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 45 && xmlData.charCodeAt(i + 3) === 45) {
        const closeIndex = findClosingIndex(xmlData, "-->", i + 3, "StopNode is not closed.");
        i = closeIndex;
      } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 91) {
        const closeIndex = findClosingIndex(xmlData, "]]>", i, "StopNode is not closed.") - 2;
        i = closeIndex;
      } else {
        const tagData = readTagExp(xmlData, i, false);
        if (tagData) {
          const openTagName = tagData && tagData.tagName;
          if (openTagName === tagName && tagData.tagExp[tagData.tagExp.length - 1] !== "/") {
            openTagCount++;
          }
          i = tagData.closeIndex;
        }
      }
    }
  }
}
function parseValue(val, shouldParse, options) {
  if (shouldParse && typeof val === "string") {
    const newval = val.trim();
    if (newval === "true") return true;
    else if (newval === "false") return false;
    else return toNumber(val, options);
  } else {
    if (isExist(val)) {
      return val;
    } else {
      return "";
    }
  }
}
function transformTagName(fn, tagName, tagExp, options) {
  if (fn) {
    const newTagName = fn(tagName);
    if (tagExp === tagName) {
      tagExp = newTagName;
    }
    tagName = newTagName;
  }
  tagName = sanitizeName(tagName, options);
  return { tagName, tagExp };
}
function sanitizeName(name, options) {
  if (criticalProperties.includes(name)) {
    throw new Error(`[SECURITY] Invalid name: "${name}" is a reserved JavaScript keyword that could cause prototype pollution`);
  } else if (DANGEROUS_PROPERTY_NAMES.includes(name)) {
    return options.onDangerousProperty(name);
  }
  return name;
}
const METADATA_SYMBOL = XmlNode.getMetaDataSymbol();
function stripAttributePrefix(attrs, prefix) {
  if (!attrs || typeof attrs !== "object") return {};
  if (!prefix) return attrs;
  const rawAttrs = {};
  for (const key in attrs) {
    if (key.startsWith(prefix)) {
      const rawName = key.substring(prefix.length);
      rawAttrs[rawName] = attrs[key];
    } else {
      rawAttrs[key] = attrs[key];
    }
  }
  return rawAttrs;
}
function prettify(node, options, matcher, readonlyMatcher) {
  return compress(node, options, matcher, readonlyMatcher);
}
function compress(arr, options, matcher, readonlyMatcher) {
  let text2;
  const compressedObj = {};
  for (let i = 0; i < arr.length; i++) {
    const tagObj = arr[i];
    const property = propName(tagObj);
    if (property !== void 0 && property !== options.textNodeName) {
      const rawAttrs = stripAttributePrefix(
        tagObj[":@"] || {},
        options.attributeNamePrefix
      );
      matcher.push(property, rawAttrs);
    }
    if (property === options.textNodeName) {
      if (text2 === void 0) text2 = tagObj[property];
      else text2 += "" + tagObj[property];
    } else if (property === void 0) {
      continue;
    } else if (tagObj[property]) {
      let val = compress(tagObj[property], options, matcher, readonlyMatcher);
      const isLeaf = isLeafTag(val, options);
      if (Object.keys(val).length === 0 && options.alwaysCreateTextNode) {
        val[options.textNodeName] = "";
      }
      if (tagObj[":@"]) {
        assignAttributes(val, tagObj[":@"], readonlyMatcher, options);
      } else if (Object.keys(val).length === 1 && val[options.textNodeName] !== void 0 && !options.alwaysCreateTextNode) {
        val = val[options.textNodeName];
      } else if (Object.keys(val).length === 0) {
        if (options.alwaysCreateTextNode) val[options.textNodeName] = "";
        else val = "";
      }
      if (tagObj[METADATA_SYMBOL] !== void 0 && typeof val === "object" && val !== null) {
        val[METADATA_SYMBOL] = tagObj[METADATA_SYMBOL];
      }
      if (compressedObj[property] !== void 0 && Object.prototype.hasOwnProperty.call(compressedObj, property)) {
        if (!Array.isArray(compressedObj[property])) {
          compressedObj[property] = [compressedObj[property]];
        }
        compressedObj[property].push(val);
      } else {
        const jPathOrMatcher = options.jPath ? readonlyMatcher.toString() : readonlyMatcher;
        if (options.isArray(property, jPathOrMatcher, isLeaf)) {
          compressedObj[property] = [val];
        } else {
          compressedObj[property] = val;
        }
      }
      if (property !== void 0 && property !== options.textNodeName) {
        matcher.pop();
      }
    }
  }
  if (typeof text2 === "string") {
    if (text2.length > 0) compressedObj[options.textNodeName] = text2;
  } else if (text2 !== void 0) compressedObj[options.textNodeName] = text2;
  return compressedObj;
}
function propName(obj) {
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key !== ":@") return key;
  }
}
function assignAttributes(obj, attrMap, readonlyMatcher, options) {
  if (attrMap) {
    const keys = Object.keys(attrMap);
    const len = keys.length;
    for (let i = 0; i < len; i++) {
      const atrrName = keys[i];
      const rawAttrName = atrrName.startsWith(options.attributeNamePrefix) ? atrrName.substring(options.attributeNamePrefix.length) : atrrName;
      const jPathOrMatcher = options.jPath ? readonlyMatcher.toString() + "." + rawAttrName : readonlyMatcher;
      if (options.isArray(atrrName, jPathOrMatcher, true, true)) {
        obj[atrrName] = [attrMap[atrrName]];
      } else {
        obj[atrrName] = attrMap[atrrName];
      }
    }
  }
}
function isLeafTag(obj, options) {
  const { textNodeName } = options;
  const propCount = Object.keys(obj).length;
  if (propCount === 0) {
    return true;
  }
  if (propCount === 1 && (obj[textNodeName] || typeof obj[textNodeName] === "boolean" || obj[textNodeName] === 0)) {
    return true;
  }
  return false;
}
class XMLParser {
  constructor(options) {
    this.externalEntities = {};
    this.options = buildOptions(options);
  }
  /**
   * Parse XML dats to JS object 
   * @param {string|Uint8Array} xmlData 
   * @param {boolean|Object} validationOption 
   */
  parse(xmlData, validationOption) {
    if (typeof xmlData !== "string" && xmlData.toString) {
      xmlData = xmlData.toString();
    } else if (typeof xmlData !== "string") {
      throw new Error("XML data is accepted in String or Bytes[] form.");
    }
    if (validationOption) {
      if (validationOption === true) validationOption = {};
      const result = validate(xmlData, validationOption);
      if (result !== true) {
        throw Error(`${result.err.msg}:${result.err.line}:${result.err.col}`);
      }
    }
    const orderedObjParser = new OrderedObjParser(this.options, this.externalEntities);
    const orderedResult = orderedObjParser.parseXml(xmlData);
    if (this.options.preserveOrder || orderedResult === void 0) return orderedResult;
    else return prettify(orderedResult, this.options, orderedObjParser.matcher, orderedObjParser.readonlyMatcher);
  }
  /**
   * Add Entity which is not by default supported by this library
   * @param {string} key 
   * @param {string} value 
   */
  addEntity(key, value) {
    if (value.indexOf("&") !== -1) {
      throw new Error("Entity value can't have '&'");
    } else if (key.indexOf("&") !== -1 || key.indexOf(";") !== -1) {
      throw new Error("An entity must be set without '&' and ';'. Eg. use '#xD' for '&#xD;'");
    } else if (value === "&") {
      throw new Error("An entity with value '&' is not permitted");
    } else {
      this.externalEntities[key] = value;
    }
  }
  /**
   * Returns a Symbol that can be used to access the metadata
   * property on a node.
   * 
   * If Symbol is not available in the environment, an ordinary property is used
   * and the name of the property is here returned.
   * 
   * The XMLMetaData property is only present when `captureMetaData`
   * is true in the options.
   */
  static getMetaDataSymbol() {
    return XmlNode.getMetaDataSymbol();
  }
}
const parser$1 = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  textNodeName: "#text"
});
const asArray$1 = (value) => value == null ? [] : Array.isArray(value) ? value : [value];
const text = (value) => typeof value === "object" ? value?.["#text"] || "" : value || "";
function collectResponses(value, output = []) {
  if (!value || typeof value !== "object") return output;
  for (const [key, child] of Object.entries(value)) {
    if (key === "response") output.push(...asArray$1(child));
    else collectResponses(child, output);
  }
  return output;
}
function parsePropfind(xml) {
  const responses = collectResponses(parser$1.parse(xml));
  return responses.map((response) => {
    const propstats = asArray$1(response.propstat);
    const prop = propstats.find((item) => / 2\d\d /.test(text(item.status)))?.prop || {};
    const type = prop.resourcetype || {};
    return {
      href: decodeURIComponent(text(response.href)),
      etag: String(text(prop.getetag) || "").replace(/^"|"$/g, "") || null,
      isDirectory: Object.prototype.hasOwnProperty.call(type, "collection"),
      size: Number(text(prop.getcontentlength) || 0)
    };
  });
}
function normalizeEndpoint(endpoint, { allowInsecure = false } = {}) {
  const url = new URL(endpoint);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("WebDAV 地址必须以 http:// 或 https:// 开头。");
  if (url.protocol !== "https:" && !allowInsecure) throw new Error("WebDAV 连接必须使用 HTTPS。");
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url;
}
function encodePath(path) {
  return String(path || "").split("/").filter(Boolean).map((part) => encodeURIComponent(part)).join("/");
}
class WebDavProvider {
  constructor({ endpoint, username, password, request, allowInsecure = false, prefix = "", userAgent = "" }) {
    if (typeof request !== "function") throw new Error("WebDAV requires a network request function.");
    this.baseUrl = normalizeEndpoint(endpoint, { allowInsecure });
    this.request = request;
    this.prefix = String(prefix || "").replace(/^\/+|\/+$/g, "");
    this.userAgent = String(userAgent || "").trim();
    this.authorization = username || password ? `Basic ${Buffer.from(`${username || ""}:${password || ""}`).toString("base64")}` : null;
  }
  urlFor(path = "") {
    return new URL(encodePath([this.prefix, path].filter(Boolean).join("/")), this.baseUrl).toString();
  }
  headers(extra = {}) {
    return {
      ...this.authorization ? { authorization: this.authorization } : {},
      ...this.userAgent ? { "user-agent": this.userAgent } : {},
      ...extra
    };
  }
  async requestPath(path, init = {}) {
    return this.request(this.urlFor(path), {
      ...init,
      headers: this.headers(init.headers)
    });
  }
  async testConnection() {
    const response = await this.requestPath("", {
      method: "PROPFIND",
      headers: { Depth: "0" }
    });
    if (![200, 207].includes(response.status)) {
      throw new Error(`WebDAV 连接失败（HTTP ${response.status}）。请检查地址、账号和权限。`);
    }
    const probePath = `HorseMD/.connection-check/${node_crypto.randomUUID()}`;
    let revision = null;
    try {
      revision = (await this.put(probePath, Buffer.alloc(0), { createOnly: true })).revision;
      await this.delete(probePath, { revision });
    } catch (error) {
      if (revision) {
        try {
          await this.delete(probePath, { revision });
        } catch {
        }
      }
      throw new Error(`WebDAV 上传权限验证失败：${error?.message || error}`);
    }
    return { ok: true };
  }
  async stat(path) {
    const response = await this.requestPath(path, { method: "PROPFIND", headers: { Depth: "0" } });
    if (response.status === 404) return null;
    if (![200, 207].includes(response.status)) throw new Error(`WebDAV 无法读取文件信息（HTTP ${response.status}）。`);
    return parsePropfind(await response.text())[0] || null;
  }
  async list(path = "") {
    const response = await this.requestPath(path, { method: "PROPFIND", headers: { Depth: "1" } });
    if (response.status === 404) return [];
    if (![200, 207].includes(response.status)) throw new Error(`WebDAV 无法列出同步目录（HTTP ${response.status}）。`);
    return parsePropfind(await response.text());
  }
  async get(path) {
    const response = await this.requestPath(path, { method: "GET" });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`WebDAV 下载失败（HTTP ${response.status}）。`);
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      revision: response.headers.get("etag")?.replace(/^"|"$/g, "") || null
    };
  }
  async ensureDirectory(path) {
    const segments = String(path || "").split("/").filter(Boolean);
    let current = "";
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      const response = await this.requestPath(current, { method: "MKCOL" });
      if (![200, 201, 204, 405].includes(response.status)) {
        throw new Error(`WebDAV 无法创建同步目录（HTTP ${response.status}）。`);
      }
    }
  }
  async put(path, bytes, { revision = null, createOnly = false, contentType = "application/octet-stream" } = {}) {
    const slash = String(path).lastIndexOf("/");
    if (slash > 0) await this.ensureDirectory(String(path).slice(0, slash));
    const headers = { "content-type": contentType };
    if (revision) headers["if-match"] = `"${revision}"`;
    if (createOnly) headers["if-none-match"] = "*";
    const response = await this.requestPath(path, { method: "PUT", headers, body: bytes });
    if (response.status === 412) throw new Error("远端文件已被其他设备修改，请重新同步。");
    if (!response.ok) throw new Error(`WebDAV 上传失败（HTTP ${response.status}）。`);
    const writtenRevision = response.headers.get("etag")?.replace(/^"|"$/g, "") || null;
    if (writtenRevision) return { revision: writtenRevision };
    return { revision: (await this.stat(path))?.etag || null };
  }
  async delete(path, { revision = null } = {}) {
    const headers = revision ? { "if-match": `"${revision}"` } : {};
    const response = await this.requestPath(path, { method: "DELETE", headers });
    if ([200, 204, 404].includes(response.status)) return true;
    if (response.status === 412) throw new Error("远端文件已被其他设备修改，请重新同步。");
    throw new Error(`WebDAV 删除失败（HTTP ${response.status}）。`);
  }
}
const isArrayBuffer = (arg) => typeof ArrayBuffer === "function" && arg instanceof ArrayBuffer || Object.prototype.toString.call(arg) === "[object ArrayBuffer]";
const fromString$1 = (input, encoding) => {
  if (typeof input !== "string") {
    throw new TypeError(`The "input" argument must be of type string. Received type ${typeof input} (${input})`);
  }
  return Buffer.from(input, encoding);
};
const fromUtf8$2 = (input) => {
  const buf = fromString$1(input, "utf8");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength / Uint8Array.BYTES_PER_ELEMENT);
};
const SHORT_TO_HEX = {};
const HEX_TO_SHORT = {};
for (let i = 0; i < 256; i++) {
  let encodedByte = i.toString(16).toLowerCase();
  if (encodedByte.length === 1) {
    encodedByte = `0${encodedByte}`;
  }
  SHORT_TO_HEX[i] = encodedByte;
  HEX_TO_SHORT[encodedByte] = i;
}
function fromHex(encoded) {
  if (encoded.length % 2 !== 0) {
    throw new Error("Hex encoded strings must have an even number length");
  }
  const out = new Uint8Array(encoded.length / 2);
  for (let i = 0; i < encoded.length; i += 2) {
    const encodedByte = encoded.slice(i, i + 2).toLowerCase();
    if (encodedByte in HEX_TO_SHORT) {
      out[i / 2] = HEX_TO_SHORT[encodedByte];
    } else {
      throw new Error(`Cannot decode unrecognized sequence ${encodedByte} as hexadecimal`);
    }
  }
  return out;
}
function toHex(bytes) {
  let out = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    out += SHORT_TO_HEX[bytes[i]];
  }
  return out;
}
const toUint8Array = (data) => {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (typeof data === "string") {
    return fromUtf8$2(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength / Uint8Array.BYTES_PER_ELEMENT);
  }
  return new Uint8Array(data);
};
let HttpRequest$1 = class HttpRequest {
  method;
  protocol;
  hostname;
  port;
  path;
  query;
  headers;
  username;
  password;
  fragment;
  body;
  constructor(options) {
    this.method = options.method || "GET";
    this.hostname = options.hostname || "localhost";
    this.port = options.port;
    this.query = options.query || {};
    this.headers = options.headers || {};
    this.body = options.body;
    this.protocol = options.protocol ? options.protocol.slice(-1) !== ":" ? `${options.protocol}:` : options.protocol : "https:";
    this.path = options.path ? options.path.charAt(0) !== "/" ? `/${options.path}` : options.path : "/";
    this.username = options.username;
    this.password = options.password;
    this.fragment = options.fragment;
  }
  static clone(request) {
    const cloned = new HttpRequest({
      ...request,
      headers: { ...request.headers }
    });
    if (cloned.query) {
      cloned.query = cloneQuery$1(cloned.query);
    }
    return cloned;
  }
  static isInstance(request) {
    if (!request) {
      return false;
    }
    const req = request;
    return "method" in req && "protocol" in req && "hostname" in req && "path" in req && typeof req["query"] === "object" && typeof req["headers"] === "object";
  }
  clone() {
    return HttpRequest.clone(this);
  }
};
function cloneQuery$1(query) {
  return Object.keys(query).reduce((carry, paramName) => {
    const param = query[paramName];
    return {
      ...carry,
      [paramName]: Array.isArray(param) ? [...param] : param
    };
  }, {});
}
const normalizeProvider = (input) => {
  if (typeof input === "function")
    return input;
  const promisified = Promise.resolve(input);
  return () => promisified;
};
class HeaderFormatter {
  format(headers) {
    const chunks = [];
    for (const headerName of Object.keys(headers)) {
      const bytes = fromUtf8$2(headerName);
      chunks.push(Uint8Array.from([bytes.byteLength]), bytes, this.formatHeaderValue(headers[headerName]));
    }
    const out = new Uint8Array(chunks.reduce((carry, bytes) => carry + bytes.byteLength, 0));
    let position = 0;
    for (const chunk of chunks) {
      out.set(chunk, position);
      position += chunk.byteLength;
    }
    return out;
  }
  formatHeaderValue(header) {
    switch (header.type) {
      case "boolean":
        return Uint8Array.from([header.value ? HEADER_VALUE_TYPE.boolTrue : HEADER_VALUE_TYPE.boolFalse]);
      case "byte":
        return Uint8Array.from([HEADER_VALUE_TYPE.byte, header.value]);
      case "short":
        const shortView = new DataView(new ArrayBuffer(3));
        shortView.setUint8(0, HEADER_VALUE_TYPE.short);
        shortView.setInt16(1, header.value, false);
        return new Uint8Array(shortView.buffer);
      case "integer":
        const intView = new DataView(new ArrayBuffer(5));
        intView.setUint8(0, HEADER_VALUE_TYPE.integer);
        intView.setInt32(1, header.value, false);
        return new Uint8Array(intView.buffer);
      case "long":
        const longBytes = new Uint8Array(9);
        longBytes[0] = HEADER_VALUE_TYPE.long;
        longBytes.set(header.value.bytes, 1);
        return longBytes;
      case "binary":
        const binView = new DataView(new ArrayBuffer(3 + header.value.byteLength));
        binView.setUint8(0, HEADER_VALUE_TYPE.byteArray);
        binView.setUint16(1, header.value.byteLength, false);
        const binBytes = new Uint8Array(binView.buffer);
        binBytes.set(header.value, 3);
        return binBytes;
      case "string":
        const utf8Bytes = fromUtf8$2(header.value);
        const strView = new DataView(new ArrayBuffer(3 + utf8Bytes.byteLength));
        strView.setUint8(0, HEADER_VALUE_TYPE.string);
        strView.setUint16(1, utf8Bytes.byteLength, false);
        const strBytes = new Uint8Array(strView.buffer);
        strBytes.set(utf8Bytes, 3);
        return strBytes;
      case "timestamp":
        const tsBytes = new Uint8Array(9);
        tsBytes[0] = HEADER_VALUE_TYPE.timestamp;
        tsBytes.set(Int64.fromNumber(header.value.valueOf()).bytes, 1);
        return tsBytes;
      case "uuid":
        if (!UUID_PATTERN.test(header.value)) {
          throw new Error(`Invalid UUID received: ${header.value}`);
        }
        const uuidBytes = new Uint8Array(17);
        uuidBytes[0] = HEADER_VALUE_TYPE.uuid;
        uuidBytes.set(fromHex(header.value.replace(/-/g, "")), 1);
        return uuidBytes;
    }
  }
}
var HEADER_VALUE_TYPE;
(function(HEADER_VALUE_TYPE2) {
  HEADER_VALUE_TYPE2[HEADER_VALUE_TYPE2["boolTrue"] = 0] = "boolTrue";
  HEADER_VALUE_TYPE2[HEADER_VALUE_TYPE2["boolFalse"] = 1] = "boolFalse";
  HEADER_VALUE_TYPE2[HEADER_VALUE_TYPE2["byte"] = 2] = "byte";
  HEADER_VALUE_TYPE2[HEADER_VALUE_TYPE2["short"] = 3] = "short";
  HEADER_VALUE_TYPE2[HEADER_VALUE_TYPE2["integer"] = 4] = "integer";
  HEADER_VALUE_TYPE2[HEADER_VALUE_TYPE2["long"] = 5] = "long";
  HEADER_VALUE_TYPE2[HEADER_VALUE_TYPE2["byteArray"] = 6] = "byteArray";
  HEADER_VALUE_TYPE2[HEADER_VALUE_TYPE2["string"] = 7] = "string";
  HEADER_VALUE_TYPE2[HEADER_VALUE_TYPE2["timestamp"] = 8] = "timestamp";
  HEADER_VALUE_TYPE2[HEADER_VALUE_TYPE2["uuid"] = 9] = "uuid";
})(HEADER_VALUE_TYPE || (HEADER_VALUE_TYPE = {}));
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
class Int64 {
  bytes;
  constructor(bytes) {
    this.bytes = bytes;
    if (bytes.byteLength !== 8) {
      throw new Error("Int64 buffers must be exactly 8 bytes");
    }
  }
  static fromNumber(number) {
    if (number > 9223372036854776e3 || number < -9223372036854776e3) {
      throw new Error(`${number} is too large (or, if negative, too small) to represent as an Int64`);
    }
    const bytes = new Uint8Array(8);
    for (let i = 7, remaining = Math.abs(Math.round(number)); i > -1 && remaining > 0; i--, remaining /= 256) {
      bytes[i] = remaining;
    }
    if (number < 0) {
      negate(bytes);
    }
    return new Int64(bytes);
  }
  valueOf() {
    const bytes = this.bytes.slice(0);
    const negative = bytes[0] & 128;
    if (negative) {
      negate(bytes);
    }
    return parseInt(toHex(bytes), 16) * (negative ? -1 : 1);
  }
  toString() {
    return String(this.valueOf());
  }
}
function negate(bytes) {
  for (let i = 0; i < 8; i++) {
    bytes[i] ^= 255;
  }
  for (let i = 7; i > -1; i--) {
    bytes[i]++;
    if (bytes[i] !== 0)
      break;
  }
}
const escapeUri = (uri) => encodeURIComponent(uri).replace(/[!'()*]/g, hexEncode);
const hexEncode = (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`;
const ALGORITHM_QUERY_PARAM = "X-Amz-Algorithm";
const CREDENTIAL_QUERY_PARAM = "X-Amz-Credential";
const AMZ_DATE_QUERY_PARAM = "X-Amz-Date";
const SIGNED_HEADERS_QUERY_PARAM = "X-Amz-SignedHeaders";
const EXPIRES_QUERY_PARAM = "X-Amz-Expires";
const SIGNATURE_QUERY_PARAM = "X-Amz-Signature";
const TOKEN_QUERY_PARAM = "X-Amz-Security-Token";
const AUTH_HEADER = "authorization";
const AMZ_DATE_HEADER = AMZ_DATE_QUERY_PARAM.toLowerCase();
const DATE_HEADER = "date";
const GENERATED_HEADERS = [AUTH_HEADER, AMZ_DATE_HEADER, DATE_HEADER];
const SIGNATURE_HEADER = SIGNATURE_QUERY_PARAM.toLowerCase();
const SHA256_HEADER = "x-amz-content-sha256";
const TOKEN_HEADER = TOKEN_QUERY_PARAM.toLowerCase();
const ALWAYS_UNSIGNABLE_HEADERS = {
  authorization: true,
  "cache-control": true,
  connection: true,
  expect: true,
  from: true,
  "keep-alive": true,
  "max-forwards": true,
  pragma: true,
  referer: true,
  te: true,
  trailer: true,
  "transfer-encoding": true,
  upgrade: true,
  "user-agent": true,
  "x-amzn-trace-id": true
};
const PROXY_HEADER_PATTERN = /^proxy-/;
const SEC_HEADER_PATTERN = /^sec-/;
const ALGORITHM_IDENTIFIER = "AWS4-HMAC-SHA256";
const EVENT_ALGORITHM_IDENTIFIER = "AWS4-HMAC-SHA256-PAYLOAD";
const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";
const MAX_CACHE_SIZE = 50;
const KEY_TYPE_IDENTIFIER = "aws4_request";
const MAX_PRESIGNED_TTL = 60 * 60 * 24 * 7;
const getCanonicalQuery = ({ query = {} }) => {
  const keys = [];
  const serialized = {};
  for (const key of Object.keys(query)) {
    if (key.toLowerCase() === SIGNATURE_HEADER) {
      continue;
    }
    const encodedKey = escapeUri(key);
    keys.push(encodedKey);
    const value = query[key];
    if (typeof value === "string") {
      serialized[encodedKey] = `${encodedKey}=${escapeUri(value)}`;
    } else if (Array.isArray(value)) {
      serialized[encodedKey] = value.slice(0).reduce((encoded, value2) => encoded.concat([`${encodedKey}=${escapeUri(value2)}`]), []).sort().join("&");
    }
  }
  return keys.sort().map((key) => serialized[key]).filter((serialized2) => serialized2).join("&");
};
const iso8601 = (time) => toDate(time).toISOString().replace(/\.\d{3}Z$/, "Z");
const toDate = (time) => {
  if (typeof time === "number") {
    return new Date(time * 1e3);
  }
  if (typeof time === "string") {
    if (Number(time)) {
      return new Date(Number(time) * 1e3);
    }
    return new Date(time);
  }
  return time;
};
class SignatureV4Base {
  service;
  regionProvider;
  credentialProvider;
  sha256;
  uriEscapePath;
  applyChecksum;
  constructor({ applyChecksum, credentials, region, service, sha256: sha2562, uriEscapePath = true }) {
    this.service = service;
    this.sha256 = sha2562;
    this.uriEscapePath = uriEscapePath;
    this.applyChecksum = typeof applyChecksum === "boolean" ? applyChecksum : true;
    this.regionProvider = normalizeProvider(region);
    this.credentialProvider = normalizeProvider(credentials);
  }
  createCanonicalRequest(request, canonicalHeaders, payloadHash) {
    const sortedHeaders = Object.keys(canonicalHeaders).sort();
    return `${request.method}
${this.getCanonicalPath(request)}
${getCanonicalQuery(request)}
${sortedHeaders.map((name) => `${name}:${canonicalHeaders[name]}`).join("\n")}

${sortedHeaders.join(";")}
${payloadHash}`;
  }
  async createStringToSign(longDate, credentialScope, canonicalRequest, algorithmIdentifier) {
    const hash = new this.sha256();
    hash.update(toUint8Array(canonicalRequest));
    const hashedRequest = await hash.digest();
    return `${algorithmIdentifier}
${longDate}
${credentialScope}
${toHex(hashedRequest)}`;
  }
  getCanonicalPath({ path }) {
    if (this.uriEscapePath) {
      const normalizedPathSegments = [];
      for (const pathSegment of path.split("/")) {
        if (pathSegment?.length === 0)
          continue;
        if (pathSegment === ".")
          continue;
        if (pathSegment === "..") {
          normalizedPathSegments.pop();
        } else {
          normalizedPathSegments.push(pathSegment);
        }
      }
      const normalizedPath = `${path?.startsWith("/") ? "/" : ""}${normalizedPathSegments.join("/")}${normalizedPathSegments.length > 0 && path?.endsWith("/") ? "/" : ""}`;
      const doubleEncoded = escapeUri(normalizedPath);
      return doubleEncoded.replace(/%2F/g, "/");
    }
    return path;
  }
  validateResolvedCredentials(credentials) {
    if (typeof credentials !== "object" || typeof credentials.accessKeyId !== "string" || typeof credentials.secretAccessKey !== "string") {
      throw new Error("Resolved credential object is not valid");
    }
  }
  formatDate(now2) {
    const longDate = iso8601(now2).replace(/[-:]/g, "");
    return {
      longDate,
      shortDate: longDate.slice(0, 8)
    };
  }
  getCanonicalHeaderList(headers) {
    return Object.keys(headers).sort().join(";");
  }
}
const signingKeyCache = {};
const cacheQueue = [];
const createScope = (shortDate, region, service) => `${shortDate}/${region}/${service}/${KEY_TYPE_IDENTIFIER}`;
const getSigningKey = async (sha256Constructor, credentials, shortDate, region, service) => {
  const credsHash = await hmac(sha256Constructor, credentials.secretAccessKey, credentials.accessKeyId);
  const cacheKey = `${shortDate}:${region}:${service}:${toHex(credsHash)}:${credentials.sessionToken}`;
  if (cacheKey in signingKeyCache) {
    return signingKeyCache[cacheKey];
  }
  cacheQueue.push(cacheKey);
  while (cacheQueue.length > MAX_CACHE_SIZE) {
    delete signingKeyCache[cacheQueue.shift()];
  }
  let key = `AWS4${credentials.secretAccessKey}`;
  for (const signable of [shortDate, region, service, KEY_TYPE_IDENTIFIER]) {
    key = await hmac(sha256Constructor, key, signable);
  }
  return signingKeyCache[cacheKey] = key;
};
const hmac = (ctor, secret, data) => {
  const hash = new ctor(secret);
  hash.update(toUint8Array(data));
  return hash.digest();
};
const getCanonicalHeaders = ({ headers }, unsignableHeaders, signableHeaders) => {
  const canonical = {};
  for (const headerName of Object.keys(headers).sort()) {
    if (headers[headerName] == void 0) {
      continue;
    }
    const canonicalHeaderName = headerName.toLowerCase();
    if (canonicalHeaderName in ALWAYS_UNSIGNABLE_HEADERS || unsignableHeaders?.has(canonicalHeaderName) || PROXY_HEADER_PATTERN.test(canonicalHeaderName) || SEC_HEADER_PATTERN.test(canonicalHeaderName)) {
      if (!signableHeaders || signableHeaders && !signableHeaders.has(canonicalHeaderName)) {
        continue;
      }
    }
    canonical[canonicalHeaderName] = headers[headerName].trim().replace(/\s+/g, " ");
  }
  return canonical;
};
const getPayloadHash = async ({ headers, body }, hashConstructor) => {
  for (const headerName of Object.keys(headers)) {
    if (headerName.toLowerCase() === SHA256_HEADER) {
      return headers[headerName];
    }
  }
  if (body == void 0) {
    return "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  } else if (typeof body === "string" || ArrayBuffer.isView(body) || isArrayBuffer(body)) {
    const hashCtor = new hashConstructor();
    hashCtor.update(toUint8Array(body));
    return toHex(await hashCtor.digest());
  }
  return UNSIGNED_PAYLOAD;
};
const hasHeader = (soughtHeader, headers) => {
  soughtHeader = soughtHeader.toLowerCase();
  for (const headerName of Object.keys(headers)) {
    if (soughtHeader === headerName.toLowerCase()) {
      return true;
    }
  }
  return false;
};
const moveHeadersToQuery = (request, options = {}) => {
  const { headers, query = {} } = HttpRequest$1.clone(request);
  for (const name of Object.keys(headers)) {
    const lname = name.toLowerCase();
    if (lname.slice(0, 6) === "x-amz-" && !options.unhoistableHeaders?.has(lname) || options.hoistableHeaders?.has(lname)) {
      query[name] = headers[name];
      delete headers[name];
    }
  }
  return {
    ...request,
    headers,
    query
  };
};
const prepareRequest = (request) => {
  request = HttpRequest$1.clone(request);
  for (const headerName of Object.keys(request.headers)) {
    if (GENERATED_HEADERS.indexOf(headerName.toLowerCase()) > -1) {
      delete request.headers[headerName];
    }
  }
  return request;
};
class SignatureV4 extends SignatureV4Base {
  headerFormatter = new HeaderFormatter();
  constructor({ applyChecksum, credentials, region, service, sha256: sha2562, uriEscapePath = true }) {
    super({
      applyChecksum,
      credentials,
      region,
      service,
      sha256: sha2562,
      uriEscapePath
    });
  }
  async presign(originalRequest, options = {}) {
    const { signingDate = /* @__PURE__ */ new Date(), expiresIn = 3600, unsignableHeaders, unhoistableHeaders, signableHeaders, hoistableHeaders, signingRegion, signingService } = options;
    const credentials = await this.credentialProvider();
    this.validateResolvedCredentials(credentials);
    const region = signingRegion ?? await this.regionProvider();
    const { longDate, shortDate } = this.formatDate(signingDate);
    if (expiresIn > MAX_PRESIGNED_TTL) {
      return Promise.reject("Signature version 4 presigned URLs must have an expiration date less than one week in the future");
    }
    const scope = createScope(shortDate, region, signingService ?? this.service);
    const request = moveHeadersToQuery(prepareRequest(originalRequest), { unhoistableHeaders, hoistableHeaders });
    if (credentials.sessionToken) {
      request.query[TOKEN_QUERY_PARAM] = credentials.sessionToken;
    }
    request.query[ALGORITHM_QUERY_PARAM] = ALGORITHM_IDENTIFIER;
    request.query[CREDENTIAL_QUERY_PARAM] = `${credentials.accessKeyId}/${scope}`;
    request.query[AMZ_DATE_QUERY_PARAM] = longDate;
    request.query[EXPIRES_QUERY_PARAM] = expiresIn.toString(10);
    const canonicalHeaders = getCanonicalHeaders(request, unsignableHeaders, signableHeaders);
    request.query[SIGNED_HEADERS_QUERY_PARAM] = this.getCanonicalHeaderList(canonicalHeaders);
    request.query[SIGNATURE_QUERY_PARAM] = await this.getSignature(longDate, scope, this.getSigningKey(credentials, region, shortDate, signingService), this.createCanonicalRequest(request, canonicalHeaders, await getPayloadHash(originalRequest, this.sha256)));
    return request;
  }
  async sign(toSign, options) {
    if (typeof toSign === "string") {
      return this.signString(toSign, options);
    } else if (toSign.headers && toSign.payload) {
      return this.signEvent(toSign, options);
    } else if (toSign.message) {
      return this.signMessage(toSign, options);
    } else {
      return this.signRequest(toSign, options);
    }
  }
  async signEvent({ headers, payload }, { signingDate = /* @__PURE__ */ new Date(), priorSignature, signingRegion, signingService, eventStreamCredentials }) {
    const region = signingRegion ?? await this.regionProvider();
    const { shortDate, longDate } = this.formatDate(signingDate);
    const scope = createScope(shortDate, region, signingService ?? this.service);
    const hashedPayload = await getPayloadHash({ headers: {}, body: payload }, this.sha256);
    const hash = new this.sha256();
    hash.update(headers);
    const hashedHeaders = toHex(await hash.digest());
    const stringToSign = [
      EVENT_ALGORITHM_IDENTIFIER,
      longDate,
      scope,
      priorSignature,
      hashedHeaders,
      hashedPayload
    ].join("\n");
    return this.signString(stringToSign, {
      signingDate,
      signingRegion: region,
      signingService,
      eventStreamCredentials
    });
  }
  async signMessage(signableMessage, { signingDate = /* @__PURE__ */ new Date(), signingRegion, signingService, eventStreamCredentials }) {
    const promise = this.signEvent({
      headers: this.headerFormatter.format(signableMessage.message.headers),
      payload: signableMessage.message.body
    }, {
      signingDate,
      signingRegion,
      signingService,
      priorSignature: signableMessage.priorSignature,
      eventStreamCredentials
    });
    return promise.then((signature) => {
      return { message: signableMessage.message, signature };
    });
  }
  async signString(stringToSign, { signingDate = /* @__PURE__ */ new Date(), signingRegion, signingService, eventStreamCredentials } = {}) {
    const credentials = eventStreamCredentials ?? await this.credentialProvider();
    this.validateResolvedCredentials(credentials);
    const region = signingRegion ?? await this.regionProvider();
    const { shortDate } = this.formatDate(signingDate);
    const hash = new this.sha256(await this.getSigningKey(credentials, region, shortDate, signingService));
    hash.update(toUint8Array(stringToSign));
    return toHex(await hash.digest());
  }
  async signRequest(requestToSign, { signingDate = /* @__PURE__ */ new Date(), signableHeaders, unsignableHeaders, signingRegion, signingService } = {}) {
    const credentials = await this.credentialProvider();
    this.validateResolvedCredentials(credentials);
    const region = signingRegion ?? await this.regionProvider();
    const request = prepareRequest(requestToSign);
    const { longDate, shortDate } = this.formatDate(signingDate);
    const scope = createScope(shortDate, region, signingService ?? this.service);
    request.headers[AMZ_DATE_HEADER] = longDate;
    if (credentials.sessionToken) {
      request.headers[TOKEN_HEADER] = credentials.sessionToken;
    }
    const payloadHash = await getPayloadHash(request, this.sha256);
    if (!hasHeader(SHA256_HEADER, request.headers) && this.applyChecksum) {
      request.headers[SHA256_HEADER] = payloadHash;
    }
    const canonicalHeaders = getCanonicalHeaders(request, unsignableHeaders, signableHeaders);
    const signature = await this.getSignature(longDate, scope, this.getSigningKey(credentials, region, shortDate, signingService), this.createCanonicalRequest(request, canonicalHeaders, payloadHash));
    request.headers[AUTH_HEADER] = `${ALGORITHM_IDENTIFIER} Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${this.getCanonicalHeaderList(canonicalHeaders)}, Signature=${signature}`;
    return request;
  }
  async getSignature(longDate, credentialScope, keyPromise, canonicalRequest) {
    const stringToSign = await this.createStringToSign(longDate, credentialScope, canonicalRequest, ALGORITHM_IDENTIFIER);
    const hash = new this.sha256(await keyPromise);
    hash.update(toUint8Array(stringToSign));
    return toHex(await hash.digest());
  }
  getSigningKey(credentials, region, shortDate, service) {
    return getSigningKey(this.sha256, credentials, shortDate, region, service || this.service);
  }
}
class HttpRequest2 {
  method;
  protocol;
  hostname;
  port;
  path;
  query;
  headers;
  username;
  password;
  fragment;
  body;
  constructor(options) {
    this.method = options.method || "GET";
    this.hostname = options.hostname || "localhost";
    this.port = options.port;
    this.query = options.query || {};
    this.headers = options.headers || {};
    this.body = options.body;
    this.protocol = options.protocol ? options.protocol.slice(-1) !== ":" ? `${options.protocol}:` : options.protocol : "https:";
    this.path = options.path ? options.path.charAt(0) !== "/" ? `/${options.path}` : options.path : "/";
    this.username = options.username;
    this.password = options.password;
    this.fragment = options.fragment;
  }
  static clone(request) {
    const cloned = new HttpRequest2({
      ...request,
      headers: { ...request.headers }
    });
    if (cloned.query) {
      cloned.query = cloneQuery(cloned.query);
    }
    return cloned;
  }
  static isInstance(request) {
    if (!request) {
      return false;
    }
    const req = request;
    return "method" in req && "protocol" in req && "hostname" in req && "path" in req && typeof req["query"] === "object" && typeof req["headers"] === "object";
  }
  clone() {
    return HttpRequest2.clone(this);
  }
}
function cloneQuery(query) {
  return Object.keys(query).reduce((carry, paramName) => {
    const param = query[paramName];
    return {
      ...carry,
      [paramName]: Array.isArray(param) ? [...param] : param
    };
  }, {});
}
function __awaiter(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
}
function __generator(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
}
typeof SuppressedError === "function" ? SuppressedError : function(error, suppressed, message) {
  var e = new Error(message);
  return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};
var BLOCK_SIZE = 64;
var DIGEST_LENGTH = 32;
var KEY = new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var INIT = [
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
];
var MAX_HASHABLE_LENGTH = Math.pow(2, 53) - 1;
var RawSha256 = (
  /** @class */
  (function() {
    function RawSha2562() {
      this.state = Int32Array.from(INIT);
      this.temp = new Int32Array(64);
      this.buffer = new Uint8Array(64);
      this.bufferLength = 0;
      this.bytesHashed = 0;
      this.finished = false;
    }
    RawSha2562.prototype.update = function(data) {
      if (this.finished) {
        throw new Error("Attempted to update an already finished hash.");
      }
      var position = 0;
      var byteLength = data.byteLength;
      this.bytesHashed += byteLength;
      if (this.bytesHashed * 8 > MAX_HASHABLE_LENGTH) {
        throw new Error("Cannot hash more than 2^53 - 1 bits");
      }
      while (byteLength > 0) {
        this.buffer[this.bufferLength++] = data[position++];
        byteLength--;
        if (this.bufferLength === BLOCK_SIZE) {
          this.hashBuffer();
          this.bufferLength = 0;
        }
      }
    };
    RawSha2562.prototype.digest = function() {
      if (!this.finished) {
        var bitsHashed = this.bytesHashed * 8;
        var bufferView = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
        var undecoratedLength = this.bufferLength;
        bufferView.setUint8(this.bufferLength++, 128);
        if (undecoratedLength % BLOCK_SIZE >= BLOCK_SIZE - 8) {
          for (var i = this.bufferLength; i < BLOCK_SIZE; i++) {
            bufferView.setUint8(i, 0);
          }
          this.hashBuffer();
          this.bufferLength = 0;
        }
        for (var i = this.bufferLength; i < BLOCK_SIZE - 8; i++) {
          bufferView.setUint8(i, 0);
        }
        bufferView.setUint32(BLOCK_SIZE - 8, Math.floor(bitsHashed / 4294967296), true);
        bufferView.setUint32(BLOCK_SIZE - 4, bitsHashed);
        this.hashBuffer();
        this.finished = true;
      }
      var out = new Uint8Array(DIGEST_LENGTH);
      for (var i = 0; i < 8; i++) {
        out[i * 4] = this.state[i] >>> 24 & 255;
        out[i * 4 + 1] = this.state[i] >>> 16 & 255;
        out[i * 4 + 2] = this.state[i] >>> 8 & 255;
        out[i * 4 + 3] = this.state[i] >>> 0 & 255;
      }
      return out;
    };
    RawSha2562.prototype.hashBuffer = function() {
      var _a = this, buffer2 = _a.buffer, state = _a.state;
      var state0 = state[0], state1 = state[1], state2 = state[2], state3 = state[3], state4 = state[4], state5 = state[5], state6 = state[6], state7 = state[7];
      for (var i = 0; i < BLOCK_SIZE; i++) {
        if (i < 16) {
          this.temp[i] = (buffer2[i * 4] & 255) << 24 | (buffer2[i * 4 + 1] & 255) << 16 | (buffer2[i * 4 + 2] & 255) << 8 | buffer2[i * 4 + 3] & 255;
        } else {
          var u = this.temp[i - 2];
          var t1_1 = (u >>> 17 | u << 15) ^ (u >>> 19 | u << 13) ^ u >>> 10;
          u = this.temp[i - 15];
          var t2_1 = (u >>> 7 | u << 25) ^ (u >>> 18 | u << 14) ^ u >>> 3;
          this.temp[i] = (t1_1 + this.temp[i - 7] | 0) + (t2_1 + this.temp[i - 16] | 0);
        }
        var t1 = (((state4 >>> 6 | state4 << 26) ^ (state4 >>> 11 | state4 << 21) ^ (state4 >>> 25 | state4 << 7)) + (state4 & state5 ^ ~state4 & state6) | 0) + (state7 + (KEY[i] + this.temp[i] | 0) | 0) | 0;
        var t2 = ((state0 >>> 2 | state0 << 30) ^ (state0 >>> 13 | state0 << 19) ^ (state0 >>> 22 | state0 << 10)) + (state0 & state1 ^ state0 & state2 ^ state1 & state2) | 0;
        state7 = state6;
        state6 = state5;
        state5 = state4;
        state4 = state3 + t1 | 0;
        state3 = state2;
        state2 = state1;
        state1 = state0;
        state0 = t1 + t2 | 0;
      }
      state[0] += state0;
      state[1] += state1;
      state[2] += state2;
      state[3] += state3;
      state[4] += state4;
      state[5] += state5;
      state[6] += state6;
      state[7] += state7;
    };
    return RawSha2562;
  })()
);
const fromString = (input, encoding) => {
  if (typeof input !== "string") {
    throw new TypeError(`The "input" argument must be of type string. Received type ${typeof input} (${input})`);
  }
  return buffer.Buffer.from(input, encoding);
};
const fromUtf8$1 = (input) => {
  const buf = fromString(input, "utf8");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength / Uint8Array.BYTES_PER_ELEMENT);
};
var fromUtf8 = typeof Buffer !== "undefined" && Buffer.from ? function(input) {
  return Buffer.from(input, "utf8");
} : fromUtf8$1;
function convertToBuffer(data) {
  if (data instanceof Uint8Array)
    return data;
  if (typeof data === "string") {
    return fromUtf8(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength / Uint8Array.BYTES_PER_ELEMENT);
  }
  return new Uint8Array(data);
}
function isEmptyData(data) {
  if (typeof data === "string") {
    return data.length === 0;
  }
  return data.byteLength === 0;
}
var Sha256 = (
  /** @class */
  (function() {
    function Sha2562(secret) {
      this.secret = secret;
      this.hash = new RawSha256();
      this.reset();
    }
    Sha2562.prototype.update = function(toHash) {
      if (isEmptyData(toHash) || this.error) {
        return;
      }
      try {
        this.hash.update(convertToBuffer(toHash));
      } catch (e) {
        this.error = e;
      }
    };
    Sha2562.prototype.digestSync = function() {
      if (this.error) {
        throw this.error;
      }
      if (this.outer) {
        if (!this.outer.finished) {
          this.outer.update(this.hash.digest());
        }
        return this.outer.digest();
      }
      return this.hash.digest();
    };
    Sha2562.prototype.digest = function() {
      return __awaiter(this, void 0, void 0, function() {
        return __generator(this, function(_a) {
          return [2, this.digestSync()];
        });
      });
    };
    Sha2562.prototype.reset = function() {
      this.hash = new RawSha256();
      if (this.secret) {
        this.outer = new RawSha256();
        var inner = bufferFromSecret(this.secret);
        var outer = new Uint8Array(BLOCK_SIZE);
        outer.set(inner);
        for (var i = 0; i < BLOCK_SIZE; i++) {
          inner[i] ^= 54;
          outer[i] ^= 92;
        }
        this.hash.update(inner);
        this.outer.update(outer);
        for (var i = 0; i < inner.byteLength; i++) {
          inner[i] = 0;
        }
      }
    };
    return Sha2562;
  })()
);
function bufferFromSecret(secret) {
  var input = convertToBuffer(secret);
  if (input.byteLength > BLOCK_SIZE) {
    var bufferHash = new RawSha256();
    bufferHash.update(input);
    input = bufferHash.digest();
  }
  var buffer2 = new Uint8Array(BLOCK_SIZE);
  buffer2.set(input);
  return buffer2;
}
const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: false });
const asArray = (value) => value == null ? [] : Array.isArray(value) ? value : [value];
const clean = (value) => String(value || "").replace(/^\/+|\/+$/g, "");
const encodePathSegment = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
function parseList(xml) {
  const root = parser.parse(xml)?.ListBucketResult || {};
  return [
    ...asArray(root.Contents).map((entry) => ({ href: entry.Key, isDirectory: false, etag: String(entry.ETag || "").replace(/^"|"$/g, ""), size: Number(entry.Size || 0) })),
    ...asArray(root.CommonPrefixes).map((entry) => ({ href: entry.Prefix, isDirectory: true, etag: null, size: 0 }))
  ];
}
async function failureCode(response) {
  try {
    const body = await response.text();
    const code = parser.parse(body)?.Error?.Code;
    return code ? ` ${code}` : "";
  } catch {
    return "";
  }
}
class S3Provider {
  constructor({ endpoint, bucket, region, accessKeyId, secretAccessKey, request, prefix = "", allowInsecure = false, userAgent = "" }) {
    const url = new URL(endpoint);
    if (!["https:", "http:"].includes(url.protocol)) throw new Error("S3 Endpoint 无效。");
    if (url.protocol !== "https:" && !allowInsecure) throw new Error("S3 连接必须使用 HTTPS。");
    if (!bucket || !region || !accessKeyId || !secretAccessKey) throw new Error("请填写完整的 S3 连接信息。");
    this.endpoint = url;
    this.bucket = bucket;
    this.prefix = clean(prefix);
    this.request = request;
    this.userAgent = String(userAgent || "").trim();
    this.signer = new SignatureV4({ credentials: { accessKeyId, secretAccessKey }, region, service: "s3", sha256: Sha256, uriEscapePath: false });
  }
  objectKey(path = "") {
    return [this.prefix, clean(path)].filter(Boolean).join("/");
  }
  async signedRequest(method, path = "", { headers = {}, body = null, query = {} } = {}) {
    const key = this.objectKey(path);
    const base = new URL(this.endpoint);
    base.pathname = `${base.pathname.replace(/\/$/, "")}/${encodePathSegment(this.bucket)}${key ? `/${key.split("/").map(encodePathSegment).join("/")}` : ""}`;
    for (const [name, value] of Object.entries(query)) if (value != null) base.searchParams.set(name, value);
    const signed = await this.signer.sign(new HttpRequest2({
      protocol: base.protocol,
      hostname: base.hostname,
      port: base.port,
      method,
      path: base.pathname,
      query: Object.fromEntries(base.searchParams),
      headers: { host: base.host, ...this.userAgent ? { "user-agent": this.userAgent } : {}, ...headers },
      body
    }));
    const { host, ...requestHeaders } = signed.headers;
    return this.request(base.toString(), { method, headers: requestHeaders, body });
  }
  async testConnection() {
    const response = await this.signedRequest("GET", "", { query: { "list-type": "2", "max-keys": "1" } });
    if (!response.ok) throw new Error(`S3 连接失败（HTTP ${response.status}${await failureCode(response)}）。请检查 Endpoint、Bucket、Region 和权限。`);
    const probePath = `HorseMD/.connection-check/${node_crypto.randomUUID()}`;
    let revision = null;
    try {
      revision = (await this.put(probePath, Buffer.alloc(0), { createOnly: true })).revision;
      await this.delete(probePath, { revision });
    } catch (error) {
      if (revision) {
        try {
          await this.delete(probePath, { revision });
        } catch {
        }
      }
      throw new Error(`S3 上传权限验证失败：${error?.message || error}`);
    }
    return { ok: true };
  }
  async get(path) {
    const response = await this.signedRequest("GET", path);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`S3 下载失败（HTTP ${response.status}${await failureCode(response)}）。`);
    return { bytes: Buffer.from(await response.arrayBuffer()), revision: response.headers.get("etag")?.replace(/^"|"$/g, "") || null };
  }
  async put(path, bytes, { revision = null, createOnly = false, contentType = "application/octet-stream" } = {}) {
    const headers = { "content-type": contentType };
    if (revision) headers["if-match"] = `"${revision}"`;
    if (createOnly) headers["if-none-match"] = "*";
    const response = await this.signedRequest("PUT", path, { headers, body: bytes });
    if (response.status === 412) throw new Error("远端文件已被其他设备修改，请重新同步。");
    if (createOnly && response.status === 404 && await failureCode(response) === " NoSuchKey") {
      if (await this.get(path)) throw new Error("远端文件已被其他设备创建，请重新同步。");
      return this.put(path, bytes, { contentType });
    }
    if (!response.ok) throw new Error(`S3 上传失败（HTTP ${response.status}${await failureCode(response)}）。`);
    return { revision: response.headers.get("etag")?.replace(/^"|"$/g, "") || null };
  }
  async delete(path, { revision = null } = {}) {
    const response = await this.signedRequest("DELETE", path, { headers: revision ? { "if-match": `"${revision}"` } : {} });
    if ([200, 204, 404].includes(response.status)) return true;
    if (response.status === 412) throw new Error("远端文件已被其他设备修改，请重新同步。");
    throw new Error(`S3 删除失败（HTTP ${response.status}${await failureCode(response)}）。`);
  }
  async list(path = "") {
    const prefix = this.objectKey(path);
    const response = await this.signedRequest("GET", "", { query: { "list-type": "2", prefix: prefix ? `${prefix}/` : "", delimiter: "/" } });
    if (!response.ok) throw new Error(`S3 无法列出同步目录（HTTP ${response.status}${await failureCode(response)}）。`);
    return parseList(await response.text()).map((entry) => ({ ...entry, href: entry.href.replace(new RegExp(`^${this.prefix ? `${this.prefix}/` : ""}`), "") }));
  }
}
const INTERNAL_DIRS = /* @__PURE__ */ new Set([".horsemd", ".git", ".obsidian", "node_modules"]);
function sha256(bytes) {
  return node_crypto.createHash("sha256").update(bytes).digest("hex");
}
function sha256File(path) {
  return new Promise((resolve, reject) => {
    const hash = node_crypto.createHash("sha256");
    const stream = node_fs.createReadStream(path, { highWaterMark: 1024 * 1024 });
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
function isInternalRelativePath(path) {
  return path.split(/[\\/]/).some((segment) => INTERNAL_DIRS.has(segment));
}
async function scanLocalWorkspace(rootPath, { maxFiles = 2e4 } = {}) {
  const files = /* @__PURE__ */ new Map();
  async function walk(dir, depth) {
    if (depth > 32) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory() && INTERNAL_DIRS.has(entry.name)) continue;
      const fullPath = node_path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (files.size >= maxFiles) throw new Error(`同步文件数量超过上限（${maxFiles}）。`);
      const relativePath = node_path.relative(rootPath, fullPath);
      if (!relativePath || relativePath.startsWith(`..${node_path.sep}`) || isInternalRelativePath(relativePath)) continue;
      const [sha256Hex, stat] = await Promise.all([sha256File(fullPath), fs.stat(fullPath)]);
      files.set(relativePath.replace(/\\/g, "/"), {
        sha256: sha256Hex,
        size: stat.size,
        mtimeMs: stat.mtimeMs
      });
    }
  }
  await walk(rootPath, 0);
  return files;
}
const normalizePath = (value) => String(value || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
function asMap(entries) {
  if (!entries) return /* @__PURE__ */ new Map();
  if (entries instanceof Map) return new Map(entries);
  return new Map(Object.entries(entries).map(([path, entry]) => [normalizePath(path), entry]));
}
const hashOf = (entry) => entry?.sha256 ? String(entry.sha256) : null;
function makeConflictPath(path, suffix) {
  const normalized = normalizePath(path);
  const directory = posix.dirname(normalized);
  const extension = posix.extname(normalized);
  const stem = posix.basename(normalized, extension);
  const name = `${stem} (${suffix})${extension}`;
  return directory === "." ? name : posix.join(directory, name);
}
function operation(type, path, details = {}) {
  return { type, path, ...details };
}
function buildSyncPlan({ localFiles, remoteFiles, previousEntries, conflictSuffix = "conflict copy" }) {
  const local = asMap(localFiles);
  const remote = asMap(remoteFiles);
  const previous = asMap(previousEntries);
  const allPaths = /* @__PURE__ */ new Set([...local.keys(), ...remote.keys(), ...previous.keys()]);
  const operations = [];
  for (const path of [...allPaths].sort()) {
    const localEntry = local.get(path) || null;
    const remoteEntry = remote.get(path) || null;
    const previousEntry = previous.get(path) || null;
    const localHash = hashOf(localEntry);
    const remoteHash = hashOf(remoteEntry);
    const previousHash = hashOf(previousEntry);
    if (!previousEntry) {
      if (localHash && !remoteHash) operations.push(operation("upload", path, { local: localEntry, remote: remoteEntry }));
      else if (!localHash && remoteHash) operations.push(operation("download", path, { remote: remoteEntry }));
      else if (localHash === remoteHash) operations.push(operation("keep", path));
      else {
        operations.push(operation("conflict", path, {
          local: localEntry,
          remote: remoteEntry,
          conflictPath: makeConflictPath(path, conflictSuffix),
          reason: "initial-divergence"
        }));
      }
      continue;
    }
    const localChanged = localHash !== previousHash;
    const remoteChanged = remoteHash !== previousHash;
    if (!localChanged && !remoteChanged) {
      operations.push(operation("keep", path));
      continue;
    }
    if (localChanged && !remoteChanged) {
      operations.push(localHash ? operation("upload", path, { local: localEntry, remote: remoteEntry }) : operation("deleteRemote", path, { previous: previousEntry, remote: remoteEntry }));
      continue;
    }
    if (!localChanged && remoteChanged) {
      operations.push(remoteHash ? operation("download", path, { remote: remoteEntry }) : operation("deleteLocal", path, { previous: previousEntry }));
      continue;
    }
    if (localHash === remoteHash) {
      operations.push(operation("keep", path));
      continue;
    }
    operations.push(operation("conflict", path, {
      local: localEntry,
      remote: remoteEntry,
      conflictPath: makeConflictPath(path, conflictSuffix),
      reason: localHash && remoteHash ? "both-modified" : "delete-vs-modify"
    }));
  }
  const summary = operations.reduce((result, item) => {
    if (item.type === "keep") result.unchanged += 1;
    else if (item.type === "upload") result.upload += 1;
    else if (item.type === "download") result.download += 1;
    else if (item.type === "deleteRemote" || item.type === "deleteLocal") result.delete += 1;
    else if (item.type === "conflict") result.conflict += 1;
    return result;
  }, { upload: 0, download: 0, delete: 0, conflict: 0, unchanged: 0 });
  return { operations, summary };
}
function buildDirectionalSyncPlan({ localFiles, remoteFiles, strategy }) {
  if (!["push", "pull"].includes(strategy)) throw new Error("同步方向无效。");
  const local = asMap(localFiles);
  const remote = asMap(remoteFiles);
  const allPaths = /* @__PURE__ */ new Set([...local.keys(), ...remote.keys()]);
  const operations = [];
  for (const path of [...allPaths].sort()) {
    const localEntry = local.get(path) || null;
    const remoteEntry = remote.get(path) || null;
    const localHash = hashOf(localEntry);
    const remoteHash = hashOf(remoteEntry);
    if (strategy === "push") {
      if (localHash && remoteHash === localHash) operations.push(operation("keep", path));
      else if (localHash) operations.push(operation("upload", path, {
        local: localEntry,
        remote: remoteEntry,
        preserveRemote: Boolean(remoteEntry)
      }));
      else if (remoteHash) operations.push(operation("deleteRemote", path, { remote: remoteEntry }));
      continue;
    }
    if (remoteHash && localHash === remoteHash) operations.push(operation("keep", path));
    else if (remoteHash) operations.push(operation("download", path, {
      local: localEntry,
      remote: remoteEntry,
      preserveLocal: Boolean(localEntry)
    }));
    else if (localHash) operations.push(operation("deleteLocal", path, { local: localEntry }));
  }
  const summary = operations.reduce((result, item) => {
    if (item.type === "keep") result.unchanged += 1;
    else if (item.type === "upload") result.upload += 1;
    else if (item.type === "download") result.download += 1;
    else if (item.type === "deleteRemote" || item.type === "deleteLocal") result.delete += 1;
    return result;
  }, { upload: 0, download: 0, delete: 0, conflict: 0, unchanged: 0 });
  return { operations, summary };
}
const STATE_VERSION = 1;
const statePathFor = (userDataPath, workspaceId) => node_path.join(userDataPath, "sync", "state", `${workspaceId}.json`);
async function readSyncState(userDataPath, workspaceId) {
  try {
    const raw = JSON.parse(await fs.readFile(statePathFor(userDataPath, workspaceId), "utf8"));
    if (raw?.version !== STATE_VERSION || raw.workspaceId !== workspaceId || !raw.files) throw new Error("invalid");
    return { version: STATE_VERSION, workspaceId, files: raw.files };
  } catch (error) {
    if (error?.code === "ENOENT" || error?.message === "invalid") {
      return { version: STATE_VERSION, workspaceId, files: {} };
    }
    throw error;
  }
}
async function writeSyncState(userDataPath, state) {
  const path = statePathFor(userDataPath, state.workspaceId);
  await fs.mkdir(node_path.dirname(path), { recursive: true, mode: 448 });
  const temp = `${path}.${process.pid}.${node_crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, JSON.stringify({ ...state, version: STATE_VERSION }, null, 2) + "\n", {
    encoding: "utf8",
    mode: 384
  });
  await fs.rename(temp, path);
}
const MANIFEST_VERSION = 1;
const now = () => (/* @__PURE__ */ new Date()).toISOString();
const manifestPath$1 = ".horsemd/manifest.json";
const trashPath = (stamp, path) => `.horsemd/trash/${stamp}/${path}`;
function normalizeManifest(input, workspaceId) {
  if (!input) return { version: MANIFEST_VERSION, workspaceId, files: {}, tombstones: {} };
  if (input.version !== MANIFEST_VERSION || input.workspaceId !== workspaceId) {
    throw new Error("远端同步目录不是当前 HorseMD 工作区。");
  }
  return {
    version: MANIFEST_VERSION,
    workspaceId,
    files: input.files && typeof input.files === "object" ? input.files : {},
    tombstones: input.tombstones && typeof input.tombstones === "object" ? input.tombstones : {}
  };
}
async function readRemoteManifest(provider, workspaceId) {
  const remote = await provider.get(manifestPath$1);
  if (!remote) return { manifest: normalizeManifest(null, workspaceId), revision: null, exists: false };
  let parsed;
  try {
    parsed = JSON.parse(remote.bytes.toString("utf8"));
  } catch {
    throw new Error("远端同步清单已损坏，已停止同步以保护文件。");
  }
  return { manifest: normalizeManifest(parsed, workspaceId), revision: remote.revision, exists: true };
}
function publicOperation(operation2) {
  const { local, remote, previous, ...safe } = operation2;
  return safe;
}
function summaryWithBytes(plan) {
  return plan.operations.reduce((summary, item) => {
    if (item.type === "upload") summary.uploadBytes += item.local?.size || 0;
    if (item.type === "download") summary.downloadBytes += item.remote?.size || 0;
    return summary;
  }, { ...plan.summary, uploadBytes: 0, downloadBytes: 0 });
}
function assertSafeRelative(rootPath, relativePath) {
  const target = node_path.resolve(rootPath, relativePath);
  const rel = node_path.relative(rootPath, target);
  if (!rel || rel.startsWith("..") || node_path.resolve(rootPath) === target) throw new Error("同步文件路径无效。");
  return target;
}
async function readLocalBytes(rootPath, relativePath) {
  return fs.readFile(assertSafeRelative(rootPath, relativePath));
}
function verifyRemoteBytes(path, expected, bytes) {
  if (expected?.sha256 && sha256(bytes) !== expected.sha256) {
    throw new Error(`远端文件“${path}”已在同步期间变化，请重新同步。`);
  }
}
function hasFiles(value) {
  return Object.keys(value || {}).length > 0;
}
function isRemoteReset(remote, state) {
  if (!hasFiles(state.files)) return false;
  if (!remote.exists) return true;
  return !hasFiles(remote.manifest.files) && !hasFiles(remote.manifest.tombstones);
}
async function writeLocalBytes(rootPath, relativePath, bytes) {
  const target = assertSafeRelative(rootPath, relativePath);
  await fs.mkdir(node_path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${node_crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, bytes);
  await fs.rename(temp, target);
}
async function moveLocalToTrash(rootPath, relativePath, stamp) {
  const source = assertSafeRelative(rootPath, relativePath);
  const target = node_path.join(rootPath, ".horsemd", "trash", stamp, relativePath);
  try {
    await fs.mkdir(node_path.dirname(target), { recursive: true });
    await fs.rename(source, target);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
async function archiveRemoteToTrash(provider, item, stamp) {
  const existing = await provider.get(item.path);
  if (!existing) return;
  verifyRemoteBytes(item.path, item.remote || item.previous, existing.bytes);
  await provider.put(trashPath(stamp, item.path), existing.bytes, { createOnly: true });
}
class SyncEngine {
  constructor({ userDataPath, provider, rootPath, workspaceId, deviceName = "this device", onProgress = null }) {
    this.userDataPath = userDataPath;
    this.provider = provider;
    this.rootPath = rootPath;
    this.workspaceId = workspaceId;
    this.deviceName = deviceName;
    this.onProgress = onProgress;
  }
  async preview(strategy = "merge") {
    if (!["merge", "push", "pull"].includes(strategy)) throw new Error("同步方向无效。");
    const [localFiles, state, remote] = await Promise.all([
      scanLocalWorkspace(this.rootPath),
      readSyncState(this.userDataPath, this.workspaceId),
      readRemoteManifest(this.provider, this.workspaceId)
    ]);
    if (strategy === "merge" && isRemoteReset(remote, state)) {
      return {
        status: "remote-reset",
        strategy,
        localFiles,
        state,
        remote,
        plan: null,
        summary: { upload: 0, download: 0, delete: 0, conflict: 0, unchanged: 0, uploadBytes: 0, downloadBytes: 0 },
        operations: []
      };
    }
    const plan = strategy === "merge" ? buildSyncPlan({
      localFiles,
      remoteFiles: remote.manifest.files,
      previousEntries: state.files,
      conflictSuffix: `来自 ${this.deviceName} 的冲突副本`
    }) : buildDirectionalSyncPlan({ localFiles, remoteFiles: remote.manifest.files, strategy });
    return {
      status: "ready",
      strategy,
      localFiles,
      state,
      remote,
      plan,
      summary: summaryWithBytes(plan),
      operations: plan.operations.map(publicOperation)
    };
  }
  async execute(preview = null, strategy = "merge") {
    const prepared = preview || await this.preview(strategy);
    if (prepared.status !== "ready") {
      throw new Error("云端工作区已被清空或替换。请明确选择上传本地或下载云端，HorseMD 不会自动删除本地文件。");
    }
    const { localFiles, state, remote, plan } = prepared;
    const manifest = structuredClone(remote.manifest);
    const stamp = now().replace(/[:.]/g, "-");
    const files = new Map(localFiles);
    const total = plan.operations.filter((item) => item.type !== "keep").length;
    let completed = 0;
    const progress = (item) => {
      completed += 1;
      this.onProgress?.({ completed, total, type: item.type, path: item.path });
    };
    for (const item of plan.operations) {
      if (item.type === "keep") continue;
      if (item.type === "upload") {
        if (item.preserveRemote) await archiveRemoteToTrash(this.provider, item, stamp);
        const bytes = await readLocalBytes(this.rootPath, item.path);
        let uploaded;
        try {
          uploaded = await this.provider.put(item.path, bytes, {
            revision: item.remote?.revision || null,
            createOnly: !item.remote
          });
        } catch (error) {
          if (prepared.strategy !== "push" || item.remote) throw error;
          const untracked = await this.provider.get(item.path);
          if (!untracked) throw error;
          await this.provider.put(trashPath(stamp, item.path), untracked.bytes, { createOnly: true });
          uploaded = await this.provider.put(item.path, bytes, { revision: untracked.revision });
        }
        manifest.files[item.path] = { ...item.local, revision: uploaded.revision, updatedAt: now() };
        delete manifest.tombstones[item.path];
      } else if (item.type === "download") {
        if (item.preserveLocal) await moveLocalToTrash(this.rootPath, item.path, stamp);
        const remoteFile = await this.provider.get(item.path);
        if (!remoteFile) throw new Error(`远端文件“${item.path}”在同步中消失，请重新同步。`);
        verifyRemoteBytes(item.path, item.remote, remoteFile.bytes);
        await writeLocalBytes(this.rootPath, item.path, remoteFile.bytes);
        files.set(item.path, { ...item.remote, sha256: sha256(remoteFile.bytes) });
      } else if (item.type === "deleteRemote") {
        const existing = await this.provider.get(item.path);
        if (existing) {
          verifyRemoteBytes(item.path, item.remote || item.previous, existing.bytes);
          await this.provider.put(trashPath(stamp, item.path), existing.bytes, { createOnly: true });
          await this.provider.delete(item.path, { revision: existing.revision });
        }
        delete manifest.files[item.path];
        manifest.tombstones[item.path] = { deletedAt: now() };
        files.delete(item.path);
      } else if (item.type === "deleteLocal") {
        await moveLocalToTrash(this.rootPath, item.path, stamp);
        files.delete(item.path);
      } else if (item.type === "conflict") {
        if (item.local && item.remote) {
          const localBytes = await readLocalBytes(this.rootPath, item.path);
          const remoteBytes = await this.provider.get(item.path);
          if (!remoteBytes) throw new Error(`远端冲突文件“${item.path}”在同步中消失。`);
          verifyRemoteBytes(item.path, item.remote, remoteBytes.bytes);
          const localConflict = makeConflictPath(item.path, `来自 ${this.deviceName} 的冲突副本`);
          await writeLocalBytes(this.rootPath, localConflict, localBytes);
          const uploadedConflict = await this.provider.put(localConflict, localBytes, { createOnly: true });
          await writeLocalBytes(this.rootPath, item.path, remoteBytes.bytes);
          files.set(item.path, { ...item.remote, sha256: sha256(remoteBytes.bytes) });
          files.set(localConflict, { sha256: sha256(localBytes), size: localBytes.byteLength, mtimeMs: Date.now() });
          manifest.files[localConflict] = {
            sha256: sha256(localBytes),
            size: localBytes.byteLength,
            revision: uploadedConflict.revision,
            updatedAt: now()
          };
        } else if (item.remote) {
          const remoteBytes = await this.provider.get(item.path);
          if (!remoteBytes) throw new Error(`远端冲突文件“${item.path}”在同步中消失。`);
          verifyRemoteBytes(item.path, item.remote, remoteBytes.bytes);
          await writeLocalBytes(this.rootPath, item.path, remoteBytes.bytes);
          files.set(item.path, { ...item.remote, sha256: sha256(remoteBytes.bytes) });
        } else if (item.local) {
          const localBytes = await readLocalBytes(this.rootPath, item.path);
          const localConflict = makeConflictPath(item.path, `来自 ${this.deviceName} 的冲突副本`);
          await writeLocalBytes(this.rootPath, localConflict, localBytes);
          const uploadedConflict = await this.provider.put(localConflict, localBytes, { createOnly: true });
          await moveLocalToTrash(this.rootPath, item.path, stamp);
          files.delete(item.path);
          files.set(localConflict, { sha256: sha256(localBytes), size: localBytes.byteLength, mtimeMs: Date.now() });
          manifest.files[localConflict] = {
            sha256: sha256(localBytes),
            size: localBytes.byteLength,
            revision: uploadedConflict.revision,
            updatedAt: now()
          };
        }
      }
      progress(item);
    }
    const nextState = {
      version: 1,
      workspaceId: this.workspaceId,
      files: Object.fromEntries([...files].map(([path, entry]) => [path, { sha256: entry.sha256 }]))
    };
    await this.provider.put(manifestPath$1, Buffer.from(JSON.stringify(manifest, null, 2) + "\n"), {
      revision: remote.revision,
      createOnly: !remote.exists,
      contentType: "application/json"
    });
    await writeSyncState(this.userDataPath, nextState);
    return { summary: summaryWithBytes(plan), conflicts: plan.summary.conflict };
  }
}
const compactRemotePrefix = (workspaceId) => `HorseMD/${workspaceId}`;
const legacyRemotePrefix = (workspaceId) => `HorseMD/v1/workspaces/${workspaceId}`;
const manifestPath = ".horsemd/manifest.json";
class SyncService {
  constructor({ getUserDataPath, safeStorage, request }) {
    this.getUserDataPath = getUserDataPath;
    this.request = request;
    this.credentials = new CredentialStore({ userDataPath: getUserDataPath(), safeStorage });
    this.connections = new ConnectionRegistry({
      userDataPath: getUserDataPath(),
      credentialStore: this.credentials,
      createWebDavProvider: (config) => new WebDavProvider({ ...config, request }),
      createS3Provider: (config) => new S3Provider({ ...config, request })
    });
    this.running = /* @__PURE__ */ new Set();
  }
  async addWebDavConnection(config) {
    return this.connections.addWebDav(config);
  }
  async addS3Connection(config) {
    return this.connections.addS3(config);
  }
  async listConnections() {
    return this.connections.list();
  }
  async updateConnection(connectionId, config) {
    return this.connections.update(connectionId, config);
  }
  async removeConnection(connectionId) {
    const bound = (await readWorkspaceRegistry(this.getUserDataPath())).find((workspace) => workspace.connectionId === connectionId);
    if (bound) throw new Error(`“${bound.rootPath}”仍在使用这个连接。请先停止管理该同步文件夹。`);
    return this.connections.remove(connectionId);
  }
  async testConnection(connectionId) {
    return this.connections.test(connectionId);
  }
  async bindWorkspace(rootPath, connectionId) {
    await this.connections.createProvider(connectionId);
    return bindSyncWorkspace(this.getUserDataPath(), rootPath, connectionId);
  }
  async listRemoteWorkspaces(connectionId) {
    const provider = await this.connections.createProvider(connectionId);
    const workspaces = /* @__PURE__ */ new Map();
    for (const root of ["HorseMD", "HorseMD/v1/workspaces"]) {
      const rows = await provider.list(root);
      const ids = rows.filter((row) => row.isDirectory).map((row) => row.href.split("/").filter(Boolean).pop()).filter(Boolean);
      for (const workspaceId of ids) {
        if (workspaces.has(workspaceId)) continue;
        const manifest = await provider.get(`${root}/${workspaceId}/${manifestPath}`);
        if (!manifest) continue;
        try {
          const parsed = JSON.parse(manifest.bytes.toString("utf8"));
          if (parsed.workspaceId === workspaceId) workspaces.set(workspaceId, { workspaceId, fileCount: Object.keys(parsed.files || {}).length });
        } catch {
        }
      }
    }
    return [...workspaces.values()];
  }
  async joinWorkspace(rootPath, connectionId, workspaceId) {
    await this.connections.createProvider(connectionId);
    const candidates = await this.listRemoteWorkspaces(connectionId);
    if (!candidates.some((item) => item.workspaceId === workspaceId)) throw new Error("远端工作区不存在。");
    const entry = await joinSyncWorkspace(this.getUserDataPath(), rootPath, workspaceId);
    return bindSyncWorkspace(this.getUserDataPath(), entry.rootPath, connectionId);
  }
  async engineFor(rootPath) {
    const entry = (await readWorkspaceRegistry(this.getUserDataPath())).find((workspace) => workspace.rootPath.toLowerCase() === rootPath.replace(/[\\/]+$/, "").toLowerCase());
    if (!entry?.connectionId) throw new Error("请先为这个文件夹选择云端连接。");
    const prefixes = [compactRemotePrefix(entry.workspaceId), legacyRemotePrefix(entry.workspaceId)];
    let provider = null;
    let compactProvider = null;
    for (const prefix of prefixes) {
      const candidate = await this.connections.createProvider(entry.connectionId, { prefix });
      if (prefix === prefixes[0]) compactProvider = candidate;
      if (await candidate.get(manifestPath)) {
        provider = candidate;
        break;
      }
    }
    provider ||= compactProvider;
    return new SyncEngine({
      userDataPath: this.getUserDataPath(),
      rootPath: entry.rootPath,
      workspaceId: entry.workspaceId,
      provider,
      deviceName: "HorseMD"
    });
  }
  async preview(rootPath, strategy = "merge") {
    return (await this.engineFor(rootPath)).preview(strategy);
  }
  async run(rootPath, strategy = "merge") {
    const key = rootPath.toLowerCase();
    if (this.running.has(key)) throw new Error("这个文件夹正在同步。");
    this.running.add(key);
    try {
      return await (await this.engineFor(rootPath)).execute(null, strategy);
    } finally {
      this.running.delete(key);
    }
  }
}
function registerSyncServiceIpc(ipcMain, { syncService, isTrustedSender }) {
  const trusted = (event) => {
    if (isTrustedSender(event)) return;
    throw new Error("Untrusted renderer.");
  };
  ipcMain.handle("sync:connectionList", async (event) => {
    trusted(event);
    return syncService.listConnections();
  });
  ipcMain.handle("sync:connectionAddWebDav", async (event, config) => {
    trusted(event);
    return syncService.addWebDavConnection(config || {});
  });
  ipcMain.handle("sync:connectionAddS3", async (event, config) => {
    trusted(event);
    return syncService.addS3Connection(config || {});
  });
  ipcMain.handle("sync:connectionUpdate", async (event, connectionId, config) => {
    trusted(event);
    return syncService.updateConnection(connectionId, config || {});
  });
  ipcMain.handle("sync:connectionRemove", async (event, connectionId) => {
    trusted(event);
    return syncService.removeConnection(connectionId);
  });
  ipcMain.handle("sync:connectionTest", async (event, connectionId) => {
    trusted(event);
    return syncService.testConnection(connectionId);
  });
  ipcMain.handle("sync:workspaceBindConnection", async (event, rootPath, connectionId) => {
    trusted(event);
    return syncService.bindWorkspace(rootPath, connectionId);
  });
  ipcMain.handle("sync:preview", async (event, rootPath, strategy) => {
    trusted(event);
    return syncService.preview(rootPath, strategy);
  });
  ipcMain.handle("sync:run", async (event, rootPath, strategy) => {
    trusted(event);
    return syncService.run(rootPath, strategy);
  });
  ipcMain.handle("sync:remoteWorkspaceList", async (event, connectionId) => {
    trusted(event);
    return syncService.listRemoteWorkspaces(connectionId);
  });
  ipcMain.handle("sync:workspaceJoin", async (event, rootPath, connectionId, workspaceId) => {
    trusted(event);
    return syncService.joinWorkspace(rootPath, connectionId, workspaceId);
  });
}
const SEARCH_LIMITS = {
  maxTerms: 8,
  // ignore terms beyond this (pathological queries)
  maxFiles: 200,
  // files returned
  maxMatchesPerFile: 30,
  // result lines listed per file
  totalMatchCap: 1e3,
  // hard cap across every file
  maxLineSnippet: 300,
  // display snippet length before windowing
  maxFileSize: 2 * 1024 * 1024
  // skip files larger than 2 MB
};
function parseSearchQuery(query) {
  if (typeof query !== "string") return [];
  const seen = /* @__PURE__ */ new Set();
  const terms = [];
  for (const raw of query.split(/\s+/)) {
    if (!raw) continue;
    const lower = raw.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    terms.push(lower);
    if (terms.length >= SEARCH_LIMITS.maxTerms) break;
  }
  return terms;
}
function occurrenceStarts(contentLower, term) {
  const starts = [];
  let idx = contentLower.indexOf(term);
  while (idx !== -1) {
    starts.push(idx);
    idx = contentLower.indexOf(term, idx + term.length);
  }
  return starts;
}
function physicalLines(content) {
  const lines = [];
  let start = 0;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    if (ch === "\n" || ch === "\r") {
      lines.push({ start, end: i, number: lines.length + 1 });
      if (ch === "\r" && content[i + 1] === "\n") i += 1;
      start = i + 1;
    }
  }
  lines.push({ start, end: content.length, number: lines.length + 1 });
  return lines;
}
function buildSnippet(lineText, ranges) {
  const indent = lineText.length - lineText.trimStart().length;
  let text2 = lineText.slice(indent);
  let shift = indent;
  const clipped = ranges.map((range) => ({
    start: Math.max(0, range.start - shift),
    end: Math.max(0, range.end - shift)
  }));
  if (text2.length > SEARCH_LIMITS.maxLineSnippet) {
    const first = clipped[0]?.start ?? 0;
    const windowStart = Math.min(
      Math.max(first - 40, 0),
      Math.max(text2.length - SEARCH_LIMITS.maxLineSnippet, 0)
    );
    const windowEnd = Math.min(windowStart + SEARCH_LIMITS.maxLineSnippet, text2.length);
    const leading = windowStart > 0 ? "…" : "";
    const trailing = windowEnd < text2.length ? "…" : "";
    text2 = leading + text2.slice(windowStart, windowEnd) + trailing;
    const offset = leading.length - windowStart;
    for (const range of clipped) {
      range.start = Math.max(leading.length, Math.min(range.start + offset, text2.length - trailing.length));
      range.end = Math.max(range.start, Math.min(range.end + offset, text2.length - trailing.length));
    }
  }
  return { text: text2, ranges: clipped.filter((range) => range.end > range.start) };
}
function searchContent(content, terms, limits = SEARCH_LIMITS) {
  if (!content || !terms.length) return { matched: false, matches: [], matchTotal: 0 };
  if (content.length > limits.maxFileSize) return { matched: false, matches: [], matchTotal: 0 };
  const contentLower = content.toLowerCase();
  const termStarts = terms.map((term) => occurrenceStarts(contentLower, term));
  if (termStarts.some((starts) => starts.length === 0)) {
    return { matched: false, matches: [], matchTotal: 0 };
  }
  const lines = physicalLines(content);
  const matches = [];
  let matchTotal = 0;
  let truncated = false;
  for (const line of lines) {
    if (line.end < line.start) continue;
    const occurrences = [];
    for (let t = 0; t < terms.length; t += 1) {
      for (const abs of termStarts[t]) {
        if (abs >= line.start && abs < line.end) {
          occurrences.push({ term: terms[t], abs, termIndex: t, occIdx: -1 });
        }
      }
    }
    if (!occurrences.length) continue;
    matchTotal += occurrences.length;
    if (matchTotal > limits.totalMatchCap) {
      truncated = true;
      matchTotal = limits.totalMatchCap;
      break;
    }
    if (matches.length >= limits.maxMatchesPerFile) {
      truncated = true;
      continue;
    }
    occurrences.sort((a, b) => a.abs - b.abs);
    for (const occ of occurrences) {
      occ.occIdx = termStarts[occ.termIndex].indexOf(occ.abs);
    }
    const primary = occurrences[0];
    const { text: text2, ranges } = buildSnippet(
      content.slice(line.start, line.end),
      occurrences.map((occ) => ({ start: occ.abs - line.start, end: occ.abs - line.start + occ.term.length }))
    );
    matches.push({
      line: line.number,
      col: primary.abs - line.start + 1,
      term: primary.term,
      occIdx: primary.occIdx,
      fileOffset: primary.abs,
      text: text2,
      ranges
    });
  }
  return { matched: true, matches, matchTotal, truncated };
}
function searchFiles(entries, query, limits = SEARCH_LIMITS) {
  const terms = parseSearchQuery(query);
  if (!terms.length) return { terms, files: [], truncated: false, matchTotal: 0 };
  const files = [];
  let truncated = false;
  let matchTotal = 0;
  for (const entry of entries) {
    if (files.length >= limits.maxFiles) {
      truncated = true;
      break;
    }
    const result = searchContent(entry.content, terms, limits);
    if (!result.matched) continue;
    files.push({
      path: entry.path,
      name: entry.name,
      rel: entry.rel,
      matches: result.matches
    });
    matchTotal += result.matchTotal;
    if (result.truncated) truncated = true;
  }
  return { terms, files, truncated, matchTotal };
}
const FILE_LIST_TTL_MS = 15e3;
const CONTENT_CACHE_MAX_ENTRIES = 800;
const CONTENT_CACHE_MAX_BYTES = 64 * 1024 * 1024;
const READ_BATCH = 16;
const fileListCache = /* @__PURE__ */ new Map();
const contentCache = /* @__PURE__ */ new Map();
let contentCacheBytes = 0;
const sanitizeRoots = (roots) => Array.isArray(roots) ? [...new Set(roots.filter((root) => typeof root === "string" && !isRestrictedWatchRoot(root)))] : [];
async function listFilesForRoot(root, showHidden, markdownPattern) {
  const cached = fileListCache.get(root);
  if (cached && Date.now() - cached.at < FILE_LIST_TTL_MS) return cached.files;
  const files = await listMarkdownFiles(root, { showHidden, markdownPattern });
  fileListCache.set(root, { at: Date.now(), files });
  return files;
}
function cachePut(path, stat, content) {
  const previous = contentCache.get(path);
  if (previous) {
    contentCacheBytes -= previous.content.length;
    contentCache.delete(path);
  }
  contentCache.set(path, { mtimeMs: stat.mtimeMs, size: stat.size, content });
  contentCacheBytes += content.length;
  while ((contentCache.size > CONTENT_CACHE_MAX_ENTRIES || contentCacheBytes > CONTENT_CACHE_MAX_BYTES) && contentCache.size > 0) {
    const oldest = contentCache.keys().next().value;
    const entry = contentCache.get(oldest);
    contentCacheBytes -= entry ? entry.content.length : 0;
    contentCache.delete(oldest);
  }
}
async function readCached(file) {
  let stat;
  try {
    stat = await fs.stat(file.path);
  } catch {
    return "";
  }
  if (stat.size > SEARCH_LIMITS.maxFileSize) return "";
  const cached = contentCache.get(file.path);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    contentCache.delete(file.path);
    contentCache.set(file.path, cached);
    return cached.content;
  }
  let content;
  try {
    content = await fs.readFile(file.path, "utf8");
  } catch {
    return "";
  }
  cachePut(file.path, stat, content);
  return content;
}
async function searchWorkspace({ roots, query, showHidden }, { markdownPattern }) {
  const safeRoots = sanitizeRoots(roots);
  if (!safeRoots.length || typeof query !== "string" || !query.trim()) {
    return { ok: true, terms: [], files: [], truncated: false, matchTotal: 0, scanned: 0 };
  }
  const entries = [];
  const scanned = { count: 0 };
  for (const root of safeRoots) {
    const files2 = await listFilesForRoot(root, Boolean(showHidden), markdownPattern);
    scanned.count += files2.length;
    for (let index = 0; index < files2.length; index += READ_BATCH) {
      const batch = files2.slice(index, index + READ_BATCH);
      const contents = await Promise.all(batch.map((file) => readCached(file)));
      batch.forEach((file, i) => {
        if (contents[i]) entries.push({ ...file, content: contents[i] });
      });
    }
  }
  const { terms, files, truncated, matchTotal } = searchFiles(entries, query);
  return { ok: true, terms, files, truncated, matchTotal, scanned: scanned.count };
}
function registerGlobalSearchIpc(ipcMain, { markdownPattern }) {
  ipcMain.handle(
    "search:workspace",
    (_event, request) => searchWorkspace(request || {}, { markdownPattern })
  );
}
const MENU_COMMAND_IDS = /* @__PURE__ */ new Set([
  "file.new",
  "file.open",
  "workspace.openFolder",
  "file.save",
  "file.saveAs",
  "file.attach",
  "file.exportPdf",
  "file.exportExcalidrawPng",
  "file.exportExcalidrawSvg",
  "file.exportHtml",
  "file.exportPandocDocx",
  "file.exportPandocEpub",
  "file.exportPandocLatex",
  "file.exportPandocOdt",
  "file.exportPandocRtf",
  "file.exportPandocTxt",
  "tab.close",
  "view.commandPalette",
  "view.showOutline",
  "view.globalSearch",
  "view.toggleSource",
  "view.cycleTheme",
  "editor.find"
]);
const MENU_COMMAND_ALIASES = {
  new: "file.new",
  open: "file.open",
  openFolder: "workspace.openFolder",
  save: "file.save",
  saveAs: "file.saveAs",
  attachFile: "file.attach",
  exportPdf: "file.exportPdf",
  exportExcalidrawPng: "file.exportExcalidrawPng",
  exportExcalidrawSvg: "file.exportExcalidrawSvg",
  exportHtml: "file.exportHtml",
  exportPandocDocx: "file.exportPandocDocx",
  exportPandocEpub: "file.exportPandocEpub",
  exportPandocLatex: "file.exportPandocLatex",
  exportPandocOdt: "file.exportPandocOdt",
  exportPandocRtf: "file.exportPandocRtf",
  exportPandocTxt: "file.exportPandocTxt",
  closeTab: "tab.close",
  palette: "view.commandPalette",
  toggleOutline: "view.showOutline",
  globalSearch: "view.globalSearch",
  toggleSource: "view.toggleSource",
  toggleTheme: "view.cycleTheme",
  find: "editor.find"
};
const DEFAULT_MENU_ACCELERATORS = {
  "file.new": "CmdOrCtrl+N",
  "file.open": "CmdOrCtrl+O",
  "workspace.openFolder": "CmdOrCtrl+Shift+O",
  "file.save": "CmdOrCtrl+S",
  "file.saveAs": "CmdOrCtrl+Shift+S",
  "file.exportPdf": "CmdOrCtrl+Shift+E",
  "tab.close": "CmdOrCtrl+W",
  "view.commandPalette": "CmdOrCtrl+P",
  "view.showOutline": "CmdOrCtrl+Shift+L",
  "view.globalSearch": "CmdOrCtrl+Shift+F",
  "view.toggleSource": "CmdOrCtrl+/",
  "view.cycleTheme": "CmdOrCtrl+Shift+T",
  "editor.find": "CmdOrCtrl+F"
};
function isValidAccelerator(value) {
  return value === null || typeof value === "string" && value.length <= 80 && /^[A-Za-z0-9+\-/\\[\]=,.;'` ]+$/.test(value);
}
function normalizeMenuKeybindingPayload(accelerators) {
  if (!accelerators || typeof accelerators !== "object" || Array.isArray(accelerators)) {
    return { ok: false, error: "invalid-payload" };
  }
  const next = {};
  const ignoredCommandIds = [];
  for (const [commandId, accelerator] of Object.entries(accelerators)) {
    const resolvedId = MENU_COMMAND_IDS.has(commandId) ? commandId : MENU_COMMAND_ALIASES[commandId];
    if (!resolvedId || !MENU_COMMAND_IDS.has(resolvedId)) {
      ignoredCommandIds.push(commandId);
      continue;
    }
    if (!isValidAccelerator(accelerator)) return { ok: false, error: "invalid-accelerator" };
    next[resolvedId] = accelerator;
  }
  return { ok: true, keybindings: next, ignoredCommandIds };
}
function menuAcceleratorFor(keybindings, commandId, fallback) {
  return Object.prototype.hasOwnProperty.call(keybindings || {}, commandId) ? keybindings[commandId] || void 0 : fallback;
}
function defaultMenuAcceleratorFor(commandId) {
  return DEFAULT_MENU_ACCELERATORS[commandId];
}
const __dirname$1 = node_path.dirname(node_url.fileURLToPath(require("url").pathToFileURL(__filename).href));
const MD_EXTS = ["md", "markdown", "mdx", "txt"];
const MD_RE = new RegExp(`\\.(${MD_EXTS.join("|")})$`, "i");
electron.protocol.registerSchemesAsPrivileged([
  { scheme: "drawio-local", privileges: { standard: true, secure: true, supportFetchAPI: true } },
  // Serves local HTML documents (and their web assets) to the renderer's
  // sandboxed HTML preview iframe. A sandboxed file: iframe loads nothing
  // (opaque origin cannot be granted file access), so the preview navigates
  // to local-html://doc/<abs-path> instead: standard+secure so the frame gets
  // a real document, while the iframe's sandbox keeps the origin opaque.
  // Serves document-relative images as local-media://<abs-path> when the
  // renderer page is NOT on a file:// origin (dev server, future embedded
  // hosts). Chromium blocks file:// subresources from http(s) origins, so
  // dev-mode pasted images rendered broken (#image-dev-display). Image
  // extensions only, and the renderer only emits this scheme on desktop.
  { scheme: "local-media", privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: "local-html", privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);
const DEFAULT_TOGGLE_WINDOW_SHORTCUT = "Alt+M";
const GLOBAL_COMMANDS = {
  "window.toggleVisibility": () => toggleMainWindow()
};
const backgroundTestMode = process.argv.includes("--horsemd-test-background");
const inputTraceEnabled = process.argv.includes("--horsemd-input-trace");
let mainWindow = null;
let allowClose = false;
let isQuitting = false;
let localFontGrant = null;
let rendererReady = false;
let tray = null;
let closeToTray = false;
let globalShortcuts = /* @__PURE__ */ new Map();
const inputTracePath = () => node_path.join(electron.app.getPath("temp"), `horsemd-input-trace-${process.pid}.jsonl`);
let inputTraceQueue = Promise.resolve();
electron.ipcMain.on("debug:inputTraceEnabled", (event) => {
  event.returnValue = inputTraceEnabled;
});
electron.ipcMain.handle("debug:inputTraceInfo", () => ({
  enabled: inputTraceEnabled,
  path: inputTraceEnabled ? inputTracePath() : null
}));
electron.ipcMain.handle("debug:inputTrace", (event, entry) => {
  if (!inputTraceEnabled || !mainWindow || event.sender.id !== mainWindow.webContents.id) return false;
  let line;
  try {
    const payload = entry && typeof entry === "object" ? entry : { value: String(entry ?? "") };
    line = JSON.stringify({ pid: process.pid, ...payload }) + "\n";
  } catch {
    return false;
  }
  if (line.length > 2 * 1024 * 1024) return false;
  inputTraceQueue = inputTraceQueue.catch(() => {
  }).then(() => fs.appendFile(inputTracePath(), line, "utf8"));
  return inputTraceQueue.then(() => true).catch(() => false);
});
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection (ignored):", reason?.message || reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception (ignored):", err?.message || err);
});
const gotLock = electron.app.requestSingleInstanceLock();
if (!gotLock) {
  electron.app.quit();
} else {
  electron.app.on("second-instance", (_e, argv) => {
    const { files, folders } = extractArgs(argv);
    focusMainWindow();
    if (!rendererReady) {
      enqueueLaunch(files, folders);
      return;
    }
    if (folders.length) sendToRenderer("open-folder", folders[0]);
    if (files.length) sendToRenderer("open-paths", files);
  });
}
let pendingLaunch = { files: [], folders: [] };
electron.ipcMain.on("app-ready", () => {
  rendererReady = true;
  const { files, folders } = pendingLaunch;
  pendingLaunch = { files: [], folders: [] };
  if (folders.length) sendToRenderer("open-folder", folders[0]);
  if (files.length) sendToRenderer("open-paths", files);
});
function enqueueLaunch(files = [], folders = []) {
  for (const file of files) {
    if (!pendingLaunch.files.includes(file)) pendingLaunch.files.push(file);
  }
  for (const folder of folders) {
    if (!pendingLaunch.folders.includes(folder)) pendingLaunch.folders.push(folder);
  }
}
function extractArgs(argv) {
  const files = [];
  const folders = [];
  let appDir = null;
  try {
    appDir = node_path.resolve(electron.app.getAppPath());
  } catch {
  }
  for (const a of argv.slice(1)) {
    if (a.startsWith("-")) continue;
    const abs = node_path.resolve(a);
    if (appDir && abs === appDir) continue;
    if (!node_fs.existsSync(abs)) continue;
    let st;
    try {
      st = node_fs.statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) folders.push(abs);
    else files.push(abs);
  }
  return { files, folders };
}
function trayIconPath() {
  const packaged = node_path.join(process.resourcesPath, "icons", "32x32.png");
  if (node_fs.existsSync(packaged)) return packaged;
  return node_path.join(electron.app.getAppPath(), "build", "icons", "32x32.png");
}
function trayLabels() {
  const zh = String(electron.app.getLocale?.() || "").toLowerCase().startsWith("zh");
  return zh ? { toggle: "显示 / 隐藏 HorseMD", quit: "退出 HorseMD" } : { toggle: "Show / Hide HorseMD", quit: "Quit HorseMD" };
}
function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (electron.app.isReady()) createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}
function hideMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
}
function toggleMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (electron.app.isReady()) createWindow();
    return;
  }
  if (!mainWindow.isMinimized() && mainWindow.isVisible() && mainWindow.isFocused()) {
    hideMainWindow();
  } else {
    showMainWindow();
  }
}
function quitApp() {
  isQuitting = true;
  if (!mainWindow || mainWindow.isDestroyed()) {
    electron.app.quit();
    return;
  }
  showMainWindow();
  mainWindow.close();
}
function rebuildTrayMenu() {
  if (!tray) return;
  const labels = trayLabels();
  const accelerator = globalShortcuts.get("window.toggleVisibility") || "";
  tray.setContextMenu(electron.Menu.buildFromTemplate([
    { label: labels.toggle, accelerator: accelerator || void 0, click: () => toggleMainWindow() },
    { type: "separator" },
    { label: labels.quit, click: () => quitApp() }
  ]));
}
function createTray() {
  if (tray) return;
  let image = null;
  try {
    const iconPath = trayIconPath();
    if (node_fs.existsSync(iconPath)) image = electron.nativeImage.createFromPath(iconPath);
  } catch {
  }
  if (!image || image.isEmpty()) return;
  try {
    tray = new electron.Tray(image);
  } catch {
    tray = null;
    return;
  }
  tray.setToolTip("HorseMD");
  rebuildTrayMenu();
  if (process.platform !== "darwin") tray.on("click", () => toggleMainWindow());
}
function destroyTray() {
  if (!tray) return;
  try {
    tray.destroy();
  } catch {
  }
  tray = null;
}
function applyGlobalShortcuts(payload) {
  for (const accelerator of globalShortcuts.values()) {
    try {
      electron.globalShortcut.unregister(accelerator);
    } catch {
    }
  }
  globalShortcuts = /* @__PURE__ */ new Map();
  const unregistered = [];
  for (const [commandId, accelerator] of Object.entries(payload || {})) {
    const action = GLOBAL_COMMANDS[commandId];
    if (!action) continue;
    if (typeof accelerator !== "string" || !accelerator.trim() || accelerator.length > 80) continue;
    let registered = false;
    try {
      registered = electron.globalShortcut.register(accelerator, action);
    } catch {
      registered = false;
    }
    if (registered) globalShortcuts.set(commandId, accelerator);
    else unregistered.push(commandId);
  }
  rebuildTrayMenu();
  return {
    ok: true,
    accelerators: Object.fromEntries(globalShortcuts),
    unregistered
  };
}
function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (electron.app.isReady()) createWindow();
    return false;
  }
  if (backgroundTestMode) return true;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  return true;
}
function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed() && rendererReady) {
    mainWindow.webContents.send(channel, payload);
  }
}
async function openExternalUrl(url) {
  const allowedUrl = getAllowedExternalUrl(url);
  if (!allowedUrl) return { ok: false, error: "Unsupported external URL." };
  await electron.shell.openExternal(allowedUrl);
  return { ok: true };
}
function createWindow() {
  rendererReady = false;
  mainWindow = new electron.BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    show: false,
    backgroundColor: "#1a1b20",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    // macOS: place the traffic lights at a fixed spot so the renderer can
    // reserve a matching gap (see `.app.is-mac` rules in app.css). y centers the
    // ~12px buttons within the 40px top bar.
    trafficLightPosition: process.platform === "darwin" ? { x: 14, y: 14 } : void 0,
    // Windows/Linux: no native caption-button overlay — the renderer draws its
    // own minimize / maximize / close controls (so they can have custom hover
    // states). macOS keeps its native traffic lights via hiddenInset above.
    titleBarOverlay: false,
    webPreferences: {
      preload: node_path.join(__dirname$1, "../preload/index.mjs"),
      // Security: keep the renderer isolated from Node. These are Electron's
      // defaults, but we set them explicitly so the posture is obvious and
      // robust against future default changes. sandbox stays off because the
      // preload is an ES module (the sandbox requires a CommonJS preload).
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Required for Chromium's built-in PDF viewer in media viewer tabs
      // (read-only display; no additional plugin APIs are exposed).
      plugins: true,
      spellcheck: true,
      backgroundThrottling: !backgroundTestMode
    }
  });
  mainWindow.once("ready-to-show", () => {
    if (!backgroundTestMode) focusMainWindow();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalUrl(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL;
    if (devUrl && url.startsWith(devUrl)) return;
    event.preventDefault();
    void openExternalUrl(url);
  });
  const emitMaxState = () => sendToRenderer("window:maximized", mainWindow?.isMaximized() ?? false);
  mainWindow.on("maximize", emitMaxState);
  mainWindow.on("unmaximize", emitMaxState);
  allowClose = false;
  mainWindow.on("close", (e) => {
    if (allowClose) return;
    e.preventDefault();
    sendToRenderer("app-close-request", { closeToTray: closeToTray && !isQuitting });
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(node_path.join(__dirname$1, "../renderer/index.html"));
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
    rendererReady = false;
  });
}
electron.app.on("open-file", (event, path) => {
  event.preventDefault();
  if (rendererReady && focusMainWindow()) {
    sendToRenderer("open-paths", [path]);
  } else {
    enqueueLaunch([path]);
    focusMainWindow();
  }
});
function registerDrawioProtocol() {
  const candidates = electron.app.isPackaged ? [node_path.join(process.resourcesPath, "drawio")] : [node_path.join(electron.app.getAppPath(), "resources", "drawio"), node_path.resolve(__dirname$1, "../../resources/drawio")];
  const drawioRoot = candidates.find((p) => node_fs.existsSync(node_path.join(p, "index.html"))) || candidates[0];
  const trace = process.argv.includes("--horsemd-drawio-trace");
  const tlog = (...a) => {
    if (trace) console.log("[drawio-trace]", ...a);
  };
  tlog("root candidates:", candidates.join(" | "));
  tlog("root selected:", drawioRoot, "exists:", node_fs.existsSync(drawioRoot));
  electron.protocol.handle("drawio-local", (request) => {
    const url = new URL(request.url);
    const relPath = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const filePath2 = node_path.normalize(node_path.join(drawioRoot, relPath));
    if (!filePath2.startsWith(node_path.normalize(drawioRoot + node_path.sep))) {
      tlog("403 path escape:", request.url);
      return new Response("Forbidden", { status: 403 });
    }
    tlog("GET", relPath);
    const resp = electron.net.fetch(node_url.pathToFileURL(filePath2).toString());
    if (trace) {
      resp.then(
        (r) => tlog("->", r.status, relPath),
        (e) => tlog("-> ERROR", relPath, e?.message || String(e))
      );
    }
    return resp;
  });
}
const MEDIA_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico|pdf|html?)$/i;
const HTML_ASSET_EXT_RE = /\.(html?|css|js|mjs|json|txt|csv|png|jpe?g|gif|webp|svg|bmp|avif|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|wav|ogg|pdf)$/i;
function registerLocalHtmlProtocol() {
  electron.protocol.handle("local-html", async (request) => {
    let url;
    try {
      url = new URL(request.url);
    } catch {
      return new Response("Bad Request", { status: 400 });
    }
    if (url.host !== "doc") return new Response("Forbidden", { status: 403 });
    let filePath2;
    try {
      filePath2 = decodeURIComponent(url.pathname);
    } catch {
      return new Response("Bad Request", { status: 400 });
    }
    filePath2 = node_path.normalize(filePath2.replace(/^\/(?=[a-zA-Z]:\/)/, ""));
    if (!HTML_ASSET_EXT_RE.test(filePath2)) {
      return new Response("Forbidden", { status: 403 });
    }
    try {
      return await electron.net.fetch(node_url.pathToFileURL(filePath2).toString());
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  });
}
function registerLocalMediaProtocol() {
  electron.protocol.handle("local-media", async (request) => {
    let url;
    try {
      url = new URL(request.url);
    } catch {
      return new Response("Bad Request", { status: 400 });
    }
    if (url.host !== "media") return new Response("Forbidden", { status: 403 });
    let filePath2;
    try {
      filePath2 = decodeURIComponent(url.pathname);
    } catch {
      return new Response("Bad Request", { status: 400 });
    }
    filePath2 = node_path.normalize(filePath2.replace(/^\/(?=[a-zA-Z]:\/)/, ""));
    if (!MEDIA_EXT_RE.test(filePath2)) {
      return new Response("Forbidden", { status: 403 });
    }
    const res = await electron.net.fetch(node_url.pathToFileURL(filePath2).toString());
    if (/\.pdf$/i.test(filePath2)) {
      const body = await res.arrayBuffer();
      return new Response(body, { headers: { "content-type": "application/pdf" } });
    }
    return res;
  });
}
electron.app.whenReady().then(() => {
  const launched = extractArgs(process.argv);
  enqueueLaunch(launched.files, launched.folders);
  ensureThemesDir();
  buildMenu();
  const allowLocalFonts = (webContents, permission, requestingUrl, isMainFrame) => canGrantLocalFonts({
    permission,
    webContentsId: webContents?.id,
    trustedWebContentsId: mainWindow?.webContents.id,
    requestingUrl,
    currentUrl: webContents?.getURL() || "",
    devRendererUrl: process.env.ELECTRON_RENDERER_URL,
    isMainFrame,
    grant: localFontGrant
  });
  electron.session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(allowLocalFonts(webContents, permission, details?.requestingUrl || "", details?.isMainFrame));
  });
  electron.session.defaultSession.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin, details) => allowLocalFonts(webContents, permission, details?.requestingUrl || requestingOrigin, details?.isMainFrame)
  );
  registerDrawioProtocol();
  registerLocalMediaProtocol();
  registerLocalHtmlProtocol();
  createWindow();
  electron.ipcMain.handle("drawio:getEditorUrl", (event, lang) => {
    const safeLang = lang === "zh" ? "zh" : "en";
    const params = new URLSearchParams({
      embed: "1",
      proto: "json",
      // ui=kennedy matches the default app.diagrams.net experience (full
      // menu bar, toolbar, shape libraries, format panel) inside the iframe.
      ui: "kennedy",
      noExitBtn: "1",
      spin: "1",
      lang: safeLang
    });
    return `drawio-local://editor/index.html?${params.toString()}`;
  });
  applyGlobalShortcuts({ "window.toggleVisibility": DEFAULT_TOGGLE_WINDOW_SHORTCUT });
  if (inputTraceEnabled) {
    console.log(`HorseMD input trace: ${inputTracePath()}`);
  }
  electron.app.on("activate", () => {
    showMainWindow();
  });
});
electron.ipcMain.handle("permissions:allowLocalFonts", (event) => {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) return false;
  localFontGrant = createLocalFontGrant(event.sender.id);
  return true;
});
electron.app.on("before-quit", () => {
  isQuitting = true;
});
electron.app.on("will-quit", () => {
  electron.globalShortcut.unregisterAll();
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !closeToTray) electron.app.quit();
});
registerDocumentIpc(electron.ipcMain, {
  getMainWindow: () => mainWindow,
  getUserDataPath: () => electron.app.getPath("userData"),
  markdownExtensions: MD_EXTS,
  isTrustedSender: (event) => !!mainWindow && event.sender.id === mainWindow.webContents.id
});
registerFileSystemIpc(electron.ipcMain, { shell: electron.shell, markdownPattern: null });
registerGlobalSearchIpc(electron.ipcMain, { markdownPattern: MD_RE });
registerSyncWorkspaceIpc(electron.ipcMain, {
  getUserDataPath: () => electron.app.getPath("userData"),
  isTrustedSender: (event) => !!mainWindow && event.sender.id === mainWindow.webContents.id
});
registerSyncServiceIpc(electron.ipcMain, {
  syncService: new SyncService({
    getUserDataPath: () => electron.app.getPath("userData"),
    safeStorage: electron.safeStorage,
    request: (url, init) => electron.net.fetch(url, init)
  }),
  isTrustedSender: (event) => !!mainWindow && event.sender.id === mainWindow.webContents.id
});
registerWatcherIpc(electron.ipcMain, { sendToRenderer });
electron.ipcMain.handle("shell:openExternal", async (event, url) => {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) {
    return { ok: false, error: "Untrusted renderer." };
  }
  return openExternalUrl(url);
});
electron.ipcMain.handle("shell:openFileUrl", async (event, url) => {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) {
    return { ok: false, error: "Untrusted renderer." };
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "file:") return { ok: false, error: "Only file:// URLs are supported." };
    const targetPath = node_url.fileURLToPath(parsed);
    const error = await electron.shell.openPath(targetPath);
    return error ? { ok: false, error } : { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "Invalid file URL." };
  }
});
electron.ipcMain.handle("shell:showInFolder", async (_e, path) => electron.shell.showItemInFolder(path));
electron.ipcMain.handle("media:saveAs", async (_e, sourcePath) => {
  try {
    if (typeof sourcePath !== "string" || !MEDIA_EXT_RE.test(sourcePath)) {
      return { error: "unsupported file" };
    }
    const res = await electron.dialog.showSaveDialog(getMainWindow(), {
      defaultPath: node_path.basename(sourcePath)
    });
    if (res.canceled || !res.filePath) return { canceled: true };
    await fs.copyFile(sourcePath, res.filePath);
    return { canceled: false, path: res.filePath };
  } catch (e) {
    return { error: e?.message || String(e) };
  }
});
electron.ipcMain.handle("clipboard:writeText", (event, text2) => {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) return false;
  electron.clipboard.writeText(String(text2 ?? ""));
  return true;
});
const themesDir = () => node_path.join(electron.app.getPath("userData"), "themes");
async function ensureThemesDir() {
  try {
    await fs.mkdir(themesDir(), { recursive: true });
  } catch {
  }
}
async function collectThemeCss(dir, root, depth, acc) {
  if (depth > 4 || acc.length > 300) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const full = node_path.join(dir, e.name);
    if (e.isDirectory()) {
      await collectThemeCss(full, root, depth + 1, acc);
    } else if (/\.css$/i.test(e.name)) {
      const rel = full.slice(root.length + 1).replace(/\\/g, "/");
      const relDir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
      acc.push({ file: rel, name: e.name.replace(/\.css$/i, ""), dir: relDir });
    }
  }
}
electron.ipcMain.handle("themes:list", async () => {
  await ensureThemesDir();
  const acc = [];
  await collectThemeCss(themesDir(), themesDir(), 0, acc);
  return acc.sort((a, b) => a.name.localeCompare(b.name) || a.file.localeCompare(b.file));
});
electron.ipcMain.handle("themes:read", async (_e, file) => {
  if (!file || !/\.css$/i.test(file) || file.includes("..")) throw new Error("Invalid theme file.");
  const root = node_path.resolve(themesDir());
  const full = node_path.resolve(root, file);
  if (full !== root && !full.startsWith(root + node_path.sep)) throw new Error("Invalid theme path.");
  let css = await fs.readFile(full, "utf8");
  const baseDir = node_path.dirname(full);
  css = css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, _q, p) => {
    const t = (p || "").trim();
    if (!t || /^(https?:|data:|file:|blob:)/i.test(t) || t.startsWith("//") || t.startsWith("#")) {
      return m;
    }
    try {
      return `url("${node_url.pathToFileURL(node_path.resolve(baseDir, t)).href}")`;
    } catch {
      return m;
    }
  });
  return css;
});
electron.ipcMain.handle("themes:reveal", async () => {
  await ensureThemesDir();
  return electron.shell.openPath(themesDir());
});
function runUploadCommand(command, file) {
  return new Promise((resolve2) => {
    const full = `${command} "${file}"`;
    node_child_process.exec(
      full,
      { timeout: 6e4, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        resolve2({
          url: parseUploadedUrl(stdout || ""),
          stdout: stdout || "",
          stderr: stderr || "",
          error: err ? err.message || String(err) : ""
        });
      }
    );
  });
}
function extractClipboardUrl(text2) {
  if (!text2) return null;
  const m = String(text2).match(/https?:\/\/[^\s)"'<>]+/i);
  return m ? m[0].replace(/[)\]"'.,]+$/, "") : null;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitForClipboardUrl(beforeText, timeoutMs = 6e3, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const clip = electron.clipboard.readText();
    if (clip && clip !== beforeText) {
      const url = extractClipboardUrl(clip);
      if (url) return url;
    }
    await sleep(intervalMs);
  }
  return null;
}
function parseUploadedUrl(out) {
  const lines = String(out).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const exact = lines.filter((l) => /^https?:\/\/\S+$/i.test(l));
  if (exact.length) return exact[exact.length - 1];
  const m = String(out).match(/https?:\/\/\S+/i);
  return m ? m[0].replace(/[)\]>"',.]+$/, "") : null;
}
async function uploadViaServer(endpoint, name, bytes) {
  const ext = (name || "").toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : ext === "svg" ? "image/svg+xml" : "image/png";
  const dataUri = `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
  const res = await electron.net.fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ list: [dataUri] })
  });
  const text2 = await res.text();
  if (!res.ok) throw new Error(`PicGo server HTTP ${res.status}: ${text2.slice(0, 200)}`);
  try {
    const j = JSON.parse(text2);
    if (j && j.success && Array.isArray(j.result) && j.result[0]) return String(j.result[0]);
    if (j && j.success === false) throw new Error(j.message || "PicGo server returned failure");
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
  }
  return parseUploadedUrl(text2);
}
electron.ipcMain.handle("image:upload", async (_e, command, name, bytes) => {
  if (!command || !String(command).trim()) return { ok: false, error: "No upload command configured." };
  const cmd = String(command).trim();
  let endpoint = cmd;
  if (cmd.toLowerCase() === "picgo") endpoint = "http://127.0.0.1:36677/upload";
  if (/^https?:\/\//i.test(endpoint)) {
    try {
      const url = await uploadViaServer(endpoint, name, bytes);
      return url ? { ok: true, url } : { ok: false, error: "No URL in PicGo server response." };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  }
  const beforeClip = electron.clipboard.readText();
  let dir;
  try {
    dir = await fs.mkdtemp(node_path.join(node_os.tmpdir(), "horsemd-img-"));
    const safe = (name || "image.png").replace(/[\\/:*?"<>|]/g, "_") || "image.png";
    const file = node_path.join(dir, safe);
    await fs.writeFile(file, Buffer.from(bytes));
    const res = await runUploadCommand(String(command).trim(), file);
    let url = res.url;
    if (!url) url = await waitForClipboardUrl(beforeClip);
    if (url) return { ok: true, url };
    return { ok: false, error: (res.stderr || res.stdout || res.error || "").slice(-500) || "No URL in command output or clipboard." };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  } finally {
    if (dir) fs.rm(dir, { recursive: true, force: true }).catch(() => {
    });
  }
});
const uniqueImageFile = (dir, name) => {
  const safe = (name || "image.png").replace(/[\\/:*?"<>|]/g, "_") || "image.png";
  const ext = node_path.extname(safe) || ".png";
  const stem = node_path.basename(safe, ext) || "image";
  let file = node_path.join(dir, `${stem}${ext}`);
  let n = 1;
  while (node_fs.existsSync(file)) file = node_path.join(dir, `${stem}-${n++}${ext}`);
  return file;
};
const uniqueAssetFile = (dir, name) => {
  const safe = (name || "attachment").replace(/[\\/:*?"<>|]/g, "_") || "attachment";
  const ext = node_path.extname(safe);
  const stem = ext ? node_path.basename(safe, ext) : safe;
  let file = node_path.join(dir, safe);
  let n = 1;
  while (node_fs.existsSync(file)) file = node_path.join(dir, `${stem}-${n++}${ext}`);
  return file;
};
electron.ipcMain.handle("attachment:save", async (_e, docPath, sourcePath, mode, customPath) => {
  try {
    if (!docPath) return { ok: false, error: "Save the document before attaching files." };
    if (!sourcePath) return { ok: false, error: "No attachment selected." };
    const st = await fs.stat(sourcePath);
    if (!st.isFile()) return { ok: false, error: "Only files can be attached." };
    const { dir: assetsDir, prefix } = resolveAttachmentTarget(docPath, mode, customPath);
    await fs.mkdir(assetsDir, { recursive: true });
    const sourceReal = node_fs.realpathSync(sourcePath);
    let assetsReal = assetsDir;
    try {
      assetsReal = node_fs.realpathSync(assetsDir);
    } catch {
    }
    const inAssets = sourceReal.startsWith(node_path.resolve(assetsReal) + node_path.sep);
    if (inAssets) return { ok: true, path: prefix + node_path.basename(sourcePath), name: node_path.basename(sourcePath) };
    const file = uniqueAssetFile(assetsDir, node_path.basename(sourcePath));
    await fs.copyFile(sourcePath, file, node_fs.constants.COPYFILE_EXCL);
    return { ok: true, path: prefix + node_path.basename(file), name: node_path.basename(sourcePath) };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});
const pasteImagesDir = () => node_path.join(electron.app.getPath("userData"), "paste-images");
electron.ipcMain.handle("image:save", async (_e, docPath, name, bytes, mode, customPath) => {
  try {
    if (!docPath) return { ok: false, error: "No document path." };
    const { dir, prefix } = resolveAttachmentTarget(docPath, mode, customPath);
    await fs.mkdir(dir, { recursive: true });
    const file = uniqueImageFile(dir, name);
    await fs.writeFile(file, Buffer.from(bytes));
    return { ok: true, path: prefix + node_path.basename(file) };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});
electron.ipcMain.handle("image:savePaste", async (_e, name, bytes) => {
  try {
    const dir = pasteImagesDir();
    await fs.mkdir(dir, { recursive: true });
    const file = uniqueImageFile(dir, name);
    await fs.writeFile(file, Buffer.from(bytes));
    return { ok: true, url: node_url.pathToFileURL(file).href };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});
electron.ipcMain.handle("image:inlineForSave", async (_e, content, targetPath, mode, customPath) => {
  try {
    if (!content || !targetPath) return { content, changed: false };
    const matches = [...content.matchAll(/(!\[[^\]]*\]\()([^)\s]+)(\))/g)];
    if (!matches.length) return { content, changed: false };
    const { dir: assetsDir, prefix } = resolveAttachmentTarget(targetPath, mode, customPath);
    let pdir = pasteImagesDir();
    try {
      pdir = node_fs.realpathSync(pdir);
    } catch {
    }
    let ensured = false;
    const ensure = async () => {
      if (!ensured) {
        await fs.mkdir(assetsDir, { recursive: true });
        ensured = true;
      }
    };
    let out = "";
    let cursor = 0;
    let changed = false;
    for (const m of matches) {
      const [full, pre, url] = m;
      out += content.slice(cursor, m.index);
      cursor = m.index + full.length;
      let replacement = full;
      try {
        const dataM = url.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.*)$/i);
        if (dataM) {
          await ensure();
          const ext = dataM[1].toLowerCase() === "jpeg" ? "jpg" : dataM[1].toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
          const file = uniqueImageFile(assetsDir, `image.${ext}`);
          await fs.writeFile(file, Buffer.from(dataM[2], "base64"));
          replacement = pre + prefix + node_path.basename(file) + ")";
          changed = true;
        } else if (/^file:\/\//i.test(url)) {
          const fsPath = node_url.fileURLToPath(url);
          let realFsPath = fsPath;
          try {
            realFsPath = node_fs.realpathSync(fsPath);
          } catch {
          }
          if (realFsPath.startsWith(pdir) && node_fs.existsSync(fsPath)) {
            await ensure();
            const file = uniqueImageFile(assetsDir, node_path.basename(fsPath));
            await fs.copyFile(fsPath, file);
            fs.rm(fsPath, { force: true }).catch(() => {
            });
            replacement = pre + prefix + node_path.basename(file) + ")";
            changed = true;
          }
        }
      } catch {
      }
      out += replacement;
    }
    out += content.slice(cursor);
    return { content: out, changed };
  } catch {
    return { content, changed: false };
  }
});
electron.ipcMain.handle("window:minimize", () => mainWindow?.minimize());
electron.ipcMain.handle("window:toggleMaximize", () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return mainWindow.isMaximized();
});
electron.ipcMain.handle("window:close", () => mainWindow?.close());
electron.ipcMain.handle("window:isMaximized", () => mainWindow?.isMaximized() ?? false);
electron.ipcMain.handle("window:setCloseToTray", (event, value) => {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) return { ok: false };
  closeToTray = value === true;
  if (closeToTray) createTray();
  else destroyTray();
  return { ok: true, closeToTray };
});
electron.ipcMain.handle("window:toggleVisibility", (event) => {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) return { ok: false };
  toggleMainWindow();
  return { ok: true };
});
electron.ipcMain.handle("window:setGlobalShortcuts", (event, payload) => {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) {
    return { ok: false, accelerators: {}, unregistered: [] };
  }
  return applyGlobalShortcuts(payload);
});
electron.ipcMain.handle("window:toggleDevTools", (event) => {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) return false;
  mainWindow.webContents.toggleDevTools();
  return true;
});
electron.ipcMain.handle("devtools:inspectElement", (event, x, y) => {
  const wc = event.sender;
  if (wc.getType() !== "window") return false;
  const ix = Number.isFinite(x) ? Math.round(x) : 0;
  const iy = Number.isFinite(y) ? Math.round(y) : 0;
  wc.inspectElement(ix, iy);
  return true;
});
electron.ipcMain.handle("devtools:open", (event) => {
  const wc = event.sender;
  if (wc.getType() !== "window") return false;
  if (wc.isDevToolsOpened()) {
    wc.closeDevTools();
    return false;
  }
  wc.openDevTools({ mode: "bottom", activate: true });
  return true;
});
electron.ipcMain.on("app:confirm-close", () => {
  if (isQuitting) {
    allowClose = true;
    electron.app.quit();
    return;
  }
  if (closeToTray) {
    hideMainWindow();
    return;
  }
  allowClose = true;
  mainWindow?.close();
});
electron.ipcMain.on("app:cancel-close", () => {
  isQuitting = false;
});
electron.ipcMain.handle("update:check", async () => {
  try {
    const res = await electron.net.fetch("https://api.github.com/repos/BND-1/horseMD/releases/latest", {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "HorseMD-Updater" },
      // Notify-only check: never let a stalled network (api.github.com is
      // unreachable on some connections) hold the request open — bail early.
      signal: AbortSignal.timeout(8e3)
    });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    const latest = String(data.tag_name || "").replace(/^v/i, "");
    return {
      ok: true,
      latest,
      current: electron.app.getVersion(),
      url: data.html_url || "https://github.com/BND-1/horseMD/releases",
      // The release notes (Markdown) so the prompt can show "what's new". Capped
      // so a huge changelog can't bloat the IPC payload / the toast.
      name: typeof data.name === "string" ? data.name : "",
      notes: typeof data.body === "string" ? data.body.slice(0, 4e3) : ""
    };
  } catch {
    return { ok: false };
  }
});
electron.ipcMain.handle("menu:setKeybindings", async (_event, accelerators) => {
  const normalized = normalizeMenuKeybindingPayload(accelerators);
  if (!normalized.ok) return normalized;
  menuKeybindings = normalized.keybindings;
  buildMenu();
  return { ok: true, ignoredCommandIds: normalized.ignoredCommandIds };
});
electron.ipcMain.handle("menu:getKeybindings", async () => ({ ...menuKeybindings }));
electron.ipcMain.handle("menu:getSnapshot", async () => getMenuSnapshot());
function menuCmd(cmd) {
  return () => sendToRenderer("menu", cmd);
}
let menuKeybindings = {};
function menuAccelerator(commandId) {
  return menuAcceleratorFor(menuKeybindings, commandId, defaultMenuAcceleratorFor(commandId));
}
function serializeMenuItem(item) {
  return {
    label: item.label || "",
    role: item.role || "",
    type: item.type || "",
    accelerator: item.accelerator || "",
    submenu: item.submenu ? item.submenu.items.map(serializeMenuItem) : []
  };
}
function getMenuSnapshot() {
  const menu = electron.Menu.getApplicationMenu();
  return menu ? menu.items.map(serializeMenuItem) : [];
}
function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...isMac ? [{ role: "appMenu" }] : [],
    {
      label: "File",
      submenu: [
        { label: "New File", accelerator: menuAccelerator("file.new"), click: menuCmd("new") },
        { label: "Open File…", accelerator: menuAccelerator("file.open"), click: menuCmd("open") },
        { label: "Open Folder…", accelerator: menuAccelerator("workspace.openFolder"), click: menuCmd("openFolder") },
        { label: "Attach File…", click: menuCmd("attachFile") },
        { type: "separator" },
        { label: "Save", accelerator: menuAccelerator("file.save"), click: menuCmd("save") },
        { label: "Save As…", accelerator: menuAccelerator("file.saveAs"), click: menuCmd("saveAs") },
        { label: "Export as PDF…", accelerator: menuAccelerator("file.exportPdf"), click: menuCmd("exportPdf") },
        { label: "Export as HTML…", accelerator: menuAccelerator("file.exportHtml"), click: menuCmd("exportHtml") },
        { label: "Export as PNG…", accelerator: menuAccelerator("file.exportExcalidrawPng"), click: menuCmd("exportExcalidrawPng") },
        { label: "Export as SVG…", accelerator: menuAccelerator("file.exportExcalidrawSvg"), click: menuCmd("exportExcalidrawSvg") },
        {
          label: "Export via Pandoc",
          submenu: [
            { label: "Word (.docx)…", accelerator: menuAccelerator("file.exportPandocDocx"), click: menuCmd("exportPandocDocx") },
            { label: "EPUB (.epub)…", accelerator: menuAccelerator("file.exportPandocEpub"), click: menuCmd("exportPandocEpub") },
            { label: "LaTeX (.tex)…", accelerator: menuAccelerator("file.exportPandocLatex"), click: menuCmd("exportPandocLatex") },
            { label: "OpenDocument (.odt)…", accelerator: menuAccelerator("file.exportPandocOdt"), click: menuCmd("exportPandocOdt") },
            { label: "Rich Text (.rtf)…", accelerator: menuAccelerator("file.exportPandocRtf"), click: menuCmd("exportPandocRtf") },
            { label: "Plain Text (.txt)…", accelerator: menuAccelerator("file.exportPandocTxt"), click: menuCmd("exportPandocTxt") }
          ]
        },
        { type: "separator" },
        { label: "Close Tab", accelerator: menuAccelerator("tab.close"), click: menuCmd("closeTab") },
        // macOS: give "Close Window" Shift+Cmd+W so it doesn't fight Close Tab
        // for Cmd+W (role 'close' otherwise defaults to Cmd+W). Windows: Quit.
        isMac ? { role: "close", accelerator: "Shift+CmdOrCtrl+W" } : { role: "quit" }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
        { type: "separator" },
        { label: "Find", accelerator: menuAccelerator("editor.find"), click: menuCmd("find") }
      ]
    },
    {
      label: "View",
      submenu: [
        { label: "Command Palette", accelerator: menuAccelerator("view.commandPalette"), click: menuCmd("palette") },
        // Sidebar toggle is handled in the renderer as Ctrl/Cmd+Shift+B. Plain
        // Ctrl/Cmd+B remains the editor's standard bold shortcut (#67).
        { label: "Toggle Sidebar", click: menuCmd("toggleSidebar") },
        { label: "Toggle Outline", accelerator: menuAccelerator("view.showOutline"), click: menuCmd("toggleOutline") },
        { label: "Global Search", accelerator: menuAccelerator("view.globalSearch"), click: menuCmd("globalSearch") },
        { label: "Toggle Source Mode", accelerator: menuAccelerator("view.toggleSource"), click: menuCmd("toggleSource") },
        { type: "separator" },
        { label: "Toggle Theme", accelerator: menuAccelerator("view.cycleTheme"), click: menuCmd("toggleTheme") },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        { role: "toggleDevTools" }
      ]
    },
    // Windows/Linux: the bare 'windowMenu' role injects { role:'close' } whose
    // DEFAULT accelerator is CmdOrCtrl+W — which collides with Close Tab (#30),
    // sometimes closing the whole window/app instead of the tab. Use a custom
    // submenu so Close binds Alt+F4 (the Windows standard), leaving Ctrl+W for
    // Close Tab. macOS keeps the bare role (its windowMenu has no 'close').
    isMac ? { role: "windowMenu" } : {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "close", accelerator: "Alt+F4" }
      ]
    }
  ];
  electron.Menu.setApplicationMenu(electron.Menu.buildFromTemplate(template));
}
