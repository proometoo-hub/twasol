import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export const KEYS = {
  apiUrl: 'twasol_native_api_url',
  webUrl: 'twasol_native_web_url',
  token: 'twasol_native_token',
  user: 'twasol_native_user',
};

export async function saveSession({ token, user }) {
  await Promise.all([
    SecureStore.setItemAsync(KEYS.token, token || ''),
    AsyncStorage.setItem(KEYS.user, JSON.stringify(user || null)),
  ]);
}

export async function loadSession() {
  const [token, userRaw] = await Promise.all([
    SecureStore.getItemAsync(KEYS.token),
    AsyncStorage.getItem(KEYS.user),
  ]);
  return {
    token: token || '',
    user: userRaw ? JSON.parse(userRaw) : null,
  };
}

export async function clearSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.token),
    AsyncStorage.removeItem(KEYS.user),
  ]);
}
