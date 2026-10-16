const faDigits = '۰۱۲۳۴۵۶۷۸۹';
export const toFa = (v: string | number) => String(v).replace(/\d/g, (d) => faDigits[+d]);

export function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return toFa(h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`);
}

export function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return toFa(new Date(iso).toLocaleString());
  }
}

export function formatBytes(n: number) {
  if (n < 1024) return toFa(`${n} B`);
  if (n < 1024 * 1024) return toFa(`${(n / 1024).toFixed(0)} KB`);
  return toFa(`${(n / 1024 / 1024).toFixed(1)} MB`);
}

export function htmlToPlainText(html: string) {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h[1-6]|li|blockquote|div)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
