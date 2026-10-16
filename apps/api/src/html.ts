/** ابزارهای HTML جزوه: پاک‌سازی (allowlist)، متن ساده، escape. */

const ALLOWED = new Set(["h1", "h2", "h3", "p", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "blockquote", "br", "hr", "span", "mark"]);
const VOID = new Set(["br", "hr"]);
const RENAME: Record<string, string> = { h4: "h3", h5: "h3", h6: "h3", strike: "s", del: "s", ins: "u" };
const FONT_SIZE = /font-size\s*:\s*([0-9.]+\s*(?:px|em|rem|%|pt)|small|medium|large|x-large|xx-large|x-small|smaller|larger)/i;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function removeDangerousBlocks(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|head|title|svg|math|template|noscript)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|style|iframe|object|embed|link|meta|base)\b[^>]*>/gi, "");
}

/** پاک‌سازی سخت‌گیرانه برای خروجی مدل: فقط تگ‌های مجاز API.md، بدون attribute (جز font-size روی span). */
export function sanitizeHtml(input: string): string {
  let html = removeDangerousBlocks(input).replace(/<!DOCTYPE[^>]*>/gi, "");
  html = html.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (_m, close: string, rawName: string, attrs: string) => {
    let name = rawName.toLowerCase();
    name = RENAME[name] ?? name;
    if (!ALLOWED.has(name)) return "";
    if (VOID.has(name)) return close ? "" : `<${name}>`;
    if (close) return `</${name}>`;
    if (name === "span") {
      const style = attrs.match(/style\s*=\s*("([^"]*)"|'([^']*)')/i);
      const fs = (style?.[2] ?? style?.[3] ?? "").match(FONT_SIZE);
      return fs ? `<span style="font-size: ${fs[1]!.replace(/\s+/g, "")}">` : "<span>";
    }
    return `<${name}>`;
  });
  // جلوگیری از < سرگردان که شبیه تگ نیست
  html = html.replace(/<(?!\/?(?:h1|h2|h3|p|strong|b|em|i|u|s|ul|ol|li|blockquote|br|hr|span|mark)\b)/gi, "&lt;");
  return html.replace(/<span>([\s\S]*?)<\/span>/g, "$1").trim();
}

/** پاک‌سازی سبک برای محتوای ویرایشگر کاربر: فقط حذف موارد خطرناک (اسکریپت، on*، javascript:). */
export function sanitizeUserHtml(input: string): string {
  return removeDangerousBlocks(input)
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, "");
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", zwnj: "‌" };

export function htmlToText(html: string): string {
  return removeDangerousBlocks(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-6]|li|blockquote|div|ul|ol)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

export function preview(html: string, n = 160): string {
  return htmlToText(html).replace(/\s+/g, " ").slice(0, n);
}

export function firstH1(html: string): string | null {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const t = m ? htmlToText(m[1]!).replace(/\s+/g, " ").trim() : "";
  return t || null;
}

/** متن ساده → پاراگراف‌های HTML */
export function textToParagraphs(text: string): string {
  return text
    .split(/\n\s*\n|\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<p>${escapeHtml(l)}</p>`)
    .join("");
}

/** اگر مدل به‌جای HTML مارک‌داون داد، تبدیل حداقلی. */
export function markdownishToHtml(md: string): string {
  const inline = (s: string) =>
    escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1<em>$2</em>");
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const rawLine of md.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      closeList();
      const lvl = Math.min(m[1]!.length, 3);
      out.push(`<h${lvl}>${inline(m[2]!)}</h${lvl}>`);
    } else if ((m = line.match(/^[-*•]\s+(.*)$/))) {
      if (list !== "ul") {
        closeList();
        out.push("<ul>");
        list = "ul";
      }
      out.push(`<li>${inline(m[1]!)}</li>`);
    } else if ((m = line.match(/^[0-9۰-۹]+[.)]\s+(.*)$/))) {
      if (list !== "ol") {
        closeList();
        out.push("<ol>");
        list = "ol";
      }
      out.push(`<li>${inline(m[1]!)}</li>`);
    } else if (/^(-{3,}|\*{3,})$/.test(line)) {
      closeList();
      out.push("<hr>");
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      closeList();
      out.push(`<blockquote>${inline(m[1]!)}</blockquote>`);
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join("");
}
