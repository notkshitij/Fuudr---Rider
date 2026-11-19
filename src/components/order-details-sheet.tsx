import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { OrderPaymentQr } from './order-payment-qr';
import { OrderStatusButton, type DeliveryStatus } from './order-status-button';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type RestaurantDetails = {
  id: string; restaurant_name: string | null; address: string | null;
  latitude: number | null; longitude: number | null;
};
export type RiderOrder = {
  id: string; delivery_address: string | null; delivery_name: string | null;
  delivery_latitude: number | null; delivery_longitude: number | null;
  partner_id: string | null; bill: unknown; status: string;
  rider_response: 'pending' | 'accepted' | 'rejected'; rider_assignment_token: string;
};

function destination(latitude: number | null | undefined, longitude: number | null | undefined, address?: string | null) {
  if (typeof latitude === 'number' && typeof longitude === 'number'
    && Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 && (latitude !== 0 || longitude !== 0)) {
    return `${latitude},${longitude}`;
  }
  return address?.trim() || null;
}
function amount(value: unknown) {
  if (value == null || value === '' || (typeof value !== 'number' && typeof value !== 'string')) return 'Not available';
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? `₹${number.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : 'Not available';
}
function Directions({ to, label }: { to: string | null; label: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !to }}
    disabled={!to} style={({ pressed }) => [styles.direction, !to && styles.disabled, pressed && styles.pressed]}
    onPress={async () => {
      if (!to) return;
      try { await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(to)}`); }
      catch { Alert.alert('Could not open directions', 'Please try again or open your maps app.'); }
    }}><Text style={styles.directionIcon}>➤</Text></Pressable>;
}
export function OrderDetailsSheet({ order, restaurant, onClose, updatingId, actionsDisabled, onConfirmStatus }: {
  order: RiderOrder | null; restaurant?: RestaurantDetails; onClose: () => void;
  updatingId: string | null; actionsDisabled: boolean;
  onConfirmStatus: (order: RiderOrder, next: DeliveryStatus) => void;
}) {
  const insets = useSafeAreaInsets();
  if (!order) return null;
  let bill: Record<string, unknown> = {};
  try {
    const parsed = typeof order.bill === 'string' ? JSON.parse(order.bill) : order.bill;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) bill = parsed;
  } catch { /* Missing or malformed bills remain explicitly unavailable. */ }
  return <Modal transparent visible animationType="slide" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={onClose} />
      <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20), maxHeight: '85%' }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <View><Text style={styles.title}>Order details</Text><Text style={styles.muted}>#{order.id.slice(0, 8)}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close order details" onPress={onClose} style={styles.direction}><Text style={styles.close}>×</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <OrderPaymentQr key={`${order.id}:${order.status}`} order={order} />
          <View style={styles.row}>
            <View style={styles.copy}><Text style={styles.label}>RESTAURANT</Text><Text style={styles.name}>{restaurant?.restaurant_name || 'Restaurant unavailable'}</Text>
              {restaurant?.address ? <Text style={styles.address}>{restaurant.address}</Text> : null}</View>
            <Directions label="Directions to restaurant" to={destination(restaurant?.latitude, restaurant?.longitude, restaurant?.address)} />
          </View>
          <View style={styles.row}>
            <View style={styles.copy}><Text style={styles.label}>CUSTOMER</Text><Text style={styles.name}>{order.delivery_name || 'Name not available'}</Text>
              <Text style={styles.address}>{order.delivery_address || 'Address not available'}</Text></View>
            <Directions label="Directions to customer" to={destination(order.delivery_latitude, order.delivery_longitude, order.delivery_address)} />
          </View>
          <View style={styles.bill}>
            <View style={styles.row}><Text style={styles.muted}>Subtotal</Text><Text style={styles.address}>{amount(bill.subtotal ?? bill.total)}</Text></View>
            <View style={styles.row}><Text style={styles.muted}>Delivery fee</Text><Text style={styles.address}>{amount(bill.delivery_fee)}</Text></View>
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.totalValue}>{amount(bill.customer_total ?? ((typeof bill.subtotal === 'number' && typeof bill.delivery_fee === 'number') ? bill.subtotal + bill.delivery_fee : bill.total))}</Text></View>
          </View>
        </ScrollView>
        <View style={styles.actions}>
          <OrderStatusButton order={order} disabled={actionsDisabled} busy={updatingId === order.id} onConfirm={onConfirmStatus} />
        </View>
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  actions: { paddingHorizontal: 20 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, flexShrink: 1 },
  handle: { width: 40, height: 4, backgroundColor: '#DDD9D5', borderRadius: 2, alignSelf: 'center', marginTop: 12 },
  header: { padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#E6E3E0' },
  title: { fontSize: 21, fontWeight: '800', color: '#111111' },
  content: { padding: 20, gap: 24 },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  copy: { flex: 1, gap: 6 },
  label: { color: '#777777', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  name: { color: '#111111', fontSize: 16, fontWeight: '700', flexShrink: 1 },
  address: { color: '#333333', fontSize: 14, lineHeight: 21, flexShrink: 1 },
  muted: { color: '#666666', fontSize: 13, marginTop: 4 },
  direction: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFF3EB', alignItems: 'center', justifyContent: 'center' },
  directionIcon: { color: '#F04400', fontSize: 23, transform: [{ rotate: '-45deg' }] },
  close: { color: '#333333', fontSize: 26 },
  disabled: { opacity: 0.3 }, pressed: { opacity: 0.65 },
  bill: { borderTopWidth: 1, borderColor: '#E6E3E0', paddingTop: 20, gap: 12 },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderColor: '#E6E3E0', paddingTop: 12, marginTop: 4 },
  totalLabel: { color: '#111111', fontSize: 17, fontWeight: '800' },
  totalValue: { color: '#111111', fontSize: 17, fontWeight: '800' },
});
