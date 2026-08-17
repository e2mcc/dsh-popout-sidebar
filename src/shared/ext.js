// Shared extension → preview-type helpers (portable JS: var/function, no
// template literals, so this file can be inlined verbatim into the host Node
// scope, the client bundle, and the standalone page's String.raw inline script).
var EXT_IMAGE = { png: 1, jpg: 1, jpeg: 1, gif: 1, webp: 1, svg: 1, bmp: 1, ico: 1, avif: 1 };
var EXT_MARKDOWN = { md: 1, markdown: 1, mdx: 1, mdown: 1 };
var EXT_HTML = { html: 1, htm: 1, xhtml: 1 };

function extType(path) {
  var m = /\.([^.]+)$/.exec(String(path || ''));
  var ext = m ? m[1].toLowerCase() : '';
  if (EXT_IMAGE[ext]) return 'image';
  if (EXT_MARKDOWN[ext]) return 'markdown';
  if (EXT_HTML[ext]) return 'html';
  return 'text';
}

function fileExt(path) {
  var m = /\.([^.]+)$/.exec(String(path || ''));
  return m ? m[1].toLowerCase() : '';
}
