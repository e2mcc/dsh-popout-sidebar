// Shared self-contained syntax highlighter (portable JS, no template literals,
// no interpolation, no backticks — safe to inline verbatim into the standalone
// page's String.raw template). Emits span class tok-* tokens; color them in CSS.
function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function makeHl(specs, flags) {
  var src = '';
  for (var i = 0; i < specs.length; i += 1) src += (i ? '|' : '') + '(' + specs[i][1] + ')';
  var re = new RegExp(src, flags || 'g');
  return function (code) {
    re.lastIndex = 0;
    var out = '', last = 0, m;
    while ((m = re.exec(code)) !== null) {
      if (m.index > last) out += escHtml(code.slice(last, m.index));
      for (var g = 1; g < m.length; g += 1) {
        if (m[g] !== undefined) {
          out += '<span class="tok-' + specs[g - 1][0] + '">' + escHtml(m[g]) + '</span>';
          break;
        }
      }
      last = re.lastIndex;
      if (m[0].length === 0) { re.lastIndex += 1; last = re.lastIndex; }
    }
    if (last < code.length) out += escHtml(code.slice(last));
    return out;
  };
}

var S_DQ = "\"(?:[^\"\\\\\\n]|\\\\.)*\"";
var S_SQ = "\\x27(?:[^\\x27\\\\\\n]|\\\\.)*\\x27";
var S_BT = "\\x60(?:[^\\x60\\\\]|\\\\.)*\\x60";
var NUM = "\\b(?:0[xX][0-9a-fA-F]+|\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\b";
var C_LINE = "//[^\\n]*";
var C_BLK = "/\\*[\\s\\S]*?\\*/";
var HASH = "#[^\\n]*";
var SQL_LINE = "--[^\\n]*";
var HTML_COMMENT = "<!--[\\s\\S]*?-->";
var PY_TRI = "(?:\"\"\"[\\s\\S]*?\"\"\"|\\x27\\x27\\x27[\\s\\S]*?\\x27\\x27\\x27)";
var PY_STR = "(?:[rfbuRFBU]{0,2})(?:\"(?:[^\"\\\\\\n]|\\\\.)*\"|\\x27(?:[^\\x27\\\\\\n]|\\\\.)*\\x27)";
var CSS_NUM = "\\b\\d+(?:\\.\\d+)?(?:[a-zA-Z%]*)\\b";
var HEX = "#[0-9a-fA-F]{3,8}\\b";
var AT = "@[\\w-]+";
var PROP = "[\\w-]+(?=\\s*:)";
var TAG = "</?[\\w-]+|/?>";
var ATTR = "[\\w-]+(?==)";
var VAR = "\\$(?:\\{[\\w]+\\}|[\\w]+)";
var VAR_PHP = "\\$\\w+";
var DECORATOR = "@[\\w.]+";
var IMPORTANT = "!important\\b";
var FUNC = "\\b[A-Za-z_$][\\w$]*(?=\\s*\\()";
var FUNC_PY = "\\b[A-Za-z_][\\w]*(?=\\s*\\()";
var CLASS = "\\b[A-Z][\\w$]*\\b";
var YAML_KEY = "^\\s*(?:-\\s+)?[\\w.@-]+(?=\\s*:)";

function kwWord(kw) { return '\\b(?:' + kw.replace(/\s+/g, '|') + ')\\b'; }

var JS_KW = 'break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new return static super switch this throw try typeof var void while with yield async await of get set null undefined true false';
var PY_KW = 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield True False None self';
var SH_KW = 'if then elif else fi for while do done case esac function select in until return exit set unset export readonly local shift source';
var SQL_KW = 'select from where insert into update delete create drop alter table index view join left right inner outer full on as and or not null group by order having limit offset union all distinct values set primary key foreign references default like between is in exists asc desc';
var C_KW = 'auto break case const continue default do double else enum extern float for goto if int long register return short signed sizeof static struct switch typedef union unsigned void volatile while';
var GO_KW = 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var';
var RUST_KW = 'as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type union unsafe use where while';
var JAVA_KW = 'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while';
var RB_KW = 'begin case class def do else elsif end ensure for if module next nil not or redo rescue retry return self super then true false undef unless until when while yield';
var PHP_KW = 'abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile extends final finally fn for foreach function global if implements include instanceof insteadof interface isset list namespace new or print private protected public require return static switch throw trait try unset use var while xor yield';

function cFamily(kw) {
  return makeHl([
    ['comment', C_LINE + '|' + C_BLK],
    ['string', S_BT + '|' + S_DQ + '|' + S_SQ],
    ['number', NUM],
    ['keyword', kwWord(kw)],
    ['function', FUNC],
    ['class', CLASS],
  ]);
}

var HL_ENGINES = {
  js: makeHl([
    ['comment', C_LINE + '|' + C_BLK],
    ['string', S_BT + '|' + S_DQ + '|' + S_SQ],
    ['number', NUM],
    ['keyword', kwWord(JS_KW)],
    ['builtin', '\\b(?:console|Math|JSON|Promise|Array|Object|String|Number|Boolean|RegExp|Date|Map|Set|WeakMap|WeakSet|Symbol|BigInt|Infinity|NaN|window|document|process|require|module|exports|setTimeout|clearTimeout|fetch|globalThis)\\b'],
    ['function', FUNC],
    ['class', CLASS],
  ]),
  py: makeHl([
    ['comment', HASH],
    ['string', PY_TRI + '|' + PY_STR],
    ['number', NUM],
    ['keyword', kwWord(PY_KW)],
    ['builtin', '\\b(?:print|len|range|enumerate|zip|map|filter|int|str|float|bool|list|dict|set|tuple|type|isinstance|super|open|input|repr|format|sorted|reversed|sum|min|max|abs|round|any|all|next|iter|dir|vars|getattr|setattr|hasattr|id|hash|bytes|bytearray|complex|frozenset|object|classmethod|staticmethod|property|Exception|ValueError|TypeError|KeyError|IndexError|ImportError|RuntimeError|StopIteration)\\b'],
    ['decorator', DECORATOR],
    ['function', FUNC_PY],
  ]),
  css: makeHl([
    ['comment', C_BLK],
    ['string', S_DQ + '|' + S_SQ],
    ['atrule', AT],
    ['property', PROP],
    ['number', CSS_NUM],
    ['hex', HEX],
    ['important', IMPORTANT],
  ]),
  html: makeHl([
    ['comment', HTML_COMMENT],
    ['string', S_DQ + '|' + S_SQ],
    ['tag', TAG],
    ['attr', ATTR],
  ]),
  sh: makeHl([
    ['comment', HASH],
    ['string', S_DQ + '|' + S_SQ + '|' + S_BT],
    ['variable', VAR],
    ['number', NUM],
    ['keyword', kwWord(SH_KW)],
  ]),
  yaml: makeHl([
    ['comment', HASH],
    ['string', S_DQ + '|' + S_SQ],
    ['number', NUM],
    ['bool', '\\b(?:true|false|null|yes|no|on|off)\\b'],
    ['key', YAML_KEY],
  ], 'gm'),
  sql: makeHl([
    ['comment', SQL_LINE + '|' + C_BLK],
    ['string', S_SQ + '|' + S_DQ],
    ['number', NUM],
    ['keyword', kwWord(SQL_KW)],
    ['function', FUNC_PY],
  ], 'gi'),
  json: makeHl([
    ['string', S_DQ],
    ['number', NUM],
    ['bool', '\\b(?:true|false|null)\\b'],
  ]),
  c: cFamily(C_KW),
  cpp: cFamily(C_KW),
  go: cFamily(GO_KW),
  rust: cFamily(RUST_KW),
  java: cFamily(JAVA_KW),
  rb: makeHl([
    ['comment', HASH],
    ['string', S_DQ + '|' + S_SQ],
    ['number', NUM],
    ['keyword', kwWord(RB_KW)],
    ['function', FUNC_PY],
    ['class', CLASS],
  ]),
  php: makeHl([
    ['comment', C_LINE + '|' + C_BLK + '|' + HASH],
    ['string', S_DQ + '|' + S_SQ],
    ['variable', VAR_PHP],
    ['number', NUM],
    ['keyword', kwWord(PHP_KW)],
    ['function', FUNC_PY],
  ]),
};

var HL_LANG_MAP = {
  js: 'js', mjs: 'js', cjs: 'js', jsx: 'js', javascript: 'js',
  ts: 'js', tsx: 'js', mts: 'js', cts: 'js', typescript: 'js',
  json: 'json', jsonc: 'json', json5: 'js',
  py: 'py', python: 'py', pyw: 'py',
  rb: 'rb', ruby: 'rb',
  go: 'go', golang: 'go',
  rs: 'rust', rust: 'rust',
  java: 'java',
  c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp', cs: 'c', csharp: 'c',
  kotlin: 'c', kt: 'c', swift: 'c',
  php: 'php',
  yaml: 'yaml', yml: 'yaml', toml: 'sh', ini: 'sh', conf: 'sh', properties: 'sh', env: 'sh',
  md: 'md', markdown: 'md', mdx: 'md',
  html: 'html', htm: 'html', xhtml: 'html', vue: 'html', xml: 'html', svg: 'html',
  css: 'css', scss: 'css', less: 'css',
  sql: 'sql',
  lua: 'c',
  sh: 'sh', bash: 'sh', shell: 'sh', zsh: 'sh', fish: 'sh',
};

var HL_LANG_NAMES = {
  js: 'JavaScript', py: 'Python', css: 'CSS', html: 'HTML/XML', sh: 'Shell',
  yaml: 'YAML', sql: 'SQL', c: 'C/C++', cpp: 'C++', go: 'Go', rust: 'Rust',
  java: 'Java', rb: 'Ruby', php: 'PHP', json: 'JSON', plain: 'Text',
};

function hlLangOf(hint) {
  var h = String(hint || '').toLowerCase();
  if (h.charAt(0) === '.') h = h.slice(1);
  return HL_LANG_MAP[h] || 'plain';
}

function hlLangLabel(hint) { return HL_LANG_NAMES[hlLangOf(hint)] || 'Text'; }

function highlightCode(src, hint) {
  var fn = HL_ENGINES[hlLangOf(hint)];
  return fn ? fn(String(src)) : escHtml(src);
}
