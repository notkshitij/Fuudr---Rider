import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/services/supabase';
import { stopRiderLocationTracking } from '@/services/location-tracking';

type DocType = 'aadhaar' | 'pan' | 'driving_license';
type VerificationMethod = 'document' | 'selfie';
type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  document_type: DocType | null;
  verification_method: VerificationMethod | null;
  verification_status: 'pending' | 'verified' | 'approved' | 'rejected';
  rejection_reason: string | null;
  verification_image_path: string | null;
  id_image_path: string | null;
  selfie_image_path: string | null;
};
const documents: { id: DocType; title: string }[] = [
  { id: 'aadhaar', title: 'Aadhaar' },
  { id: 'pan', title: 'PAN card' },
  { id: 'driving_license', title: 'Driving licence' },
];

export default function RiderProfileScreen() {
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState<string | undefined>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [docType, setDocType] = useState<DocType>('aadhaar');
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [verificationStep, setVerificationStep] = useState<'document' | 'selfie'>('document');
  const [idPreviewUri, setIdPreviewUri] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { router.replace('/auth/auth'); return; }
      const { data, error: loadError } = await supabase.from('rider_profiles').select('*').eq('id', authData.user.id).maybeSingle();
      if (!alive) return;
      setUserId(authData.user.id);
      setEmail(authData.user.email);
      setProfile(data as Profile | null);
      if (['verified', 'approved'].includes((data as Profile | null)?.verification_status || '')) {
        router.replace('/home');
        setLoading(false);
        return;
      }
      setName((data as Profile | null)?.full_name || String(authData.user.user_metadata?.full_name || authData.user.user_metadata?.name || ''));
      setPhone((data as Profile | null)?.phone || '');
      if (data) {
        setDocType(data.document_type || 'aadhaar');
        setStep(data.full_name ? (data.phone ? (data.verification_image_path ? 3 : 2) : 1) : 0);
        const idPath = data.id_image_path || data.verification_image_path;
        if (idPath) {
          const { data: imageData } = await supabase.storage.from('rider-verification').createSignedUrl(idPath, 3600);
          if (alive && imageData?.signedUrl) setIdPreviewUri(imageData.signedUrl);
        }
        if (data.selfie_image_path) {
          const { data: imageData } = await supabase.storage.from('rider-verification').createSignedUrl(data.selfie_image_path, 3600);
          if (alive && imageData?.signedUrl) setPreviewUri(imageData.signedUrl);
        }
      }
      if (loadError) setError(`Could not load rider profile: ${loadError.message}`);
      setLoading(false);
    };
    void load();
    return () => { alive = false; };
  }, []);

  async function save(values: Partial<Profile>) {
    setBusy(true); setError('');
    const { data, error: saveError } = await supabase.from('rider_profiles').upsert({ id: userId, email, ...values }).select('*').single();
    setBusy(false);
    if (saveError) {
      const message = [saveError.message, saveError.details, saveError.hint].filter(Boolean).join(' ');
      setError(message);
      return false;
    }
    setProfile(data as Profile); return true;
  }

  async function continueFromName() {
    if (name.trim().length < 2) { setError('Enter your full name to continue.'); return; }
    if (await save({ full_name: name.trim() })) setStep(1);
  }
  async function continueFromPhone() {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) { setError('Enter a valid phone number with country code if needed.'); return; }
    if (await save({ phone: `+${digits}` })) setStep(2);
  }

  async function chooseImage(source: 'camera' | 'library') {
    setError('');
    try {
      let result: ImagePicker.ImagePickerResult;
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { setError('Allow camera access to take the verification photo.'); return; }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], cameraType: verificationStep === 'selfie' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back, allowsEditing: true, quality: 0.8 });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 });
      }
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 8 * 1024 * 1024) { setError('Choose an image smaller than 8 MB.'); return; }
      setBusy(true);
      const contentType = asset.mimeType?.startsWith('image/') ? asset.mimeType : 'image/jpeg';
      const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
      const response = await fetch(asset.uri);
      if (!response.ok) throw new Error('Could not read the selected image. Please choose it again.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      const imageKind = verificationStep === 'document' ? 'id' : 'selfie';
      const imagePath = `${userId}/${imageKind}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('rider-verification').upload(imagePath, bytes, { contentType, upsert: true });
      if (uploadError) throw uploadError;
      const saved = await save(verificationStep === 'document'
        ? { document_type: docType, verification_method: 'document', id_image_path: imagePath }
        : { verification_method: 'selfie', selfie_image_path: imagePath, verification_image_path: imagePath });
      if (saved) {
        if (verificationStep === 'document') setIdPreviewUri(asset.uri);
        else setPreviewUri(asset.uri);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The photo could not be uploaded. Please try again.');
    } finally { setBusy(false); }
  }

  if (loading) return <View style={styles.loading}><ActivityIndicator color="#F04400" /></View>;

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.brandRow}><View style={styles.brandMark}><Text style={styles.brandGlyph}>R</Text></View><Text style={styles.brand}>RIDER</Text><Text style={styles.role}>DRIVER PARTNER</Text></View>
        <View style={styles.card}>
          {step < 3 ? <>
            <Text style={styles.eyebrow}>SIGNUP - {step === 2 ? (verificationStep === 'document' ? '3 OF 4' : '4 OF 4') : `${step + 1} OF 4`}</Text>
            <View style={styles.progress}><View style={[styles.progressFill, { width: `${step === 2 ? (verificationStep === 'document' ? 75 : 90) : ((step + 1) / 4) * 100}%` }]} /></View>
            <Text style={styles.title}>{step === 0 ? 'What should we call you?' : step === 1 ? 'Your phone number' : verificationStep === 'document' ? 'Add an ID photo' : 'Add a selfie'}</Text>
            <Text style={styles.subtitle}>{step === 0 ? 'Your Google name is filled in. Edit it if needed.' : step === 1 ? 'Weâ€™ll use this to contact you about rides.' : verificationStep === 'document' ? 'Choose an ID image and review it before continuing.' : 'Take a clear selfie to finish verification.'}</Text>
            {step === 0 ? <Field label="FULL NAME" value={name} onChangeText={setName} placeholder="e.g. Arjun Mehta" autoCapitalize="words" /> : null}
            {step === 1 ? <Field label="PHONE NUMBER" value={phone} onChangeText={setPhone} placeholder="+91 98765 43210" keyboardType="phone-pad" /> : null}
            {step === 2 ? <>
              {verificationStep === 'document' ? <>
                <Text style={styles.label}>ID TYPE</Text>
                <View style={styles.docChoices}>{documents.map((doc) => <Pressable key={doc.id} onPress={() => setDocType(doc.id)} style={[styles.docChoice, docType === doc.id && styles.docChoiceActive]}><Text style={[styles.docTitle, docType === doc.id && styles.docTitleActive]}>{doc.title}</Text></Pressable>)}</View>
                {idPreviewUri ? <><Text style={styles.label}>SELECTED ID IMAGE</Text><Image source={{ uri: idPreviewUri }} style={styles.preview} /></> : null}
                <Pressable style={[styles.primary, busy && styles.disabled]} disabled={busy} onPress={() => chooseImage('library')}><Text style={styles.primaryText}>{idPreviewUri ? 'Choose a different ID image' : 'Choose ID image'}</Text></Pressable>
                <Pressable style={[styles.secondary, busy && styles.disabled]} disabled={busy} onPress={() => chooseImage('camera')}><Text style={styles.secondaryText}>Take a photo of your ID</Text></Pressable>
                {idPreviewUri ? <Pressable style={[styles.primary, busy && styles.disabled]} disabled={busy} onPress={() => { setVerificationStep('selfie'); setError(''); }}><Text style={styles.primaryText}>Next: take a selfie</Text></Pressable> : null}
              </> : <>
                {previewUri ? <><Text style={styles.label}>SELFIE PREVIEW</Text><Image source={{ uri: previewUri }} style={styles.preview} /></> : null}
                <Pressable style={[styles.primary, busy && styles.disabled]} disabled={busy} onPress={() => chooseImage('camera')}>
                  {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{previewUri ? 'Retake selfie' : 'Open front camera - Take selfie'}</Text>}
                </Pressable>
                {previewUri ? <Pressable style={[styles.primary, busy && styles.disabled]} disabled={busy} onPress={() => setStep(3)}><Text style={styles.primaryText}>Finish signup</Text></Pressable> : null}
                <Pressable style={styles.backButton} onPress={() => { setError(''); setVerificationStep('document'); }}><Text style={styles.backText}>Back to ID photo</Text></Pressable>
              </>}
              <Text style={styles.privacy}>Images are stored in your private account folder. ID and selfie are saved separately.</Text>
            </> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {step < 2 ? <Pressable style={[styles.primary, busy && styles.disabled]} disabled={busy} onPress={step === 0 ? continueFromName : continueFromPhone}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Continue</Text>}
            </Pressable> : null}
            {step > 0 ? <Pressable style={styles.backButton} onPress={() => { setError(''); setStep(step - 1); }}><Text style={styles.backText}>Back</Text></Pressable> : null}
          </> : <>
            <View style={styles.successIcon}><Text style={styles.successGlyph}>...</Text></View>
            <Text style={styles.eyebrow}>ACCOUNT STATUS</Text><Text style={styles.title}>{profile?.verification_status === 'rejected' ? 'Verification needs attention' : 'Pending verification'}</Text>
            <Text style={styles.subtitle}>{profile?.verification_status === 'rejected' ? 'Contact support for help with your verification.' : 'Your details and photos have been submitted. Verification usually takes 5-15 minutes.'}</Text>
            {idPreviewUri ? <Image source={{ uri: idPreviewUri }} style={styles.preview} /> : null}
            {previewUri ? <Image source={{ uri: previewUri }} style={styles.preview} /> : null}
            <View style={styles.savedBox}><Text style={styles.savedLine}>Phone: {profile?.phone}</Text><Text style={styles.savedLine}>ID photo submitted</Text><Text style={styles.savedLine}>Selfie submitted</Text></View>
            <Pressable style={[styles.primary, busy && styles.disabled]} disabled={busy} onPress={async () => {
              setBusy(true);
              const { data, error: statusError } = await supabase.from('rider_profiles').select('verification_status, rejection_reason').eq('id', userId).single();
              setBusy(false);
              if (statusError) setError(statusError.message);
              else if (data.verification_status === 'verified' || data.verification_status === 'approved') router.replace('/home');
              else if (data.verification_status === 'rejected') {
                setProfile((current) => current ? { ...current, verification_status: 'rejected', rejection_reason: data.rejection_reason } : current);
                setError(data.rejection_reason || 'Your profile was not approved. Contact support for next steps.');
              }
              else setError('Your account is still pending review. Please check again later.');
            }}><Text style={styles.primaryText}>{busy ? 'Checking...' : 'Check verification status'}</Text></Pressable>
            <Pressable style={styles.signOut} onPress={async () => { try { await stopRiderLocationTracking(); } finally { await supabase.auth.signOut(); router.replace('/auth/auth'); } }}><Text style={styles.signOutText}>Sign out</Text></Pressable>
          </>}
        </View>
        <Text style={styles.footer}>NEED HELP?  CONTACT SUPPORT</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...inputProps } = props;
  return <View style={styles.fieldWrap}><Text style={styles.label}>{label}</Text><TextInput {...inputProps} style={styles.input} placeholderTextColor="#888888" /></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFFFFF' }, scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 36 }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  brandRow: { width: '100%', maxWidth: 460, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 26 }, brandMark: { width: 31, height: 31, borderRadius: 10, backgroundColor: '#F04400', alignItems: 'center', justifyContent: 'center' }, brandGlyph: { color: '#FFFFFF', fontWeight: '900', fontSize: 18 }, brand: { color: '#111111', fontSize: 13, fontWeight: '800', letterSpacing: 2 }, role: { color: '#777777', fontSize: 9, letterSpacing: 1.4, marginLeft: 'auto' },
  card: { width: '100%', maxWidth: 460, backgroundColor: '#FFFFFF', borderColor: '#E6E3E0', borderWidth: 1, borderRadius: 22, padding: 24 }, eyebrow: { color: '#F04400', fontSize: 10, fontWeight: '800', letterSpacing: 1.7, marginBottom: 15 }, title: { fontSize: 28, lineHeight: 34, color: '#111111', fontWeight: '700', letterSpacing: -0.5, marginTop: 4 }, subtitle: { fontSize: 14, lineHeight: 22, color: '#666666', marginTop: 10, marginBottom: 25 }, progress: { height: 4, borderRadius: 4, backgroundColor: '#E6E3E0', marginBottom: 24, overflow: 'hidden' }, progressFill: { height: 4, borderRadius: 4, backgroundColor: '#F04400' }, fieldWrap: { marginBottom: 18 }, label: { color: '#666666', fontSize: 10, fontWeight: '800', letterSpacing: 1.15, marginBottom: 8 }, input: { height: 52, backgroundColor: '#FFFFFF', borderColor: '#DDD9D5', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, color: '#111111', fontSize: 15 },
  methodRow: { flexDirection: 'row', gap: 10, marginBottom: 20 }, methodChoice: { flex: 1, alignItems: 'center', padding: 13, borderWidth: 1, borderColor: '#DDD9D5', borderRadius: 12, backgroundColor: '#FFFFFF' }, methodActive: { borderColor: '#F04400', backgroundColor: '#FFF3EB' }, methodText: { color: '#333333', fontWeight: '700', fontSize: 13 }, methodTextActive: { color: '#F04400' }, docChoices: { gap: 8, marginBottom: 16 }, docChoice: { borderRadius: 12, padding: 13, borderWidth: 1, borderColor: '#DDD9D5', backgroundColor: '#FFFFFF' }, docChoiceActive: { borderColor: '#F04400', backgroundColor: '#FFF3EB' }, docTitle: { color: '#333333', fontSize: 13, fontWeight: '700' }, docTitleActive: { color: '#F04400' }, privacy: { color: '#777777', fontSize: 11, lineHeight: 16, marginTop: 14 }, preview: { width: 120, height: 120, borderRadius: 14, alignSelf: 'center', marginBottom: 16 },
  error: { color: '#D94B17', fontSize: 12, lineHeight: 17, marginTop: 10, marginBottom: 4 }, primary: { minHeight: 52, borderRadius: 13, backgroundColor: '#F04400', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', marginTop: 8, paddingHorizontal: 12 }, primaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14, textAlign: 'center' }, secondary: { minHeight: 48, borderRadius: 13, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DDD9D5', alignItems: 'center', justifyContent: 'center', marginTop: 9, paddingHorizontal: 12 }, secondaryText: { color: '#111111', fontWeight: '700', fontSize: 14 }, disabled: { opacity: 0.6 }, backButton: { alignSelf: 'center', padding: 14 }, backText: { color: '#F04400', fontSize: 13, fontWeight: '600' }, successIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFF3EB', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }, successGlyph: { color: '#F04400', fontSize: 23, fontWeight: '800' }, savedBox: { borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6E3E0', padding: 15, gap: 12, marginTop: 4 }, savedLine: { color: '#333333', fontSize: 13 }, signOut: { alignSelf: 'center', padding: 16, marginTop: 8 }, signOutText: { color: '#666666', fontSize: 13, fontWeight: '700' }, footer: { color: '#888888', fontSize: 9, letterSpacing: 1.2, marginTop: 23 },
});


