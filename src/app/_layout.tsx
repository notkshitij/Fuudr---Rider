import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import '@/services/location-task';
import { retryPendingRiderLocation } from '@/services/location-tracking';

export default function RootLayout() {
  useEffect(() => {
    const retry = () => {
      if (AppState.currentState === 'active') void retryPendingRiderLocation();
    };
    retry();
    const subscription = AppState.addEventListener('change', retry);
    const timer = setInterval(retry, 15_000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, []);

  return <>
    <StatusBar style="dark" />
    <Stack screenOptions={{ headerShown: false }} />
  </>;
}
