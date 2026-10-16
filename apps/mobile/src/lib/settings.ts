import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useSyncExternalStore } from 'react';

export interface Settings {
  serverUrl: string;
  transcribeModel: string;
  noteModel: string;
}

const KEY = 'classnevis.settings.v1';

/** In development, the API runs on the same machine as Metro, so reuse Metro's host. */
function defaultServerUrl() {
  // set at build time for release APKs, e.g. EXPO_PUBLIC_API_URL=http://192.168.1.10:4000
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (__DEV__ && host) return `http://${host}:4000`;
  return Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
}

export const defaultSettings: Settings = {
  serverUrl: defaultServerUrl(),
  transcribeModel: '',
  noteModel: '',
};

let current: Settings = defaultSettings;
let loaded = false;
const listeners = new Set<() => void>();

export async function loadSettings(): Promise<Settings> {
  if (loaded) return current;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) current = { ...defaultSettings, ...JSON.parse(raw) };
  } catch {}
  loaded = true;
  listeners.forEach((l) => l());
  return current;
}

export function getSettings(): Settings {
  return current;
}

export async function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  listeners.forEach((l) => l());
  await AsyncStorage.setItem(KEY, JSON.stringify(current));
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
