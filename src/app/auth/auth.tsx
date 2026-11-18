import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from '@/services/supabase';

export default function AuthScreen() {
  const redirectUrl = useMemo(() => Linking.createURL('auth/callback'), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const continueIfSignedIn = async () => {
      const initialUrl = await Linking.getInitialURL();
      const url = initialUrl;
      if (url) {
        const code = Linking.parse(url).queryParams?.code;
        if (typeof code === 'string') {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError && alive) setError(exchangeError.message);
        }
      }
      const { data } = await supabase.auth.getSession();
      if (alive && data.session) router.replace('/auth/profile');
    };
    void continueIfSignedIn();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.replace('/auth/profile');
    });
    const urlListener = Linking.addEventListener('url', async ({ url }) => {
      const code = Linking.parse(url).queryParams?.code;
      if (typeof code === 'string') {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError && alive) setError(exchangeError.message);
      }
    });
    return () => { alive = false; listener.subscription.unsubscribe(); urlListener.remove(); };
  }, []);

  async function signInWithGoogle() {
    setBusy(true); setError('');
    try {
      const { data, error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl, skipBrowserRedirect: true },
      });
      if (authError) throw authError;
      if (!data.url) throw new Error('Google sign-in could not be started.');
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
      if (result.type === 'success' && result.url) {
        const code = Linking.parse(result.url).queryParams?.code;
        if (typeof code === 'string') {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Google sign-in failed. Please try again.');
    } finally { setBusy(false); }
  }

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.brandRow}><View style={styles.brandMark}><Text style={styles.brandGlyph}>R</Text></View><Text style={styles.brand}>RIDER</Text><Text style={styles.role}>DRIVER PARTNER</Text></View>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>YOUR NEXT RIDE STARTS HERE</Text>
          <Text style={styles.title}>Drive with{ '\n' }confidence.</Text>
          <Text style={styles.subtitle}>Sign in to get started as a Rider driver partner.</Text>
          <View style={styles.perks}><Text style={styles.perk}>✦  Flexible hours, on your terms</Text><Text style={styles.perk}>✦  A simple setup that takes minutes</Text></View>
          <Pressable accessibilityRole="button" style={[styles.primary, busy && styles.disabled]} onPress={signInWithGoogle} disabled={busy}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <><Text style={styles.google}>G</Text><Text style={styles.primaryText}>Continue with Google</Text></>}
          </Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.finePrint}>By continuing, you agree to our Terms of Service and Privacy Policy.</Text>
        </View>
        <Text style={styles.footer}>NEED HELP?  CONTACT SUPPORT</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  brandRow: { width: '100%', maxWidth: 460, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 26 },
  brandMark: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F04400', alignItems: 'center', justifyContent: 'center' },
  brandGlyph: { color: '#FFFFFF', fontWeight: '900', fontSize: 18 },
  brand: { color: '#111111', fontSize: 13, fontWeight: '800', letterSpacing: 2 },
  role: { color: '#777777', fontSize: 9, letterSpacing: 1.4, marginLeft: 'auto' },
  card: { width: '100%', maxWidth: 460, backgroundColor: '#FFFFFF', borderColor: '#E6E3E0', borderWidth: 1, borderRadius: 22, padding: 26 },
  eyebrow: { color: '#F04400', fontSize: 10, fontWeight: '800', letterSpacing: 1.7, marginBottom: 15 },
  title: { fontSize: 32, lineHeight: 38, color: '#111111', fontWeight: '700', letterSpacing: -1 },
  subtitle: { fontSize: 14, lineHeight: 22, color: '#666666', marginTop: 10, marginBottom: 25 },
  perks: { gap: 12, marginBottom: 26 },
  perk: { color: '#333333', fontSize: 13 },
  primary: { minHeight: 52, borderRadius: 13, backgroundColor: '#F04400', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 11, marginTop: 8 },
  primaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  google: { fontSize: 18, fontWeight: '900', color: '#FFFFFF' },
  finePrint: { color: '#777777', fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 17 },
  error: { color: '#D94B17', fontSize: 12, marginTop: 12 },
  disabled: { opacity: 0.6 },
  footer: { color: '#888888', fontSize: 9, letterSpacing: 1.2, marginTop: 23 },
});

