## HTTPS local note
Use `start-https.bat` for local-network camera/microphone access. Open the backend and frontend HTTPS URLs once and accept the self-signed certificate warning.

# Twasol Pro v6.45.0 Final Delivery

نسخة تسليم مرتبة من المشروع بعد جولات التحديث المتتابعة.

## المكونات
- `backend` خادم Express + Prisma + Socket.IO
- `frontend` واجهة React
- `electron` نسخة سطح المكتب
- `mobile-app` نسخة Expo/WebView

## التشغيل السريع
1. انسخ `backend/.env.example` إلى `backend/.env` وعدّل القيم الحساسة.
2. شغّل `setup.bat` لأول مرة.
3. للتشغيل الكامل استخدم `start-all.bat`.

## أوامر مهمة
- `setup.bat` تثبيت الحزم وتوليد Prisma وفتح المنافذ المحلية
- `start.bat` تشغيل الويب فقط
- `start-desktop.bat` تشغيل نسخة Electron
- `start-mobile.bat` تشغيل نسخة الجوال
- `stop.bat` إيقاف نوافذ التشغيل

## ملاحظات
- هذه النسخة مخصصة للتشغيل المحلي أو داخل شبكة LAN.
- يجب تغيير `JWT_SECRET` و`ADMIN_EMAILS` قبل أي استخدام فعلي.
- نسخة الجوال الحالية تعتمد على WebView وتحتاج أن تكون الواجهة شغالة.


## ميزات الذكاء اللغوي
- ترجمة الرسائل أثناء المحادثة عبر `/api/ai/translate`
- تحويل الصوت والفيديو إلى نص عبر `/api/ai/transcribe-from-url`
- تحتاج هذه الميزات إلى ضبط `OPENAI_API_KEY` في `backend/.env`


## LAN default
- Frontend: https://localhost:3020
- Backend: https://localhost:4000
