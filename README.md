# MarkaBot v2

بوت ديسكورد (discord.js v14) مع لوحة تحكم عربية. البوت ولوحة التحكم يعملان في **عملية واحدة على منفذ واحد**، وكل البيانات محفوظة في ملفات JSON داخل مجلد `data/` (بدون أي قاعدة بيانات).

## المتطلبات
- Node.js 18.17 أو أحدث (يُفضّل 20)
- بوت من [بوابة المطورين](https://discord.com/developers/applications)

## 1) إعداد بوابة المطورين
1. **Bot** ← فعّل `Server Members Intent` و `Message Content Intent`.
2. **OAuth2** ← انسخ `Client ID` و `Client Secret`.
3. **OAuth2 ← Redirects** ← أضف: `DASHBOARD_URL/callback`
   مثال: `http://123.45.67.89:25565/callback`

## 2) ملف ‎.env
انسخ `.env.example` إلى `.env` واملأ القيم:

| المتغير | الوصف |
|---|---|
| `DISCORD_TOKEN` | توكن البوت |
| `CLIENT_ID` | آيدي التطبيق |
| `CLIENT_SECRET` | سيكرت OAuth2 (لتسجيل الدخول في اللوحة) |
| `OWNER_IDS` | آيديات مالكي البوت مفصولة بفاصلة |
| `DASHBOARD_URL` | الرابط الذي تفتح منه اللوحة، بدون `/` في النهاية |
| `PORT` | المنفذ — إن لم يوجد يُستخدم `SERVER_PORT` الذي تعطيه الاستضافة تلقائياً |
| `AI_API_KEY` | مفتاح الذكاء الاصطناعي للمساعد الذكي وتقديم الإدارة (اختياري). مفتاح Gemini مجاني من Google AI Studio |
| `AI_PROVIDER` | `gemini` (الافتراضي) أو `anthropic` أو `openai` أو `groq` أو `openrouter` |
| `AI_MODEL` | اختياري، لتغيير الموديل الافتراضي |
| `GROQ_API_KEY` | اختياري: مزوّد احتياطي مجاني، بيرد لما المزوّد الأساسي يكون مضغوط |
| `AI_DAILY_FREE` / `AI_DAILY_PREMIUM` / `AI_DAILY_GLOBAL` | اختياري: حد الردود باليوم لكل سيرفر مجاني / بريميوم / لكل البوت (60 / 800 / 3000) |

## 3) الرفع على bot-hosting.net (أو أي لوحة Pterodactyl)
1. أنشئ سيرفر **Node.js** (نسخة 18 أو 20).
2. من **File Manager** ارفع ملف ZIP ثم اضغط **Unarchive** (تأكد أن `package.json` في المجلد الرئيسي وليس داخل مجلد فرعي).
3. أنشئ ملف `.env` في المجلد الرئيسي.
4. من **Network** خذ عنوان IP والمنفذ المخصص لك، واكتب `DASHBOARD_URL=http://IP:PORT` — المنفذ يُكتشف تلقائياً من `SERVER_PORT`.
5. من **Startup** اجعل الملف الرئيسي `index.js` (ملف `launcher.js` يعمل أيضاً).
6. شغّل السيرفر — اللوحة تثبّت الحزم تلقائياً من `package.json`. إن لم تفعل، شغّل `npm install` من الكونسول.
7. أضف رابط `DASHBOARD_URL/callback` في Redirects ببوابة المطورين.

> **صور الترحيب** تحتاج مكتبة `canvas` أو `@napi-rs/canvas` (الاثنتان في optionalDependencies، والبوت يستخدم أي واحدة تنجح). إن فشل تثبيت الاثنتين يعمل البوت طبيعياً بدون صور الترحيب. الخط العربي مضمّن في `assets/fonts`.

## الأوامر
البوت **Slash أولاً**: كل الأوامر تعمل بـ `/`. الأوامر النصية تعمل فقط إذا عيّن السيرفر بادئة عبر `/setprefix` أو من اللوحة.
أوامر المالك (`servers`, `leave`, `setname`, `setavatar`, `setstatus`, `admin`, `blacklist`) تعمل بمنشن البوت: `@MarkaBot servers`.

| القسم | الأوامر |
|---|---|
| عام | `help` `ping` `user` `server` `avatar` |
| التذاكر | `ticket-setup` `ticket-panel` (`panel`) `ticket-stats` (`tstats`) |
| الإدارة والسجن | `ban` `unban` `kick` `mute` `unmute` `clear` `jail` (`اسجن`) `unjail` (`تحرير`) `jail-setup` |
| القنوات | `hide` `show` `lock` `unlock` |
| السجلات | `setlog` `viewlogs` `disablelog` |
| الترحيب | `setwelcome` `welcomeimage` `welcome` `setgreet` `greet` `greetduration` `testgreet` |
| القيفاواي | `gstart` `gend` `greroll` `box` |
| الدعوات والعجلة | `invites` `addpoints` `setinvitelog` `wheelticket` `addreward` `removereward` `listrewards` |
| الإعدادات | `setprefix` `command` `manager-role` `feedback` `autoline` `vanity` `premium` |

## الإيموجيات المخصصة
كل الإيموجيات في `utils/emojis.js` وتُقرأ من `data/emojis.json`. من اللوحة ← الإعدادات ← **مدير الإيموجيات** (لمالك البوت) الصق `<:name:id>` لكل مفتاح. الحقول الفارغة تستخدم رموزاً نصية بديلة.
> الأزرار والتفاعلات تقبل فقط إيموجيات مخصصة، لذلك تظهر بدون إيموجي حتى تضيف إيموجياتك.

## البريميوم 👑
التفعيل لكل سيرفر لوحده:
- **من لوحة المالك ← البريميوم:** تفعيل سيرفر بالآيدي لعدد أيام (أو دائم)، أو **إنشاء أكواد تفعيل** وبيعها.
- **صاحب السيرفر** يفعّل الكود بالأمر `/premium code:MARKA-XXXX-XXXX-XXXX` أو من أعلى صفحة إعدادات السيرفر. الكود الثاني يمدّد المدة فوق الباقي.
- قبل الانتهاء بـ 3 أيام يوصل تنبيه لصاحب السيرفر، وعند الانتهاء يرجع شكل البوت للأصلي. **الإعدادات لا تُحذف** — الزيادات تتوقف فقط وترجع فور التجديد.

| | مجاني | بريميوم |
|---|---|---|
| أقسام التذاكر | 4 | 25 |
| التذاكر المفتوحة للعضو | 1 | 5 |
| جوائز العجلة | 15 | بلا حدود |
| الردود التلقائية / عدد القيفاواي | بلا حدود | بلا حدود |

ميزات البريميوم فقط: شكل البوت في السيرفر (اسم، صورة، بانر، نبذة)، إيموجيات البوت الخاصة بالسيرفر، تخصيص رسالة القيفاواي، شروط دخول القيفاواي (رتبة / دعوات / عمر حساب)، إدخالات إضافية للرتب، فورم أسئلة قبل فتح التذكرة، الإغلاق التلقائي للتذاكر، إحصائيات التذاكر، محرر صورة الترحيب الكامل (شكل الأفتار، الإطار، اسم العضو، نص إضافي)، Anti-Raid، Anti-Nuke.

الحدود والميزات كلها في `utils/premium.js` (الكائن `PLANS`) — عدّل الأرقام من هناك.

> **ملاحظات:** شكل البوت المخصص يحتاج صلاحية "تغيير الاسم المستعار" للبوت. Anti-Nuke يحتاج صلاحية **View Audit Log** وأن تكون رتبة البوت أعلى من رتب الأشخاص اللي ممكن يعاقبهم.

## البيانات
كل الملفات في `data/` وتُنشأ تلقائياً عند أول تشغيل. الصور المرفوعة من اللوحة في `data/uploads/`. خذ نسخة احتياطية من هذا المجلد قبل أي تحديث.

## هيكل المشروع
```
index.js            تشغيل البوت + اللوحة
utils/              store (JSON) · emojis · ui · commands (slash+prefix) · context · perms · time
systems/            tickets · transcript · jail · giveaways · invites · welcome · logs · vanity · messages
commands/<قسم>/     كل أمر ملف واحد يعمل كـ slash و prefix
dashboard/server.js Express + Discord OAuth2 + API
dashboard/views/    login · home · servers · moderation · commands · server_detail · unauthorized
dashboard/public/   style.css · app.js · moderation.js
```
