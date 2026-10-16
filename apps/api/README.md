# API کلاس‌نویس

بک‌اند کلاس‌نویس با Bun + Elysia + Prisma 7 (PostgreSQL). قرارداد کامل endpointها در `docs/API.md` است.

## راه‌اندازی

```bash
# از ریشهٔ مخزن یک بار
bun install

cd apps/api
cp .env.example .env          # و مقادیر را تنظیم کنید
createdb -U postgres classnevis
./node_modules/.bin/prisma migrate deploy
./node_modules/.bin/prisma generate
```

## متغیرهای محیطی (`.env`)

| متغیر | توضیح |
|---|---|
| `DATABASE_URL` | آدرس PostgreSQL |
| `PORT` | پورت سرور (پیش‌فرض 4000) |
| `OPENROUTER_API_KEY` | کلید OpenRouter؛ اگر خالی باشد بخش‌ها در وضعیت `PENDING` می‌مانند و تولید جزوه خطای 503 می‌دهد |
| `TRANSCRIBE_MODEL` | مدل پیش‌فرض رونویسی (هدر `x-transcribe-model` آن را تغییر می‌دهد) |
| `NOTE_MODEL` | مدل پیش‌فرض جزوه‌نویسی (هدر `x-note-model`) |
| `STORAGE_DIR` | محل ذخیرهٔ فایل‌های صوتی (نسبت به `apps/api`) |

## اجرا

```bash
bun run dev      # با watch
bun run start    # تولید
bun run typecheck
```

سرور روی `0.0.0.0:PORT` گوش می‌دهد. وضعیت: `GET /health`.

## نکات

- فایل‌های صوتی در `STORAGE_DIR/recordings/<recordingId>/<index>.<ext>` به‌صورت اتمیک ذخیره می‌شوند و فقط با `DELETE /recordings/:id` پاک می‌شوند.
- صف رونویسی درون همین پردازه اجرا می‌شود (هم‌زمانی ۲، حداکثر ۴ تلاش با backoff). با راه‌اندازی دوباره، کارهای نیمه‌تمام دوباره صف می‌شوند.
