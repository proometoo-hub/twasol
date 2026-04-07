import { useEffect, useCallback } from 'react';

const OPEN_EVENT = 'twasol-open-conversation';

export default function usePushNotifications() {
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const notify = useCallback((title, body, icon, data = {}) => {
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      try {
        const n = new Notification(title, { body, icon, badge: icon, tag: data.tag || 'twasol-msg', renotify: true, data });
        n.onclick = () => {
          try {
            window.focus();
            window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: n.data || data || {} }));
          } catch {}
          n.close();
        };
        setTimeout(() => n.close(), 5000);
      } catch {}
    }
  }, []);

  return notify;
}
