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

- ثبت‌نام با تکرار رمز، حداقل ۸ کاراکتر شامل حروف کوچک/بزرگ، عدد و کاراکتر خاص؛ نشست در دیتابیس، تغییر رمز و خروج از همهٔ نشست‌ها. بازیابی رمز با اتصال ایمیل فعال می‌شود؛ تأیید ایمیل هنوز پیاده نشده است.
- تم روشن پیش‌فرض و دارک اختیاری؛ لوگوی شفاف متناسب با تم و حفظ انتخاب در مرورگر.
- داشبورد با خوشامدگویی، وضعیت خدمات و تیکت‌های واقعی؛ فقط یک ورودی به مرکز ابزارها. مدرسه فارکس، کیف پول و ریبیت همچنان به‌زودی‌اند. نمای بازار، تقویم، پنل ریسک و آموزش اکسپرت فعال‌اند؛ ابزارهای ناتمام به‌زودی نمایش داده می‌شوند.
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

DATABASE_URL باید تنظیم شده باشد. هیچ حساب پیش‌فرض مدیر و API عمومی ارتقای نقش وجود ندارد. پس از تغییر نقش، صفحهٔ پنل را تازه کنید. پیام‌ها در خود پنل نمایش داده می‌شوند؛ با اتصال SMTP، پاسخ کارشناس به صاحب تیکت ایمیل اطلاع‌رسانی می‌فرستد. ضمیمه هنوز وجود ندارد.

## فونت برند

فونت فارسی Yekan Bakh از وب‌فونت‌های موجود در سایت خود Tradersho دریافت و با @font-face استفاده شده است. باینری فونت‌ها دارایی استقرار خصوصی هستند و به‌طور پیش‌فرض از Git عمومی خارج‌اند. قبل از build در محیط جدید، چهار فایل مجاز را طبق public/fonts/README.md در public/fonts قرار دهید. بدون این فایل‌ها رابط fallback را نمایش می‌دهد. برای Gilroy انگلیسی هنوز فایل مجاز فراهم نشده است. ظاهر داخلی ویجت TradingView تابع خود ویجت است.

## ممیزی رابط

`npm run test:ui` ممیزی هندسه، overflow، کنتراست/دسترسی axe و hover در تم روشن/تیره را اجرا می‌کند؛ پورت 5183 و DATABASE_URL دیتابیس منتهی به `_qa` الزامی است. `npm run test:ui:states` خطا، retry، فوکوس، حفظ فرم و نبود فایل فونت را بررسی می‌کند. Chrome نصب‌شده لازم است. تصاویر و report.json در qa/audit محلی و خارج Git هستند. این تست‌ها جای آزمایش روی دستگاه واقعی یا ممیزی انسانی کامل دسترس‌پذیری را نمی‌گیرند.

`npm run test:ui:mobile` همان ممیزی را با حالت mobile/لمسی در Chromium، ۹ اندازهٔ عمودی/افقی و هر دو تم گسترش می‌دهد. اندازهٔ متن و ورودی‌ها، اهداف لمس ۴۴ پیکسلی، چگالی بنر، دکمه‌های انتهای فرم و تمام‌صفحهٔ چارت نیز بررسی می‌شوند. گزارش و تصاویر این اجرا جدا در `qa/mobile/` ذخیره می‌شوند. تنظیمات QA همان تست اصلی است؛ دستگاه واقعی را شبیه‌سازی کامل نمی‌کند. قواعد جمع‌وجور موبایل در `src/mobile.css` و فقط زیر عرض ۶۰۰ پیکسل فعال‌اند.

`npm run test:ui:wide` همهٔ صفحات را در عرض‌های ۱۲۸۰ تا ۵۱۲۰ با هر دو تم بررسی می‌کند؛ از جمله پوشش viewport، سقف عرض محتوا، تقارن دکمهٔ خروج و توقف/کاهش حرکت پس‌زمینه ورود. نتایج در `qa/wide/` هستند. قواعد تم تصویر و نمایشگر بزرگ در `src/refinements.css` نگهداری می‌شوند.

### Password recovery email adapter

Recovery supports direct SMTP or the legacy HTTPS adapter. With both unconfigured it returns HTTP 503 with a clear user-facing message. For the legacy adapter, configure `APP_PUBLIC_URL`, `RECOVERY_EMAIL_URL` and `RECOVERY_EMAIL_SECRET`. No reset tokens are returned to the browser or logged. Configure an HTTPS mail adapter endpoint that accepts `POST` JSON `{to, subject, text}` and `Authorization: Bearer <RECOVERY_EMAIL_SECRET>`, sends the text email through your chosen provider, and returns a 2xx status only after accepting delivery. Store the secret only in server environment variables. Use the public HTTPS panel origin for `APP_PUBLIC_URL` (localhost allowed for QA).

The email contains `/reset-password#<token>`; tokens expire after 15 minutes, are stored only as hashes, replace earlier recovery links, and cannot be reused. Reset validates the strong password and confirmation, rejects links issued before a password change, and revokes all sessions. Responses never disclose whether an account exists. Provider failures invalidate the new token and produce a generic operational log without personal data; monitor delivery at the adapter. Requests are throttled per account and IP. There is deliberately no demo reset bypass.

Run `DATABASE_URL=<database ending _qa> npm run test:e2e:recovery` with the QA server on port 5183 and email delivery disabled. The test uses a local mock adapter; it sends no real emails.


## تقویم اختصاصی

تقویم فقط در `/panel/tools/calendar` داخل پوستهٔ ابزارهاست. صفحه و job خبرها حذف شده‌اند؛ API قدیمی خبر410 می‌دهد و سوابق DB حذف نمی‌شوند. مدرسه فارکس به https://tradersho.com/school متصل است.

تقویم native به API رایگان PersianFX وصل است: عنوان فارسی، ساعت تهران، اهمیت اعلام‌شده و مقدار واقعی/پیش‌بینی/قبلی/اصلاح‌شده. فیلتر تاریخ، ارز، اهمیت و جستجو، صفحه‌بندی، کنترل‌ها و عنوان ستون sticky و کارت موبایل دارد. منبع اصلی `scripts/collect-persianfx.py` است؛ collector رسمی ۱۳منبع و داده‌های تاریخی در repository/DB حفظ شده‌اند ولی با feed جدید ادغام یا تکرار نمی‌شوند.

پیش‌نمایش نمای بازار فقط upcomingهای دارای ساعت مشخص را، به ترتیب زمان سرور نشان می‌دهد؛ `/api/calendar?upcoming=1&limit=50` سقف۵۰ دارد و پیش‌فرضAPIبرایسازگاری۲است. تعداد ردیف‌های۵۸پیکسلی باارتفاع کادر تطبیق می‌یابد؛ عنوان اصلی انگلیسی زیر فارسی و اهمیت متنی است، ارز و اهمیت در خود پیش‌نمایش قابل فیلترند؛ باگذشتزمان رویداد بدونانتظاربرایfetchبعدی حذفمی‌شود. ساعت پایهserverNowوelapsedمحلی است. جدولبزرگ متراکم باپرچم/کشور/ارز و عنوانفارسی/انگلیسی دوخطی و اهمیت/وضعیت دوخطی است؛موبایلکارتدارد. پس‌زمینهٔابزارهاوتقویمثابت وبدونهالهٔمتحرکاست. تست‌هاعرض۳۲۰تا۳۸۴۰وارتفاع۲۱۶۰راپوششمی‌دهند.

`python3 scripts/collect-persianfx.py --output /tmp/calendar.json` فقط دریافت و اعتبارسنجی می‌کند. بدون `--output` با `CALENDAR_PANEL_URL` و `CALENDAR_INGEST_TOKEN` به endpoint امن ingest می‌فرستد. GitHubActions در دقیقه‌های۲/۳۲/۴۷ روز جاری را و در دقیقه۱۷ هر ساعت بازه دیروز تا۱۴روز آینده را می‌گیرد؛ اجرای دستی۳۰روز قبل/بعد را seed می‌کند. تأخیر cron ممکن است؛ دریافت لحظه‌ای تضمین نمی‌شود. صفحه هر۶۰ثانیه فقط cache خود سرور را می‌خواند. خطای دریافت یا schema باعث حفظ آخرین snapshot موفق می‌شود.

قرارداد عدد در `src/calendar/format.ts`: اعشار canonical، واحد و ارز مستقل، null≠0، حفظ اعشار و علامت، مقادیر ترکیبی حراج به‌صورت بخش‌های مستقل و به ترتیب ناشر. مقدار اصلاح‌شده به‌طور مجزا نمایش داده می‌شود و جای قبلی را بی‌اطلاع نمی‌گیرد. ساعت‌های all-day و tentative به نیمه‌شب تبدیل نمی‌شوند. ارزهای غیرفارکس فیلتر می‌شوند. زمان محلی feed در آداپتور Asia/Tehran است؛ timestamp UTC ذخیره می‌شود.

جزئیات تصمیم/پوشش/آزمون در `docs/35-persianfx-native-calendar.md` است. این feed همهٔ کشورها، نتیجهٔ همهٔ رویدادها یا سرعت انتشار ForexFactory را تضمین نمی‌کند.

## Direct organizational SMTP

Set `MAIL_TRANSPORT=smtp`, `APP_PUBLIC_URL` (public HTTPS panel origin), `SMTP_HOST`, `SMTP_PORT` (587 STARTTLS or 465 TLS), `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, `MAIL_REPLY_TO`, and `MAIL_ENCRYPTION_KEY` (32 random bytes encoded as 64 hex characters) in the server environment. No separate email provider or HTTPS adapter is needed. Incomplete enabled configuration prevents startup. Certificate verification and encryption are mandatory; use a hostname covered by the SMTP certificate. Keep passwords and the encryption key outside Git and logs. Do not rotate the encryption key while pending jobs exist.

Password recovery queues a 15-minute, single-use reset link in the same transaction as its hashed token. Only the encrypted queue payload contains the raw link. New requests replace older queued links; password changes invalidate earlier links; reset revokes all sessions. Account existence is never disclosed in the response. Recovery jobs expire after 14 minutes to avoid intentionally delivering expired links.

Each committed agent reply queues one notification to the ticket owner with a link to `/panel/support/:id`. It excludes ticket subject/body and agent details. Customer messages, status-only changes, rejected requests and idempotent retries do not create notifications. SMTP failure does not undo a committed reply. Email replies go to `MAIL_REPLY_TO`; they do not add a ticket message.

PostgreSQL `mail_outbox` persists jobs across restarts; AES-256-GCM encrypts queued recipient/content with job-bound authentication. A database advisory lock and persisted clock coordinate workers. Default spacing is 5000ms (at most 12 attempts/minute); `MAIL_INTERVAL_MS` permits 1000–60000ms. Confirm hourly/daily host limits before increasing volume. Temporary failures retry up to five attempts with exponential delay; permanent SMTP 5xx/auth failures stop. Support jobs expire after 24 hours. Sent/failed payloads are cleared; metadata is retained at most seven days. Recovery metadata can disappear sooner through token cleanup. SMTP acceptance is not proof of inbox delivery. A crash after SMTP acceptance and before the database update can repeat a message; retries use a stable Message-ID.

Monitor queue counts by status/purpose and generic `Mail delivery` / `Mail worker unavailable` logs from the secure server. No public mail administration or arbitrary-send endpoint exists. `DATABASE_URL=<dedicated _qa database> npm run test:e2e:mail` tests recovery/notifications, access control, duplicates, encryption, concurrency, expiry and retries using a fake transport, without real emails. CI runs this test automatically.

فیلتر اهمیت در تقویم و پیش‌نمایش چندانتخابی است: `impact=high,medium`، مقدار `all` برای همه و `none` برای بدون انتخاب. ترکیب آرای بانک مرکزی با سه عدد صحیح و جداکنندهٔ خط تیره مستقل از مقدارهای اعشاری حفظ می‌شود؛ منبع مقدار خالی را به صفر تبدیل نمی‌کنیم.

تقویم از فیلتر چندارزی `currency=USD,EUR` و `none` پشتیبانی می‌کند. چک‌باکس‌ها، منابع قابل‌بازشدن، جستجوی دارای دکمه پاک‌کردن و فیلترهای جمع‌شوندهٔ موبایل فعال‌اند. ممیزی `scripts/ci-ui.mjs` صفحات پنل را در۱۹۸ترکیبصفحه/عرض/تم و تمام تب‌های ابزارها می‌سنجد؛ `QA_BRAND_FONTS=1` فونت واقعی برند را نیز بارگذاری می‌کند.

تقویم: انتخاب چندارزی مشترک در پیش‌نمایش و صفحهٔ تقویم؛ پیش‌فرض هشت ارز اصلی بدون CNY. `favorableDirection` از قاعدهٔ صریح PersianFX برای رنگ نتیجه، مقایسهٔ دقیق BigInt با پیش‌بینی. شمارش معکوس با ساعت سرور؛ UI هر۳۰ثانیه cache را می‌خواند. timer خود VPS (`tradersho-calendar.timer`) دریافت امروز را هر۶۰ثانیه اجرا می‌کند؛ workflow پنجرهٔ وسیع همچنان باقی است. Flicker فقط iframe خودش را هر۵دقیقه در تب نمایان بازخوانی می‌کند؛ تازه‌شدن دادهٔ ناشر تضمین نمی‌شود.

پنل ریسک `/panel/tools/risk` فعال است: موتور `src/risk/engine.ts` طبق مشخصات v1.2 با پنج ورودی و سه پروفایل، محاسبات محلی بدون ذخیره یا ارسال موجودی/ریسک، ظرفیت بدون سقف۱۰۰معامله و نمایش مرحلهٔ عبور. UI شامل انتخاب مرحله، بودجه/سقف، خالصTP، جدول، کپی و CSV است. `scripts/ci-risk-ui.mjs` فقط با DATABASE_URL ختم‌شونده به `_qa`، سرور5183 و Chrome اجرا می‌شود؛ در CI فعال است.


## آموزش تعاملی اکسپرت
`/panel/tools/expert` فعال است: چارت ثابتِ فرضی، بازسازی پنل v2.13 در iframe opaque و بدون دسترسی شبکه/حساب، Simple/Pro، پنج تب، پنجرهٔ More Settings، مدیر/ویرایشگر پریست، ALERT، انتخاب‌گر رنگ، تم‌ها و راهنماهای فارسی. چند راهنما با سنجاق، جابه‌جایی و چینش مستقل باز می‌مانند. کنترل‌ها صرفاً سناریوی محلی را تغییر می‌دهند. دانلود MT5 همان EX5 ورودی داخل ZIP به همراه LICENSE/NOTICE است؛ MT4 نیز با EX4 اصلی ارسالی و راهنمای مستقل MQL4/Experts برای دانلود موجود است. فایل‌های دانلود دست‌نخورده‌اند؛ اجرای معامله یا سازگاری همهٔ بروکرها تأیید نشده است.

کاتالوگ PDF از `src/expert/catalog.json` و `content.ts` با `node scripts/build-expert-catalog.mjs` ساخته می‌شود (پس از build، سرور QA روی5183 و فونت برند محلی). `ci-expert-ui.mjs` فقط با دیتابیس `_qa`، کنترل‌ها/پنجره‌ها، ۱۶اندازه/تم، overflow/axe و SHA دانلود را می‌سنجد؛ در CI فعال است. هیچ تستی سفارش واقعی نمی‌فرستد.

بازبینی بومی: کپی QA از سورس ارسالی با مسیرهای OrderSend/Async حذف‌شده، ۰خطای کامپایل و۱۸هشدار، در ترمینال portable بدون حساب و با معاملات/DLL غیرفعال اجرا شد؛ تصاویر۱۹حالت ذخیره شدند. خود EX5 نیز در همان محیط بارگذاری شد، اما نبود حساب/quote معتبر باعث می‌شود این بررسی جای آزمون اجرای معامله نباشد. هنگام خروج آفلاین در Wine خطای invalid pointer دیده شد؛ فایل دانلود تغییر نکرده و این محدودیت در یادداشت نسخه آمده است.

بازخورد۱۰نوامبر: ورود اکسپرت بدون راهنمای باز؛ پنل چپ و مانیتور بالا راست، ارتفاع تطبیقی برای۵هدف/Stop Limit/ATR، رنگ نواحی TP/SL و Light/Dark به چارت آموزشی متصل‌اند. نمایش میله‌ای ریسک با کارت‌های هم‌اندازه و خالص هدف/سربه‌سر جایگزین شده؛ engine v1.2 تغییر نکرده است. تست‌های ci-expert-ui و ci-risk-ui این رفتارها را حفظ می‌کنند.
