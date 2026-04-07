import { getPushTokensForUsers, prunePushToken } from './pushStore';

type CallPushPayload = {
  userIds: number[];
  title: string;
  body: string;
  data: Record<string, any>;
};

function isExpoPushToken(token: string) {
  return /^ExponentPushToken\[.+\]$/.test(token || '') || /^ExpoPushToken\[.+\]$/.test(token || '');
}

export async function sendCallPushNotification({ userIds, title, body, data }: CallPushPayload) {
  const targets = await getPushTokensForUsers((userIds || []).filter(Boolean));
  const messages = targets
    .filter((item) => isExpoPushToken(item.token))
    .map((item) => ({
      to: item.token,
      sound: 'default',
      title,
      body,
      priority: 'high',
      channelId: 'calls',
      categoryId: 'TWASOL_CALL_ACTIONS',
      data,
    }));

  if (!messages.length) return;

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const json: any = await response.json().catch(() => null);
    const results = Array.isArray(json?.data) ? json.data : [];
    await Promise.all(results.map(async (item: any, index: number) => {
      const details = item?.details || {};
      if (item?.status === 'error' && details?.error === 'DeviceNotRegistered') {
        const token = messages[index]?.to;
        if (token) await prunePushToken(token);
      }
    }));
  } catch (error) {
    console.error('sendCallPushNotification failed', error);
  }
}
