import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';

import { supabase } from '@/services/supabase';

export default function AuthCallbackScreen() {
  const [message, setMessage] = useState('Finishing your Google sign-in…');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const completeSignIn = async () => {
      const callbackUrl = await Linking.getInitialURL();
      const params = callbackUrl ? Linking.parse(callbackUrl).queryParams : null;
      const code = params?.code;
      const authError = params?.error_description || params?.error;

      if (typeof authError === 'string' && authError) {
        if (active) { setMessage(authError); setLoading(false); }
        return;
      }
      if (typeof code === 'string') {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          if (active) { setMessage(`Could not finish sign-in: ${error.message}`); setLoading(false); }
          return;
        }
      }
      const { data } = await supabase.auth.getSession();
      if (active && data.session) router.replace('/auth/profile');
      else if (active) { setMessage('Sign-in completed, but no session was returned. Please try again.'); setLoading(false); }
    };
    void completeSignIn();
    return () => { active = false; };
  }, []);

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        {loading ? <ActivityIndicator color="#F04400" /> : null}
        <Text style={styles.message}>{message}</Text>
        {!loading ? <Pressable style={styles.button} onPress={() => router.replace('/auth/auth')}><Text style={styles.buttonText}>Back to Google sign-in</Text></Pressable> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 460, minHeight: 150, gap: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderColor: '#E6E3E0', borderWidth: 1, borderRadius: 22, padding: 26 },
  message: { color: '#111111', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  button: { borderRadius: 12, paddingHorizontal: 18, paddingVertical: 13, backgroundColor: '#F04400' },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});

