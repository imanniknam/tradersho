# Tradersho panel

React/Vite، Node.js 24 و PostgreSQL. ثبت‌نام/ورود، داشبورد خدمات حساب و ویجت رسمی TradingView.

## اجرا

```bash
npm ci
export DATABASE_URL='postgresql://localhost:5432/tradersho_dev'
npm run dev
```

ابتدا دیتابیس را بسازید. سرور در شروع جداول را به‌صورت افزایشی ایجاد می‌کند. Vite روی `http://127.0.0.1:5173`، API روی پورت 3001 و proxy `/api` است. متغیرهای محیط را صریح export کنید؛ فایل `.env.example` نمونه است و `.env` خودکار بارگیری نمی‌شود.

## Production

```bash
npm run build
NODE_ENV=production npm start
```

`DATABASE_URL` الزامی، `PORT` پیش‌فرض 3001 و `HOST` پیش‌فرض `0.0.0.0` است. در production سرور Node فایل‌های `dist` و API را در یک مبدأ سرو می‌کند. بررسی سلامت: `/api/health`؛ پاسخ سالم `{"ok":true,"database":"ready"}` است. Dockerfile شامل `server/`، `shared/` و build فرانت‌اند است. دیتابیس و secrets باید توسط میزبان فراهم شوند و در Git قرار نگیرند. برای انتشار عمومی از HTTPS استفاده کنید.

## وضعیت امکانات

- ثبت‌نام با تکرار رمز، حداقل ۸ کاراکتر شامل حروف کوچک/بزرگ، عدد و کاراکتر خاص؛ نشست در دیتابیس، تغییر رمز و خروج از همهٔ نشست‌ها. تأیید ایمیل و بازیابی رمز در این نسخه وجود ندارند.
- تم روشن پیش‌فرض و دارک اختیاری؛ لوگوی شفاف متناسب با تم و حفظ انتخاب در مرورگر.
- داشبورد با خوشامدگویی، وضعیت خدمات و تیکت‌های واقعی؛ فقط یک ورودی به مرکز ابزارها. مدرسه فارکس، کیف پول و ریبیت همچنان به‌زودی‌اند. کاتالوگ فقط نمودار فعال و اکسپرت به‌زودی را نمایش می‌دهد.
- `/panel/tools/chart`: ویجت رسمی hosted Advanced Chart از TradingView، نماد اولیه OANDA:XAUUSD، کندل یک‌ساعته، UTC، تغییر نماد/بازه و ابزارهای ارائه‌شده توسط خود ویجت؛ نمای تمام پنجره، Escape، retry و پیوند بیرونی.
- [راهنمای رسمی ویجت](https://www.tradingview.com/widget-docs/widgets/charts/advanced-chart/). داده در iframe خود TradingView می‌ماند؛ پوشش نماد و تأخیر تابع ارائه‌دهنده است. قابلیت‌های حساب پولی Supercharts یا کتابخانهٔ self-hosted Advanced Charts وعده داده نمی‌شوند. ویجت به حساب فرضی، CSV یا Replay اختصاصی متصل نیست.
- کد و سوابق چارت اختصاصی قبلی حفظ شده‌اند؛ `/api/candles/*`، `/api/replay/*`، `/api/market/*` فعلاً 409 می‌دهند. `?view=reference` مسیر قدیمی را فعال نمی‌کند.
- تیکتینگ فعال: ایجاد، دسته و اولویت، گفتگو، پاسخ کارشناس، وضعیت، بستن/بازگشایی و صفحه‌بندی؛ مالکیت/نقش/نسخه و ثبت درخواست تکراری در سرور کنترل می‌شود. ریبیت و اشتراک غیرفعال‌اند.

## بررسی

```bash
npm run build
npm run test:unit
```

تست واحد با Node 24 فایل TS را مستقیم اجرا می‌کند. E2E به Google Chrome نصب‌شده و دیتابیس QA **جدا** نیاز دارد. محیط QA را مثلاً در پورت 5183 با `DATABASE_URL` دیتابیس تست، `HOST=127.0.0.1` و `NODE_ENV=production` اجرا کنید، سپس:

```bash
E2E_BASE_URL=http://127.0.0.1:5183 npm run test:e2e
DATABASE_URL=postgresql://localhost:5432/tradersho_qa npm run test:e2e:support

```

تست نسخهٔ اولیه فقط پورت 5183 را می‌پذیرد. اسکریپت‌های e2e:legacy و e2e:candles متعلق به امکانات غیرفعال قبلی‌اند و برای نسخهٔ اولیه اجرا نمی‌شوند. آزمون‌ها حساب‌های آزمایشی ایجاد می‌کنند. `qa/` و داده‌های محلی در Git نیستند. CI از دیتابیس جداگانهٔ QA برای تست API و مرورگر استفاده می‌کند و به دیتابیس واقعی دسترسی ندارد.

## میز پشتیبانی و نقش کارشناس

کاربر در `/panel/support` و کارشناس مجاز در `/admin/support` کار می‌کند. برای اعطای نقش به یک حساب ثبت‌شده از محیط امن سرور اجرا کنید:

```bash
node scripts/support-agent.mjs grant existing-user@example.com
# Revoke with: node scripts/support-agent.mjs revoke existing-user@example.com
```

DATABASE_URL باید تنظیم شده باشد. هیچ حساب پیش‌فرض مدیر و API عمومی ارتقای نقش وجود ندارد. پس از تغییر نقش، صفحهٔ پنل را تازه کنید. پیام‌ها در خود پنل نمایش داده می‌شوند؛ ارسال ایمیل و ضمیمه در این مرحله وجود ندارد.

## فونت برند

فونت فارسی Yekan Bakh از وب‌فونت‌های موجود در سایت خود Tradersho دریافت و با @font-face استفاده شده است. باینری فونت‌ها دارایی استقرار خصوصی هستند و به‌طور پیش‌فرض از Git عمومی خارج‌اند. قبل از build در محیط جدید، چهار فایل مجاز را طبق public/fonts/README.md در public/fonts قرار دهید. بدون این فایل‌ها رابط fallback را نمایش می‌دهد. برای Gilroy انگلیسی هنوز فایل مجاز فراهم نشده است. ظاهر داخلی ویجت TradingView تابع خود ویجت است.

## ممیزی رابط

`npm run test:ui` ممیزی هندسه، overflow، کنتراست/دسترسی axe و hover در تم روشن/تیره را اجرا می‌کند؛ پورت 5183 و DATABASE_URL دیتابیس منتهی به `_qa` الزامی است. `npm run test:ui:states` خطا، retry، فوکوس، حفظ فرم و نبود فایل فونت را بررسی می‌کند. Chrome نصب‌شده لازم است. تصاویر و report.json در qa/audit محلی و خارج Git هستند. این تست‌ها جای آزمایش روی دستگاه واقعی یا ممیزی انسانی کامل دسترس‌پذیری را نمی‌گیرند.

`npm run test:ui:mobile` همان ممیزی را با حالت mobile/لمسی در Chromium، ۹ اندازهٔ عمودی/افقی و هر دو تم گسترش می‌دهد. اندازهٔ متن و ورودی‌ها، اهداف لمس ۴۴ پیکسلی، چگالی بنر، دکمه‌های انتهای فرم و تمام‌صفحهٔ چارت نیز بررسی می‌شوند. گزارش و تصاویر این اجرا جدا در `qa/mobile/` ذخیره می‌شوند. تنظیمات QA همان تست اصلی است؛ دستگاه واقعی را شبیه‌سازی کامل نمی‌کند. قواعد جمع‌وجور موبایل در `src/mobile.css` و فقط زیر عرض ۶۰۰ پیکسل فعال‌اند.

`npm run test:ui:wide` همهٔ صفحات را در عرض‌های ۱۲۸۰ تا ۵۱۲۰ با هر دو تم بررسی می‌کند؛ از جمله پوشش viewport، سقف عرض محتوا، تقارن دکمهٔ خروج و توقف/کاهش حرکت پس‌زمینه ورود. نتایج در `qa/wide/` هستند. قواعد تم تصویر و نمایشگر بزرگ در `src/refinements.css` نگهداری می‌شوند.

### Password recovery email adapter

Recovery is disabled (HTTP 503 with a clear user-facing message) until `APP_PUBLIC_URL`, `RECOVERY_EMAIL_URL` and `RECOVERY_EMAIL_SECRET` are configured. No reset tokens are returned to the browser or logged. Configure an HTTPS mail adapter endpoint that accepts `POST` JSON `{to, subject, text}` and `Authorization: Bearer <RECOVERY_EMAIL_SECRET>`, sends the text email through your chosen provider, and returns a 2xx status only after accepting delivery. Store the secret only in server environment variables. Use the public HTTPS panel origin for `APP_PUBLIC_URL` (localhost allowed for QA).

The email contains `/reset-password#<token>`; tokens expire after 15 minutes, are stored only as hashes, replace earlier recovery links, and cannot be reused. Reset validates the strong password and confirmation, rejects links issued before a password change, and revokes all sessions. Responses never disclose whether an account exists. Provider failures invalidate the new token and produce a generic operational log without personal data; monitor delivery at the adapter. Requests are throttled per account and IP. There is deliberately no demo reset bypass.

Run `DATABASE_URL=<database ending _qa> npm run test:e2e:recovery` with the QA server on port 5183 and email delivery disabled. The test uses a local mock adapter; it sends no real emails.


## تقویم اختصاصی

تقویم فقط در `/panel/tools/calendar` داخل پوستهٔ ابزارهاست. صفحه و job خبرها حذف شده‌اند؛ API قدیمی خبر410 می‌دهد و سوابق DB حذف نمی‌شوند. مدرسه فارکس به https://tradersho.com/school متصل است.

تقویم native با نوار فرمان sticky، جستجو/فیلتر و قالب مستقل عدد/واحد آماده است. بنا به انتخاب کاربر، منبع خام جدا بررسی می‌شود. تا اتصال منبع معتبر، `/api/calendar` پس از احراز هویت فقط `{configured:false,events:[],updatedAt:null}` می‌دهد؛ UI آماده‌سازی را نشان می‌دهد. این نسخه تقویم داده‌دار یا متصل به CashbackForex نیست. لینک خارجی منبع برای مشاهدهٔ موقت وجود دارد. نمونه‌های رویداد فقط در تست مرورگر mock می‌شوند، نه محصول.

قرارداد عدد و تست آن در `src/calendar/format.ts` و `format.test.ts` است. رشته اعشار canonical به‌همراه واحد/ارز مستقل؛ نگهداری دقت بدون گردکردن با تبدیلFloat، عدم حدس مقیاس/درصد و استفاده از bidi isolation. مقدار ناموجود/مبهم به‌صورت — نمایش داده می‌شود. زمان رویداد از UTC به Asia/Tehran نمایش داده خواهد شد. اهمیت یاپیش‌بینی را خودمان حدس نمی‌زنیم.

Official free economic calendar lives in `/panel/tools/calendar`. The shared collector (`scripts/collect-calendar.py`) aggregates 13 official schedules, not consensus/actual feeds. `python3 scripts/collect-calendar.py --output /tmp/calendar.json` is read-only; without `--output`, it uses `CALENDAR_PANEL_URL` (HTTPS) and `CALENDAR_INGEST_TOKEN` to update PostgreSQL through the machine endpoint. Configure the same random token in VPS environment and GitHub Actions secrets. `calendar.yml` runs hourly and after successful deployment; schedules can be delayed by GitHub. Source failures preserve cached records. Titles preserve the original alongside curated Persian labels. No synthetic observations or inferred forecasts/impact/times. Coverage and source links are visible in the calendar. See `docs/31-free-official-calendar.md` in the private working documentation for limitations and attribution.
