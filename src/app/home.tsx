import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { supabase } from '@/services/supabase';
import { stopRiderLocationTracking } from '@/services/location-tracking';

type RiderOrder = {
  id: string;
  order_reference: string;
  pickup_address: string;
  delivery_address: string;
  payout: number | string;
  status: 'assigned' | 'accepted' | 'picked_up' | 'delivered' | 'declined';
  created_at: string;
};

const statusLabels: Record<RiderOrder['status'], string> = {
  assigned: 'New order', accepted: 'Accepted', picked_up: 'Picked up', delivered: 'Delivered', declined: 'Declined',
};

export default function RiderHomeScreen() {
  const [name, setName] = useState('');
  const [orders, setOrders] = useState<RiderOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    setError('');
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { router.replace('/auth/auth'); return; }
    const { data: profile, error: profileError } = await supabase
      .from('rider_profiles').select('full_name, verification_status').eq('id', auth.user.id).maybeSingle();
    if (profileError || (profile?.verification_status !== 'verified' && profile?.verification_status !== 'approved')) {
      router.replace('/auth/profile');
      return;
    }
    setName(profile.full_name || auth.user.user_metadata?.name || 'Rider');
    const { data, error: ordersError } = await supabase
      .from('rider_orders').select('id, order_reference, pickup_address, delivery_address, payout, status, created_at')
      .eq('rider_id', auth.user.id).order('created_at', { ascending: false });
    if (ordersError) setError(ordersError.message);
    else setOrders((data || []) as RiderOrder[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const delivered = orders.filter((order) => order.status === 'delivered');
  const earnings = delivered.reduce((total, order) => total + Number(order.payout), 0);

  async function updateOrder(order: RiderOrder, status: RiderOrder['status']) {
    setError('');
    const { error: updateError } = await supabase.from('rider_orders').update({ status }).eq('id', order.id);
    if (updateError) setError(updateError.message);
    else await load(true);
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={ORANGE} /></View>;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.header}>
        <View><Text style={styles.eyebrow}>RIDER HOME</Text><Text style={styles.title}>Hi, {name.split(' ')[0]}</Text></View>
        <View style={styles.headerActions}>
          <Pressable onPress={() => router.push('/profile')} style={styles.refresh}><Text style={styles.refreshText}>Profile</Text></Pressable>
          <Pressable onPress={() => void load(true)} style={styles.refresh}><Text style={styles.refreshText}>{refreshing ? 'Loading...' : 'Refresh'}</Text></Pressable>
        </View>
      </View>

      <View style={styles.stats}>
        <View style={styles.statCard}><Text style={styles.statValue}>{delivered.length}</Text><Text style={styles.statLabel}>Completed deliveries</Text></View>
        <View style={styles.statCard}><Text style={styles.statValue}>{formatRupees(earnings)}</Text><Text style={styles.statLabel}>Delivery earnings</Text></View>
      </View>
      <Text style={styles.note}>Earnings are calculated from payouts on completed orders.</Text>

      <Text style={styles.sectionTitle}>Your orders</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!orders.length && !error ? <View style={styles.empty}><Text style={styles.emptyTitle}>No orders assigned yet</Text><Text style={styles.body}>New orders assigned to you by the admin will appear here.</Text></View> : null}
      {orders.map((order) => <View key={order.id} style={styles.orderCard}>
        <View style={styles.orderHeading}><Text style={styles.orderId}>{order.order_reference}</Text><Text style={styles.status}>{statusLabels[order.status]}</Text></View>
        <Text style={styles.label}>PICKUP</Text><Text style={styles.address}>{order.pickup_address}</Text>
        <Text style={styles.label}>DELIVER TO</Text><Text style={styles.address}>{order.delivery_address}</Text>
        <View style={styles.orderFooter}><Text style={styles.payout}>{formatRupees(Number(order.payout))}</Text>
          {order.status === 'assigned' ? <View style={styles.actions}><Action title="Decline" secondary onPress={() => void updateOrder(order, 'declined')} /><Action title="Accept" onPress={() => void updateOrder(order, 'accepted')} /></View> : null}
          {order.status === 'accepted' ? <Action title="Mark picked up" onPress={() => void updateOrder(order, 'picked_up')} /> : null}
          {order.status === 'picked_up' ? <Action title="Mark delivered" onPress={() => void updateOrder(order, 'delivered')} /> : null}
        </View>
      </View>)}
      <Pressable style={styles.signOut} onPress={async () => { try { await stopRiderLocationTracking(); } finally { await supabase.auth.signOut(); router.replace('/auth/auth'); } }}><Text style={styles.signOutText}>Sign out</Text></Pressable>
    </ScrollView>
  );
}

function Action({ title, onPress, secondary = false }: { title: string; onPress: () => void; secondary?: boolean }) {
  return <Pressable onPress={onPress} style={[styles.action, secondary && styles.actionSecondary]}><Text style={[styles.actionText, secondary && styles.actionTextSecondary]}>{title}</Text></Pressable>;
}

function formatRupees(amount: number) {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  stats: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, borderWidth: 1, borderColor: '#E6E3E0', backgroundColor: '#FFFFFF', borderRadius: 15, padding: 14, minHeight: 92, justifyContent: 'center' },
  statValue: { color: '#111111', fontSize: 22, fontWeight: '800' },
  statLabel: { color: '#666666', fontSize: 12, marginTop: 6 },
  note: { color: '#777777', fontSize: 12 },
  sectionTitle: { color: '#111111', fontSize: 18, fontWeight: '800', marginTop: 8 },
  empty: { borderWidth: 1, borderColor: '#E6E3E0', backgroundColor: '#FFFFFF', borderRadius: 15, padding: 18, gap: 8 },
  emptyTitle: { color: '#111111', fontSize: 15, fontWeight: '800' },
  body: { color: '#666666', fontSize: 13, lineHeight: 20 },
  orderCard: { borderWidth: 1, borderColor: '#E6E3E0', backgroundColor: '#FFFFFF', borderRadius: 15, padding: 15, gap: 9 },
  orderHeading: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' },
  orderId: { color: '#111111', fontSize: 15, fontWeight: '800' },
  status: { color: ORANGE, borderWidth: 1, borderColor: '#FFD1B8', backgroundColor: '#FFF3EB', borderRadius: 20, paddingVertical: 5, paddingHorizontal: 9, fontSize: 11, fontWeight: '700' },
  label: { color: '#777777', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginTop: 5 },
  address: { color: '#D5D8DB', fontSize: 14, lineHeight: 20 },
  orderFooter: { borderTopWidth: 1, borderTopColor: '#E6E3E0', paddingTop: 12, marginTop: 5, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  payout: { color: ORANGE, fontSize: 17, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 8 },
  action: { backgroundColor: ORANGE, borderRadius: 11, paddingVertical: 10, paddingHorizontal: 13 },
  actionSecondary: { backgroundColor: '#FFFFFF', borderColor: '#DDD9D5', borderWidth: 1 },
  actionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  actionTextSecondary: { color: '#111111' },
  error: { color: '#D94B17', fontSize: 13 },
  signOut: { alignSelf: 'center', padding: 15, marginTop: 10 },
  signOutText: { color: '#666666', fontWeight: '700' },
});
