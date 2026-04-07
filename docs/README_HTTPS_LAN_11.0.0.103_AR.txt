تواصل برو - تشغيل HTTPS محلي على الشبكة 11.0.0.103
=================================================

الملفات المهمة:
- certs\https\11.0.0.103\server.key.pem        مفتاح السيرفر
- certs\https\11.0.0.103\server.cert.pem       شهادة السيرفر
- certs\https\11.0.0.103\fullchain.pem         السلسلة الكاملة
- certs\client-trust\rootCA.cer            شهادة الجذر لتثبيتها على الاجهزة العميلة
- certs\client-trust\install-root-ca-windows.ps1  تثبيت تلقائي على ويندوز

التشغيل الموصى به:
1) شغل setup.bat مرة واحدة.
2) على كل جهاز ويندوز عميل: شغل PowerShell كمسؤول داخل certs\client-trust ثم نفذ:
   .\install-root-ca-windows.ps1 -LocalMachine
3) على Android / iPhone ثبت rootCA.cer يدويا ثم افتح:
   https://11.0.0.103:3020
4) لتشغيل النسخة الآمنة على الشبكة:
   start-https.bat
5) لتشغيل الويب + الديسكتوب + الجوال:
   start-all.bat

ملاحظات:
- تم اعتماد IP 11.0.0.103 داخل المشروع كعنوان LAN افتراضي.
- ملف rootCA الخاص بالمفتاح السري غير مضمن داخل المشروع عمدا لأسباب امنية.
- اذا غيرت IP لاحقا ستحتاج اصدار شهادة جديدة او استخدام اسم مضمن داخل SAN.
