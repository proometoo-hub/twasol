#!/bin/bash
# ============================================================
# Twasol Pro — تحديث المشروع على GitHub
# ============================================================

# 1. ادخل مجلد المشروع الجديد
cd twasol_global

# 2. إذا المجلد ما فيه git، اربطه بالمستودع الموجود
git init
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git 2>/dev/null || true

# 3. احذف كل الملفات القديمة من git tracking
git rm -rf --cached . 2>/dev/null || true

# 4. أضف كل الملفات الجديدة
git add -A

# 5. Commit التحديث
git commit -m "v6.48.3 — Global deployment + call fixes + security hardening

- CRITICAL: Fixed socket.join(user room) — all events now delivered
- CRITICAL: Added TURN server fallback for cross-network calls
- Fixed CallModal: graceful media failure, stale closure, reconnection
- Fixed useCall: added native_call_end listener, proper cleanup
- Security: removed exposed JWT_SECRET, SSL private key, unhashed token fallback
- Fixed DATABASE_URL: SQLite → PostgreSQL
- Added Railway + Vercel deployment configs
- Socket.IO: websocket+polling transports, connection recovery
- WebRTC: 4 STUN servers, iceCandidatePoolSize, openrelay TURN fallback"

# 6. ادفع للـ main branch (force لاستبدال كل شيء)
git branch -M main
git push origin main --force
