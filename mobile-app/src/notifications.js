import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

export const CALL_NOTIFICATION_CHANNEL = 'calls';
export const CALL_NOTIFICATION_CATEGORY = 'TWASOL_CALL_ACTIONS';
export const CALL_ACTION_ACCEPT = 'CALL_ACCEPT';
export const CALL_ACTION_DECLINE = 'CALL_DECLINE';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function configureCallNotifications() {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CALL_NOTIFICATION_CHANNEL, {
        name: 'Calls',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        vibrationPattern: [0, 250, 200, 250],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
      });
    }

    await Notifications.setNotificationCategoryAsync(CALL_NOTIFICATION_CATEGORY, [
      {
        identifier: CALL_ACTION_ACCEPT,
        buttonTitle: 'قبول',
        options: { opensAppToForeground: true },
      },
      {
        identifier: CALL_ACTION_DECLINE,
        buttonTitle: 'رفض',
        options: { isDestructive: true, opensAppToForeground: false },
      },
    ]);
  } catch {}
}

export async function registerForPushNotificationsAsync() {
  try {
    const isNativeMobile = Platform.OS === 'android' || Platform.OS === 'ios';
    if (!isNativeMobile) {
      return { token: '', error: 'الإشعارات الفعلية تحتاج بيئة Android أو iOS.' };
    }

    const current = await Notifications.getPermissionsAsync();
    let finalStatus = current.status;
    if (finalStatus !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      finalStatus = requested.status;
    }
    if (finalStatus !== 'granted') {
      return { token: '', error: 'تم رفض إذن الإشعارات.' };
    }

    const projectId = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;
    const tokenResponse = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();

    return { token: tokenResponse?.data || '', error: '' };
  } catch (error) {
    return { token: '', error: error instanceof Error ? error.message : 'تعذر تسجيل إشعارات Expo.' };
  }
}

export async function showIncomingCallNotification(payload = {}) {
  try {
    const title = payload?.isGroup ? 'دعوة مكالمة جماعية' : 'مكالمة واردة';
    const body = payload?.isGroup
      ? `${payload?.fromName || payload?.from?.name || 'مستخدم'} يدعوك للانضمام إلى ${payload?.roomName || 'المكالمة الجماعية'}`
      : `${payload?.fromName || payload?.from?.name || 'مستخدم'} يتصل بك الآن`;

    return await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        sticky: false,
        autoDismiss: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
        channelId: CALL_NOTIFICATION_CHANNEL,
        categoryIdentifier: CALL_NOTIFICATION_CATEGORY,
        data: payload,
      },
      trigger: null,
    });
  } catch {
    return null;
  }
}

export async function dismissNotificationById(notificationId) {
  if (!notificationId) return;
  try {
    await Notifications.dismissNotificationAsync(notificationId);
  } catch {}
}

export { Notifications };
