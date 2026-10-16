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

const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

/** Gregorian → Jalali (Shamsi). Pure arithmetic, so it doesn't depend on Hermes' Intl calendar support. */
export function toJalali(date: Date): { y: number; m: number; d: number } {
  const gy = date.getFullYear();
  const gm = date.getMonth() + 1;
  const gd = date.getDate();
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    355666 + 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) + gd + gdm[gm - 1];
  let y = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  y += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    y += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const m = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const d = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { y, m, d };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** «۲۴ مهر ۱۴۰۵» */
export function formatJalaliDate(iso: string | Date) {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  const { y, m, d } = toJalali(date);
  return toFa(`${d} ${JALALI_MONTHS[m - 1]} ${y}`);
}

/** «۲۲:۰۸» */
export function formatTime(iso: string | Date) {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  return toFa(`${pad2(date.getHours())}:${pad2(date.getMinutes())}`);
}

/** «امروز، ۲۲:۰۸» / «دیروز، ۲۲:۰۸» / «۲۴ مهر ۱۴۰۵، ۲۲:۰۸» (Shamsi; year omitted for the current year) */
export function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const dayStart = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((dayStart(now) - dayStart(date)) / 86_400_000);
  const time = formatTime(date);
  if (diffDays === 0) return `امروز، ${time}`;
  if (diffDays === 1) return `دیروز، ${time}`;
  const j = toJalali(date);
  const sameYear = j.y === toJalali(now).y;
  const day = toFa(`${j.d} ${JALALI_MONTHS[j.m - 1]}${sameYear ? '' : ` ${j.y}`}`);
  return `${day}، ${time}`;
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
