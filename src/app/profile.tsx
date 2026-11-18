import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { supabase } from '@/services/supabase';
import { stopRiderLocationTracking } from '@/services/location-tracking';

type RiderProfile = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  document_type: string | null;
  verification_status: 'pending' | 'verified' | 'approved' | 'rejected';
  rejection_reason: string | null;
  id_image_path: string | null;
  selfie_image_path: string | null;
  verification_image_path: string | null;
};

const documentNames: Record<string, string> = {
  aadhaar: 'Aadhaar', pan: 'PAN card', driving_license: 'Driving licence',
};

export default function RiderProfileScreen() {
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [idImage, setIdImage] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { router.replace('/auth/auth'); return; }
    const { data, error: profileError } = await supabase.from('rider_profiles').select('*').eq('id', auth.user.id).maybeSingle();
    if (profileError) { setError(profileError.message); setLoading(false); return; }
    if (!data) { router.replace('/auth/profile'); return; }
    const rider = data as RiderProfile;
    setProfile(rider);
    const idPath = rider.id_image_path || rider.verification_image_path;
    if (idPath) {
      const { data: signed } = await supabase.storage.from('rider-verification').createSignedUrl(idPath, 3600);
      setIdImage(signed?.signedUrl || null);
    }
    if (rider.selfie_image_path) {
      const { data: signed } = await supabase.storage.from('rider-verification').createSignedUrl(rider.selfie_image_path, 3600);
      setSelfie(signed?.signedUrl || null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={ORANGE} /></View>;
  const status = profile?.verification_status || 'pending';

  return <ScrollView contentContainerStyle={styles.page}>
    <View style={styles.header}>
      <View><Text style={styles.eyebrow}>RIDER ACCOUNT</Text><Text style={styles.title}>My profile</Text></View>
      <Pressable onPress={() => void load()} style={styles.outlineButton}><Text style={styles.outlineText}>Refresh</Text></Pressable>
    </View>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <View style={styles.card}>
      <Text style={styles.label}>FULL NAME</Text><Text style={styles.value}>{profile?.full_name || '—'}</Text>
      <Text style={styles.label}>EMAIL</Text><Text style={styles.value}>{profile?.email || '—'}</Text>
      <Text style={styles.label}>PHONE</Text><Text style={styles.value}>{profile?.phone || '—'}</Text>
      <Text style={styles.label}>ID TYPE</Text><Text style={styles.value}>{profile?.document_type ? documentNames[profile.document_type] || profile.document_type : '—'}</Text>
    </View>
    <View style={styles.statusCard}>
      <Text style={styles.label}>VERIFICATION STATUS</Text>
      <Text style={styles.status}>{status === 'verified' || status === 'approved' ? 'Approved' : status === 'rejected' ? 'Not approved' : 'Pending review'}</Text>
      <Text style={styles.body}>{status === 'verified' || status === 'approved' ? 'Your rider account is approved. You can receive assigned deliveries.' : status === 'rejected' ? (profile?.rejection_reason || 'Your profile was not approved. Please contact support for next steps.') : 'Your profile is waiting for review. Verification usually takes 5-15 minutes.'}</Text>
    </View>
    {idImage ? <View style={styles.card}><Text style={styles.label}>ID PHOTO</Text><Image source={{ uri: idImage }} style={styles.image} /></View> : null}
    {selfie ? <View style={styles.card}><Text style={styles.label}>SELFIE</Text><Image source={{ uri: selfie }} style={styles.image} /></View> : null}
    <Pressable onPress={() => router.replace(status === 'verified' || status === 'approved' ? '/home' : '/auth/profile')} style={styles.primary}><Text style={styles.primaryText}>{status === 'verified' || status === 'approved' ? 'Go to rider home' : 'Back to verification'}</Text></Pressable>
    <Pressable style={styles.signOut} onPress={async () => { try { await stopRiderLocationTracking(); } finally { await supabase.auth.signOut(); router.replace('/auth/auth'); } }}><Text style={styles.outlineText}>Sign out</Text></Pressable>
  </ScrollView>;
}

const ORANGE = '#F04400';
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  page: { flexGrow: 1, backgroundColor: '#FFFFFF', padding: 20, paddingTop: 50, paddingBottom: 36, gap: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: ORANGE, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  title: { color: '#111111', fontSize: 27, fontWeight: '800', marginTop: 5 },
  outlineButton: { borderWidth: 1, borderColor: '#DDD9D5', backgroundColor: '#FFFFFF', borderRadius: 11, paddingVertical: 9, paddingHorizontal: 13 },
  outlineText: { color: '#111111', fontWeight: '800', fontSize: 13 },
  card: { borderWidth: 1, borderColor: '#E6E3E0', backgroundColor: '#FFFFFF', borderRadius: 15, padding: 15, gap: 7 },
  label: { color: '#777777', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginTop: 7 },
  value: { color: '#111111', fontSize: 15, marginBottom: 4 },
  statusCard: { borderWidth: 1, borderColor: '#FFD1B8', borderRadius: 15, padding: 15, gap: 8, backgroundColor: '#FFF3EB' },
  status: { color: ORANGE, fontSize: 20, fontWeight: '800' },
  body: { color: '#333333', fontSize: 13, lineHeight: 20 },
  image: { width: '100%', height: 210, resizeMode: 'contain', borderRadius: 12, marginTop: 8 },
  primary: { minHeight: 50, borderRadius: 13, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  error: { color: '#D94B17', fontSize: 13 },
  signOut: { alignSelf: 'center', padding: 14 },
});
