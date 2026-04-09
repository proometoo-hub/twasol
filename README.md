# Tawasol WhatsLike Ultimate

نسخة مطورة محليًا لتقريب المشروع من تجربة تطبيق مراسلة احترافي، مع تحسينات واسعة على البنية، قاعدة البيانات، الأمان، الرسائل، المجموعات، القنوات، الحالات، وإدارة المكالمات الفردية.

## التشغيل السريع على ويندوز

افتح نافذتين PowerShell.

### server
```powershell
cd C:\tawasol\server
npm install
npm run dev
```

### client
```powershell
cd C:\tawasol\client
npm install
npm run dev
```

ثم افتح:

```text
http://localhost:5173
```

## ملفات تشغيل سريعة
- `start-server.bat`
- `start-client.bat`
- `start-dev.bat`

## الحساب التجريبي
```text
username: Admin
password: 548519
```

## ما الذي أضيف في هذه النسخة
- تقوية بنية الإعدادات والبيئة
- تحسينات SQLite مع ترحيل تلقائي للنسخ القديمة
- تحسينات أمان أساسية: CORS, Helmet, rate limit, validation
- تحسينات الحسابات: تعديل الملف الشخصي، تغيير كلمة المرور، تفضيلات الخصوصية
- تحسين الرسائل: تعديل، حذف منطقي، تمييز، إعادة توجيه، ردود، تحميل أقدم
- تحسين المجموعات والقنوات: دعوة برمز، إدارة الأعضاء، ترقية الأدوار، إعدادات النشر
- تحسين الحالات: مشاهدة، عداد مشاهدات، كتم/إلغاء كتم
- سجل مكالمات فردية، حالات busy/reject/end، وتحسين signaling الأساسي
- تحسينات للواجهة: بحث داخل المحادثة، كتم/أرشفة/تثبيت، تحسينات RTL والجوال
- ملفات تشغيل على ويندوز و Docker للتشغيل المنظم

## حدود النسخة الحالية
هذه النسخة أقوى بكثير من السابقة، لكنها ليست بديلًا كاملاً لتطبيق إنتاجي ضخم مثل واتساب. ما يزال ينقصها في مرحلة لاحقة:
- تشفير طرفي كامل E2EE
- مزامنة متعددة الأجهزة
- بنية مكالمات جماعية احترافية (SFU/TURN production-grade)
- اختبارات آلية شاملة
- PostgreSQL أو بنية تخزين إنتاجية عند التوسع الكبير

## ملاحظات
- إذا كانت لديك قاعدة قديمة أو ملف JSON من نسخة سابقة، فطبقة قاعدة البيانات تحاول ترحيلها تلقائيًا.
- إذا ظهر خطأ بعد `npm install`، تأكد من إصدار Node. الموصى به 20.19+ أو 22+.


## تجهيز المشروع للرفع على الإنترنت

هذه النسخة مجهزة للنشر كخدمة ويب واحدة. في الإنتاج يتم بناء الواجهة `client` ثم يقوم السيرفر بتقديم ملفاتها الثابتة من `client/dist`.

### ملفات النشر المضافة
- `Dockerfile`
- `docker-compose.yml`
- `.dockerignore`
- `railway.json`
- `render.yaml`
- `Procfile`
- `.env.production.example`
- `server/.env.production.example`
- `client/.env.production.example`
- `DEPLOY_ONLINE_AR.txt`

### متغيرات البيئة الأساسية
```env
NODE_ENV=production
PORT=4000
BASE_URL=https://your-domain.example
CORS_ORIGINS=https://your-domain.example
JWT_SECRET=replace-with-a-long-random-secret
MEDIA_SECRET=replace-with-another-long-random-secret
MAX_UPLOAD_MB=80
MEDIA_LINK_TTL_SEC=86400
TRUST_PROXY=1
```

### تشغيل نسخة الإنتاج عبر Docker
```bash
cp .env.production.example .env.production
# عدل القيم السرية والدومين

docker compose up --build
```

ثم افتح:

```text
http://localhost:4000
```

### ملاحظات إنتاجية مهمة
- احفظ هذه المجلدات بشكل دائم: `server/data` و`server/private_media` و`server/uploads`.
- استخدم HTTPS في الإنترنت العام.
- إذا كان التطبيق والسيرفر على نفس الدومين في الإنتاج، اترك `VITE_API_BASE` فارغًا.
- في الإنتاج إذا لم تحدد `CORS_ORIGINS` فسيتم أخذ قيمة `BASE_URL` تلقائيًا.


## نشر GitHub + Railway + Vercel
راجع الملف:
- `DEPLOY_GITHUB_RAILWAY_VERCEL_AR.txt`
- `server/.env.railway.example`
- `client/.env.vercel.example`
