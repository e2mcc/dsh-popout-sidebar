// Shared minimal Markdown → HTML renderer (portable JS, no template literals).
// Backticks are written as \x60 so the file can be inlined verbatim into the
// standalone page's String.raw template. Fenced code blocks are highlighted via
// highlightCode from shared/highlight.js.
function mdEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function mdInline(s) {
  s = s.replace(/\x60([^\x60]+)\x60/g, function (m, c) { return '<code>' + c + '</code>'; });
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  return s;
}

function mdToHtml(src) {
  var lines = String(src || '').replace(/\r\n/g, '\n').split('\n');
  var out = [];
  var i = 0;
  while (i < lines.length) {
    var line = lines[i];
    if (/^\s*\x60\x60\x60/.test(line)) {
      var fence = /^\s*\x60\x60\x60([\w+-]*)/.exec(line);
      var langHint = fence ? fence[1] : '';
      var buf = [];
      i += 1;
      while (i < lines.length && !/^\s*\x60\x60\x60/.test(lines[i])) { buf.push(lines[i]); i += 1; }
      i += 1;
      var codeText = buf.join('\n');
      out.push('<pre><code>' + highlightCode(codeText, langHint) + '</code></pre>');
      continue;
    }
    var h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      var lv = h[1].length;
      out.push('<h' + lv + '>' + mdInline(mdEscape(h[2])) + '</h' + lv + '>');
      i += 1;
      continue;
    }
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) { out.push('<hr>'); i += 1; continue; }
    if (/^\s*>\s?/.test(line)) {
      var q = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, '')); i += 1; }
      out.push('<blockquote>' + mdInline(mdEscape(q.join(' '))) + '</blockquote>');
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      var lis = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) { lis.push(mdInline(mdEscape(lines[i].replace(/^\s*[-*+]\s+/, '')))); i += 1; }
      out.push('<ul>' + lis.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>');
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      var lis2 = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { lis2.push(mdInline(mdEscape(lines[i].replace(/^\s*\d+\.\s+/, '')))); i += 1; }
      out.push('<ol>' + lis2.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ol>');
      continue;
    }
    if (line.trim() === '') { i += 1; continue; }
    out.push('<p>' + mdInline(mdEscape(line)) + '</p>');
    i += 1;
  }
  return out.join('\n');
}
