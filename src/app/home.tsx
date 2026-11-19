import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { supabase } from '@/services/supabase';
import { stopRiderLocationTracking } from '@/services/location-tracking';

type RiderOrder = {
  id: string;
  delivery_address: string | null;
  status: string;
};

export default function RiderHomeScreen() {
  const [name, setName] = useState('');
  const [orders, setOrders] = useState<RiderOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { router.replace('/auth/auth'); return; }
    const { data: profile, error: profileError } = await supabase
      .from('rider_profiles').select('full_name, verification_status').eq('id', auth.user.id).maybeSingle();
    if (profileError || (profile?.verification_status !== 'verified' && profile?.verification_status !== 'approved')) {
      router.replace('/auth/profile');
      return;
    }
    setError('');
    setName(profile.full_name || auth.user.user_metadata?.name || 'Rider');
    const { data, error: ordersError } = await supabase
      .from('orders').select('id, delivery_address, status')
      .eq('assigned_rider_id', auth.user.id).order('created_at', { ascending: false });
    if (ordersError) setError(ordersError.message);
    else setOrders((data || []) as RiderOrder[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const delivered = orders.filter((order) => order.status === 'delivered');
  if (loading) return <View style={styles.center}><ActivityIndicator color={ORANGE} /></View>;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.header}>
        <View><Text style={styles.eyebrow}>RIDER HOME</Text><Text style={styles.title}>Hi, {name.split(' ')[0]}</Text></View>
        <View style={styles.headerActions}>
          <Pressable onPress={() => router.push('/profile')} style={styles.refresh}><Text style={styles.refreshText}>Profile</Text></Pressable>
          <Pressable onPress={() => { setRefreshing(true); void load(); }} style={styles.refresh}><Text style={styles.refreshText}>{refreshing ? 'Loading...' : 'Refresh'}</Text></Pressable>
        </View>
      </View>
      <Pressable onPress={() => router.push('/tracking')} style={styles.locationButton}>
        <Text style={styles.locationButtonTitle}>Live location</Text>
        <Text style={styles.locationButtonDescription}>Open GPS settings and start sharing with dispatch</Text>
      </Pressable>

      <View style={styles.stats}>
        <View style={styles.statCard}><Text style={styles.statValue}>{delivered.length}</Text><Text style={styles.statLabel}>Completed deliveries</Text></View>
      </View>

      <Text style={styles.sectionTitle}>Your orders</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!orders.length && !error ? <View style={styles.empty}><Text style={styles.emptyTitle}>No orders assigned yet</Text><Text style={styles.body}>New orders assigned to you by the admin will appear here.</Text></View> : null}
      {orders.map((order) => <View key={order.id} style={styles.orderCard}>
        <View style={styles.orderHeading}><Text style={styles.orderId}>Order {order.id.slice(0, 8)}</Text><Text style={styles.status}>{order.status.replace(/_/g, ' ')}</Text></View>
        <Text style={styles.label}>DELIVER TO</Text><Text style={styles.address}>{order.delivery_address || 'No delivery address'}</Text>
      </View>)}
      <Pressable style={styles.signOut} onPress={async () => { try { await stopRiderLocationTracking(); } finally { await supabase.auth.signOut(); router.replace('/auth/auth'); } }}><Text style={styles.signOutText}>Sign out</Text></Pressable>
    </ScrollView>
  );
}

const ORANGE = '#F04400';
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  page: { flexGrow: 1, backgroundColor: '#FFFFFF', padding: 20, paddingTop: 50, paddingBottom: 36, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  headerActions: { flexDirection: 'row', gap: 8 },
  eyebrow: { color: ORANGE, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: '#111111', fontSize: 27, fontWeight: '800', marginTop: 5 },
  refresh: { borderColor: '#DDD9D5', backgroundColor: '#FFFFFF', borderWidth: 1, borderRadius: 11, paddingVertical: 9, paddingHorizontal: 13 },
  refreshText: { color: '#111111', fontWeight: '700' },
  locationButton: { borderWidth: 1, borderColor: '#FFD1B8', backgroundColor: '#FFF3EB', borderRadius: 14, padding: 14, gap: 4 },
  locationButtonTitle: { color: ORANGE, fontSize: 14, fontWeight: '800' },
  locationButtonDescription: { color: '#666666', fontSize: 12, lineHeight: 17 },
  stats: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, borderWidth: 1, borderColor: '#E6E3E0', backgroundColor: '#FFFFFF', borderRadius: 15, padding: 14, minHeight: 92, justifyContent: 'center' },
  statValue: { color: '#111111', fontSize: 22, fontWeight: '800' },
  statLabel: { color: '#666666', fontSize: 12, marginTop: 6 },
  sectionTitle: { color: '#111111', fontSize: 18, fontWeight: '800', marginTop: 8 },
  empty: { borderWidth: 1, borderColor: '#E6E3E0', backgroundColor: '#FFFFFF', borderRadius: 15, padding: 18, gap: 8 },
  emptyTitle: { color: '#111111', fontSize: 15, fontWeight: '800' },
  body: { color: '#666666', fontSize: 13, lineHeight: 20 },
  orderCard: { borderWidth: 1, borderColor: '#E6E3E0', backgroundColor: '#FFFFFF', borderRadius: 15, padding: 15, gap: 9 },
  orderHeading: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' },
  orderId: { color: '#111111', fontSize: 15, fontWeight: '800' },
  status: { color: ORANGE, borderWidth: 1, borderColor: '#FFD1B8', backgroundColor: '#FFF3EB', borderRadius: 20, paddingVertical: 5, paddingHorizontal: 9, fontSize: 11, fontWeight: '700' },
  label: { color: '#777777', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginTop: 5 },
  address: { color: '#333333', fontSize: 14, lineHeight: 20 },
  error: { color: '#D94B17', fontSize: 13 },
  signOut: { alignSelf: 'center', padding: 15, marginTop: 10 },
  signOutText: { color: '#666666', fontWeight: '700' },
});
