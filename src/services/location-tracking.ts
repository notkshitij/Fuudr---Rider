import AsyncStorage from '@react-native-async-storage/async-storage';
import { Location, LocationProfile, LocationScope, LocationUpdatesHandle, type Position } from 'expo-location/next';
import { Platform } from 'react-native';

import { supabase } from '@/services/supabase';

const TRACKING_ERROR_KEY = 'rider-location-tracking-error';
const PUBLISH_INTERVAL_MS = 15_000;
const MIN_DISTANCE_METERS = 30;

let updatesHandle: LocationUpdatesHandle | null = null;
let lastPublishedAt = 0;
let lastCoordinates: { latitude: number; longitude: number } | null = null;
let writeQueue = Promise.resolve();

function getUpdatesHandle() {
  if (!updatesHandle) {
    updatesHandle = new LocationUpdatesHandle().withProfile(LocationProfile.AUTOMOTIVE_NAVIGATION);
  }
  return updatesHandle;
}

export class LocationTrackingError extends Error {
  constructor(message: string, readonly openSettings = false) {
    super(message);
    this.name = 'LocationTrackingError';
  }
}

function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export async function saveRiderLocation(position: Position, force = false) {
  const coordinates = position.coordinates;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const now = Date.now();
    if (!force && lastCoordinates && now - lastPublishedAt < PUBLISH_INTERVAL_MS
        && distanceMeters(lastCoordinates, coordinates) < MIN_DISTANCE_METERS) return;
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user) throw new Error('Sign in again to share your live location.');
    const { error } = await supabase.from('rider_live_locations').upsert({
      rider_id: session.user.id,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      tracking_active: true,
      position_timestamp: new Date(position.timestamp).toISOString(),
    }, { onConflict: 'rider_id' });
    if (error) throw new Error(error.message);
    lastPublishedAt = Date.now();
    lastCoordinates = coordinates;
    await AsyncStorage.removeItem(TRACKING_ERROR_KEY);
  });
  return writeQueue;
}

export async function recordTrackingError(message: string) {
  await AsyncStorage.setItem(TRACKING_ERROR_KEY, message);
}

export async function startRiderLocationTracking() {
  if (!Location.hasLocationServicesEnabled()) {
    if (Platform.OS !== 'android' || !await Location.enableLocationServices()) {
      throw new LocationTrackingError('Turn on your phone location services, then try again.');
    }
  }

  const foreground = await Location.requestForegroundPermissions();
  if (!foreground.granted) {
    throw new LocationTrackingError(
      foreground.canAskAgain ? 'Allow location access to start rider tracking.' : 'Allow location access in Settings to start tracking.',
      !foreground.canAskAgain,
    );
  }

  const background = await Location.requestBackgroundPermissions();
  if (background.scope !== LocationScope.ALWAYS) {
    throw new LocationTrackingError(
      background.canAskAgain
        ? 'Allow background location so dispatch can see your location while your phone is locked.'
        : 'Set location access to Allow all the time in Settings to use background tracking.',
      !background.canAskAgain,
    );
  }

  if (Platform.OS === 'android') {
    // The service still runs if notifications are denied, but Android recommends the visible notice.
    await Location.requestNotificationPermissions();
  }

  const position = await Location.getPosition({ timeout: 20, maxCachedAge: 5 });
  if (!position) throw new LocationTrackingError('GPS could not get a position. Move outdoors and try again.');
  await saveRiderLocation(position, true);

  const handle = getUpdatesHandle();
  if (!await handle.hasStarted()) await handle.start();
  if (Platform.OS === 'android') {
    await Location.ensureBackgroundSessionStarted({
      notificationTitle: 'Rider location sharing is on',
      notificationBody: 'Dispatch can see your live location while you work.',
      notificationColor: 0xF04400,
    });
  }
  await AsyncStorage.removeItem(TRACKING_ERROR_KEY);
  return position;
}

export async function stopRiderLocationTracking() {
  let wasStarted = false;
  const handle = getUpdatesHandle();
  wasStarted = await handle.hasStarted();
  if (wasStarted) await handle.stop();
  if (Platform.OS === 'android') await Location.stopBackgroundSession();

  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user && wasStarted) {
    const { error } = await supabase.from('rider_live_locations').upsert({
      rider_id: session.user.id,
      latitude: null,
      longitude: null,
      tracking_active: false,
      position_timestamp: null,
    }, { onConflict: 'rider_id' });
    if (error) throw new Error(error.message);
  }
  lastCoordinates = null;
  lastPublishedAt = 0;
  await AsyncStorage.removeItem(TRACKING_ERROR_KEY);
}

export async function getRiderTrackingSnapshot() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  if (!session?.user) throw new Error('Sign in to view location tracking.');

  const [started, locationResult, savedError] = await Promise.all([
    getUpdatesHandle().hasStarted(),
    supabase.from('rider_live_locations').select('latitude, longitude, tracking_active, position_timestamp, updated_at').eq('rider_id', session.user.id).maybeSingle(),
    AsyncStorage.getItem(TRACKING_ERROR_KEY),
  ]);
  if (locationResult.error) throw new Error(locationResult.error.message);
  const androidStatus = Platform.OS === 'android' ? getUpdatesHandle().status() : null;
  return {
    supported: true as const,
    isTracking: started && Boolean(locationResult.data?.tracking_active),
    latitude: locationResult.data?.latitude ?? null,
    longitude: locationResult.data?.longitude ?? null,
    positionTimestamp: locationResult.data?.position_timestamp ?? null,
    updatedAt: locationResult.data?.updated_at ?? null,
    trackingError: androidStatus?.lastError || savedError,
  };
}

export async function refreshCurrentRiderLocation(publishToDispatch = false) {
  const permission = await Location.getForegroundPermissions();
  if (!permission.granted) throw new LocationTrackingError('Allow location access to read your current position.');
  if (!Location.hasLocationServicesEnabled()) throw new LocationTrackingError('Phone location services are turned off.');
  const position = await Location.getPosition({ timeout: 20, maxCachedAge: 5 });
  if (!position) throw new LocationTrackingError('GPS could not get a position. Try again outdoors.');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new LocationTrackingError('Sign in again to update your location.');
  if (publishToDispatch) await saveRiderLocation(position, true);
  return position;
}

export function isLocationTrackingSupported() {
  return true;
}
