import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { OrderStatusButton, nextDeliveryStatus, type DeliveryStatus } from '@/components/order-status-button';

import { supabase } from '@/services/supabase';

import { OrderDetailsSheet, type RiderOrder, type RestaurantDetails } from '@/components/order-details-sheet';
import { haversineKm, formatDistance } from '@/services/distance';

export default function RiderHomeScreen() {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const statusActionOpen = useRef(false);
  const requestVersion = useRef(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [restaurants, setRestaurants] = useState<Record<string, RestaurantDetails>>({});
  const [name, setName] = useState('');
  const [orders, setOrders] = useState<RiderOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [responding, setResponding] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
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
      .from('orders').select('id, delivery_address, delivery_name, delivery_latitude, delivery_longitude, partner_id, bill, status, rider_response, rider_assignment_token')
      .eq('assigned_rider_id', auth.user.id).order('created_at', { ascending: false });
    if (version !== requestVersion.current) return;
    if (ordersError) setError(ordersError.message);
    else {
      const rows = (data || []) as RiderOrder[];
      setOrders(rows);
      const ids = [...new Set(rows.map((order) => order.partner_id).filter((id): id is string => Boolean(id)))];
      if (ids.length) {
        const { data: partners, error: partnerError } = await supabase.from('partners')
          .select('id, restaurant_name, address, latitude, longitude').in('id', ids);
        if (version !== requestVersion.current) return;
        if (partnerError) setError('Restaurant details could not load. Please refresh to retry.');
        else setRestaurants(Object.fromEntries((partners || []).map((partner) => [partner.id, partner])));
      } else setRestaurants({});
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function refreshOrders() {
      try {
        await load();
      } finally {
        if (active) timer = setTimeout(refreshOrders, 15_000);
      }
    }
    timer = setTimeout(refreshOrders, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [load]);

  function confirmResponse(order: RiderOrder, response: 'accepted' | 'rejected') {
    const action = response === 'accepted' ? 'Accept' : 'Reject';
    Alert.alert(`${action} this delivery?`, `Order ${order.id.slice(0, 8)}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: action, style: response === 'rejected' ? 'destructive' : 'default',
        onPress: async () => {
          setResponding(true);
          try {
            const { error } = await supabase.rpc('respond_to_rider_assignment', {
              p_order_id: order.id, p_token: order.rider_assignment_token, p_response: response,
            });
            if (error) throw error;
            await load();
          } catch (cause) {
            const message = cause && typeof cause === 'object' && 'message' in cause
              ? String(cause.message) : 'Please try again.';
            Alert.alert('Could not save response', message);
          } finally {
            setResponding(false);
          }
        } },
    ]);
  }

  function confirmStatus(order: RiderOrder, next: DeliveryStatus) {
    if (statusActionOpen.current || responding || nextDeliveryStatus(order) !== next) return;
    statusActionOpen.current = true;
    const release = () => { statusActionOpen.current = false; };
    Alert.alert(next === 'on_the_way' ? 'Pickup this order?' : 'Mark this order delivered?',
      next === 'on_the_way'
        ? 'Confirm that you have collected the order from the restaurant.'
        : 'Confirm that you have handed the order to the customer.', [
        { text: 'Cancel', style: 'cancel', onPress: release },
        { text: next === 'on_the_way' ? 'Yes, picked up' : 'Yes, delivered', onPress: async () => {
          setUpdatingId(order.id);
          requestVersion.current++;
          try {
            const { data, error: updateError } = await supabase.rpc('advance_assigned_rider_order', {
              p_order_id: order.id, p_token: order.rider_assignment_token, p_next: next,
            });
            if (updateError) throw updateError;
            if (data !== next) throw new Error('The order status was not confirmed. Please refresh.');
            requestVersion.current++;
            setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: next } : item));
            if (next === 'on_the_way') setSelectedId(order.id);
          } catch (cause) {
            const message = cause && typeof cause === 'object' && 'message' in cause
              ? String(cause.message) : 'Please try again.';
            Alert.alert('Could not update order', message);
          } finally {
            setUpdatingId(null);
            release();
            void load();
          }
        } },
      ], { cancelable: false });
  }

  const selected = orders.find((order) => order.id === selectedId) ?? null;
  const delivered = orders.filter((order) => order.status === 'delivered');
  if (loading) return <View style={styles.center}><ActivityIndicator color={ORANGE} /></View>;

  return (
    <>
    <ScrollView contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={ORANGE} colors={[ORANGE]} />}>
      <View style={styles.header}>
        <View><Text style={styles.eyebrow}>RIDER HOME</Text><Text style={styles.title}>Hi, {name.split(' ')[0]}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={() => router.push('/profile')} style={({ pressed }) => [styles.settingsBtn, pressed && { opacity: 0.6 }]}>
          <Text style={styles.settingsIcon}>⚙</Text>
        </Pressable>
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
      {orders.map((order) => {
        const restaurant = order.partner_id ? restaurants[order.partner_id] : undefined;
        const distance = formatDistance(
          haversineKm(restaurant?.latitude, restaurant?.longitude, order.delivery_latitude, order.delivery_longitude)
        );
        return (
          <View key={order.id} style={styles.orderCard}>
            <Pressable accessibilityRole="button" accessibilityLabel={`View details for order ${order.id.slice(0, 8)}`}
              testID={`order-card-${order.id}`} onPress={() => setSelectedId(order.id)} style={({ pressed }) => [styles.orderBody, pressed && { opacity: 0.65 }]}>
              <View style={styles.orderHeading}>
                <Text style={styles.orderId}>Order {order.id.slice(0, 8)}</Text>
                <View style={styles.orderBadges}>
                  {distance ? (
                    <View style={styles.distanceBadge}>
                      <Text style={styles.distanceBadgeText}>📍 {distance}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.status}>{order.status.replace(/_/g, ' ')}</Text>
                </View>
              </View>
              <Text style={styles.label}>DELIVER TO</Text>
              <Text style={styles.address}>{order.delivery_address || 'No delivery address'}</Text>
              {distance ? (
                <Text style={styles.distanceInfo}>
                  Distance from restaurant: <Text style={styles.distanceInfoValue}>{distance}</Text>
                </Text>
              ) : null}
              <Text style={styles.detailsHint}>View order details ›</Text>
            </Pressable>
            {order.rider_response === 'pending' && !['cancelled', 'delivered'].includes(order.status) ? (
              <View style={styles.headerActions}>
                <Pressable accessibilityRole="button" disabled={responding || updatingId !== null} style={styles.refresh} onPress={() => confirmResponse(order, 'accepted')}>
                  <Text style={styles.refreshText}>Accept</Text>
                </Pressable>
                <Pressable accessibilityRole="button" disabled={responding || updatingId !== null} style={styles.refresh} onPress={() => confirmResponse(order, 'rejected')}>
                  <Text style={styles.error}>Reject</Text>
                </Pressable>
              </View>
            ) : order.rider_response !== 'pending' ? (
              <Text style={styles.body}>{order.rider_response === 'accepted' ? 'Delivery accepted' : 'Delivery rejected'}</Text>
            ) : null}
            <OrderStatusButton order={order} disabled={responding || updatingId !== null} busy={updatingId === order.id} onConfirm={confirmStatus} />
          </View>
        );
      })}

    </ScrollView>
    <OrderDetailsSheet order={selected} restaurant={selected?.partner_id ? restaurants[selected.partner_id] : undefined} onClose={() => setSelectedId(null)} updatingId={updatingId} actionsDisabled={responding || updatingId !== null} onConfirmStatus={confirmStatus} />
    </>
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
  settingsBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F5F3F1', alignItems: 'center', justifyContent: 'center' },
  settingsIcon: { fontSize: 22, color: '#333333' },
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
  orderBody: { gap: 9 },
  detailsHint: { color: ORANGE, fontSize: 12, fontWeight: '700' },
  orderHeading: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' },
  orderBadges: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' },
  distanceBadge: { borderWidth: 1, borderColor: '#E6E3E0', backgroundColor: '#F8F7F5', borderRadius: 20, paddingVertical: 5, paddingHorizontal: 9 },
  distanceBadgeText: { color: '#444444', fontSize: 11, fontWeight: '700' },
  distanceInfo: { color: '#666666', fontSize: 13, marginTop: 2 },
  distanceInfoValue: { color: '#111111', fontWeight: '700' },
  orderId: { color: '#111111', fontSize: 15, fontWeight: '800' },
  status: { color: ORANGE, borderWidth: 1, borderColor: '#FFD1B8', backgroundColor: '#FFF3EB', borderRadius: 20, paddingVertical: 5, paddingHorizontal: 9, fontSize: 11, fontWeight: '700' },
  label: { color: '#777777', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginTop: 5 },
  address: { color: '#333333', fontSize: 14, lineHeight: 20 },
  error: { color: '#D94B17', fontSize: 13 },
});
