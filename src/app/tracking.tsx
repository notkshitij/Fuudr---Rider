import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  getRiderTrackingSnapshot,
  isLocationTrackingSupported,
  LocationTrackingError,
  refreshCurrentRiderLocation,
  startRiderLocationTracking,
  stopRiderLocationTracking,
} from '@/services/location-tracking';

type Snapshot = Awaited<ReturnType<typeof getRiderTrackingSnapshot>>;
type Coordinates = { latitude: number; longitude: number };

export default function LocationTrackingScreen() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [localPosition, setLocalPosition] = useState<Coordinates | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsSettings, setNeedsSettings] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await getRiderTrackingSnapshot();
      setSnapshot(next);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read tracking status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 20_000);
    return () => clearInterval(interval);
  }, [load]);

  async function start() {
    setBusy(true); setError(''); setNeedsSettings(false);
    try {
      const position = await startRiderLocationTracking();
      setLocalPosition(position.coordinates);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start GPS tracking.');
      setNeedsSettings(cause instanceof LocationTrackingError && cause.openSettings);
    } finally { setBusy(false); }
  }

  async function stop() {
    setBusy(true); setError('');
    try {
      await stopRiderLocationTracking();
      setLocalPosition(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not stop location sharing.');
    } finally { setBusy(false); }
  }

  async function refreshLocation() {
    setBusy(true); setError('');
    try {
      const position = await refreshCurrentRiderLocation(Boolean(snapshot?.supported && snapshot.isTracking));
      setLocalPosition(position.coordinates);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'GPS could not get your current position.');
    } finally { setBusy(false); }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={ORANGE} /></View>;

  const supported = isLocationTrackingSupported();
  const isTracking = Boolean(snapshot?.supported && snapshot.isTracking);
  const latitude = snapshot?.supported && snapshot.latitude !== null ? snapshot.latitude : localPosition?.latitude;
  const longitude = snapshot?.supported && snapshot.longitude !== null ? snapshot.longitude : localPosition?.longitude;
  const updatedAt = snapshot?.supported ? snapshot.positionTimestamp || snapshot.updatedAt : null;

  return <ScrollView contentContainerStyle={styles.page}>
    <Text style={styles.eyebrow}>RIDER LOCATION</Text>
    <Text style={styles.title}>Live location</Text>
    <Text style={styles.intro}>Share your position with dispatch while you are working. Location sharing continues when your phone is locked.</Text>

    <View style={styles.statusCard}>
      <View style={[styles.statusDot, isTracking && styles.statusDotActive]} />
      <View style={styles.statusCopy}>
        <Text style={styles.statusTitle}>{!supported ? 'Mobile app required' : isTracking ? 'Location sharing is on' : 'Location sharing is off'}</Text>
        <Text style={styles.statusDescription}>{!supported ? 'Background GPS is available in the Android and iOS app.' : isTracking ? 'Dispatch can see your latest position.' : 'Your location is not being sent to dispatch.'}</Text>
      </View>
    </View>

    <View style={styles.locationCard}>
      <Text style={styles.sectionTitle}>Current position</Text>
      {latitude != null && longitude != null ? <>
        <Text style={styles.coordinate}>{latitude.toFixed(6)}</Text>
        <Text style={styles.coordinate}>{longitude.toFixed(6)}</Text>
        <Text style={styles.timestamp}>{updatedAt ? `Last GPS fix: ${new Date(updatedAt).toLocaleString()}` : 'GPS fix available on this device'}</Text>
      </> : <Text style={styles.emptyLocation}>No GPS position yet. Turn on location and refresh, or start sharing.</Text>}
      <Pressable disabled={busy || !supported} style={[styles.secondaryButton, (busy || !supported) && styles.disabled]} onPress={() => void refreshLocation()}>
        <Text style={styles.secondaryText}>{busy ? 'Getting location...' : 'Refresh current position'}</Text>
      </Pressable>
    </View>

    {snapshot?.supported && snapshot.trackingError ? <Text style={styles.warning}>{snapshot.trackingError}</Text> : null}
    {error ? <Text style={styles.warning}>{error}</Text> : null}
    {needsSettings ? <Pressable style={styles.secondaryButton} onPress={() => void Linking.openSettings()}><Text style={styles.secondaryText}>Open location settings</Text></Pressable> : null}

    {supported ? <Pressable disabled={busy} style={[styles.primaryButton, busy && styles.disabled]} onPress={() => void (isTracking ? stop() : start())}>
      <Text style={styles.primaryText}>{busy ? 'Please wait...' : isTracking ? 'Stop sharing location' : 'Start live location sharing'}</Text>
    </Pressable> : null}
    <Text style={styles.privacy}>Your live position is stored in a private Supabase table. Only your account can read or update it from the Rider app. Stop sharing to remove the saved coordinates.</Text>
    {Platform.OS === 'android' && isTracking ? <Text style={styles.notice}>Android shows an ongoing notification while background location sharing is active.</Text> : null}
  </ScrollView>;
}

const ORANGE = '#F04400';
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  page: { flexGrow: 1, backgroundColor: '#FFFFFF', padding: 22, paddingTop: 52, paddingBottom: 38, gap: 14 },
  eyebrow: { color: ORANGE, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: '#111111', fontSize: 27, fontWeight: '800', marginTop: -8 },
  intro: { color: '#666666', fontSize: 14, lineHeight: 21, marginBottom: 5 },
  statusCard: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15, borderRadius: 15, borderWidth: 1, borderColor: '#E6E3E0', backgroundColor: '#FFFFFF' },
  statusDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#888888' },
  statusDotActive: { backgroundColor: ORANGE },
  statusCopy: { flex: 1, gap: 4 },
  statusTitle: { color: '#111111', fontSize: 15, fontWeight: '800' },
  statusDescription: { color: '#666666', fontSize: 12, lineHeight: 18 },
  locationCard: { padding: 16, borderRadius: 15, borderWidth: 1, borderColor: '#E6E3E0', backgroundColor: '#FFFFFF', gap: 10 },
  sectionTitle: { color: '#111111', fontSize: 16, fontWeight: '800' },
  coordinate: { color: '#111111', fontSize: 17, fontVariant: ['tabular-nums'], fontWeight: '700' },
  timestamp: { color: '#777777', fontSize: 11, lineHeight: 16, marginTop: 2 },
  emptyLocation: { color: '#666666', fontSize: 13, lineHeight: 19 },
  primaryButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: ORANGE, paddingHorizontal: 16 },
  primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  secondaryButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#DDD9D5', backgroundColor: '#FFFFFF', paddingHorizontal: 14, marginTop: 3 },
  secondaryText: { color: '#111111', fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  warning: { color: '#D94B17', borderRadius: 12, borderWidth: 1, borderColor: '#FFD1B8', backgroundColor: '#FFF3EB', padding: 12, fontSize: 12, lineHeight: 18 },
  privacy: { color: '#777777', fontSize: 11, lineHeight: 17, marginTop: 3 },
  notice: { color: '#666666', fontSize: 11, lineHeight: 16 },
});
