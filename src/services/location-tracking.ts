import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LocationUpdatesHandle, Position } from 'expo-location/next';
import { Platform } from 'react-native';

import { supabase } from '@/services/supabase';
import { getLocationRuntime, isLocationTrackingSupported, LOCATION_BUILD_REQUIRED } from '@/services/location-runtime';

export { isLocationTrackingSupported } from '@/services/location-runtime';

const TRACKING_ERROR_KEY = 'rider-location-tracking-error';
const PENDING_FIX_KEY = 'rider-pending-location:';
const PUBLISH_INTERVAL_MS = 15_000;
const MIN_DISTANCE_METERS = 30;

let updatesHandle: LocationUpdatesHandle | null = null;
let lastPublishedAt = 0;
let lastCoordinates: { latitude: number; longitude: number } | null = null;
let lastFixTimestamp = 0;
let recovering = false;
let writeQueue = Promise.resolve();

function getUpdatesHandle() {
  const { LocationUpdatesHandle, LocationProfile } = getLocationRuntime();
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

export async function saveRiderLocation(position: Pick<Position, 'coordinates' | 'timestamp'>, force = false, activeRiderId?: string) {
  const coordinates = position.coordinates;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const now = Date.now();
    if (!force && lastCoordinates && now - lastPublishedAt < PUBLISH_INTERVAL_MS
        && distanceMeters(lastCoordinates, coordinates) < MIN_DISTANCE_METERS) return;
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user) throw new Error('Sign in again to share your live location.');
    if (activeRiderId && session.user.id !== activeRiderId) return;
    if ((!force || activeRiderId) && !await getUpdatesHandle().hasStarted()) return;
    if (position.timestamp < lastFixTimestamp) return;
    const pendingKey = PENDING_FIX_KEY + session.user.id;
    const saved = await AsyncStorage.getItem(pendingKey);
    if (saved && (JSON.parse(saved) as Pick<Position, 'timestamp'>).timestamp > position.timestamp) return;
    await AsyncStorage.setItem(pendingKey, JSON.stringify({ coordinates, timestamp: position.timestamp }));
    const { error } = await supabase.from('rider_live_locations').upsert({
      rider_id: session.user.id,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      tracking_active: true,
      position_timestamp: new Date(position.timestamp).toISOString(),
    }, { onConflict: 'rider_id' });
    if (error) throw new Error(error.message);
    lastFixTimestamp = position.timestamp;
    lastPublishedAt = Date.now();
    lastCoordinates = coordinates;
    await AsyncStorage.multiRemove([pendingKey, TRACKING_ERROR_KEY]);
  });
  return writeQueue;
}

export async function retryPendingRiderLocation() {
  if (recovering || !isLocationTrackingSupported()) return;
  recovering = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user || !await getUpdatesHandle().hasStarted()) return;
    const riderId = session.user.id;
    const pending = await AsyncStorage.getItem(PENDING_FIX_KEY + riderId);
    if (!pending) return;
    const saved = JSON.parse(pending) as Pick<Position, 'coordinates' | 'timestamp'>;
    const { Location } = getLocationRuntime();
    const current = await Location.getPosition({ timeout: 10, maxCachedAge: 5 }).catch(() => null);
    await saveRiderLocation(current && current.timestamp >= saved.timestamp ? current : saved, true, riderId);
  } catch {
    // The next foreground retry or background fix can upload the pending position.
  } finally {
    recovering = false;
  }
}

export async function recordTrackingError(message: string) {
  await AsyncStorage.setItem(TRACKING_ERROR_KEY, message);
}

export async function startRiderLocationTracking() {
  const { Location, LocationScope } = getLocationRuntime();
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
  const handle = getUpdatesHandle();
  if (!await handle.hasStarted()) await handle.start();
  if (Platform.OS === 'android') {
    await Location.ensureBackgroundSessionStarted({
      notificationTitle: 'Rider location sharing is on',
      notificationBody: 'Dispatch can see your live location while you work.',
      notificationColor: 0xF04400,
    });
  }
  try {
    await saveRiderLocation(position, true);
  } catch {
    await recordTrackingError('Location could not be uploaded. Rider will retry while sharing is on.');
  }
  return position;
}
export async function stopRiderLocationTracking() {
  if (!isLocationTrackingSupported()) return;
  const { Location } = getLocationRuntime();
  let wasStarted = false;
  const handle = getUpdatesHandle();
  wasStarted = await handle.hasStarted();
  if (wasStarted) await handle.stop();
  if (Platform.OS === 'android') await Location.stopBackgroundSession();

  const { data: { session } } = await supabase.auth.getSession();
  await writeQueue.catch(() => undefined);
  if (session?.user) await AsyncStorage.removeItem(PENDING_FIX_KEY + session.user.id);
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
  lastFixTimestamp = 0;
  lastCoordinates = null;
  lastPublishedAt = 0;
  await AsyncStorage.removeItem(TRACKING_ERROR_KEY);
}

export async function getRiderTrackingSnapshot() {
  if (!isLocationTrackingSupported()) {
    return {
      supported: false as const,
      isTracking: false,
      latitude: null,
      longitude: null,
      positionTimestamp: null,
      updatedAt: null,
      trackingError: LOCATION_BUILD_REQUIRED,
    };
  }
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
    isTracking: started,
    latitude: locationResult.data?.latitude ?? null,
    longitude: locationResult.data?.longitude ?? null,
    positionTimestamp: locationResult.data?.position_timestamp ?? null,
    updatedAt: locationResult.data?.updated_at ?? null,
    trackingError: androidStatus?.lastError || savedError,
  };
}

export async function refreshCurrentRiderLocation(publishToDispatch = false) {
  const { Location } = getLocationRuntime();
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
