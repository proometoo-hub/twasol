import React, { useEffect, useState } from 'react';
import { MessageSquare, Camera, Settings, LogOut, Sun, Moon, Globe, Bell, CheckSquare, Sparkles, Command, Wifi, ShieldCheck, UserCircle2, Users } from 'lucide-react';
import Avatar from './components/Avatar';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { SocketProvider, useSocket } from './context/SocketContext';
import { ChatProvider, useChat } from './context/ChatContext';
import useCall from './hooks/useCall';
import { useKeyboardShortcuts } from './hooks/useExtras';
import AuthPage from './components/AuthPage';
import ChatList from './components/ChatList';
import ChatWindow from './components/ChatWindow';
import Stories from './components/Stories';
import Profile from './components/Profile';
import SessionsPanel from './components/SessionsPanel';
import BlockedUsers from './components/BlockedUsers';
import CreateGroupModal from './components/CreateGroupModal';
import GroupSettings from './components/GroupSettings';
import SharedMedia from './components/SharedMedia';
import CallModal from './components/CallModal';
import GroupCallModal from './components/GroupCallModal';
import { AdminDashboard, PrivacySettings, ThemePicker, ModerationCenter, AuditLogView } from './components/SettingsViews';
import InviteLanding from './components/InviteLanding';
import QuickSwitcher from './components/QuickSwitcher';
import NotificationCenter from './components/NotificationCenter';
import DailyPlanner from './components/DailyPlanner';
import './styles/app.css';
import ErrorBoundary from './components/ErrorBoundary';
import { useLanguage } from './context/LanguageContext';
import { getStoredToken } from './utils/authStorage';

function MainApp() {
  const { user, logout, isLoggedIn } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const socketRef = useSocket();
  const { conversations, activeChat, totalUnread, closeChat, fetchConversations } = useChat();
  const { callData, startCall, endCall } = useCall(conversations);
  const [tab, setTab] = useState(() => localStorage.getItem('mainTab') || 'chats');
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [subView, setSubView] = useState(() => localStorage.getItem('mainSubView') || null);
  const { lang, setLang, languages, t, isRTL } = useLanguage();
  const [mobileChat, setMobileChat] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() => window.innerWidth <= 760);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [socketConnected, setSocketConnected] = useState(false);
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);
  const [health, setHealth] = useState({ status: 'unknown', version: '—', checkedAt: null, ok: false, uptimeSec: 0, clients: 0 });

  useEffect(() => {
    const syncMobileState = () => {
      const isMobile = window.innerWidth <= 760;
      setIsMobileViewport(isMobile);
      setMobileChat(Boolean(isMobile && activeChat));
    };
    syncMobileState();
    window.addEventListener('resize', syncMobileState);
    return () => window.removeEventListener('resize', syncMobileState);
  }, [activeChat]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const sync = () => setSocketConnected(Boolean(socket.connected));
    sync();
    socket.on('connect', sync);
    socket.on('disconnect', sync);
    return () => {
      socket.off('connect', sync);
      socket.off('disconnect', sync);
    };
  }, [socketRef, user?.id]);

  useKeyboardShortcuts({
    onNewChat: () => setShowGroupModal(true),
    onSearch: () => setShowQuickSwitcher(true),
    onCommandPalette: () => setShowQuickSwitcher(true),
    onEscape: () => {
      if (showQuickSwitcher) setShowQuickSwitcher(false);
      else if (subView) setSubView(null);
      else if (activeChat) closeChat();
    }
  });

  useEffect(() => { try { localStorage.setItem('mainTab', tab); } catch {} }, [tab]);
  useEffect(() => { try { if (subView) localStorage.setItem('mainSubView', subView); else localStorage.removeItem('mainSubView'); } catch {} }, [subView]);

  useEffect(() => {
    let stop = false;
    const checkHealth = async () => {
      try {
        const apiOrigin = String(process.env.REACT_APP_API_URL || process.env.REACT_APP_BACKEND_ORIGIN || '').trim().replace(/\/+$/, '') || (window.location.port && window.location.port !== '3020'
          ? window.location.origin
          : `${window.location.protocol}//${window.location.hostname}:${process.env.REACT_APP_API_PORT || '4000'}`);
        const r = await fetch(`${apiOrigin}/api/health`);
        const data = await r.json();
        if (stop) return;
        setHealth({ status: data.status || 'ok', version: data.version || '—', checkedAt: new Date().toISOString(), ok: true, uptimeSec: data.uptimeSec || 0, clients: data.socketClients || 0 });
      } catch {
        if (stop) return;
        setHealth(prev => ({ ...prev, checkedAt: new Date().toISOString(), ok: false }));
      }
    };
    checkHealth();
    const timer = setInterval(checkHealth, 30000);
    return () => { stop = true; clearInterval(timer); };
  }, []);

  useEffect(() => {
    const pendingCode = localStorage.getItem('pendingInviteCode');
    if (!pendingCode || !isLoggedIn) return;
    (async () => {
      try {
        const apiOrigin = String(process.env.REACT_APP_API_URL || process.env.REACT_APP_BACKEND_ORIGIN || '').trim().replace(/\/+$/, '') || (window.location.port && window.location.port !== '3020'
          ? window.location.origin
          : `${window.location.protocol}//${window.location.hostname}:${process.env.REACT_APP_API_PORT || '4000'}`);
        const r = await fetch(`${apiOrigin}/api/invites/join/${pendingCode}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${getStoredToken()}` }
        });
        if (!r.ok) return;
        localStorage.removeItem('pendingInviteCode');
        await fetchConversations();
      } catch {}
    })();
  }, [isLoggedIn, fetchConversations]);

  if (!isLoggedIn) return <AuthPage />;

  const handleCallStart = (type) => {
    if (!activeChat) return;
    if (activeChat.isGroup || activeChat.isChannel) {
      startCall({ ...activeChat, conversationId: activeChat.id }, type);
      return;
    }
    startCall({ id: activeChat.userId, name: activeChat.name, avatar: activeChat.avatar }, type);
  };

  const clearSub = () => setSubView(null);

  const renderSidebar = () => {
    if (subView === 'blocked') return <BlockedUsers onClose={clearSub} />;
    if (subView === 'admin') return <AdminDashboard onClose={clearSub} />;
    if (subView === 'privacy') return <PrivacySettings onClose={clearSub} />;
    if (subView === 'moderation') return <ModerationCenter onClose={clearSub} />;
    if (subView === 'sessions') return <SessionsPanel onClose={clearSub} />;
    if (subView === 'notifications') return <NotificationCenter onClose={clearSub} />;
    if (subView === 'daily') return <DailyPlanner onClose={clearSub} />;
    if (tab === 'chats') return <ChatList onCreateGroup={() => setShowGroupModal(true)} />;
    if (tab === 'status') return <Stories />;
    if (tab === 'profile') return (
      <Profile
        onShowBlocked={() => setSubView('blocked')}
        onShowPrivacy={() => setSubView('privacy')}
        onShowAdmin={() => setSubView('admin')}
        onShowModeration={() => setSubView('moderation')}
        onShowSessions={() => setSubView('sessions')}
        onShowThemes={() => setShowThemePicker(true)}
      />
    );
    return null;
  };

  const renderMain = () => {
    if (subView === 'groupSettings' && activeChat) return <GroupSettings onClose={clearSub} onShowMedia={() => setSubView('sharedMedia')} onShowAudit={() => setSubView('auditLog')} />;
    if (subView === 'sharedMedia' && activeChat) return <SharedMedia conversationId={activeChat.id} onClose={() => setSubView('groupSettings')} />;
    if (subView === 'auditLog' && activeChat) return <AuditLogView conversationId={activeChat.id} onClose={() => setSubView('groupSettings')} />;
    if (activeChat) return <ChatWindow onCallStart={handleCallStart} onOpenGroupSettings={() => setSubView('groupSettings')} />;
    return (
      <div className="welcome">
        <div className="welcome-badge"><Sparkles size={14} /> {t('activityCenter')}</div>
        <MessageSquare size={72} />
        <h1>{t('appName')}</h1>
        <p>{t('welcomeTitle')}</p>
        <div className="welcome-grid">
          <div className="welcome-card"><Command size={18} /><strong>Ctrl + K</strong><span>{t('quickSwitcherSub')}</span></div>
          <div className="welcome-card"><CheckSquare size={18} /><strong>{t('dailyPlanner')}</strong><span>{t('dailyPlannerSub')}</span></div>
          <div className="welcome-card"><Bell size={18} /><strong>{t('activityCenter')}</strong><span>{t('activityCenterSub')}</span></div>
        </div>
      </div>
    );
  };

  const serverState = !isOnline ? 'offline' : (!socketConnected || !health.ok ? 'degraded' : 'ready');
  const mobileMainViews = ['groupSettings', 'sharedMedia', 'auditLog'];
  const showingMainOnMobile = Boolean(activeChat || mobileMainViews.includes(subView || ''));
  const mobileTitle = activeChat
    ? activeChat.name
    : (subView === 'notifications'
      ? t('notificationsCenter')
      : subView === 'daily'
        ? t('dailyPlanner')
        : subView === 'sessions'
          ? t('settingsDevices')
          : tab === 'status'
            ? t('status')
            : tab === 'profile'
              ? t('profile')
              : t('chats'));

  const openMobileSection = (nextTab, nextSubView = null) => {
    if (activeChat) closeChat();
    setTab(nextTab);
    setSubView(nextSubView);
  };

  const desktopShell = (
    <>
      <nav className="nav nav-refined">
        <button className={`nav-profile ${tab === 'profile' && !subView ? 'active' : ''}`} onClick={() => { setTab('profile'); setSubView(null); }} title={user?.name || t('profile')}>
          <Avatar src={user?.avatar} name={user?.name} size={42} />
        </button>

        <div className="nav-primary-group">
          <div className={`nav-item ${tab === 'chats' ? 'active' : ''}`} onClick={() => { setTab('chats'); setSubView(null); }} title={t('chats')}>
            <MessageSquare size={22} />
            {totalUnread > 0 && <span className="nav-badge">{totalUnread}</span>}
          </div>
          <div className={`nav-item ${tab === 'status' ? 'active' : ''}`} onClick={() => { setTab('status'); setSubView(null); }} title={t('status')}><Camera size={22} /></div>
          <div className={`nav-item ${subView === 'notifications' ? 'active' : ''}`} onClick={() => { setTab('profile'); setSubView('notifications'); }} title={t('notificationsCenter')}><Bell size={22} /></div>
          <div className={`nav-item ${subView === 'daily' ? 'active' : ''}`} onClick={() => { setTab('profile'); setSubView('daily'); }} title={t('dailyPlanner')}><CheckSquare size={22} /></div>
          <div className={`nav-item ${tab === 'profile' && !!subView ? 'active' : ''}`} onClick={() => { setTab('profile'); setSubView('sessions'); }} title={t('settingsDevices')}><Settings size={22} /></div>
        </div>

        <div className="nav-spacer" />

        <div className="nav-status-stack slim">
          <div className={`nav-status-pill ${serverState === 'ready' ? 'ok' : serverState === 'degraded' ? 'warn' : 'bad'}`} title={serverState === 'ready' ? t('serverReady') : serverState === 'degraded' ? t('reconnecting') : t('disconnected')}>
            {serverState === 'ready' ? <ShieldCheck size={12} /> : <Wifi size={12} />}
            <span>{serverState === 'ready' ? t('serverReady') : serverState === 'degraded' ? t('reconnecting') : t('disconnected')}</span>
          </div>
          <div className="nav-version">v{health.version}</div>
        </div>

        <div className="nav-utility-group">
          <button className="nav-item nav-utility" onClick={toggleTheme} title={theme === 'dark' ? t('lightMode') : t('darkMode')}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
          <div className="lang-switcher" title={t('chooseLanguage')}><Globe size={16} /><select value={lang} onChange={e => setLang(e.target.value)} aria-label={t('language')}>{languages.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}</select></div>
          <button className="nav-item nav-utility" onClick={() => { socketRef.current?.disconnect(); logout(); }} title={t('logoutTitle')}><LogOut size={18} /></button>
        </div>
      </nav>

      <aside className="sidebar sidebar-shell">
        {renderSidebar()}
        <div className="sidebar-footer">
          <div>
            <strong>{subView === 'notifications' ? t('notificationsCenter') : subView === 'daily' ? t('dailyPlanner') : t('chats')}</strong>
            <span>{subView ? t('compactFastActionsFooter') : t('chatsViewFooter')}</span>
          </div>
          <div className="sidebar-footer-chip">v{health.version}</div>
        </div>
      </aside>

      <main className="main">
        {(!isOnline || !socketConnected || !health.ok) && (
          <div className="connection-banner connection-banner-compact">
            <span className="connection-banner-text">{!isOnline ? t('noInternet') : !socketConnected ? t('reconnectingServer') : t('serverNoResponse')}</span>
            <span className="connection-banner-meta">{t('versionLabel')} {health.version} • {health.clients} {t('activeClients')}</span>
          </div>
        )}
        {renderMain()}
      </main>
    </>
  );

  const mobileShell = (
    <div className={`mobile-shell ${showingMainOnMobile ? 'mobile-chat-shell' : 'mobile-sidebar-shell'}`}>
      {!showingMainOnMobile && (
        <header className="mobile-topbar">
          <button type="button" className="mobile-avatar-btn" onClick={() => openMobileSection('profile', null)} aria-label={t('profile')}>
            <Avatar src={user?.avatar} name={user?.name} size={38} />
          </button>
          <div className="mobile-topbar-copy">
            <div className="mobile-topbar-kicker">{serverState === 'ready' ? 'المساحة الأساسية' : 'جاري إعادة الاتصال'}</div>
            <h1>{mobileTitle}</h1>
            <p>{tab === 'chats' ? `${conversations.length} ${t('chats')}` : (user?.name || t('appName'))}</p>
          </div>
          <div className={`mobile-status-badge ${serverState}`}>
            {serverState === 'ready' ? <ShieldCheck size={14} /> : <Wifi size={14} />}
            <span>{serverState === 'ready' ? 'آمن' : 'غير مستقر'}</span>
          </div>
        </header>
      )}

      <div className="mobile-stage">
        {(!isOnline || !socketConnected || !health.ok) && (
          <div className="connection-banner connection-banner-compact mobile-banner">
            <span className="connection-banner-text">{!isOnline ? t('noInternet') : !socketConnected ? t('reconnectingServer') : t('serverNoResponse')}</span>
            <span className="connection-banner-meta">v{health.version}</span>
          </div>
        )}
        <div className={`mobile-pane ${showingMainOnMobile ? 'mobile-pane-main' : 'mobile-pane-sidebar'}`}>
          <div className={`mobile-pane-scroll ${showingMainOnMobile ? 'mobile-pane-scroll-main' : 'mobile-pane-scroll-sidebar'}`}>
            {showingMainOnMobile ? renderMain() : renderSidebar()}
          </div>
        </div>
      </div>

      {!showingMainOnMobile && (
        <nav className="mobile-bottom-nav">
          <button type="button" className={`mobile-tab ${tab === 'chats' && !subView ? 'active' : ''}`} onClick={() => openMobileSection('chats', null)}>
            <MessageSquare size={18} />
            <span>{t('chats')}</span>
            {totalUnread > 0 && <b>{totalUnread}</b>}
          </button>
          <button type="button" className={`mobile-tab ${tab === 'status' ? 'active' : ''}`} onClick={() => openMobileSection('status', null)}>
            <Camera size={18} />
            <span>{t('status')}</span>
          </button>
          <button type="button" className="mobile-tab mobile-tab-action" onClick={() => setShowGroupModal(true)} title={t('newGroup')} aria-label={t('newGroup')}>
            <Users size={20} />
          </button>
          <button type="button" className={`mobile-tab ${subView === 'notifications' ? 'active' : ''}`} onClick={() => openMobileSection('profile', 'notifications')}>
            <Bell size={18} />
            <span>{t('notificationsCenter')}</span>
          </button>
          <button type="button" className={`mobile-tab ${subView === 'sessions' ? 'active' : ''}`} onClick={() => openMobileSection('profile', 'sessions')}>
            <Settings size={18} />
            <span>{t('settingsDevices')}</span>
          </button>
          <button type="button" className={`mobile-tab ${tab === 'profile' && !subView ? 'active' : ''}`} onClick={() => openMobileSection('profile', null)}>
            <UserCircle2 size={18} />
            <span>{t('profile')}</span>
          </button>
        </nav>
      )}
    </div>
  );

  return (
    <div className={`app ${isMobileViewport ? 'mobile-frame' : 'desktop-frame'} ${mobileChat && activeChat ? 'chat-open' : ''} ${isRTL ? 'app-rtl' : 'app-ltr'}`}>
      {isMobileViewport ? mobileShell : desktopShell}
      {showGroupModal && <CreateGroupModal onClose={() => setShowGroupModal(false)} />}
      {showThemePicker && <ThemePicker onClose={() => setShowThemePicker(false)} />}
      <QuickSwitcher open={showQuickSwitcher} onClose={() => setShowQuickSwitcher(false)} />
      {callData && socketRef.current && callData.mode === 'direct' && <CallModal socket={socketRef.current} user={user} targetUser={callData.targetUser} callType={callData.callType} isIncoming={callData.isIncoming} incomingSignal={callData.incomingSignal} onClose={endCall} />}
      {callData && socketRef.current && callData.mode === 'group' && <GroupCallModal socket={socketRef.current} user={user} conversation={callData.conversation} callType={callData.callType} incoming={callData.isIncoming} onClose={endCall} />}
    </div>
  );
}

function RoutedApp() {
  const [path, setPath] = useState(() => window.location.pathname || '/');

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname || '/');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  if (path.startsWith('/join/')) {
    const code = path.split('/join/')[1]?.split('/')[0];
    return <InviteLanding code={code} onBackHome={() => setPath('/')} />;
  }

  return <MainApp />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ThemeProvider>
          <SocketProvider>
            <ChatProvider>
              <RoutedApp />
            </ChatProvider>
          </SocketProvider>
        </ThemeProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
