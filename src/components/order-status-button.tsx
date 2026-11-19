import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import type { RiderOrder } from './order-details-sheet';

export type DeliveryStatus = 'on_the_way' | 'delivered';
export function nextDeliveryStatus(order: Pick<RiderOrder, 'status' | 'rider_response'>): DeliveryStatus | null {
  if (order.rider_response !== 'accepted') return null;
  return order.status === 'prepared' ? 'on_the_way' : order.status === 'on_the_way' ? 'delivered' : null;
}
export function OrderStatusButton({ order, disabled, busy, onConfirm }: {
  order: RiderOrder; disabled: boolean; busy: boolean;
  onConfirm: (order: RiderOrder, next: DeliveryStatus) => void;
}) {
  const next = nextDeliveryStatus(order);
  if (!next) return null;
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled, busy }}
    disabled={disabled} onPress={() => onConfirm(order, next)}
    style={({ pressed }) => [styles.button, (pressed || disabled) && styles.dimmed]}>
    {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.text}>{next === 'on_the_way' ? 'Pickup order' : 'Delivered'}</Text>}
  </Pressable>;
}
const styles = StyleSheet.create({
  button: { minHeight: 48, borderRadius: 12, backgroundColor: '#F04400', padding: 14, alignItems: 'center', justifyContent: 'center' },
  text: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  dimmed: { opacity: 0.6 },
});
