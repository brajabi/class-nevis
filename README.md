# کلاس‌نویس (ClassNevis)

ضبط کلاس ← رونویسی با هوش مصنوعی ← جزوه‌ی آماده. مونوریپوی Bun.

```
apps/api      بک‌اند: Bun + ElysiaJS + Prisma 7 + PostgreSQL + OpenRouter
apps/mobile   اپ موبایل: Expo SDK 58 (اولویت اندروید)
docs/API.md   قرارداد API
```

## راه‌اندازی

```bash
bun install
```

1. PostgreSQL محلی: دیتابیس `classnevis` (کاربر `postgres`) ساخته و migrate شده است.
2. در `apps/api/.env` مقدار `OPENROUTER_API_KEY` را بگذارید.
   - مدل رونویسی: `elevenlabs/scribe-v2` (از endpoint `/audio/transcriptions`)
   - مدل نوشتن جزوه: `google/gemini-3.8-flash`
   - هر دو از تب تنظیمات اپ هم قابل تغییرند.
3. سرور: `bun run dev:api` (پورت ۴۰۰۰)
4. اپ: `bun run dev:mobile`

### ساخت اپ اندروید (لازم برای ضبط در پس‌زمینه)
ضبط در پس‌زمینه (وقتی صفحه خاموش است) به development build نیاز دارد و در Expo Go کار نمی‌کند:

```bash
cd apps/mobile && bunx expo run:android
```

> اگر دسترسی به `dl.google.com` بسته است، ساخت Gradle با خطای `Could not find com.android.tools.build:gradle` شکست می‌خورد.
> با VPN یا mirror (مثل `maven.myket.ir` / `maven.aliyun.com/repository/google`) بسازید. SDK 58 به Android SDK Platform 37 و Build-Tools 37 نیاز دارد.

در حالت توسعه، اپ آدرس سرور را خودکار از آدرس Metro برمی‌دارد. روی گوشی واقعی در صورت نیاز، در تب تنظیمات آدرس سرور را `http://<IP کامپیوتر>:4000` بگذارید.

## صداها از دست نمی‌روند
- ضبط در بخش‌های ۲ دقیقه‌ای با فرمت AAC-ADTS (حتی با بسته شدن ناگهانی برنامه قابل پخش است) مستقیم در حافظه‌ی دائمی گوشی
- بازیابی خودکار ضبط نیمه‌تمام در اجرای بعدی
- صف آپلود با تلاش مجدد بی‌پایان؛ آپلود idempotent
- سرور فایل‌ها را به‌صورت اتمیک روی دیسک می‌نویسد و در پس‌زمینه یک نسخه در Cloudflare R2 (باکت `classnevis`) نگه می‌دارد؛ اگر فایلی روی دیسک نباشد خودکار از R2 بازیابی می‌شود
- هیچ فایلی جز با حذف دستی پاک نمی‌شود
