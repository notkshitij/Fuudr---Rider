import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { supabase } from '@/services/supabase';
import { stopRiderLocationTracking } from '@/services/location-tracking';

type RiderProfile = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  document_type: string | null;
};

const documentNames: Record<string, string> = {
  aadhaar: 'Aadhaar',
  pan: 'PAN card',
  driving_license: 'Driving licence',
};

export default function RiderProfileScreen() {
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { router.replace('/auth/auth'); return; }
    const { data, error: profileError } = await supabase.from('rider_profiles').select('*').eq('id', auth.user.id).maybeSingle();
    if (profileError) { setError(profileError.message); setLoading(false); return; }
    if (!data) { router.replace('/auth/profile'); return; }
    setProfile(data as RiderProfile);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={ORANGE} /></View>;

  return (
    <>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/home');
            }}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>RIDER ACCOUNT</Text>
            <Text style={styles.title}>Settings</Text>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.card}>
          <Text style={styles.label}>FULL NAME</Text>
          <Text style={styles.value}>{profile?.full_name || '—'}</Text>
          <Text style={styles.label}>EMAIL</Text>
          <Text style={styles.value}>{profile?.email || '—'}</Text>
          <Text style={styles.label}>PHONE</Text>
          <Text style={styles.value}>{profile?.phone || '—'}</Text>
          <Text style={styles.label}>ID TYPE</Text>
          <Text style={styles.value}>{profile?.document_type ? documentNames[profile.document_type] || profile.document_type : '—'}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          style={({ pressed }) => [styles.signOutButton, pressed && { opacity: 0.7 }]}
          onPress={() => setShowSignOutConfirm(true)}
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>

      <Modal
        transparent
        visible={showSignOutConfirm}
        animationType="fade"
        onRequestClose={() => { if (!signingOut) setShowSignOutConfirm(false); }}
      >
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { if (!signingOut) setShowSignOutConfirm(false); }} />
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Sign out</Text>
            <Text style={styles.dialogMessage}>Are you sure you want to sign out of your account?</Text>
            <View style={styles.dialogActions}>
              <Pressable
                disabled={signingOut}
                onPress={() => setShowSignOutConfirm(false)}
                style={({ pressed }) => [styles.dialogCancelButton, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={signingOut}
                onPress={async () => {
                  setSigningOut(true);
                  try {
                    await stopRiderLocationTracking();
                  } finally {
                    await supabase.auth.signOut();
                    setShowSignOutConfirm(false);
                    router.replace('/auth/auth');
                  }
                }}
                style={({ pressed }) => [styles.dialogConfirmButton, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.dialogConfirmText}>{signingOut ? 'Signing out...' : 'Sign out'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const ORANGE = '#F04400';
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  page: { flexGrow: 1, backgroundColor: '#FFFFFF', padding: 20, paddingTop: 50, paddingBottom: 36, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 8 },
  headerText: { flex: 1 },
  backBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#F5F3F1', alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 22, color: '#111111', fontWeight: '700' },
  eyebrow: { color: ORANGE, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  title: { color: '#111111', fontSize: 27, fontWeight: '800', marginTop: 2 },
  card: { borderWidth: 1, borderColor: '#E6E3E0', backgroundColor: '#FFFFFF', borderRadius: 15, padding: 16, gap: 7 },
  label: { color: '#777777', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginTop: 7 },
  value: { color: '#111111', fontSize: 15, marginBottom: 4 },
  error: { color: '#D94B17', fontSize: 13 },
  signOutButton: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#DDD9D5', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginTop: 16, paddingHorizontal: 16 },
  signOutText: { color: '#D94B17', fontWeight: '800', fontSize: 14 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', padding: 24 },
  dialog: { width: '100%', maxWidth: 340, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 22, gap: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  dialogTitle: { fontSize: 19, fontWeight: '800', color: '#111111' },
  dialogMessage: { fontSize: 14, color: '#666666', lineHeight: 20 },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 6 },
  dialogCancelButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#F5F3F1' },
  dialogCancelText: { color: '#333333', fontSize: 14, fontWeight: '700' },
  dialogConfirmButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#D94B17' },
  dialogConfirmText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
