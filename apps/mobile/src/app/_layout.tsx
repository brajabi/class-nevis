import {
  useFonts,
  Vazirmatn_400Regular,
  Vazirmatn_500Medium,
  Vazirmatn_700Bold,
  Vazirmatn_900Black,
} from '@expo-google-fonts/vazirmatn';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ToastHost } from '@/components/notes';
import { rtl } from '@/components/ui';
import { bootRecordingSystem } from '@/lib/recorder/boot';
import { loadSettings } from '@/lib/settings';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, primary: colors.primary, text: colors.text, border: colors.border },
};

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Vazirmatn_400Regular, Vazirmatn_500Medium, Vazirmatn_700Bold, Vazirmatn_900Black });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      await loadSettings();
      // Recover any interrupted recording and start the upload queue before UI shows.
      await bootRecordingSystem().catch((e) => console.warn('boot failed', e));
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (fontsLoaded && ready) SplashScreen.hideAsync();
  }, [fontsLoaded, ready]);

  if (!fontsLoaded || !ready) return null;

  return (
    <GestureHandlerRootView style={[{ flex: 1, backgroundColor: colors.bg }, rtl]}>
      <ThemeProvider value={navTheme}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_left' }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="recording/[id]" />
          <Stack.Screen name="note/[id]" />
        </Stack>
        {/* one app-wide toast, above every screen */}
        <ToastHost />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
