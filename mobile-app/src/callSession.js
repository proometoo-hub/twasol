import AsyncStorage from '@react-native-async-storage/async-storage';

const CALL_SESSION_KEY = 'twasol_native_call_session_v1';

export async function saveCallSession(session) {
  try {
    if (!session) {
      await AsyncStorage.removeItem(CALL_SESSION_KEY);
      return;
    }
    await AsyncStorage.setItem(CALL_SESSION_KEY, JSON.stringify({ ...session, savedAt: new Date().toISOString() }));
  } catch {}
}

export async function loadCallSession() {
  try {
    const raw = await AsyncStorage.getItem(CALL_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function clearCallSession() {
  try {
    await AsyncStorage.removeItem(CALL_SESSION_KEY);
  } catch {}
}
