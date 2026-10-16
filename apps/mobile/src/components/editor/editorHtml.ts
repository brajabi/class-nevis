import { VAZIR_400_BASE64, VAZIR_700_BASE64 } from './fontData';

/** @font-face rules with the Vazirmatn font embedded as base64 (works fully offline). */
export function vazirFontFaceCss(): string {
  return `
@font-face { font-family: 'Vazirmatn'; font-weight: 400; font-style: normal; font-display: block;
  src: url(data:font/ttf;base64,${VAZIR_400_BASE64}) format('truetype'); }
@font-face { font-family: 'Vazirmatn'; font-weight: 700; font-style: normal; font-display: block;
  src: url(data:font/ttf;base64,${VAZIR_700_BASE64}) format('truetype'); }`;
}

/** Shared typography for note content — used by the editor paper and the PDF export. */
export const NOTE_CONTENT_CSS = `
h1, h2, h3 { font-weight: 700; line-height: 1.6; margin: 1.1em 0 0.45em; }
h1 { font-size: 1.65em; color: #4B2FD6; }
h2 { font-size: 1.32em; color: #5B3FF0; }
h3 { font-size: 1.12em; color: #0E7490; }
p { margin: 0 0 0.6em; }
ul, ol { margin: 0 0 0.7em; padding-inline-start: 1.6em; padding-inline-end: 0; }
ol { list-style-type: persian; }
li { margin: 0.15em 0; }
li::marker { color: #6D4CFF; }
blockquote { margin: 0.8em 0; padding: 0.5em 1em; border-inline-start: 4px solid #7C5CFF;
  background: #F4F1FF; border-radius: 4px 10px 10px 4px; color: #3A3560; }
mark { background: #FFEC99; color: inherit; padding: 0 2px; border-radius: 3px; }
hr { border: 0; height: 1px; background: #E3E4EE; margin: 1.4em 0; }
strong, b { font-weight: 700; }
`;

/** Returns the full inline HTML page that hosts the contenteditable "paper". */
export function buildEditorHtml(initialHtml: string, placeholder: string): string {
  // JSON-encode and escape '<' so nothing in the content can close the <script> tag.
  const initial = JSON.stringify(initialHtml ?? '').replace(/</g, '\\u003c');
  const ph = JSON.stringify(placeholder).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
${vazirFontFaceCss()}
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html, body { margin: 0; padding: 0; background: #0A0B14; }
body { font-family: 'Vazirmatn', 'Tahoma', 'Noto Naskh Arabic', sans-serif; -webkit-text-size-adjust: 100%; }
.desk { padding: 14px 12px 40px; min-height: 100vh; }
.paper {
  background: #FFFFFF; color: #1A1C2B; border-radius: 6px; min-height: calc(100vh - 54px);
  padding: 34px 26px 60px; font-size: 17px; line-height: 2; outline: none; word-wrap: break-word;
  overflow-wrap: anywhere; caret-color: #6D4CFF;
  box-shadow: 0 1px 0 rgba(255,255,255,0.04), 0 18px 40px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3);
}
.paper > :first-child { margin-top: 0; }
.paper.is-empty::before {
  content: attr(data-placeholder); position: absolute; color: #A5A8BC; pointer-events: none;
}
.paper.is-empty { position: relative; }
.paper[contenteditable="false"] { opacity: 0.75; }
::selection { background: rgba(124, 92, 255, 0.28); }
${NOTE_CONTENT_CSS.replace(/(^|\n)([^\n{]+)\{/g, (_m, nl, sel: string) => `${nl}${sel.split(',').map((s) => '.paper ' + s.trim()).join(', ')} {`)}
</style>
</head>
<body>
<div class="desk"><div id="paper" class="paper" contenteditable="true" spellcheck="false" dir="rtl"></div></div>
<script>
(function () {
  var paper = document.getElementById('paper');
  paper.setAttribute('data-placeholder', ${ph});
  function post(m) { try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch (e) {} }
  function exec(c, v) { try { return document.execCommand(c, false, v === undefined ? null : v); } catch (e) { return false; } }
  function q(c) { try { return document.queryCommandState(c); } catch (e) { return false; } }
  exec('defaultParagraphSeparator', 'p');
  exec('styleWithCSS', false);

  var lastRange = null, lastHtml = '', changeTimer = null, dirty = false, lastState = '';

  function inPaper(n) { return !!n && (n === paper || paper.contains(n)); }
  function closest(n, re) {
    while (n && n !== paper) { if (n.nodeType === 1 && re.test(n.nodeName)) return n; n = n.parentNode; }
    return null;
  }
  function blockOf(n) { return closest(n, /^(H1|H2|H3|P|BLOCKQUOTE|LI|DIV)$/); }
  function isEmpty() {
    var t = (paper.textContent || '').replace(/[\\u200b\\s]/g, '');
    return t === '' && !paper.querySelector('li, hr');
  }
  function updateEmpty() { paper.classList.toggle('is-empty', isEmpty()); }
  function ensureBlock() {
    var h = paper.innerHTML.trim();
    if (h === '' || h === '<br>') {
      paper.innerHTML = '<p><br></p>';
      var sel = getSelection();
      if (document.activeElement === paper) {
        var r = document.createRange(); r.setStart(paper.firstChild, 0); r.collapse(true);
        sel.removeAllRanges(); sel.addRange(r);
      }
    }
  }
  // Live DOM keeps Chrome's own structure (so native undo stays intact); the
  // HTML we hand out is normalized on a clone.
  function getHtml() {
    if (isEmpty()) return '';
    var c = paper.cloneNode(true);
    normalizeIn(c);
    return c.innerHTML;
  }
  function saveSel() {
    var sl = getSelection();
    return sl.rangeCount ? [sl.anchorNode, sl.anchorOffset, sl.focusNode, sl.focusOffset] : null;
  }
  function restoreSel(sv) {
    if (sv && inPaper(sv[0]) && inPaper(sv[2])) {
      try { getSelection().setBaseAndExtent(sv[0], sv[1], sv[2], sv[3]); } catch (e) {}
    }
  }
  function setHtml(h) {
    paper.innerHTML = h || '';
    ensureBlock(); updateEmpty(); lastHtml = getHtml(); dirty = false;
  }
  function unwrap(el) {
    var p = el.parentNode; if (!p) return;
    while (el.firstChild) p.insertBefore(el.firstChild, el);
    p.removeChild(el);
  }

  function flushChange() {
    clearTimeout(changeTimer); changeTimer = null;
    var h = getHtml();
    dirty = false;
    if (h !== lastHtml) { lastHtml = h; post({ type: 'change', html: h }); }
  }
  function onInput() {
    ensureBlock(); updateEmpty();
    if (!dirty) { dirty = true; post({ type: 'dirty' }); }
    clearTimeout(changeTimer);
    changeTimer = setTimeout(flushChange, 600);
    scheduleState();
  }
  paper.addEventListener('input', onInput);

  // ----- selection state -----
  var stateQueued = false;
  function scheduleState() {
    if (stateQueued) return; stateQueued = true;
    requestAnimationFrame(function () { stateQueued = false; sendState(); });
  }
  function sendState() {
    var sel = getSelection();
    if (!sel.rangeCount || !inPaper(sel.anchorNode)) return;
    var n = sel.anchorNode;
    var el = n.nodeType === 3 ? n.parentNode : n;
    var h = closest(n, /^H[123]$/);
    var blk = blockOf(n) || el;
    var ta = blk && blk.nodeType === 1 ? getComputedStyle(blk).textAlign : 'start';
    var align = ta === 'center' ? 'center' : (ta === 'left' || ta === 'end') ? 'left' : 'right';
    var s = {
      bold: q('bold'), italic: q('italic'), underline: q('underline'), strike: q('strikeThrough'),
      ul: q('insertUnorderedList'), ol: q('insertOrderedList'),
      heading: h ? h.nodeName.toLowerCase() : null,
      quote: !!closest(n, /^BLOCKQUOTE$/), mark: !!hiliteOf(n), align: align,
      fontSize: Math.round(parseFloat(getComputedStyle(el).fontSize) || 17),
      collapsed: sel.isCollapsed
    };
    var j = JSON.stringify(s);
    if (j !== lastState) { lastState = j; post({ type: 'state', state: s }); }
  }
  document.addEventListener('selectionchange', function () {
    var sel = getSelection();
    if (sel.rangeCount && inPaper(sel.anchorNode)) lastRange = sel.getRangeAt(0).cloneRange();
    scheduleState();
  });
  paper.addEventListener('focus', function () { post({ type: 'focus', focused: true }); });
  paper.addEventListener('blur', function () { flushChange(); post({ type: 'focus', focused: false }); });

  function restore() {
    var sel = getSelection();
    var inside = document.activeElement === paper && sel.rangeCount && inPaper(sel.anchorNode);
    if (inside) return;
    paper.focus({ preventScroll: true });
    if (lastRange) { sel.removeAllRanges(); sel.addRange(lastRange); }
  }

  // ----- caret visibility (keyboard opening shrinks the viewport) -----
  function scrollCaret() {
    var sel = getSelection();
    if (!sel.rangeCount || !inPaper(sel.anchorNode)) return;
    var r = sel.getRangeAt(0).cloneRange();
    var rect = r.getClientRects()[0];
    if (!rect) { var b = blockOf(sel.anchorNode); if (b) rect = b.getBoundingClientRect(); }
    if (!rect) return;
    var vh = window.innerHeight;
    if (rect.bottom > vh - 24) window.scrollBy(0, rect.bottom - vh + 56);
    else if (rect.top < 8) window.scrollBy(0, rect.top - 40);
  }
  window.addEventListener('resize', function () { setTimeout(scrollCaret, 60); });

  // ----- paste sanitizing -----
  var ALLOWED = /^(H1|H2|H3|P|STRONG|B|EM|I|U|S|UL|OL|LI|BLOCKQUOTE|BR|MARK|HR)$/;
  function esc(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function sanitizeNode(src, out) {
    for (var c = src.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) { out.appendChild(document.createTextNode(c.nodeValue)); continue; }
      if (c.nodeType !== 1) continue;
      var name = c.nodeName;
      if (/^(SCRIPT|STYLE|META|LINK|TITLE|HEAD|IMG|SVG|IFRAME|OBJECT)$/.test(name)) continue;
      if (name === 'H4' || name === 'H5' || name === 'H6') name = 'H3';
      if (name === 'DIV' || name === 'SECTION' || name === 'ARTICLE' || name === 'TR') name = 'P';
      if (name === 'STRIKE' || name === 'DEL') name = 'S';
      if (ALLOWED.test(name)) {
        var el = document.createElement(name.toLowerCase());
        out.appendChild(el);
        sanitizeNode(c, el);
      } else {
        sanitizeNode(c, out);
      }
    }
  }
  function textToHtml(t) {
    return t.replace(/\\r\\n?/g, '\\n').split(/\\n{2,}/).map(function (p) {
      return '<p>' + esc(p).replace(/\\n/g, '<br>') + '</p>';
    }).join('');
  }
  paper.addEventListener('paste', function (e) {
    e.preventDefault();
    var cd = e.clipboardData || window.clipboardData;
    if (!cd) return;
    var html = cd.getData('text/html'), text = cd.getData('text/plain');
    var out = '';
    if (html) {
      var tpl = document.createElement('template'); tpl.innerHTML = html;
      var box = document.createElement('div'); sanitizeNode(tpl.content, box);
      out = box.innerHTML;
    }
    if (!out && text) out = textToHtml(text);
    if (!out) return;
    if (!/<(p|h[123]|ul|ol|blockquote|hr)\\b/i.test(out) && text && text.indexOf('\\n') < 0) exec('insertText', text);
    else exec('insertHTML', out);
  });
  paper.addEventListener('drop', function (e) { e.preventDefault(); });

  // ----- commands -----
  var SIZES = [12, 14, 15, 17, 19, 22, 26, 30, 36];
  function singleBlockRange() {
    var sel = getSelection(); if (!sel.rangeCount) return null;
    var r = sel.getRangeAt(0);
    var a = blockOf(r.startContainer), b = blockOf(r.endContainer);
    return a && a === b ? r : null;
  }
  function selectedHtml(r, clean) {
    var d = document.createElement('div'); d.appendChild(r.cloneContents());
    if (clean) clean(d);
    return d.innerHTML;
  }
  function stripFontSizes(root) {
    var spans = root.querySelectorAll('span[style], font');
    for (var i = 0; i < spans.length; i++) {
      var s = spans[i];
      if (s.nodeName === 'FONT') { unwrap(s); continue; }
      s.style.fontSize = '';
      if (!s.getAttribute('style') || !s.getAttribute('style').trim()) unwrap(s);
    }
  }
  function hint(t) { post({ type: 'hint', text: t }); }
  var NEED_SELECTION = 'ابتدا بخشی از متن را انتخاب کنید';

  function fontSize(dir) {
    var sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) { hint(NEED_SELECTION); return; }
    var n = sel.anchorNode; var el = n.nodeType === 3 ? n.parentNode : n;
    var cur = Math.round(parseFloat(getComputedStyle(el).fontSize) || 17);
    var next = cur;
    if (dir > 0) { for (var i = 0; i < SIZES.length; i++) if (SIZES[i] > cur) { next = SIZES[i]; break; } }
    else { for (var j = SIZES.length - 1; j >= 0; j--) if (SIZES[j] < cur) { next = SIZES[j]; break; } }
    if (next === cur) return;
    var r = singleBlockRange();
    if (r) {
      exec('insertHTML', '<span style="font-size: ' + next + 'px;">' + selectedHtml(r, stripFontSizes) + '</span>');
    } else {
      exec('styleWithCSS', false);
      exec('fontSize', '7');
      var sv = saveSel();
      var fonts = paper.querySelectorAll('font[size="7"]');
      for (var k = 0; k < fonts.length; k++) {
        var f = fonts[k]; var sp = document.createElement('span');
        sp.style.fontSize = next + 'px';
        while (f.firstChild) sp.appendChild(f.firstChild);
        stripFontSizes(sp);
        f.parentNode.replaceChild(sp, f);
      }
      restoreSel(sv);
      onInput();
    }
  }
  function isHilite(n) {
    return n.nodeType === 1 && (n.nodeName === 'MARK' || (n.nodeName === 'SPAN' && !!n.style.backgroundColor));
  }
  function hiliteOf(n) {
    while (n && n !== paper) { if (isHilite(n)) return n; n = n.parentNode; }
    return null;
  }
  function highlight() {
    var sel = getSelection(); if (!sel.rangeCount) return;
    var r = sel.getRangeAt(0);
    var m = hiliteOf(sel.anchorNode) || hiliteOf(sel.focusNode);
    if (m) {
      // Toggle off: remove every highlight touched by the selection.
      var sv = saveSel();
      var ms = paper.querySelectorAll('mark, span[style]');
      for (var i = 0; i < ms.length; i++) {
        var x = ms[i];
        if (!isHilite(x) || !(x === m || r.intersectsNode(x))) continue;
        if (x.nodeName === 'MARK') unwrap(x);
        else { x.style.backgroundColor = ''; if (!x.getAttribute('style').trim()) unwrap(x); }
      }
      restoreSel(sv);
      onInput();
      return;
    }
    if (sel.isCollapsed) { hint(NEED_SELECTION); return; }
    exec('styleWithCSS', true);
    exec('hiliteColor', 'rgb(255, 236, 153)');
    exec('styleWithCSS', false);
  }
  var BLOCKS = /^(P|H1|H2|H3|UL|OL|LI|BLOCKQUOTE|HR|DIV|TABLE)$/;
  /** Converts editor artefacts to the note HTML subset (mark, span[font-size], no p>ul, no loose text). */
  function normalizeIn(root) {
    var spans = root.querySelectorAll('span[style]');
    for (var k = 0; k < spans.length; k++) {
      var s = spans[k];
      if (s.style.color === 'inherit') s.style.color = '';
      if (s.style.backgroundColor) {
        s.style.backgroundColor = '';
        var mk = document.createElement('mark');
        while (s.firstChild) mk.appendChild(s.firstChild);
        s.appendChild(mk);
      }
      var st = s.getAttribute('style');
      if (!st || !st.trim()) unwrap(s);
    }
    var bad = root.querySelectorAll('p > ul, p > ol, p > blockquote, p > h1, p > h2, p > h3, p > p');
    for (var j = bad.length - 1; j >= 0; j--) {
      var par = bad[j].parentNode;
      if (par && par.nodeName === 'P' && par.parentNode) unwrap(par);
    }
    var fonts = root.querySelectorAll('font');
    for (var f = 0; f < fonts.length; f++) unwrap(fonts[f]);
    var divs = root.querySelectorAll('div');
    for (var d = 0; d < divs.length; d++) {
      var pe = document.createElement('p');
      while (divs[d].firstChild) pe.appendChild(divs[d].firstChild);
      divs[d].parentNode.replaceChild(pe, divs[d]);
    }
    var marks = root.querySelectorAll('mark + mark');
    for (var n = 0; n < marks.length; n++) {
      var prev = marks[n].previousSibling;
      if (prev && prev.nodeName === 'MARK') { while (marks[n].firstChild) prev.appendChild(marks[n].firstChild); marks[n].parentNode.removeChild(marks[n]); }
    }
    // Wrap loose top-level inline content into paragraphs.
    var group = null;
    var kids = Array.prototype.slice.call(root.childNodes);
    for (var c = 0; c < kids.length; c++) {
      var node = kids[c];
      var isBlock = node.nodeType === 1 && BLOCKS.test(node.nodeName);
      if (isBlock) { group = null; continue; }
      if (node.nodeType === 3 && !node.nodeValue.trim() && !group) { root.removeChild(node); continue; }
      if (node.nodeType === 1 && node.nodeName === 'BR' && !group) { root.removeChild(node); continue; }
      if (!group) { group = document.createElement('p'); root.insertBefore(group, node); }
      group.appendChild(node);
    }
    var ps = root.querySelectorAll('p');
    for (var q = 0; q < ps.length; q++) {
      var last = ps[q].lastChild;
      if (last && last.nodeName === 'BR' && ps[q].childNodes.length > 1) ps[q].removeChild(last);
    }
  }
  function block(tag) {
    var sel = getSelection(); var n = sel.rangeCount ? sel.anchorNode : null;
    if (tag === 'blockquote') {
      exec('formatBlock', closest(n, /^BLOCKQUOTE$/) ? '<p>' : '<blockquote>');
      return;
    }
    if (tag !== 'p') {
      var h = closest(n, /^H[123]$/);
      if (h && h.nodeName.toLowerCase() === tag) tag = 'p';
    }
    exec('formatBlock', '<' + tag + '>');
  }
  function clearFormat() {
    exec('removeFormat');
    var sel = getSelection();
    if (sel.rangeCount) {
      var r = sel.getRangeAt(0);
      var ms = paper.querySelectorAll('mark, span[style]');
      for (var i = 0; i < ms.length; i++) if (r.intersectsNode(ms[i])) unwrap(ms[i]);
      if (closest(sel.anchorNode, /^(H[123]|BLOCKQUOTE)$/)) exec('formatBlock', '<p>');
    }
    onInput();
  }

  function cmd(name, value) {
    if (paper.getAttribute('contenteditable') !== 'true') return;
    restore();
    switch (name) {
      case 'bold': exec('bold'); break;
      case 'italic': exec('italic'); break;
      case 'underline': exec('underline'); break;
      case 'strike': exec('strikeThrough'); break;
      case 'h1': case 'h2': case 'h3': block(name); break;
      case 'paragraph': block('p'); break;
      case 'quote': block('blockquote'); break;
      case 'ul': exec('insertUnorderedList'); break;
      case 'ol': exec('insertOrderedList'); break;
      case 'fontUp': fontSize(1); break;
      case 'fontDown': fontSize(-1); break;
      case 'mark': highlight(); break;
      case 'alignRight': exec('justifyRight'); break;
      case 'alignCenter': exec('justifyCenter'); break;
      case 'alignLeft': exec('justifyLeft'); break;
      case 'undo': exec('undo'); break;
      case 'redo': exec('redo'); break;
      case 'hr': exec('insertHorizontalRule'); break;
      case 'clear': clearFormat(); break;
    }
    lastState = '';
    scheduleState();
    setTimeout(scrollCaret, 30);
  }

  window.__cn = {
    cmd: cmd,
    setHtml: function (h) { setHtml(h); post({ type: 'change', html: getHtml(), silent: true }); },
    getHtml: function (id) { flushChange(); post({ type: 'html', id: id, html: getHtml() }); },
    focus: function () {
      paper.focus();
      if (!lastRange) {
        var r = document.createRange(); r.selectNodeContents(paper); r.collapse(false);
        var s = getSelection(); s.removeAllRanges(); s.addRange(r);
      } else restore();
      setTimeout(scrollCaret, 250);
    },
    blur: function () { paper.blur(); },
    setEditable: function (on) { paper.setAttribute('contenteditable', on ? 'true' : 'false'); }
  };

  setHtml(${initial});
  post({ type: 'ready' });
})();
true;
</script>
</body>
</html>`;
}
