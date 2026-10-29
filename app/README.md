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


## اخبار و تقویم اقتصادی

مسیر `/panel/market` شامل تیترهای فارسی با جستجو، فیلتر موضوع/منبع/بازه، صفحه‌بندی و لینک اصل خبر است. تقویم در `/panel/market?tab=calendar` ویجت فارسی رسمی CashbackForex است؛ دادهٔ آن استخراج یا بازنشر نمی‌شود. iframe در هر دو تم بارگذاری می‌شود و فقط پیام resize از origin و پنجرهٔ همان ارائه‌دهنده پذیرفته می‌شود. بارگذاری و دسترسی تابع سرویس خارجی است؛ شکست یا تأخیر با retry و لینک منبع نمایش داده می‌شود.

خبرها از GDELT و RSS رسمی Federal Reserve/BLS دریافت و در PostgreSQL نگهداری می‌شوند. نمایش فقط تیتر و لینک با ذکر منبع است؛ تصویر و متن کامل ناشر کپی نمی‌شود. خبر فارسی اصلی، ترجمهٔ ماشینی و عنوان فارسیِ اطلاعیهٔ رسمی برچسب مستقل دارند. خبر فاقد عنوان فارسی پنهان می‌ماند. زمان انتشار از زمان شناسایی/دریافت جداست؛ این سرویس خبر لحظه‌ای یا تضمین دسترسی ندارد. شکست یک منبع آخرین دادهٔ سالم را حذف نمی‌کند. بازهٔ پیش‌فرض ۳۰ روز است و وضعیت منابع در رابط دیده می‌شود.

`collect-news.py` بدون وابستگی Python، تیترهای انگلیسی را با MyMemory رایگان و سقف ۴۸۰۰ کاراکتر در روز ترجمه می‌کند؛ ارقام ترجمه با اصل تطبیق داده می‌شوند. فقط تیتر عمومی به مترجم می‌رود؛ اطلاعات کاربران ارسال نمی‌شود. محدودیت یا اختلال منابع ممکن است بعضی خبرها را تا نوبت بعد بدون ترجمه نگه دارد.

Workflow `Refresh market news` ساعتی و پس از استقرار موفق اجرا می‌شود. `NEWS_INGEST_TOKEN` باید در محیط سرور و GitHub Secrets یکسان و حداقل ۳۲ کاراکتر تصادفی باشد. endpointهای `/api/integrations/news` به این کلید نیاز دارند؛ `/api/news` فقط برای کاربر واردشده است. برای اجرای دستی از workflow_dispatch استفاده کنید. دکمهٔ پنل فقط دادهٔ ذخیره‌شده را مجدد می‌خواند. تنظیم ساعات GitHub ممکن است با تأخیر اجرا شود. GitHub-hosted runner استاندارد برای مخزن عمومی رایگان است؛ تغییر خصوصی‌بودن/پلن را جدا بررسی کنید.

تست‌ها: `python3 scripts/test_collect_news.py` و `npm run test:e2e:news` با DB منتهی به `_qa`، سرور 5183 و کلید QA. E2E از اخبار آزمایشی و iframe کنترل‌شده استفاده می‌کند؛ `node scripts/check-real-calendar.mjs` بررسی اختیاری سرویس واقعی است و به دسترسی اینترنت وابسته است.

منابع: [GDELT](https://www.gdeltproject.org/)، [Fed RSS](https://www.federalreserve.gov/feeds/feeds.htm)، [BLS RSS](https://www.bls.gov/feed/)، [MyMemory](https://mymemory.translated.net/doc/usagelimits.php)، [Calendar widget](https://www.cashbackforex.com/fa/tools/economic-calendar-widget).
