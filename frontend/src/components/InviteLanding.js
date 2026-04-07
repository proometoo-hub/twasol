import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Link2, LogIn, Users, ShieldCheck, Clock3, RefreshCw, CheckCircle2, Copy, Share2 } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import Avatar from './Avatar';

export default function InviteLanding({ code, onBackHome }) {
  const { isLoggedIn } = useAuth();
  const { fetchConversations } = useChat();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const expiresText = useMemo(() => {
    if (!info?.expiresAt) return 'بدون تاريخ انتهاء';
    return new Date(info.expiresAt).toLocaleString('ar-EG');
  }, [info?.expiresAt]);

  const inviteUrl = `${window.location.origin}/join/${code}`;

  const loadInfo = async () => {
    setLoading(true); setError('');
    try {
      const r = await api.get(`/invites/info/${code}`);
      setInfo(r.data);
    } catch (err) {
      setError(err.response?.data?.error || 'تعذر تحميل رابط الدعوة');
    } finally { setLoading(false); }
  };

  useEffect(() => { loadInfo(); }, [code]);

  const afterJoin = async () => {
    await fetchConversations();
    setTimeout(() => {
      window.history.replaceState({}, '', '/');
      onBackHome?.();
    }, 150);
  };

  const joinNow = async () => {
    if (!isLoggedIn) {
      localStorage.setItem('pendingInviteCode', code);
      setMessage('تم حفظ رابط الدعوة. سجّل الدخول أولًا ثم سنكمل الانضمام.');
      window.history.replaceState({}, '', '/');
      onBackHome?.();
      return;
    }
    setJoining(true); setError(''); setMessage('');
    try {
      const r = await api.post(`/invites/join/${code}`);
      if (r.data?.pendingApproval) {
        setMessage('تم إرسال طلب الانضمام وبانتظار موافقة الإدارة.');
      } else if (r.data?.alreadyMember) {
        setMessage('أنت عضو بالفعل في هذه المحادثة.');
        await afterJoin();
      } else {
        setMessage('تم الانضمام بنجاح.');
        await afterJoin();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'تعذر الانضمام عبر هذا الرابط');
    } finally { setJoining(false); }
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  const shareInvite = async () => {
    try {
      const text = `انضم إلى ${info?.conversation?.name || 'هذه المحادثة'} عبر الرابط التالي`;
      if (navigator.share) await navigator.share({ title: info?.conversation?.name || 'دعوة', text, url: inviteUrl });
      else copyInvite();
    } catch {}
  };

  return (
    <div className="auth-bg">
      <div className="auth-card" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <button onClick={() => { window.history.replaceState({}, '', '/'); onBackHome?.(); }} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><ArrowRight size={20} /></button>
          <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><Link2 size={16} /> دعوة عامة</div>
          <button onClick={loadInfo} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><RefreshCw size={18} /></button>
        </div>

        {loading ? <div style={{ padding: 24, color: 'var(--text-secondary)' }}>جاري تحميل بيانات الدعوة...</div> : error ? (
          <div>
            <div className="auth-error">{error}</div>
            <button className="auth-btn" onClick={loadInfo}>إعادة المحاولة</button>
          </div>
        ) : info?.conversation ? (
          <>
            <div style={{ background: 'linear-gradient(135deg, rgba(0,168,132,.13), rgba(0,168,132,.04))', borderRadius: 18, padding: 18, marginBottom: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <Avatar src={info.conversation.image} name={info.conversation.name} size={88} />
                <div style={{ fontSize: 24, fontWeight: 800 }}>{info.conversation.name}</div>
                {info.conversation.description ? <div style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.7 }}>{info.conversation.description}</div> : null}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                  <span className="member-role">{info.conversation.isChannel ? 'قناة' : (info.conversation.isGroup ? 'مجموعة' : 'محادثة')}</span>
                  {info.requireApproval ? <span className="member-role" style={{ background: 'rgba(0,168,132,.1)', color: 'var(--accent)' }}><ShieldCheck size={13} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 4 }} />تحتاج موافقة</span> : null}
                  {info.remainingUses !== null ? <span className="member-role">المتبقي {info.remainingUses}</span> : <span className="member-role">استخدامات غير محدودة</span>}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div style={{ background: 'var(--bg-tertiary)', borderRadius: 12, padding: 12 }}><div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}><Users size={14} /> الأعضاء</div><div style={{ fontSize: 18, fontWeight: 700 }}>{info.memberCount}</div></div>
              <div style={{ background: 'var(--bg-tertiary)', borderRadius: 12, padding: 12 }}><div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}><Clock3 size={14} /> انتهاء الرابط</div><div style={{ fontSize: 13, fontWeight: 700 }}>{expiresText}</div></div>
            </div>

            <div style={{ background: 'var(--bg-tertiary)', borderRadius: 12, padding: 10, marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>رابط الدعوة</div>
              <div style={{ fontSize: 13, fontFamily: 'monospace', direction: 'ltr', textAlign: 'left', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{inviteUrl}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={copyInvite} className="auth-btn" style={{ margin: 0, padding: '10px 12px', flex: 1, background: copied ? 'var(--accent)' : 'var(--bg-secondary)', color: copied ? '#fff' : 'var(--text-primary)' }}>{copied ? <><CheckCircle2 size={16} style={{ marginLeft: 6, verticalAlign: 'middle' }} />تم النسخ</> : <><Copy size={16} style={{ marginLeft: 6, verticalAlign: 'middle' }} />نسخ الرابط</>}</button>
                <button onClick={shareInvite} className="auth-btn" style={{ margin: 0, padding: '10px 12px', flex: 1 }}><Share2 size={16} style={{ marginLeft: 6, verticalAlign: 'middle' }} />مشاركة</button>
              </div>
            </div>

            {message ? <div style={{ background: 'rgba(0,168,132,.1)', color: 'var(--accent)', borderRadius: 10, padding: 10, fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}><CheckCircle2 size={16} />{message}</div> : null}
            {error ? <div className="auth-error">{error}</div> : null}

            <button className="auth-btn" onClick={joinNow} disabled={joining}>{joining ? '...' : (isLoggedIn ? (info.requireApproval ? 'إرسال طلب انضمام' : 'الانضمام الآن') : 'سجّل الدخول للمتابعة')}</button>
            {!isLoggedIn ? <p className="auth-toggle" style={{ marginTop: 12 }}><LogIn size={14} style={{ verticalAlign: 'middle', marginLeft: 6 }} />سيتم حفظ رابط الدعوة مؤقتًا ثم إعادتك بعد تسجيل الدخول.</p> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
