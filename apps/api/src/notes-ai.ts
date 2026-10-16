import { chatCompletion, stripFences } from "./openrouter.ts";
import { escapeHtml, markdownishToHtml, sanitizeHtml } from "./html.ts";

const FORMAT_RULES = `قواعد خروجی (بسیار مهم):
- خروجی فقط و فقط HTML باشد؛ بدون <html>، <head>، <body>، بدون مارک‌داون، بدون \`\`\` و بدون هیچ توضیح اضافه قبل یا بعد از آن.
- فقط از این تگ‌ها استفاده کن: h1 h2 h3 p strong b em i u s ul ol li blockquote br hr mark و span (فقط با style="font-size:...").
- هیچ attribute دیگری (class، id، dir، style غیر از font-size) نگذار.
- زبان متن فارسی روان و نوشتاری باشد؛ اصطلاحات فنی انگلیسی را به خط لاتین نگه دار (در صورت نیاز معادل فارسی را هم بیاور).`;

const NOTE_SYSTEM = `تو یک دستیار آموزشی حرفه‌ای و جزوه‌نویس دقیق هستی. وظیفه‌ات این است که از متن پیاده‌شدهٔ صوت یک کلاس درس (دانشگاه یا مدرسه)، یک جزوهٔ درسی کامل، منظم و قابل مطالعه به زبان فارسی بنویسی؛ جزوه‌ای که دانشجو بتواند به‌جای حضور در کلاس از روی آن درس را یاد بگیرد و برای امتحان مرور کند.

ساختار جزوه:
1. یک عنوان دقیق و گویا در <h1> که موضوع اصلی جلسه را نشان دهد.
2. یک پاراگراف مقدمه (<p>) که در چند جمله خلاصه می‌کند این جلسه دربارهٔ چه بود و چه مباحثی پوشش داده شد.
3. بخش‌های اصلی با سرفصل <h2> و در صورت نیاز زیرفصل <h3>، به ترتیب منطقی مطالب (معمولاً همان ترتیب تدریس).
4. در هر بخش: توضیح روشن مفاهیم در پاراگراف‌ها، فهرست‌های <ul>/<ol> برای مراحل، ویژگی‌ها و مقایسه‌ها.
5. تعریف‌های کلیدی و اصطلاحات مهم را با <strong> برجسته کن (مثلاً: <strong>الگوریتم:</strong> ...).
6. فرمول‌ها، مثال‌ها، اعداد، قضیه‌ها، کدها و نمونه‌حل‌هایی که استاد گفته را کامل و دقیق حفظ کن؛ مثال‌ها را با «مثال:» مشخص کن. نکاتی که استاد بر آن تأکید کرده (مثلاً «این در امتحان می‌آید») را با <mark> یا <blockquote> مشخص کن.
7. در انتها یک بخش <h2>نکات کلیدی</h2> با فهرست مهم‌ترین نکات برای مرور سریع.
8. و در آخر یک بخش <h2>جمع‌بندی</h2> با یک یا دو پاراگراف جمع‌بندی.

اصول محتوایی:
- محتوا را فقط از روی متن کلاس بنویس و هیچ مطلبی از خودت اختراع نکن. اگر بخشی از متن نامفهوم است ([نامفهوم]) آن را نادیده بگیر یا فقط اشاره کن.
- لکنت‌ها، تکرارها، «اِ»، «مثلاً»های زائد، حرف‌های حاشیه‌ای (حضور و غیاب، شوخی‌ها، مسائل اداری) را حذف کن و گفتار محاوره را به نثر نوشتاری روان و دقیق تبدیل کن، بدون از دست دادن هیچ نکتهٔ علمی.
- اگر نکتهٔ اداری مهمی گفته شد (تاریخ امتحان، تکلیف، منبع درسی)، آن را در یک بخش کوتاه «اطلاعات درس» قبل از نکات کلیدی بیاور.
- جامع باش: جزوه باید همهٔ مطالب علمی جلسه را پوشش دهد، نه فقط خلاصه‌ای کوتاه.

${FORMAT_RULES}`;

const SECTION_SYSTEM = `تو یک دستیار آموزشی حرفه‌ای و جزوه‌نویس دقیق هستی. یک جزوهٔ درسی فارسی از قبل وجود دارد و حالا متن پیاده‌شدهٔ یک جلسه/ضبط جدید از همان درس به تو داده می‌شود. باید یک بخش ادامه برای این جزوه بنویسی که به انتهای آن اضافه شود.

قواعد:
- بخش با یک <h2> شروع شود که عنوان ضبط را در بر دارد (مثلاً: <h2>عنوان ضبط — موضوع اصلی</h2>).
- زیرفصل‌ها با <h3>، توضیح‌ها در <p>، فهرست‌ها با <ul>/<ol>، تعریف‌های کلیدی با <strong>، و فرمول‌ها و مثال‌ها دقیق و کامل.
- مطالبی که در جزوهٔ موجود آمده را تکرار نکن؛ اگر استاد مطلب قبلی را مرور کرد فقط در یک جمله به آن ارجاع بده و روی مطالب جدید تمرکز کن.
- در انتها یک <h3>نکات کلیدی</h3> با فهرست مهم‌ترین نکات همین بخش بیاور.
- از <h1> استفاده نکن.
- لکنت‌ها و حرف‌های حاشیه‌ای را حذف کن، گفتار را به نثر نوشتاری روان تبدیل کن و هیچ مطلبی از خودت اختراع نکن.

${FORMAT_RULES}`;

function finalize(raw: string): string {
  let out = stripFences(raw);
  out = out.replace(/^\s*html\s*\n/i, "");
  // حذف پوسته‌های احتمالی
  const body = out.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (body) out = body[1]!;
  if (!/<(h[1-6]|p|ul|ol|li|strong|br)\b/i.test(out)) out = markdownishToHtml(out);
  return sanitizeHtml(out);
}

export async function generateNoteHtml(opts: { transcript: string; recordingTitle: string; model: string }): Promise<string> {
  const raw = await chatCompletion({
    model: opts.model,
    maxTokens: 16000,
    temperature: 0.3,
    timeoutMs: 10 * 60_000,
    messages: [
      { role: "system", content: NOTE_SYSTEM },
      {
        role: "user",
        content: `عنوان ضبط: ${opts.recordingTitle}\n\nمتن پیاده‌شدهٔ کلاس:\n"""\n${opts.transcript}\n"""\n\nاکنون جزوهٔ کامل را فقط به صورت HTML بنویس.`,
      },
    ],
  });
  const html = finalize(raw);
  if (!html) throw new Error("مدل خروجی خالی برگرداند");
  return html;
}

export async function generateSectionHtml(opts: {
  existingText: string;
  transcript: string;
  recordingTitle: string;
  model: string;
}): Promise<string> {
  const existing = opts.existingText.length > 20000 ? "…" + opts.existingText.slice(-20000) : opts.existingText;
  const raw = await chatCompletion({
    model: opts.model,
    maxTokens: 16000,
    temperature: 0.3,
    timeoutMs: 10 * 60_000,
    messages: [
      { role: "system", content: SECTION_SYSTEM },
      {
        role: "user",
        content: `متن جزوهٔ موجود (برای اطلاع؛ تکرار نکن):\n"""\n${existing || "(جزوه هنوز خالی است)"}\n"""\n\nعنوان ضبط جدید: ${opts.recordingTitle}\n\nمتن پیاده‌شدهٔ ضبط جدید:\n"""\n${opts.transcript}\n"""\n\nاکنون بخش ادامهٔ جزوه را فقط به صورت HTML بنویس.`,
      },
    ],
  });
  let html = finalize(raw).replace(/<(\/?)h1>/g, "<$1h2>");
  if (!html) throw new Error("مدل خروجی خالی برگرداند");
  if (!/^<h2>/.test(html)) html = `<h2>${escapeHtml(opts.recordingTitle)}</h2>${html}`;
  return html;
}
