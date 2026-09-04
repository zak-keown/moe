// @generated — do not edit; see scripts/build-runtime.mjs
import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);

// ../../node_modules/.pnpm/marked@16.4.2/node_modules/marked/lib/marked.esm.js
function L() {
  return { async: false, breaks: false, extensions: null, gfm: true, hooks: null, pedantic: false, renderer: null, silent: false, tokenizer: null, walkTokens: null };
}
var T = L();
function G(l3) {
  T = l3;
}
var E = { exec: () => null };
function d(l3, e = "") {
  let t = typeof l3 == "string" ? l3 : l3.source, n = { replace: (r, i) => {
    let s = typeof i == "string" ? i : i.source;
    return s = s.replace(m.caret, "$1"), t = t.replace(r, s), n;
  }, getRegex: () => new RegExp(t, e) };
  return n;
}
var be = (() => {
  try {
    return !!new RegExp("(?<=1)(?<!1)");
  } catch {
    return false;
  }
})();
var m = { codeRemoveIndent: /^(?: {1,4}| {0,3}\t)/gm, outputLinkReplace: /\\([\[\]])/g, indentCodeCompensation: /^(\s+)(?:```)/, beginningSpace: /^\s+/, endingHash: /#$/, startingSpaceChar: /^ /, endingSpaceChar: / $/, nonSpaceChar: /[^ ]/, newLineCharGlobal: /\n/g, tabCharGlobal: /\t/g, multipleSpaceGlobal: /\s+/g, blankLine: /^[ \t]*$/, doubleBlankLine: /\n[ \t]*\n[ \t]*$/, blockquoteStart: /^ {0,3}>/, blockquoteSetextReplace: /\n {0,3}((?:=+|-+) *)(?=\n|$)/g, blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm, listReplaceTabs: /^\t+/, listReplaceNesting: /^ {1,4}(?=( {4})*[^ ])/g, listIsTask: /^\[[ xX]\] /, listReplaceTask: /^\[[ xX]\] +/, anyLine: /\n.*\n/, hrefBrackets: /^<(.*)>$/, tableDelimiter: /[:|]/, tableAlignChars: /^\||\| *$/g, tableRowBlankLine: /\n[ \t]*$/, tableAlignRight: /^ *-+: *$/, tableAlignCenter: /^ *:-+: *$/, tableAlignLeft: /^ *:-+ *$/, startATag: /^<a /i, endATag: /^<\/a>/i, startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i, endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i, startAngleBracket: /^</, endAngleBracket: />$/, pedanticHrefTitle: /^([^'"]*[^\s])\s+(['"])(.*)\2/, unicodeAlphaNumeric: /[\p{L}\p{N}]/u, escapeTest: /[&<>"']/, escapeReplace: /[&<>"']/g, escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/, escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g, unescapeTest: /&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig, caret: /(^|[^\[])\^/g, percentDecode: /%25/g, findPipe: /\|/g, splitPipe: / \|/, slashPipe: /\\\|/g, carriageReturn: /\r\n|\r/g, spaceLine: /^ +$/gm, notSpaceStart: /^\S*/, endingNewline: /\n$/, listItemRegex: (l3) => new RegExp(`^( {0,3}${l3})((?:[	 ][^\\n]*)?(?:\\n|$))`), nextBulletRegex: (l3) => new RegExp(`^ {0,${Math.min(3, l3 - 1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`), hrRegex: (l3) => new RegExp(`^ {0,${Math.min(3, l3 - 1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`), fencesBeginRegex: (l3) => new RegExp(`^ {0,${Math.min(3, l3 - 1)}}(?:\`\`\`|~~~)`), headingBeginRegex: (l3) => new RegExp(`^ {0,${Math.min(3, l3 - 1)}}#`), htmlBeginRegex: (l3) => new RegExp(`^ {0,${Math.min(3, l3 - 1)}}<(?:[a-z].*>|!--)`, "i") };
var Re = /^(?:[ \t]*(?:\n|$))+/;
var Te = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/;
var Oe = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/;
var I = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
var we = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
var F = /(?:[*+-]|\d{1,9}[.)])/;
var ie = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/;
var oe = d(ie).replace(/bull/g, F).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/\|table/g, "").getRegex();
var ye = d(ie).replace(/bull/g, F).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex();
var j = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/;
var Pe = /^[^\n]+/;
var Q = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\])+/;
var Se = d(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label", Q).replace("title", /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex();
var $e = d(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g, F).getRegex();
var v = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
var U = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;
var _e = d("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))", "i").replace("comment", U).replace("tag", v).replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex();
var ae = d(j).replace("hr", I).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("|table", "").replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", v).getRegex();
var Le = d(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph", ae).getRegex();
var K = { blockquote: Le, code: Te, def: Se, fences: Oe, heading: we, hr: I, html: _e, lheading: oe, list: $e, newline: Re, paragraph: ae, table: E, text: Pe };
var re = d("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr", I).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("blockquote", " {0,3}>").replace("code", "(?: {4}| {0,3}	)[^\\n]").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", v).getRegex();
var Me = { ...K, lheading: ye, table: re, paragraph: d(j).replace("hr", I).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("table", re).replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", v).getRegex() };
var ze = { ...K, html: d(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment", U).replace(/tag/g, "(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(), def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/, heading: /^(#{1,6})(.*)(?:\n+|$)/, fences: E, lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/, paragraph: d(j).replace("hr", I).replace("heading", ` *#{1,6} *[^
]`).replace("lheading", oe).replace("|table", "").replace("blockquote", " {0,3}>").replace("|fences", "").replace("|list", "").replace("|html", "").replace("|tag", "").getRegex() };
var Ae = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;
var Ee = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
var le = /^( {2,}|\\)\n(?!\s*$)/;
var Ie = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/;
var D = /[\p{P}\p{S}]/u;
var W = /[\s\p{P}\p{S}]/u;
var ue = /[^\s\p{P}\p{S}]/u;
var Ce = d(/^((?![*_])punctSpace)/, "u").replace(/punctSpace/g, W).getRegex();
var pe = /(?!~)[\p{P}\p{S}]/u;
var Be = /(?!~)[\s\p{P}\p{S}]/u;
var qe = /(?:[^\s\p{P}\p{S}]|~)/u;
var ve = d(/link|precode-code|html/, "g").replace("link", /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/).replace("precode-", be ? "(?<!`)()" : "(^^|[^`])").replace("code", /(?<b>`+)[^`]+\k<b>(?!`)/).replace("html", /<(?! )[^<>]*?>/).getRegex();
var ce = /^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/;
var De = d(ce, "u").replace(/punct/g, D).getRegex();
var He = d(ce, "u").replace(/punct/g, pe).getRegex();
var he = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)";
var Ze = d(he, "gu").replace(/notPunctSpace/g, ue).replace(/punctSpace/g, W).replace(/punct/g, D).getRegex();
var Ge = d(he, "gu").replace(/notPunctSpace/g, qe).replace(/punctSpace/g, Be).replace(/punct/g, pe).getRegex();
var Ne = d("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)", "gu").replace(/notPunctSpace/g, ue).replace(/punctSpace/g, W).replace(/punct/g, D).getRegex();
var Fe = d(/\\(punct)/, "gu").replace(/punct/g, D).getRegex();
var je = d(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme", /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email", /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex();
var Qe = d(U).replace("(?:-->|$)", "-->").getRegex();
var Ue = d("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment", Qe).replace("attribute", /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex();
var q = /(?:\[(?:\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+[^`]*?`+(?!`)|[^\[\]\\`])*?/;
var Ke = d(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label", q).replace("href", /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title", /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex();
var de = d(/^!?\[(label)\]\[(ref)\]/).replace("label", q).replace("ref", Q).getRegex();
var ke = d(/^!?\[(ref)\](?:\[\])?/).replace("ref", Q).getRegex();
var We = d("reflink|nolink(?!\\()", "g").replace("reflink", de).replace("nolink", ke).getRegex();
var se = /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/;
var X = { _backpedal: E, anyPunctuation: Fe, autolink: je, blockSkip: ve, br: le, code: Ee, del: E, emStrongLDelim: De, emStrongRDelimAst: Ze, emStrongRDelimUnd: Ne, escape: Ae, link: Ke, nolink: ke, punctuation: Ce, reflink: de, reflinkSearch: We, tag: Ue, text: Ie, url: E };
var Xe = { ...X, link: d(/^!?\[(label)\]\((.*?)\)/).replace("label", q).getRegex(), reflink: d(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label", q).getRegex() };
var N = { ...X, emStrongRDelimAst: Ge, emStrongLDelim: He, url: d(/^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/).replace("protocol", se).replace("email", /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(), _backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/, del: /^(~~?)(?=[^\s~])((?:\\[\s\S]|[^\\])*?(?:\\[\s\S]|[^\s~\\]))\1(?=[^~]|$)/, text: d(/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/).replace("protocol", se).getRegex() };
var Je = { ...N, br: d(le).replace("{2,}", "*").getRegex(), text: d(N.text).replace("\\b_", "\\b_| {2,}\\n").replace(/\{2,\}/g, "*").getRegex() };
var C = { normal: K, gfm: Me, pedantic: ze };
var M = { normal: X, gfm: N, breaks: Je, pedantic: Xe };
var Ve = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
var ge = (l3) => Ve[l3];
function w(l3, e) {
  if (e) {
    if (m.escapeTest.test(l3)) return l3.replace(m.escapeReplace, ge);
  } else if (m.escapeTestNoEncode.test(l3)) return l3.replace(m.escapeReplaceNoEncode, ge);
  return l3;
}
function J(l3) {
  try {
    l3 = encodeURI(l3).replace(m.percentDecode, "%");
  } catch {
    return null;
  }
  return l3;
}
function V(l3, e) {
  let t = l3.replace(m.findPipe, (i, s, a) => {
    let o = false, p = s;
    for (; --p >= 0 && a[p] === "\\"; ) o = !o;
    return o ? "|" : " |";
  }), n = t.split(m.splitPipe), r = 0;
  if (n[0].trim() || n.shift(), n.length > 0 && !n.at(-1)?.trim() && n.pop(), e) if (n.length > e) n.splice(e);
  else for (; n.length < e; ) n.push("");
  for (; r < n.length; r++) n[r] = n[r].trim().replace(m.slashPipe, "|");
  return n;
}
function z(l3, e, t) {
  let n = l3.length;
  if (n === 0) return "";
  let r = 0;
  for (; r < n; ) {
    let i = l3.charAt(n - r - 1);
    if (i === e && !t) r++;
    else if (i !== e && t) r++;
    else break;
  }
  return l3.slice(0, n - r);
}
function fe(l3, e) {
  if (l3.indexOf(e[1]) === -1) return -1;
  let t = 0;
  for (let n = 0; n < l3.length; n++) if (l3[n] === "\\") n++;
  else if (l3[n] === e[0]) t++;
  else if (l3[n] === e[1] && (t--, t < 0)) return n;
  return t > 0 ? -2 : -1;
}
function me(l3, e, t, n, r) {
  let i = e.href, s = e.title || null, a = l3[1].replace(r.other.outputLinkReplace, "$1");
  n.state.inLink = true;
  let o = { type: l3[0].charAt(0) === "!" ? "image" : "link", raw: t, href: i, title: s, text: a, tokens: n.inlineTokens(a) };
  return n.state.inLink = false, o;
}
function Ye(l3, e, t) {
  let n = l3.match(t.other.indentCodeCompensation);
  if (n === null) return e;
  let r = n[1];
  return e.split(`
`).map((i) => {
    let s = i.match(t.other.beginningSpace);
    if (s === null) return i;
    let [a] = s;
    return a.length >= r.length ? i.slice(r.length) : i;
  }).join(`
`);
}
var y = class {
  options;
  rules;
  lexer;
  constructor(e) {
    this.options = e || T;
  }
  space(e) {
    let t = this.rules.block.newline.exec(e);
    if (t && t[0].length > 0) return { type: "space", raw: t[0] };
  }
  code(e) {
    let t = this.rules.block.code.exec(e);
    if (t) {
      let n = t[0].replace(this.rules.other.codeRemoveIndent, "");
      return { type: "code", raw: t[0], codeBlockStyle: "indented", text: this.options.pedantic ? n : z(n, `
`) };
    }
  }
  fences(e) {
    let t = this.rules.block.fences.exec(e);
    if (t) {
      let n = t[0], r = Ye(n, t[3] || "", this.rules);
      return { type: "code", raw: n, lang: t[2] ? t[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : t[2], text: r };
    }
  }
  heading(e) {
    let t = this.rules.block.heading.exec(e);
    if (t) {
      let n = t[2].trim();
      if (this.rules.other.endingHash.test(n)) {
        let r = z(n, "#");
        (this.options.pedantic || !r || this.rules.other.endingSpaceChar.test(r)) && (n = r.trim());
      }
      return { type: "heading", raw: t[0], depth: t[1].length, text: n, tokens: this.lexer.inline(n) };
    }
  }
  hr(e) {
    let t = this.rules.block.hr.exec(e);
    if (t) return { type: "hr", raw: z(t[0], `
`) };
  }
  blockquote(e) {
    let t = this.rules.block.blockquote.exec(e);
    if (t) {
      let n = z(t[0], `
`).split(`
`), r = "", i = "", s = [];
      for (; n.length > 0; ) {
        let a = false, o = [], p;
        for (p = 0; p < n.length; p++) if (this.rules.other.blockquoteStart.test(n[p])) o.push(n[p]), a = true;
        else if (!a) o.push(n[p]);
        else break;
        n = n.slice(p);
        let u = o.join(`
`), c = u.replace(this.rules.other.blockquoteSetextReplace, `
    $1`).replace(this.rules.other.blockquoteSetextReplace2, "");
        r = r ? `${r}
${u}` : u, i = i ? `${i}
${c}` : c;
        let g = this.lexer.state.top;
        if (this.lexer.state.top = true, this.lexer.blockTokens(c, s, true), this.lexer.state.top = g, n.length === 0) break;
        let h = s.at(-1);
        if (h?.type === "code") break;
        if (h?.type === "blockquote") {
          let R = h, f = R.raw + `
` + n.join(`
`), O = this.blockquote(f);
          s[s.length - 1] = O, r = r.substring(0, r.length - R.raw.length) + O.raw, i = i.substring(0, i.length - R.text.length) + O.text;
          break;
        } else if (h?.type === "list") {
          let R = h, f = R.raw + `
` + n.join(`
`), O = this.list(f);
          s[s.length - 1] = O, r = r.substring(0, r.length - h.raw.length) + O.raw, i = i.substring(0, i.length - R.raw.length) + O.raw, n = f.substring(s.at(-1).raw.length).split(`
`);
          continue;
        }
      }
      return { type: "blockquote", raw: r, tokens: s, text: i };
    }
  }
  list(e) {
    let t = this.rules.block.list.exec(e);
    if (t) {
      let n = t[1].trim(), r = n.length > 1, i = { type: "list", raw: "", ordered: r, start: r ? +n.slice(0, -1) : "", loose: false, items: [] };
      n = r ? `\\d{1,9}\\${n.slice(-1)}` : `\\${n}`, this.options.pedantic && (n = r ? n : "[*+-]");
      let s = this.rules.other.listItemRegex(n), a = false;
      for (; e; ) {
        let p = false, u = "", c = "";
        if (!(t = s.exec(e)) || this.rules.block.hr.test(e)) break;
        u = t[0], e = e.substring(u.length);
        let g = t[2].split(`
`, 1)[0].replace(this.rules.other.listReplaceTabs, (H) => " ".repeat(3 * H.length)), h = e.split(`
`, 1)[0], R = !g.trim(), f = 0;
        if (this.options.pedantic ? (f = 2, c = g.trimStart()) : R ? f = t[1].length + 1 : (f = t[2].search(this.rules.other.nonSpaceChar), f = f > 4 ? 1 : f, c = g.slice(f), f += t[1].length), R && this.rules.other.blankLine.test(h) && (u += h + `
`, e = e.substring(h.length + 1), p = true), !p) {
          let H = this.rules.other.nextBulletRegex(f), ee = this.rules.other.hrRegex(f), te = this.rules.other.fencesBeginRegex(f), ne = this.rules.other.headingBeginRegex(f), xe = this.rules.other.htmlBeginRegex(f);
          for (; e; ) {
            let Z = e.split(`
`, 1)[0], A;
            if (h = Z, this.options.pedantic ? (h = h.replace(this.rules.other.listReplaceNesting, "  "), A = h) : A = h.replace(this.rules.other.tabCharGlobal, "    "), te.test(h) || ne.test(h) || xe.test(h) || H.test(h) || ee.test(h)) break;
            if (A.search(this.rules.other.nonSpaceChar) >= f || !h.trim()) c += `
` + A.slice(f);
            else {
              if (R || g.replace(this.rules.other.tabCharGlobal, "    ").search(this.rules.other.nonSpaceChar) >= 4 || te.test(g) || ne.test(g) || ee.test(g)) break;
              c += `
` + h;
            }
            !R && !h.trim() && (R = true), u += Z + `
`, e = e.substring(Z.length + 1), g = A.slice(f);
          }
        }
        i.loose || (a ? i.loose = true : this.rules.other.doubleBlankLine.test(u) && (a = true));
        let O = null, Y;
        this.options.gfm && (O = this.rules.other.listIsTask.exec(c), O && (Y = O[0] !== "[ ] ", c = c.replace(this.rules.other.listReplaceTask, ""))), i.items.push({ type: "list_item", raw: u, task: !!O, checked: Y, loose: false, text: c, tokens: [] }), i.raw += u;
      }
      let o = i.items.at(-1);
      if (o) o.raw = o.raw.trimEnd(), o.text = o.text.trimEnd();
      else return;
      i.raw = i.raw.trimEnd();
      for (let p = 0; p < i.items.length; p++) if (this.lexer.state.top = false, i.items[p].tokens = this.lexer.blockTokens(i.items[p].text, []), !i.loose) {
        let u = i.items[p].tokens.filter((g) => g.type === "space"), c = u.length > 0 && u.some((g) => this.rules.other.anyLine.test(g.raw));
        i.loose = c;
      }
      if (i.loose) for (let p = 0; p < i.items.length; p++) i.items[p].loose = true;
      return i;
    }
  }
  html(e) {
    let t = this.rules.block.html.exec(e);
    if (t) return { type: "html", block: true, raw: t[0], pre: t[1] === "pre" || t[1] === "script" || t[1] === "style", text: t[0] };
  }
  def(e) {
    let t = this.rules.block.def.exec(e);
    if (t) {
      let n = t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal, " "), r = t[2] ? t[2].replace(this.rules.other.hrefBrackets, "$1").replace(this.rules.inline.anyPunctuation, "$1") : "", i = t[3] ? t[3].substring(1, t[3].length - 1).replace(this.rules.inline.anyPunctuation, "$1") : t[3];
      return { type: "def", tag: n, raw: t[0], href: r, title: i };
    }
  }
  table(e) {
    let t = this.rules.block.table.exec(e);
    if (!t || !this.rules.other.tableDelimiter.test(t[2])) return;
    let n = V(t[1]), r = t[2].replace(this.rules.other.tableAlignChars, "").split("|"), i = t[3]?.trim() ? t[3].replace(this.rules.other.tableRowBlankLine, "").split(`
`) : [], s = { type: "table", raw: t[0], header: [], align: [], rows: [] };
    if (n.length === r.length) {
      for (let a of r) this.rules.other.tableAlignRight.test(a) ? s.align.push("right") : this.rules.other.tableAlignCenter.test(a) ? s.align.push("center") : this.rules.other.tableAlignLeft.test(a) ? s.align.push("left") : s.align.push(null);
      for (let a = 0; a < n.length; a++) s.header.push({ text: n[a], tokens: this.lexer.inline(n[a]), header: true, align: s.align[a] });
      for (let a of i) s.rows.push(V(a, s.header.length).map((o, p) => ({ text: o, tokens: this.lexer.inline(o), header: false, align: s.align[p] })));
      return s;
    }
  }
  lheading(e) {
    let t = this.rules.block.lheading.exec(e);
    if (t) return { type: "heading", raw: t[0], depth: t[2].charAt(0) === "=" ? 1 : 2, text: t[1], tokens: this.lexer.inline(t[1]) };
  }
  paragraph(e) {
    let t = this.rules.block.paragraph.exec(e);
    if (t) {
      let n = t[1].charAt(t[1].length - 1) === `
` ? t[1].slice(0, -1) : t[1];
      return { type: "paragraph", raw: t[0], text: n, tokens: this.lexer.inline(n) };
    }
  }
  text(e) {
    let t = this.rules.block.text.exec(e);
    if (t) return { type: "text", raw: t[0], text: t[0], tokens: this.lexer.inline(t[0]) };
  }
  escape(e) {
    let t = this.rules.inline.escape.exec(e);
    if (t) return { type: "escape", raw: t[0], text: t[1] };
  }
  tag(e) {
    let t = this.rules.inline.tag.exec(e);
    if (t) return !this.lexer.state.inLink && this.rules.other.startATag.test(t[0]) ? this.lexer.state.inLink = true : this.lexer.state.inLink && this.rules.other.endATag.test(t[0]) && (this.lexer.state.inLink = false), !this.lexer.state.inRawBlock && this.rules.other.startPreScriptTag.test(t[0]) ? this.lexer.state.inRawBlock = true : this.lexer.state.inRawBlock && this.rules.other.endPreScriptTag.test(t[0]) && (this.lexer.state.inRawBlock = false), { type: "html", raw: t[0], inLink: this.lexer.state.inLink, inRawBlock: this.lexer.state.inRawBlock, block: false, text: t[0] };
  }
  link(e) {
    let t = this.rules.inline.link.exec(e);
    if (t) {
      let n = t[2].trim();
      if (!this.options.pedantic && this.rules.other.startAngleBracket.test(n)) {
        if (!this.rules.other.endAngleBracket.test(n)) return;
        let s = z(n.slice(0, -1), "\\");
        if ((n.length - s.length) % 2 === 0) return;
      } else {
        let s = fe(t[2], "()");
        if (s === -2) return;
        if (s > -1) {
          let o = (t[0].indexOf("!") === 0 ? 5 : 4) + t[1].length + s;
          t[2] = t[2].substring(0, s), t[0] = t[0].substring(0, o).trim(), t[3] = "";
        }
      }
      let r = t[2], i = "";
      if (this.options.pedantic) {
        let s = this.rules.other.pedanticHrefTitle.exec(r);
        s && (r = s[1], i = s[3]);
      } else i = t[3] ? t[3].slice(1, -1) : "";
      return r = r.trim(), this.rules.other.startAngleBracket.test(r) && (this.options.pedantic && !this.rules.other.endAngleBracket.test(n) ? r = r.slice(1) : r = r.slice(1, -1)), me(t, { href: r && r.replace(this.rules.inline.anyPunctuation, "$1"), title: i && i.replace(this.rules.inline.anyPunctuation, "$1") }, t[0], this.lexer, this.rules);
    }
  }
  reflink(e, t) {
    let n;
    if ((n = this.rules.inline.reflink.exec(e)) || (n = this.rules.inline.nolink.exec(e))) {
      let r = (n[2] || n[1]).replace(this.rules.other.multipleSpaceGlobal, " "), i = t[r.toLowerCase()];
      if (!i) {
        let s = n[0].charAt(0);
        return { type: "text", raw: s, text: s };
      }
      return me(n, i, n[0], this.lexer, this.rules);
    }
  }
  emStrong(e, t, n = "") {
    let r = this.rules.inline.emStrongLDelim.exec(e);
    if (!r || r[3] && n.match(this.rules.other.unicodeAlphaNumeric)) return;
    if (!(r[1] || r[2] || "") || !n || this.rules.inline.punctuation.exec(n)) {
      let s = [...r[0]].length - 1, a, o, p = s, u = 0, c = r[0][0] === "*" ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
      for (c.lastIndex = 0, t = t.slice(-1 * e.length + s); (r = c.exec(t)) != null; ) {
        if (a = r[1] || r[2] || r[3] || r[4] || r[5] || r[6], !a) continue;
        if (o = [...a].length, r[3] || r[4]) {
          p += o;
          continue;
        } else if ((r[5] || r[6]) && s % 3 && !((s + o) % 3)) {
          u += o;
          continue;
        }
        if (p -= o, p > 0) continue;
        o = Math.min(o, o + p + u);
        let g = [...r[0]][0].length, h = e.slice(0, s + r.index + g + o);
        if (Math.min(s, o) % 2) {
          let f = h.slice(1, -1);
          return { type: "em", raw: h, text: f, tokens: this.lexer.inlineTokens(f) };
        }
        let R = h.slice(2, -2);
        return { type: "strong", raw: h, text: R, tokens: this.lexer.inlineTokens(R) };
      }
    }
  }
  codespan(e) {
    let t = this.rules.inline.code.exec(e);
    if (t) {
      let n = t[2].replace(this.rules.other.newLineCharGlobal, " "), r = this.rules.other.nonSpaceChar.test(n), i = this.rules.other.startingSpaceChar.test(n) && this.rules.other.endingSpaceChar.test(n);
      return r && i && (n = n.substring(1, n.length - 1)), { type: "codespan", raw: t[0], text: n };
    }
  }
  br(e) {
    let t = this.rules.inline.br.exec(e);
    if (t) return { type: "br", raw: t[0] };
  }
  del(e) {
    let t = this.rules.inline.del.exec(e);
    if (t) return { type: "del", raw: t[0], text: t[2], tokens: this.lexer.inlineTokens(t[2]) };
  }
  autolink(e) {
    let t = this.rules.inline.autolink.exec(e);
    if (t) {
      let n, r;
      return t[2] === "@" ? (n = t[1], r = "mailto:" + n) : (n = t[1], r = n), { type: "link", raw: t[0], text: n, href: r, tokens: [{ type: "text", raw: n, text: n }] };
    }
  }
  url(e) {
    let t;
    if (t = this.rules.inline.url.exec(e)) {
      let n, r;
      if (t[2] === "@") n = t[0], r = "mailto:" + n;
      else {
        let i;
        do
          i = t[0], t[0] = this.rules.inline._backpedal.exec(t[0])?.[0] ?? "";
        while (i !== t[0]);
        n = t[0], t[1] === "www." ? r = "http://" + t[0] : r = t[0];
      }
      return { type: "link", raw: t[0], text: n, href: r, tokens: [{ type: "text", raw: n, text: n }] };
    }
  }
  inlineText(e) {
    let t = this.rules.inline.text.exec(e);
    if (t) {
      let n = this.lexer.state.inRawBlock;
      return { type: "text", raw: t[0], text: t[0], escaped: n };
    }
  }
};
var x = class l {
  tokens;
  options;
  state;
  tokenizer;
  inlineQueue;
  constructor(e) {
    this.tokens = [], this.tokens.links = /* @__PURE__ */ Object.create(null), this.options = e || T, this.options.tokenizer = this.options.tokenizer || new y(), this.tokenizer = this.options.tokenizer, this.tokenizer.options = this.options, this.tokenizer.lexer = this, this.inlineQueue = [], this.state = { inLink: false, inRawBlock: false, top: true };
    let t = { other: m, block: C.normal, inline: M.normal };
    this.options.pedantic ? (t.block = C.pedantic, t.inline = M.pedantic) : this.options.gfm && (t.block = C.gfm, this.options.breaks ? t.inline = M.breaks : t.inline = M.gfm), this.tokenizer.rules = t;
  }
  static get rules() {
    return { block: C, inline: M };
  }
  static lex(e, t) {
    return new l(t).lex(e);
  }
  static lexInline(e, t) {
    return new l(t).inlineTokens(e);
  }
  lex(e) {
    e = e.replace(m.carriageReturn, `
`), this.blockTokens(e, this.tokens);
    for (let t = 0; t < this.inlineQueue.length; t++) {
      let n = this.inlineQueue[t];
      this.inlineTokens(n.src, n.tokens);
    }
    return this.inlineQueue = [], this.tokens;
  }
  blockTokens(e, t = [], n = false) {
    for (this.options.pedantic && (e = e.replace(m.tabCharGlobal, "    ").replace(m.spaceLine, "")); e; ) {
      let r;
      if (this.options.extensions?.block?.some((s) => (r = s.call({ lexer: this }, e, t)) ? (e = e.substring(r.raw.length), t.push(r), true) : false)) continue;
      if (r = this.tokenizer.space(e)) {
        e = e.substring(r.raw.length);
        let s = t.at(-1);
        r.raw.length === 1 && s !== void 0 ? s.raw += `
` : t.push(r);
        continue;
      }
      if (r = this.tokenizer.code(e)) {
        e = e.substring(r.raw.length);
        let s = t.at(-1);
        s?.type === "paragraph" || s?.type === "text" ? (s.raw += (s.raw.endsWith(`
`) ? "" : `
`) + r.raw, s.text += `
` + r.text, this.inlineQueue.at(-1).src = s.text) : t.push(r);
        continue;
      }
      if (r = this.tokenizer.fences(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.heading(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.hr(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.blockquote(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.list(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.html(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.def(e)) {
        e = e.substring(r.raw.length);
        let s = t.at(-1);
        s?.type === "paragraph" || s?.type === "text" ? (s.raw += (s.raw.endsWith(`
`) ? "" : `
`) + r.raw, s.text += `
` + r.raw, this.inlineQueue.at(-1).src = s.text) : this.tokens.links[r.tag] || (this.tokens.links[r.tag] = { href: r.href, title: r.title }, t.push(r));
        continue;
      }
      if (r = this.tokenizer.table(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.lheading(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      let i = e;
      if (this.options.extensions?.startBlock) {
        let s = 1 / 0, a = e.slice(1), o;
        this.options.extensions.startBlock.forEach((p) => {
          o = p.call({ lexer: this }, a), typeof o == "number" && o >= 0 && (s = Math.min(s, o));
        }), s < 1 / 0 && s >= 0 && (i = e.substring(0, s + 1));
      }
      if (this.state.top && (r = this.tokenizer.paragraph(i))) {
        let s = t.at(-1);
        n && s?.type === "paragraph" ? (s.raw += (s.raw.endsWith(`
`) ? "" : `
`) + r.raw, s.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = s.text) : t.push(r), n = i.length !== e.length, e = e.substring(r.raw.length);
        continue;
      }
      if (r = this.tokenizer.text(e)) {
        e = e.substring(r.raw.length);
        let s = t.at(-1);
        s?.type === "text" ? (s.raw += (s.raw.endsWith(`
`) ? "" : `
`) + r.raw, s.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = s.text) : t.push(r);
        continue;
      }
      if (e) {
        let s = "Infinite loop on byte: " + e.charCodeAt(0);
        if (this.options.silent) {
          console.error(s);
          break;
        } else throw new Error(s);
      }
    }
    return this.state.top = true, t;
  }
  inline(e, t = []) {
    return this.inlineQueue.push({ src: e, tokens: t }), t;
  }
  inlineTokens(e, t = []) {
    let n = e, r = null;
    if (this.tokens.links) {
      let o = Object.keys(this.tokens.links);
      if (o.length > 0) for (; (r = this.tokenizer.rules.inline.reflinkSearch.exec(n)) != null; ) o.includes(r[0].slice(r[0].lastIndexOf("[") + 1, -1)) && (n = n.slice(0, r.index) + "[" + "a".repeat(r[0].length - 2) + "]" + n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex));
    }
    for (; (r = this.tokenizer.rules.inline.anyPunctuation.exec(n)) != null; ) n = n.slice(0, r.index) + "++" + n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);
    let i;
    for (; (r = this.tokenizer.rules.inline.blockSkip.exec(n)) != null; ) i = r[2] ? r[2].length : 0, n = n.slice(0, r.index + i) + "[" + "a".repeat(r[0].length - i - 2) + "]" + n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);
    n = this.options.hooks?.emStrongMask?.call({ lexer: this }, n) ?? n;
    let s = false, a = "";
    for (; e; ) {
      s || (a = ""), s = false;
      let o;
      if (this.options.extensions?.inline?.some((u) => (o = u.call({ lexer: this }, e, t)) ? (e = e.substring(o.raw.length), t.push(o), true) : false)) continue;
      if (o = this.tokenizer.escape(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.tag(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.link(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.reflink(e, this.tokens.links)) {
        e = e.substring(o.raw.length);
        let u = t.at(-1);
        o.type === "text" && u?.type === "text" ? (u.raw += o.raw, u.text += o.text) : t.push(o);
        continue;
      }
      if (o = this.tokenizer.emStrong(e, n, a)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.codespan(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.br(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.del(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.autolink(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (!this.state.inLink && (o = this.tokenizer.url(e))) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      let p = e;
      if (this.options.extensions?.startInline) {
        let u = 1 / 0, c = e.slice(1), g;
        this.options.extensions.startInline.forEach((h) => {
          g = h.call({ lexer: this }, c), typeof g == "number" && g >= 0 && (u = Math.min(u, g));
        }), u < 1 / 0 && u >= 0 && (p = e.substring(0, u + 1));
      }
      if (o = this.tokenizer.inlineText(p)) {
        e = e.substring(o.raw.length), o.raw.slice(-1) !== "_" && (a = o.raw.slice(-1)), s = true;
        let u = t.at(-1);
        u?.type === "text" ? (u.raw += o.raw, u.text += o.text) : t.push(o);
        continue;
      }
      if (e) {
        let u = "Infinite loop on byte: " + e.charCodeAt(0);
        if (this.options.silent) {
          console.error(u);
          break;
        } else throw new Error(u);
      }
    }
    return t;
  }
};
var P = class {
  options;
  parser;
  constructor(e) {
    this.options = e || T;
  }
  space(e) {
    return "";
  }
  code({ text: e, lang: t, escaped: n }) {
    let r = (t || "").match(m.notSpaceStart)?.[0], i = e.replace(m.endingNewline, "") + `
`;
    return r ? '<pre><code class="language-' + w(r) + '">' + (n ? i : w(i, true)) + `</code></pre>
` : "<pre><code>" + (n ? i : w(i, true)) + `</code></pre>
`;
  }
  blockquote({ tokens: e }) {
    return `<blockquote>
${this.parser.parse(e)}</blockquote>
`;
  }
  html({ text: e }) {
    return e;
  }
  def(e) {
    return "";
  }
  heading({ tokens: e, depth: t }) {
    return `<h${t}>${this.parser.parseInline(e)}</h${t}>
`;
  }
  hr(e) {
    return `<hr>
`;
  }
  list(e) {
    let t = e.ordered, n = e.start, r = "";
    for (let a = 0; a < e.items.length; a++) {
      let o = e.items[a];
      r += this.listitem(o);
    }
    let i = t ? "ol" : "ul", s = t && n !== 1 ? ' start="' + n + '"' : "";
    return "<" + i + s + `>
` + r + "</" + i + `>
`;
  }
  listitem(e) {
    let t = "";
    if (e.task) {
      let n = this.checkbox({ checked: !!e.checked });
      e.loose ? e.tokens[0]?.type === "paragraph" ? (e.tokens[0].text = n + " " + e.tokens[0].text, e.tokens[0].tokens && e.tokens[0].tokens.length > 0 && e.tokens[0].tokens[0].type === "text" && (e.tokens[0].tokens[0].text = n + " " + w(e.tokens[0].tokens[0].text), e.tokens[0].tokens[0].escaped = true)) : e.tokens.unshift({ type: "text", raw: n + " ", text: n + " ", escaped: true }) : t += n + " ";
    }
    return t += this.parser.parse(e.tokens, !!e.loose), `<li>${t}</li>
`;
  }
  checkbox({ checked: e }) {
    return "<input " + (e ? 'checked="" ' : "") + 'disabled="" type="checkbox">';
  }
  paragraph({ tokens: e }) {
    return `<p>${this.parser.parseInline(e)}</p>
`;
  }
  table(e) {
    let t = "", n = "";
    for (let i = 0; i < e.header.length; i++) n += this.tablecell(e.header[i]);
    t += this.tablerow({ text: n });
    let r = "";
    for (let i = 0; i < e.rows.length; i++) {
      let s = e.rows[i];
      n = "";
      for (let a = 0; a < s.length; a++) n += this.tablecell(s[a]);
      r += this.tablerow({ text: n });
    }
    return r && (r = `<tbody>${r}</tbody>`), `<table>
<thead>
` + t + `</thead>
` + r + `</table>
`;
  }
  tablerow({ text: e }) {
    return `<tr>
${e}</tr>
`;
  }
  tablecell(e) {
    let t = this.parser.parseInline(e.tokens), n = e.header ? "th" : "td";
    return (e.align ? `<${n} align="${e.align}">` : `<${n}>`) + t + `</${n}>
`;
  }
  strong({ tokens: e }) {
    return `<strong>${this.parser.parseInline(e)}</strong>`;
  }
  em({ tokens: e }) {
    return `<em>${this.parser.parseInline(e)}</em>`;
  }
  codespan({ text: e }) {
    return `<code>${w(e, true)}</code>`;
  }
  br(e) {
    return "<br>";
  }
  del({ tokens: e }) {
    return `<del>${this.parser.parseInline(e)}</del>`;
  }
  link({ href: e, title: t, tokens: n }) {
    let r = this.parser.parseInline(n), i = J(e);
    if (i === null) return r;
    e = i;
    let s = '<a href="' + e + '"';
    return t && (s += ' title="' + w(t) + '"'), s += ">" + r + "</a>", s;
  }
  image({ href: e, title: t, text: n, tokens: r }) {
    r && (n = this.parser.parseInline(r, this.parser.textRenderer));
    let i = J(e);
    if (i === null) return w(n);
    e = i;
    let s = `<img src="${e}" alt="${n}"`;
    return t && (s += ` title="${w(t)}"`), s += ">", s;
  }
  text(e) {
    return "tokens" in e && e.tokens ? this.parser.parseInline(e.tokens) : "escaped" in e && e.escaped ? e.text : w(e.text);
  }
};
var $ = class {
  strong({ text: e }) {
    return e;
  }
  em({ text: e }) {
    return e;
  }
  codespan({ text: e }) {
    return e;
  }
  del({ text: e }) {
    return e;
  }
  html({ text: e }) {
    return e;
  }
  text({ text: e }) {
    return e;
  }
  link({ text: e }) {
    return "" + e;
  }
  image({ text: e }) {
    return "" + e;
  }
  br() {
    return "";
  }
};
var b = class l2 {
  options;
  renderer;
  textRenderer;
  constructor(e) {
    this.options = e || T, this.options.renderer = this.options.renderer || new P(), this.renderer = this.options.renderer, this.renderer.options = this.options, this.renderer.parser = this, this.textRenderer = new $();
  }
  static parse(e, t) {
    return new l2(t).parse(e);
  }
  static parseInline(e, t) {
    return new l2(t).parseInline(e);
  }
  parse(e, t = true) {
    let n = "";
    for (let r = 0; r < e.length; r++) {
      let i = e[r];
      if (this.options.extensions?.renderers?.[i.type]) {
        let a = i, o = this.options.extensions.renderers[a.type].call({ parser: this }, a);
        if (o !== false || !["space", "hr", "heading", "code", "table", "blockquote", "list", "html", "def", "paragraph", "text"].includes(a.type)) {
          n += o || "";
          continue;
        }
      }
      let s = i;
      switch (s.type) {
        case "space": {
          n += this.renderer.space(s);
          continue;
        }
        case "hr": {
          n += this.renderer.hr(s);
          continue;
        }
        case "heading": {
          n += this.renderer.heading(s);
          continue;
        }
        case "code": {
          n += this.renderer.code(s);
          continue;
        }
        case "table": {
          n += this.renderer.table(s);
          continue;
        }
        case "blockquote": {
          n += this.renderer.blockquote(s);
          continue;
        }
        case "list": {
          n += this.renderer.list(s);
          continue;
        }
        case "html": {
          n += this.renderer.html(s);
          continue;
        }
        case "def": {
          n += this.renderer.def(s);
          continue;
        }
        case "paragraph": {
          n += this.renderer.paragraph(s);
          continue;
        }
        case "text": {
          let a = s, o = this.renderer.text(a);
          for (; r + 1 < e.length && e[r + 1].type === "text"; ) a = e[++r], o += `
` + this.renderer.text(a);
          t ? n += this.renderer.paragraph({ type: "paragraph", raw: o, text: o, tokens: [{ type: "text", raw: o, text: o, escaped: true }] }) : n += o;
          continue;
        }
        default: {
          let a = 'Token with "' + s.type + '" type was not found.';
          if (this.options.silent) return console.error(a), "";
          throw new Error(a);
        }
      }
    }
    return n;
  }
  parseInline(e, t = this.renderer) {
    let n = "";
    for (let r = 0; r < e.length; r++) {
      let i = e[r];
      if (this.options.extensions?.renderers?.[i.type]) {
        let a = this.options.extensions.renderers[i.type].call({ parser: this }, i);
        if (a !== false || !["escape", "html", "link", "image", "strong", "em", "codespan", "br", "del", "text"].includes(i.type)) {
          n += a || "";
          continue;
        }
      }
      let s = i;
      switch (s.type) {
        case "escape": {
          n += t.text(s);
          break;
        }
        case "html": {
          n += t.html(s);
          break;
        }
        case "link": {
          n += t.link(s);
          break;
        }
        case "image": {
          n += t.image(s);
          break;
        }
        case "strong": {
          n += t.strong(s);
          break;
        }
        case "em": {
          n += t.em(s);
          break;
        }
        case "codespan": {
          n += t.codespan(s);
          break;
        }
        case "br": {
          n += t.br(s);
          break;
        }
        case "del": {
          n += t.del(s);
          break;
        }
        case "text": {
          n += t.text(s);
          break;
        }
        default: {
          let a = 'Token with "' + s.type + '" type was not found.';
          if (this.options.silent) return console.error(a), "";
          throw new Error(a);
        }
      }
    }
    return n;
  }
};
var S = class {
  options;
  block;
  constructor(e) {
    this.options = e || T;
  }
  static passThroughHooks = /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens", "emStrongMask"]);
  static passThroughHooksRespectAsync = /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens"]);
  preprocess(e) {
    return e;
  }
  postprocess(e) {
    return e;
  }
  processAllTokens(e) {
    return e;
  }
  emStrongMask(e) {
    return e;
  }
  provideLexer() {
    return this.block ? x.lex : x.lexInline;
  }
  provideParser() {
    return this.block ? b.parse : b.parseInline;
  }
};
var B = class {
  defaults = L();
  options = this.setOptions;
  parse = this.parseMarkdown(true);
  parseInline = this.parseMarkdown(false);
  Parser = b;
  Renderer = P;
  TextRenderer = $;
  Lexer = x;
  Tokenizer = y;
  Hooks = S;
  constructor(...e) {
    this.use(...e);
  }
  walkTokens(e, t) {
    let n = [];
    for (let r of e) switch (n = n.concat(t.call(this, r)), r.type) {
      case "table": {
        let i = r;
        for (let s of i.header) n = n.concat(this.walkTokens(s.tokens, t));
        for (let s of i.rows) for (let a of s) n = n.concat(this.walkTokens(a.tokens, t));
        break;
      }
      case "list": {
        let i = r;
        n = n.concat(this.walkTokens(i.items, t));
        break;
      }
      default: {
        let i = r;
        this.defaults.extensions?.childTokens?.[i.type] ? this.defaults.extensions.childTokens[i.type].forEach((s) => {
          let a = i[s].flat(1 / 0);
          n = n.concat(this.walkTokens(a, t));
        }) : i.tokens && (n = n.concat(this.walkTokens(i.tokens, t)));
      }
    }
    return n;
  }
  use(...e) {
    let t = this.defaults.extensions || { renderers: {}, childTokens: {} };
    return e.forEach((n) => {
      let r = { ...n };
      if (r.async = this.defaults.async || r.async || false, n.extensions && (n.extensions.forEach((i) => {
        if (!i.name) throw new Error("extension name required");
        if ("renderer" in i) {
          let s = t.renderers[i.name];
          s ? t.renderers[i.name] = function(...a) {
            let o = i.renderer.apply(this, a);
            return o === false && (o = s.apply(this, a)), o;
          } : t.renderers[i.name] = i.renderer;
        }
        if ("tokenizer" in i) {
          if (!i.level || i.level !== "block" && i.level !== "inline") throw new Error("extension level must be 'block' or 'inline'");
          let s = t[i.level];
          s ? s.unshift(i.tokenizer) : t[i.level] = [i.tokenizer], i.start && (i.level === "block" ? t.startBlock ? t.startBlock.push(i.start) : t.startBlock = [i.start] : i.level === "inline" && (t.startInline ? t.startInline.push(i.start) : t.startInline = [i.start]));
        }
        "childTokens" in i && i.childTokens && (t.childTokens[i.name] = i.childTokens);
      }), r.extensions = t), n.renderer) {
        let i = this.defaults.renderer || new P(this.defaults);
        for (let s in n.renderer) {
          if (!(s in i)) throw new Error(`renderer '${s}' does not exist`);
          if (["options", "parser"].includes(s)) continue;
          let a = s, o = n.renderer[a], p = i[a];
          i[a] = (...u) => {
            let c = o.apply(i, u);
            return c === false && (c = p.apply(i, u)), c || "";
          };
        }
        r.renderer = i;
      }
      if (n.tokenizer) {
        let i = this.defaults.tokenizer || new y(this.defaults);
        for (let s in n.tokenizer) {
          if (!(s in i)) throw new Error(`tokenizer '${s}' does not exist`);
          if (["options", "rules", "lexer"].includes(s)) continue;
          let a = s, o = n.tokenizer[a], p = i[a];
          i[a] = (...u) => {
            let c = o.apply(i, u);
            return c === false && (c = p.apply(i, u)), c;
          };
        }
        r.tokenizer = i;
      }
      if (n.hooks) {
        let i = this.defaults.hooks || new S();
        for (let s in n.hooks) {
          if (!(s in i)) throw new Error(`hook '${s}' does not exist`);
          if (["options", "block"].includes(s)) continue;
          let a = s, o = n.hooks[a], p = i[a];
          S.passThroughHooks.has(s) ? i[a] = (u) => {
            if (this.defaults.async && S.passThroughHooksRespectAsync.has(s)) return (async () => {
              let g = await o.call(i, u);
              return p.call(i, g);
            })();
            let c = o.call(i, u);
            return p.call(i, c);
          } : i[a] = (...u) => {
            if (this.defaults.async) return (async () => {
              let g = await o.apply(i, u);
              return g === false && (g = await p.apply(i, u)), g;
            })();
            let c = o.apply(i, u);
            return c === false && (c = p.apply(i, u)), c;
          };
        }
        r.hooks = i;
      }
      if (n.walkTokens) {
        let i = this.defaults.walkTokens, s = n.walkTokens;
        r.walkTokens = function(a) {
          let o = [];
          return o.push(s.call(this, a)), i && (o = o.concat(i.call(this, a))), o;
        };
      }
      this.defaults = { ...this.defaults, ...r };
    }), this;
  }
  setOptions(e) {
    return this.defaults = { ...this.defaults, ...e }, this;
  }
  lexer(e, t) {
    return x.lex(e, t ?? this.defaults);
  }
  parser(e, t) {
    return b.parse(e, t ?? this.defaults);
  }
  parseMarkdown(e) {
    return (n, r) => {
      let i = { ...r }, s = { ...this.defaults, ...i }, a = this.onError(!!s.silent, !!s.async);
      if (this.defaults.async === true && i.async === false) return a(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));
      if (typeof n > "u" || n === null) return a(new Error("marked(): input parameter is undefined or null"));
      if (typeof n != "string") return a(new Error("marked(): input parameter is of type " + Object.prototype.toString.call(n) + ", string expected"));
      if (s.hooks && (s.hooks.options = s, s.hooks.block = e), s.async) return (async () => {
        let o = s.hooks ? await s.hooks.preprocess(n) : n, u = await (s.hooks ? await s.hooks.provideLexer() : e ? x.lex : x.lexInline)(o, s), c = s.hooks ? await s.hooks.processAllTokens(u) : u;
        s.walkTokens && await Promise.all(this.walkTokens(c, s.walkTokens));
        let h = await (s.hooks ? await s.hooks.provideParser() : e ? b.parse : b.parseInline)(c, s);
        return s.hooks ? await s.hooks.postprocess(h) : h;
      })().catch(a);
      try {
        s.hooks && (n = s.hooks.preprocess(n));
        let p = (s.hooks ? s.hooks.provideLexer() : e ? x.lex : x.lexInline)(n, s);
        s.hooks && (p = s.hooks.processAllTokens(p)), s.walkTokens && this.walkTokens(p, s.walkTokens);
        let c = (s.hooks ? s.hooks.provideParser() : e ? b.parse : b.parseInline)(p, s);
        return s.hooks && (c = s.hooks.postprocess(c)), c;
      } catch (o) {
        return a(o);
      }
    };
  }
  onError(e, t) {
    return (n) => {
      if (n.message += `
Please report this to https://github.com/markedjs/marked.`, e) {
        let r = "<p>An error occurred:</p><pre>" + w(n.message + "", true) + "</pre>";
        return t ? Promise.resolve(r) : r;
      }
      if (t) return Promise.reject(n);
      throw n;
    };
  }
};
var _ = new B();
function k(l3, e) {
  return _.parse(l3, e);
}
k.options = k.setOptions = function(l3) {
  return _.setOptions(l3), k.defaults = _.defaults, G(k.defaults), k;
};
k.getDefaults = L;
k.defaults = T;
k.use = function(...l3) {
  return _.use(...l3), k.defaults = _.defaults, G(k.defaults), k;
};
k.walkTokens = function(l3, e) {
  return _.walkTokens(l3, e);
};
k.parseInline = _.parseInline;
k.Parser = b;
k.parser = b.parse;
k.Renderer = P;
k.TextRenderer = $;
k.Lexer = x;
k.lexer = x.lex;
k.Tokenizer = y;
k.Hooks = S;
k.parse = k;
var Zt = k.options;
var Gt = k.setOptions;
var Nt = k.use;
var Ft = k.walkTokens;
var jt = k.parseInline;
var Ut = b.parse;
var Kt = x.lex;

// src/show.ts
function formatConversationAsMarkdown(jsonl, startLine, endLine) {
  const allLines = jsonl.trim().split("\n").filter((line) => line.trim());
  const lines = startLine !== void 0 || endLine !== void 0 ? allLines.slice(
    startLine !== void 0 ? startLine - 1 : 0,
    endLine !== void 0 ? endLine : void 0
  ) : allLines;
  if (isCodexRollout(lines)) {
    return formatCodexConversationAsMarkdown(lines);
  }
  const allMessages = lines.map((line) => JSON.parse(line));
  const messages = allMessages.filter((msg) => {
    if (msg.type !== "user" && msg.type !== "assistant") return false;
    if (!msg.timestamp) return false;
    if (!msg.message?.content) {
      if (msg.type === "assistant" && msg.message?.usage) return true;
      return false;
    }
    if (Array.isArray(msg.message.content) && msg.message.content.length === 0) {
      if (msg.type === "assistant" && msg.message?.usage) return true;
      return false;
    }
    return true;
  });
  if (messages.length === 0) {
    return "";
  }
  const firstMessage = messages[0];
  if (!firstMessage) {
    return "";
  }
  let output = "# Conversation\n\n";
  output += "## Metadata\n\n";
  if (firstMessage.sessionId) {
    output += `**Session ID:** ${firstMessage.sessionId}

`;
  }
  if (firstMessage.gitBranch) {
    output += `**Git Branch:** ${firstMessage.gitBranch}

`;
  }
  if (firstMessage.gitCommit) {
    output += `**Git Commit:** ${firstMessage.gitCommit}

`;
  }
  if (firstMessage.cwd) {
    output += `**Working Directory:** ${firstMessage.cwd}

`;
  }
  if (firstMessage.version) {
    output += `**Claude Code Version:** ${firstMessage.version}

`;
  }
  output += "---\n\n";
  output += "## Messages\n\n";
  let inSidechain = false;
  for (const [i, msg] of messages.entries()) {
    const timestamp = new Date(msg.timestamp).toLocaleString();
    const messageId = msg.uuid || `msg-${i}`;
    if (msg.type === "user" && Array.isArray(msg.message.content)) {
      const hasOnlyToolResults = msg.message.content.every((block) => block.type === "tool_result");
      if (hasOnlyToolResults) {
        continue;
      }
    }
    if (msg.isSidechain && !inSidechain) {
      output += "\n---\n";
      output += "**\u{1F500} SIDECHAIN START**\n";
      output += "---\n\n";
      inSidechain = true;
    } else if (!msg.isSidechain && inSidechain) {
      output += "\n---\n";
      output += "**\u{1F500} SIDECHAIN END**\n";
      output += "---\n\n";
      inSidechain = false;
    }
    let roleLabel;
    if (msg.isSidechain) {
      roleLabel = msg.type === "user" ? "Agent" : "Subagent";
    } else {
      roleLabel = msg.type === "user" ? "User" : "Agent";
    }
    output += `### **${roleLabel}** (${timestamp}) {#${messageId}}

`;
    if (msg.type === "user") {
      if (msg.toolUseResult) {
        output += "**Tool Result:**\n\n";
        if (typeof msg.toolUseResult === "string") {
          output += `${msg.toolUseResult}

`;
        } else if (Array.isArray(msg.toolUseResult)) {
          for (const result of msg.toolUseResult) {
            output += `${result.text || String(result)}

`;
          }
        }
      } else if (typeof msg.message.content === "string") {
        output += `${msg.message.content}

`;
      } else if (Array.isArray(msg.message.content)) {
        for (const block of msg.message.content) {
          if (block.type === "text" && block.text) {
            output += `${block.text}

`;
          }
        }
      }
    } else if (msg.type === "assistant") {
      const content = msg.message.content;
      if (typeof content === "string") {
        output += `${content}

`;
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "text" && block.text) {
            output += `${block.text}

`;
          } else if (block.type === "tool_use") {
            output += `**Tool Use:** \`${block.name}\`

`;
            const input = block.input;
            if (input && typeof input === "object") {
              for (const [key, value] of Object.entries(input)) {
                if (typeof value === "string" && value.includes("\n")) {
                  output += `- **${key}:**
\`\`\`
${value}
\`\`\`
`;
                } else if (typeof value === "string") {
                  output += `- **${key}:** ${value}
`;
                } else {
                  output += `- **${key}:**
\`\`\`json
${JSON.stringify(value, null, 2)}
\`\`\`
`;
                }
              }
              output += "\n";
            }
            const toolUseId = block.id;
            if (toolUseId) {
              let foundResult = false;
              for (let j2 = i + 1; j2 < Math.min(i + 6, messages.length) && !foundResult; j2++) {
                const laterMsg = messages[j2];
                if (laterMsg && laterMsg.type === "user" && Array.isArray(laterMsg.message.content)) {
                  for (const resultBlock of laterMsg.message.content) {
                    if (resultBlock.type === "tool_result" && resultBlock.tool_use_id === toolUseId) {
                      const content2 = resultBlock.content;
                      output += "**Result:**\n";
                      if (typeof content2 === "string") {
                        if (content2.includes("\n") || content2.length > 100) {
                          output += "```\n";
                          output += content2;
                          output += "\n```\n\n";
                        } else {
                          output += `${content2}

`;
                        }
                      } else if (Array.isArray(content2)) {
                        output += "```json\n";
                        output += JSON.stringify(content2, null, 2);
                        output += "\n```\n\n";
                      }
                      foundResult = true;
                      break;
                    }
                  }
                }
              }
            }
          }
        }
      }
      if (msg.message.usage) {
        const usage = msg.message.usage;
        output += `_in: ${(usage.input_tokens || 0).toLocaleString()}`;
        if (usage.cache_read_input_tokens) {
          output += ` | cache read: ${usage.cache_read_input_tokens.toLocaleString()}`;
        }
        if (usage.cache_creation_input_tokens) {
          output += ` | cache create: ${usage.cache_creation_input_tokens.toLocaleString()}`;
        }
        output += ` | out: ${(usage.output_tokens || 0).toLocaleString()}_

`;
      }
    }
  }
  if (inSidechain) {
    output += "\n---\n";
    output += "**\u{1F500} SIDECHAIN END**\n";
    output += "---\n\n";
  }
  return output;
}
function formatConversationAsHTML(jsonl) {
  const lines = jsonl.trim().split("\n").filter((line) => line.trim());
  if (isCodexRollout(lines)) {
    return formatMarkdownDocumentAsHTML(formatCodexConversationAsMarkdown(lines));
  }
  const allMessages = lines.map((line) => JSON.parse(line));
  const messages = allMessages.filter((msg) => {
    if (msg.type !== "user" && msg.type !== "assistant") return false;
    if (!msg.timestamp) return false;
    if (!msg.message?.content) {
      if (msg.type === "assistant" && msg.message?.usage) return true;
      return false;
    }
    if (Array.isArray(msg.message.content) && msg.message.content.length === 0) {
      if (msg.type === "assistant" && msg.message?.usage) return true;
      return false;
    }
    return true;
  });
  if (messages.length === 0) {
    return "";
  }
  const firstMessage = messages[0];
  if (!firstMessage) {
    return "";
  }
  let bodyContent = "";
  bodyContent += '<div class="header">';
  bodyContent += "<h1>Conversation</h1>";
  bodyContent += '<table class="metadata">';
  if (firstMessage.sessionId) {
    bodyContent += `<tr><th>Session ID</th><td>${escapeHtml(firstMessage.sessionId)}</td></tr>`;
  }
  if (firstMessage.gitBranch) {
    bodyContent += `<tr><th>Git Branch</th><td>${escapeHtml(firstMessage.gitBranch)}</td></tr>`;
  }
  if (firstMessage.gitCommit) {
    bodyContent += `<tr><th>Git Commit</th><td>${escapeHtml(firstMessage.gitCommit)}</td></tr>`;
  }
  if (firstMessage.cwd) {
    bodyContent += `<tr><th>Working Directory</th><td>${escapeHtml(firstMessage.cwd)}</td></tr>`;
  }
  if (firstMessage.version) {
    bodyContent += `<tr><th>Claude Code Version</th><td>${escapeHtml(firstMessage.version)}</td></tr>`;
  }
  bodyContent += "</table></div>";
  bodyContent += '<div class="messages">';
  const toolUseMap = /* @__PURE__ */ new Map();
  for (const msg of messages) {
    if (msg.type === "assistant" && Array.isArray(msg.message.content)) {
      for (const block of msg.message.content) {
        if (block.type === "tool_use" && block.id) {
          toolUseMap.set(block.id, { msg, block });
        }
      }
    }
  }
  let inSidechain = false;
  for (const [i, msg] of messages.entries()) {
    const timestamp = new Date(msg.timestamp).toLocaleString();
    const messageId = `msg-${msg.uuid || i}`;
    if (msg.type === "user" && Array.isArray(msg.message.content)) {
      const hasOnlyToolResults = msg.message.content.every((block) => block.type === "tool_result");
      if (hasOnlyToolResults) {
        continue;
      }
    }
    if (msg.isSidechain && !inSidechain) {
      bodyContent += '<div class="sidechain-group">';
      inSidechain = true;
    } else if (!msg.isSidechain && inSidechain) {
      bodyContent += "</div>";
      inSidechain = false;
    }
    const messageClass = msg.type === "user" ? "message user-message" : "message assistant-message";
    let roleLabel;
    if (msg.isSidechain) {
      roleLabel = msg.type === "user" ? "Agent" : "Subagent";
    } else {
      roleLabel = msg.type === "user" ? "User" : "Agent";
    }
    bodyContent += `<div class="${messageClass}" id="${messageId}">`;
    bodyContent += `<div class="message-header">`;
    bodyContent += `<span class="role">${roleLabel}</span>`;
    bodyContent += `<a href="#${messageId}" class="timestamp">${escapeHtml(timestamp)}</a>`;
    bodyContent += `</div>`;
    bodyContent += `<div class="message-content">`;
    if (msg.type === "user") {
      if (msg.toolUseResult) {
        bodyContent += '<div class="tool-result">';
        bodyContent += "<strong>Tool Result:</strong>";
        if (typeof msg.toolUseResult === "string") {
          bodyContent += `<p>${escapeHtml(msg.toolUseResult)}</p>`;
        } else if (Array.isArray(msg.toolUseResult)) {
          for (const result of msg.toolUseResult) {
            bodyContent += `<p>${escapeHtml(result.text || String(result))}</p>`;
          }
        }
        bodyContent += "</div>";
      } else if (typeof msg.message.content === "string") {
        bodyContent += `<p>${escapeHtml(msg.message.content)}</p>`;
      } else if (Array.isArray(msg.message.content)) {
        for (const block of msg.message.content) {
          if (block.type === "text" && block.text) {
            bodyContent += `<p>${escapeHtml(block.text)}</p>`;
          } else if (block.type === "tool_result") {
            bodyContent += '<div class="tool-result">';
            bodyContent += "<strong>Tool Result:</strong> ";
            bodyContent += `<code>${escapeHtml(String(block.content || ""))}</code>`;
            bodyContent += "</div>";
          }
        }
      }
    } else if (msg.type === "assistant") {
      const content = msg.message.content;
      if (typeof content === "string") {
        bodyContent += `<p>${escapeHtml(content)}</p>`;
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "text" && block.text) {
            if (isMarkdown(block.text)) {
              bodyContent += '<div class="markdown-content">';
              bodyContent += renderMarkdownSafely(block.text);
              bodyContent += "</div>";
            } else {
              bodyContent += `<div class="plain-content">${escapeHtml(block.text)}</div>`;
            }
          } else if (block.type === "tool_use") {
            bodyContent += '<div class="tool-use">';
            bodyContent += `<div class="tool-name"><strong>Tool Use:</strong> <code>${escapeHtml(block.name || "")}</code></div>`;
            const input = block.input;
            if (input && typeof input === "object") {
              bodyContent += '<div class="tool-params">';
              for (const [key, value] of Object.entries(input)) {
                bodyContent += `<div class="tool-param">`;
                bodyContent += `<strong>${escapeHtml(key)}:</strong> `;
                if (typeof value === "string") {
                  if (value.includes("\n") || value.length > 100) {
                    bodyContent += "<pre>";
                    bodyContent += escapeHtml(value);
                    bodyContent += "</pre>";
                  } else {
                    bodyContent += escapeHtml(value);
                  }
                } else {
                  bodyContent += "<pre>";
                  bodyContent += escapeHtml(JSON.stringify(value, null, 2));
                  bodyContent += "</pre>";
                }
                bodyContent += "</div>";
              }
              bodyContent += "</div>";
            }
            const toolUseId = block.id;
            if (toolUseId) {
              let foundResult = false;
              for (let j2 = i + 1; j2 < Math.min(i + 6, messages.length) && !foundResult; j2++) {
                const laterMsg = messages[j2];
                if (laterMsg && laterMsg.type === "user" && Array.isArray(laterMsg.message.content)) {
                  for (const resultBlock of laterMsg.message.content) {
                    if (resultBlock.type === "tool_result" && resultBlock.tool_use_id === toolUseId) {
                      bodyContent += '<div class="tool-result">';
                      bodyContent += "<strong>Result:</strong> ";
                      const content2 = resultBlock.content;
                      if (typeof content2 === "string") {
                        if (content2.includes("\n") || content2.length > 100) {
                          bodyContent += "<pre>";
                          bodyContent += escapeHtml(content2);
                          bodyContent += "</pre>";
                        } else {
                          bodyContent += escapeHtml(content2);
                        }
                      } else if (Array.isArray(content2)) {
                        bodyContent += "<pre>";
                        bodyContent += escapeHtml(JSON.stringify(content2, null, 2));
                        bodyContent += "</pre>";
                      }
                      bodyContent += "</div>";
                      foundResult = true;
                      break;
                    }
                  }
                }
              }
            }
            bodyContent += "</div>";
          }
        }
      }
      if (msg.message.usage) {
        const usage = msg.message.usage;
        bodyContent += '<div class="token-usage">';
        bodyContent += `in: ${(usage.input_tokens || 0).toLocaleString()}`;
        if (usage.cache_read_input_tokens) {
          bodyContent += ` | cache read: ${usage.cache_read_input_tokens.toLocaleString()}`;
        }
        if (usage.cache_creation_input_tokens) {
          bodyContent += ` | cache create: ${usage.cache_creation_input_tokens.toLocaleString()}`;
        }
        bodyContent += ` | out: ${(usage.output_tokens || 0).toLocaleString()}`;
        bodyContent += "</div>";
      }
    }
    bodyContent += "</div></div>";
  }
  if (inSidechain) {
    bodyContent += "</div>";
  }
  bodyContent += "</div>";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Conversation</title>
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
      max-width: 900px;
      margin: 0 auto;
      padding: 24px;
      line-height: 1.5;
      color: #1d1d1f;
      background: #f5f5f7;
    }
    .header {
      margin-bottom: 32px;
      padding: 24px;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .header h1 {
      margin: 0 0 20px 0;
      font-size: 28px;
      font-weight: 600;
      color: #1d1d1f;
    }
    .metadata {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .metadata th {
      text-align: left;
      padding: 10px 0;
      color: #86868b;
      font-weight: 500;
      width: 180px;
      border-bottom: 1px solid #f5f5f7;
    }
    .metadata td {
      padding: 10px 0;
      font-family: 'SF Mono', Consolas, monospace;
      font-size: 12px;
      color: #1d1d1f;
      border-bottom: 1px solid #f5f5f7;
    }
    .messages {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .message {
      padding: 20px 24px;
      background: #ffffff;
    }
    .user-message {
      border-left: 3px solid #007aff;
    }
    .assistant-message {
      border-left: 3px solid #34c759;
    }
    .message-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 12px;
    }
    .role {
      font-weight: 600;
      font-size: 14px;
      letter-spacing: -0.01em;
    }
    .user-message .role {
      color: #007aff;
    }
    .assistant-message .role {
      color: #34c759;
    }
    .plain-content {
      white-space: pre-wrap;
      word-wrap: break-word;
      color: #1d1d1f;
      font-size: 14px;
      line-height: 1.6;
    }
    .markdown-content {
      color: #1d1d1f;
      font-size: 14px;
      line-height: 1.6;
    }
    .markdown-content p {
      margin: 0 0 12px 0;
    }
    .markdown-content p:last-child {
      margin-bottom: 0;
    }
    .markdown-content h1, .markdown-content h2, .markdown-content h3 {
      margin: 20px 0 12px 0;
      font-weight: 600;
      color: #1d1d1f;
    }
    .markdown-content h1 {
      font-size: 20px;
      border-bottom: 1px solid #e5e5e7;
      padding-bottom: 8px;
    }
    .markdown-content h2 {
      font-size: 18px;
    }
    .markdown-content h3 {
      font-size: 16px;
    }
    .markdown-content ul, .markdown-content ol {
      margin: 12px 0;
      padding-left: 24px;
    }
    .markdown-content li {
      margin: 4px 0;
    }
    .markdown-content code {
      background: #f5f5f7;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'SF Mono', Consolas, monospace;
      font-size: 13px;
      color: #5e5ce6;
    }
    .markdown-content pre {
      margin: 12px 0;
      background: #1d1d1f;
      color: #f5f5f7;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      line-height: 1.5;
    }
    .markdown-content pre code {
      background: none;
      color: #f5f5f7;
      padding: 0;
      font-size: 12px;
    }
    .markdown-content blockquote {
      margin: 12px 0;
      padding-left: 16px;
      border-left: 3px solid #e5e5e7;
      color: #6e6e73;
    }
    .markdown-content strong {
      font-weight: 600;
      color: #1d1d1f;
    }
    .markdown-content a {
      color: #007aff;
      text-decoration: none;
    }
    .markdown-content a:hover {
      text-decoration: underline;
    }
    .timestamp {
      font-size: 11px;
      color: #86868b;
      font-weight: 400;
      text-decoration: none;
    }
    .timestamp:hover {
      color: #007aff;
      text-decoration: underline;
    }
    .tool-use {
      margin: 16px 0;
      background: #f5f5f7;
      border-radius: 8px;
      padding: 16px;
      border: 1px solid #e5e5e7;
    }
    .tool-name {
      margin-bottom: 12px;
      font-size: 12px;
      font-weight: 600;
      color: #8e8e93;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .tool-name code {
      color: #5e5ce6;
      background: none;
      padding: 0;
      font-weight: 600;
    }
    .tool-params {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 8px;
    }
    .tool-param {
      font-size: 12px;
      font-family: 'SF Mono', Consolas, monospace;
      line-height: 1.6;
    }
    .tool-param strong {
      color: #5e5ce6;
      font-weight: 600;
    }
    .tool-param pre {
      margin: 6px 0 0 0;
      padding: 8px 12px;
      background: #ffffff;
      border: 1px solid #e5e5e7;
      border-radius: 6px;
      font-size: 11px;
      white-space: pre-wrap;
      word-wrap: break-word;
      color: #1d1d1f;
      font-family: 'SF Mono', Consolas, monospace;
      line-height: 1.5;
      overflow-x: auto;
    }
    .tool-result {
      margin-top: 8px;
      font-size: 12px;
      font-family: 'SF Mono', Consolas, monospace;
      line-height: 1.6;
    }
    .tool-result strong {
      color: #5e5ce6;
      font-weight: 600;
    }
    .tool-result pre {
      margin: 6px 0 0 0;
      padding: 8px 12px;
      background: #ffffff;
      border: 1px solid #e5e5e7;
      border-radius: 6px;
      font-size: 11px;
      white-space: pre-wrap;
      word-wrap: break-word;
      color: #1d1d1f;
      font-family: 'SF Mono', Consolas, monospace;
      line-height: 1.5;
      overflow-x: auto;
    }
    .token-usage {
      margin-top: 12px;
      font-size: 10px;
      color: #86868b;
      font-family: 'SF Mono', Consolas, monospace;
    }
    .sidechain-group {
      background: #fffbf0;
      border-left: 3px solid #ffcc00;
      border-radius: 8px;
      padding: 2px;
      margin: 8px 0;
    }
    .sidechain-group .message {
      background: #ffffff;
    }
    @media (max-width: 768px) {
      body {
        padding: 12px;
      }
      .header {
        padding: 16px;
      }
      .message {
        padding: 16px;
      }
    }
  </style>
</head>
<body>
${bodyContent}
</body>
</html>`;
}
function isCodexRollout(lines) {
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      return Boolean(
        parsed.payload && (parsed.type === "session_meta" || parsed.type === "turn_context" || parsed.type === "response_item" || parsed.type === "event_msg" || parsed.type === "compacted")
      );
    } catch {
    }
  }
  return false;
}
function extractCodexText(content) {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content.filter(
    (block) => block && typeof block === "object" && typeof block.text === "string"
  ).map((block) => block.text).join("\n");
}
function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
function codexToolInput(payload) {
  if (typeof payload.arguments === "string") {
    return safeParseJson(payload.arguments);
  }
  if (payload.arguments !== void 0) {
    return payload.arguments;
  }
  if (payload.input !== void 0) {
    return payload.input;
  }
  if (payload.action !== void 0) {
    return payload.action;
  }
  return void 0;
}
function codexToolOutput(payload) {
  if (payload.output === void 0 || payload.output === null) {
    return "";
  }
  if (typeof payload.output === "string") {
    return payload.output;
  }
  const text = extractCodexText(payload.output);
  return text.trim() ? text : JSON.stringify(payload.output, null, 2);
}
function formatCodexToolInputMarkdown(input) {
  if (input === void 0 || input === null) {
    return "";
  }
  if (typeof input === "string") {
    return `\`\`\`
${input}
\`\`\`

`;
  }
  if (typeof input !== "object") {
    return `${String(input)}

`;
  }
  let output = "";
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" && !value.includes("\n")) {
      output += `- **${key}:** ${value}
`;
    } else {
      output += `- **${key}:**
\`\`\`json
${typeof value === "string" ? value : JSON.stringify(value, null, 2)}
\`\`\`
`;
    }
  }
  return output ? `${output}
` : "";
}
function formatCodexConversationAsMarkdown(lines) {
  const entries = lines.map((line) => JSON.parse(line));
  const metadata = {};
  for (const entry of entries) {
    const payload = entry.payload;
    if (entry.type === "session_meta" && payload) {
      metadata.sessionId = payload.id || metadata.sessionId;
      metadata.cwd = payload.cwd || metadata.cwd;
      metadata.gitBranch = payload.git?.branch || metadata.gitBranch;
      metadata.gitCommit = payload.git?.commit || metadata.gitCommit;
      metadata.cliVersion = payload.cli_version || metadata.cliVersion;
      metadata.modelProvider = payload.model_provider || metadata.modelProvider;
    } else if (entry.type === "turn_context" && payload) {
      metadata.cwd = payload.cwd || metadata.cwd;
      metadata.model = payload.model || metadata.model;
    }
  }
  let output = "# Conversation\n\n";
  output += "## Metadata\n\n";
  output += "**Harness:** Codex\n\n";
  if (metadata.sessionId) output += `**Session ID:** ${metadata.sessionId}

`;
  if (metadata.gitBranch) output += `**Git Branch:** ${metadata.gitBranch}

`;
  if (metadata.gitCommit) output += `**Git Commit:** ${metadata.gitCommit}

`;
  if (metadata.cwd) output += `**Working Directory:** ${metadata.cwd}

`;
  if (metadata.cliVersion) output += `**Codex Version:** ${metadata.cliVersion}

`;
  if (metadata.model) output += `**Model:** ${metadata.model}

`;
  if (metadata.modelProvider) output += `**Model Provider:** ${metadata.modelProvider}

`;
  output += "---\n\n";
  output += "## Messages\n\n";
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const payload = entry.payload;
    if (entry.type !== "response_item" || !payload) {
      continue;
    }
    const timestamp = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : "";
    const anchor = payload.call_id || `msg-${i}`;
    if (payload.type === "message") {
      const text = extractCodexText(payload.content);
      if (!text.trim()) {
        continue;
      }
      const roleLabel = payload.role === "user" ? "User" : "Agent";
      output += `### **${roleLabel}** (${timestamp}) {#${anchor}}

`;
      output += `${text}

`;
    } else if (payload.type === "function_call" || payload.type === "custom_tool_call" || payload.type === "tool_search_call" || payload.type === "local_shell_call") {
      const toolName = payload.name || payload.namespace || payload.type || "unknown";
      output += `### **Tool Use** (${timestamp}) {#${anchor}}

`;
      output += `**Tool Use:** \`${toolName}\`

`;
      output += formatCodexToolInputMarkdown(codexToolInput(payload));
    } else if (payload.type === "function_call_output" || payload.type === "custom_tool_call_output" || payload.type === "tool_search_output" || payload.type === "local_shell_call_output") {
      const result = codexToolOutput(payload);
      output += `### **Tool Result** (${timestamp}) {#${anchor}-result}

`;
      output += "**Result:**\n";
      if (result.includes("\n") || result.length > 100) {
        output += `\`\`\`
${result}
\`\`\`

`;
      } else {
        output += `${result}

`;
      }
    } else if (payload.type === "reasoning") {
      const text = extractCodexText(payload.summary);
      if (text.trim()) {
        output += `### **Reasoning Summary** (${timestamp}) {#${anchor}}

`;
        output += `${text}

`;
      }
    }
  }
  return output;
}
function formatMarkdownDocumentAsHTML(markdown) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Conversation</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
      max-width: 900px;
      margin: 0 auto;
      padding: 24px;
      line-height: 1.5;
      color: #1d1d1f;
      background: #f5f5f7;
    }
    .markdown-content {
      background: #ffffff;
      padding: 24px;
      border-radius: 12px;
    }
    pre {
      overflow-x: auto;
      background: #f5f5f7;
      padding: 12px;
      border-radius: 6px;
    }
    code {
      font-family: 'SF Mono', Consolas, monospace;
    }
  </style>
</head>
<body>
<div class="markdown-content">
${renderMarkdownSafely(markdown)}
</div>
</body>
</html>`;
}
function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  };
  return text.replace(/[&<>"']/g, (m2) => map[m2] ?? m2);
}
function isMarkdown(text) {
  const markdownPatterns = [
    /^#{1,6}\s/m,
    // Headers
    /\*\*[^*]+\*\*/,
    // Bold
    /\*[^*]+\*/,
    // Italic
    /`[^`]+`/,
    // Inline code
    /```/,
    // Code blocks
    /^\s*[-*+]\s/m,
    // Unordered lists
    /^\s*\d+\.\s/m,
    // Ordered lists
    /^\s*>\s/m,
    // Blockquotes
    /\[.+\]\(.+\)/
    // Links
  ];
  const matchCount = markdownPatterns.filter((pattern) => pattern.test(text)).length;
  return matchCount >= 2;
}
function renderMarkdownSafely(text) {
  try {
    const renderer = new k.Renderer();
    renderer.html = ({ text: text2 }) => escapeHtml(text2);
    return k.parse(text, { async: false, renderer });
  } catch {
    return `<pre>${escapeHtml(text)}</pre>`;
  }
}

export {
  formatConversationAsMarkdown,
  formatConversationAsHTML
};
