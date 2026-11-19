import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RiderOrder } from './order-details-sheet';

export function OrderPaymentQr({ order }: { order: RiderOrder }) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  if (order.status !== 'on_the_way' || order.rider_response !== 'accepted') return null;
  let total: number | null = null;
  try {
    const bill = typeof order.bill === 'string' ? JSON.parse(order.bill) : order.bill;
    if (bill && typeof bill === 'object' && !Array.isArray(bill)) {
      const value = (bill as Record<string, unknown>).customer_total ?? (bill as Record<string, unknown>).total;
      if ((typeof value === 'number' || typeof value === 'string') && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0) total = Number(value);
    }
  } catch { /* Do not invent an amount for a missing bill. */ }
  return <>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: visible }}
      onPress={() => setVisible(true)} style={styles.toggle}>
      <Text style={styles.toggleText}>Show QR</Text>
    </Pressable>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={[styles.overlay, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
        <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={() => setVisible(false)} />
        <View style={styles.panel} accessibilityViewIsModal>
          <View style={styles.header}>
            <Text style={styles.heading}>Payment QR</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close payment QR" onPress={() => setVisible(false)} style={styles.close}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.details}>
    <Text style={styles.title}>Collect payment</Text>
    <Text style={styles.amount}>{total === null ? 'Order amount unavailable' : `Order amount: ₹${total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}</Text>
    <Image source={require('../../assets/images/payment-upi-qr.png')} contentFit="contain"
      accessibilityLabel="Payment QR for Harsh Agrawal, UPI ID harshagrawal7878@oksbi"
      style={styles.qr} />
    <Text selectable style={styles.upi}>harshagrawal7878@oksbi</Text>
    <Text style={styles.help}>Ask the customer to scan and enter the amount. Verify payment before marking the order delivered.</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  toggle: { minHeight: 48, backgroundColor: '#1D4ED8', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  toggleText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, backgroundColor: 'rgba(0,0,0,0.88)' },
  panel: { width: '100%', maxWidth: 420, maxHeight: '100%', flexShrink: 1, backgroundColor: '#111827', borderRadius: 20, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  heading: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#FFFFFF', fontSize: 30 },
  details: { gap: 12, paddingHorizontal: 16, paddingBottom: 20 },
  title: { color: '#FFFFFF', fontWeight: '800', fontSize: 17 },
  amount: { color: '#FDBA74', fontWeight: '700', fontSize: 16 },
  qr: { width: '100%', aspectRatio: 1152 / 1600, maxWidth: 400, alignSelf: 'center' },
  upi: { textAlign: 'center', color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
  help: { color: '#D1D5DB', fontSize: 13, lineHeight: 19 },
});
