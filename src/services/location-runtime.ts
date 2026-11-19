import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

export const LOCATION_BUILD_REQUIRED = 'Install the latest Rider development app to use live location sharing.';

export function isLocationTrackingSupported() {
  return (Platform.OS === 'android' || Platform.OS === 'ios')
    && requireOptionalNativeModule('LocationModuleNext') !== null;
}

export function getLocationRuntime(): typeof import('expo-location/next') {
  if (!isLocationTrackingSupported()) throw new Error(LOCATION_BUILD_REQUIRED);
  // A static import would crash every route in Expo Go or an outdated native build.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Load synchronously only after checking native support.
  return require('expo-location/next');
}
