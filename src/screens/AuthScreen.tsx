import React, {useState} from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {FontAwesome, Ionicons} from '@expo/vector-icons';
import {AppPage, Field, PrimaryButton} from '../components/ui';
import {colors, radius} from '../theme';

export type AuthMode = 'login' | 'signup';
export type AuthFormValues = {name: string; email: string; password: string};

export function AuthScreen({
  mode,
  onModeChange,
  onSubmit,
  onGooglePress,
  loading = false,
  googleLoading = false,
  error,
  onClearError,
}: {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onSubmit: (values: AuthFormValues) => void | Promise<void>;
  onGooglePress: () => void | Promise<void>;
  loading?: boolean;
  googleLoading?: boolean;
  error?: string | null;
  onClearError?: () => void;
}) {
  const {height} = useWindowDimensions();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const isSignup = mode === 'signup';
  const compact = height < 780;
  const visibleError = formError ?? error;

  const clearErrors = () => {
    setFormError(null);
    onClearError?.();
  };

  const submit = () => {
    if (isSignup && !name.trim()) {
      setFormError('Escribe tu nombre para continuar.');
      return;
    }
    if (isSignup && name.trim().length > 80) {
      setFormError('El nombre puede tener hasta 80 caracteres.');
      return;
    }
    if (email.trim().length > 254) {
      setFormError('El correo puede tener hasta 254 caracteres.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setFormError('Escribe un correo electrónico válido.');
      return;
    }
    if (!password || (isSignup && (password.length < 8 || password.length > 72))) {
      setFormError(isSignup ? 'La contraseña debe tener entre 8 y 72 caracteres.' : 'Escribe tu contraseña para continuar.');
      return;
    }
    if (isSignup && !acceptedTerms) {
      setFormError('Acepta los términos y la política de privacidad para crear tu cuenta.');
      return;
    }
    clearErrors();
    onSubmit({name: name.trim(), email: email.trim().toLowerCase(), password});
  };

  return (
    <AppPage backgroundColor="#FCFDFE">
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.content, compact && styles.contentCompact]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <AuthBrand compact={compact} />
          <Text style={styles.title}>{isSignup ? 'Crea tu cuenta' : 'Qué bueno verte'}</Text>
          <Text style={styles.subtitle}>{isSignup ? 'Organiza tu estudio a tu ritmo' : 'Continúa tu camino de estudio'}</Text>

          {visibleError ? (
            <View accessibilityRole="alert" style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={19} color={colors.danger} />
              <Text style={styles.errorText}>{visibleError}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            {isSignup ? (
              <Field label="Nombre" icon="person-outline" value={name} onChangeText={value => {setName(value); clearErrors();}} placeholder="Nombre" autoCapitalize="words" maxLength={80} returnKeyType="next" />
            ) : null}
            <Field label="Correo electrónico" icon="mail-outline" value={email} onChangeText={value => {setEmail(value); clearErrors();}} placeholder="Correo electrónico" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" maxLength={254} returnKeyType="next" />
            <Field label="Contraseña" icon="lock-closed-outline" value={password} onChangeText={value => {setPassword(value); clearErrors();}} placeholder="Contraseña" secureTextEntry autoComplete={isSignup ? 'new-password' : 'password'} textContentType={isSignup ? 'newPassword' : 'password'} maxLength={72} returnKeyType="done" onSubmitEditing={submit} />
            {isSignup ? <Text style={styles.helper}>Mínimo 8 caracteres</Text> : (
              <Pressable onPress={() => Alert.alert('Recuperar contraseña', 'La recuperación por correo se habilitará cuando el servicio de correo esté configurado.')} hitSlop={8} style={styles.forgot}>
                <Text style={styles.link}>¿Olvidaste tu contraseña?</Text>
              </Pressable>
            )}

            {isSignup ? (
              <View style={styles.termsRow}>
                <Pressable accessibilityRole="checkbox" accessibilityLabel="Acepto los términos y la política de privacidad" accessibilityState={{checked: acceptedTerms}} onPress={() => {setAcceptedTerms(!acceptedTerms); clearErrors();}} hitSlop={8}>
                  <Ionicons name={acceptedTerms ? 'checkbox' : 'square-outline'} size={22} color={acceptedTerms ? colors.primary : '#64748B'} />
                </Pressable>
                <Text style={styles.termsText}>
                  Acepto los <Text style={styles.termsLink} onPress={() => Alert.alert('Términos', 'Los términos del servicio se publicarán antes del lanzamiento.')}>términos</Text> y la <Text style={styles.termsLink} onPress={() => Alert.alert('Privacidad', 'La política de privacidad se publicará antes del lanzamiento.')}>política de privacidad</Text>
                </Text>
              </View>
            ) : null}

            <PrimaryButton title={isSignup ? 'Crear cuenta' : 'Iniciar sesión'} onPress={submit} loading={loading} showArrow={false} />
          </View>

          {!isSignup ? (
            <>
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>o</Text>
                <View style={styles.dividerLine} />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Continuar con Google"
                disabled={googleLoading}
                onPress={onGooglePress}
                style={({pressed}) => [styles.googleButton, pressed && styles.googlePressed, googleLoading && styles.googleDisabled]}>
                {googleLoading ? <Text style={styles.googleLoading}>Conectando…</Text> : (
                  <>
                    <FontAwesome name="google" size={21} color="#4285F4" />
                    <Text style={styles.googleButtonText}>Continuar con Google</Text>
                  </>
                )}
              </Pressable>
            </>
          ) : null}

          <View style={[styles.switchRow, compact && styles.switchRowCompact]}>
            <Text style={styles.switchText}>{isSignup ? '¿Ya tienes cuenta?' : '¿Aún no tienes cuenta?'}</Text>
            <Pressable onPress={() => onModeChange(isSignup ? 'login' : 'signup')} hitSlop={8}>
              <Text style={styles.link}>{isSignup ? 'Iniciar sesión' : 'Crear cuenta'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </AppPage>
  );
}

function AuthBrand({compact}: {compact: boolean}) {
  return (
    <View style={[styles.hero, compact && styles.heroCompact]}>
      <View style={styles.leftWave} />
      <View style={styles.leftWaveTail} />
      <View style={styles.rightWave} />
      <View style={styles.dottedRoute} />
      <View style={styles.brandLockup}>
        <View style={styles.brandSymbol}>
          <View style={styles.rayLong} />
          <View style={styles.rayLeft} />
          <View style={styles.rayRight} />
          <Ionicons name="book-outline" size={86} color="#263B68" />
          <View style={styles.needle}>
            <View style={styles.needleTeal} />
            <View style={styles.needleAmber} />
          </View>
        </View>
        <Text style={styles.brandName}>Brújula</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  content: {flexGrow: 1, paddingHorizontal: 24, paddingTop: 2, paddingBottom: 14, alignItems: 'stretch'},
  contentCompact: {paddingHorizontal: 22},
  hero: {height: 190, marginHorizontal: -24, overflow: 'hidden', alignItems: 'center', justifyContent: 'center'},
  heroCompact: {height: 166, marginHorizontal: -22},
  leftWave: {position: 'absolute', width: 236, height: 145, left: -106, top: 22, borderRadius: 100, backgroundColor: '#E2F0EF', transform: [{rotate: '18deg'}]},
  leftWaveTail: {position: 'absolute', width: 220, height: 56, left: 6, top: 136, borderRadius: 100, backgroundColor: '#F0F7F6', transform: [{rotate: '14deg'}]},
  rightWave: {position: 'absolute', width: 200, height: 102, right: -91, top: 101, borderRadius: 100, backgroundColor: '#FFF1DA', transform: [{rotate: '-15deg'}]},
  dottedRoute: {position: 'absolute', width: 185, height: 76, right: -10, top: 54, borderTopWidth: 2, borderRightWidth: 2, borderColor: '#FFD797', borderStyle: 'dashed', borderRadius: 80, transform: [{rotate: '-22deg'}]},
  brandLockup: {alignItems: 'center', marginTop: 8},
  brandSymbol: {width: 126, height: 97, alignItems: 'center', justifyContent: 'center'},
  rayLong: {position: 'absolute', width: 3, height: 17, borderRadius: 2, backgroundColor: '#F3B34D', top: -1},
  rayLeft: {position: 'absolute', width: 3, height: 10, borderRadius: 2, backgroundColor: '#F3B34D', top: 10, left: 30, transform: [{rotate: '-35deg'}]},
  rayRight: {position: 'absolute', width: 3, height: 10, borderRadius: 2, backgroundColor: '#F3B34D', top: 10, right: 30, transform: [{rotate: '35deg'}]},
  needle: {position: 'absolute', width: 10, height: 37, top: 27, left: 58, borderRadius: 5, overflow: 'hidden', transform: [{rotate: '35deg'}]},
  needleTeal: {flex: 1, backgroundColor: '#13A6A1'},
  needleAmber: {flex: 1, backgroundColor: '#F3B34D'},
  brandName: {fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -1, color: '#102047', marginTop: 0},
  title: {fontSize: 27, lineHeight: 34, fontWeight: '800', letterSpacing: -0.6, color: '#102047', textAlign: 'center', marginTop: 1},
  subtitle: {fontSize: 16, lineHeight: 22, color: '#586782', textAlign: 'center', marginTop: 3, marginBottom: 20},
  form: {width: '100%'},
  errorBanner: {flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FEF3F2', borderWidth: 1, borderColor: '#FECDCA', borderRadius: radius.sm, padding: 11, marginBottom: 15},
  errorText: {flex: 1, fontSize: 13, lineHeight: 18, color: colors.danger, fontWeight: '600'},
  divider: {flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 17, marginBottom: 15},
  dividerLine: {height: 1, flex: 1, backgroundColor: '#C9D1E0'},
  dividerText: {fontSize: 14, color: '#586782', fontWeight: '600'},
  googleButton: {height: 52, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 15, borderRadius: 12, borderWidth: 1, borderColor: '#BFC9DB', backgroundColor: '#FFFFFF'},
  googlePressed: {backgroundColor: '#F7F9FC'},
  googleDisabled: {opacity: 0.6},
  googleButtonText: {fontSize: 15, color: '#102047', fontWeight: '700'},
  googleLoading: {fontSize: 14, color: colors.muted, fontWeight: '600'},
  helper: {fontSize: 12, color: '#71809A', marginTop: -8, marginBottom: 13},
  forgot: {alignSelf: 'flex-end', marginTop: -7, marginBottom: 18},
  link: {fontSize: 14, color: '#4F46F5', fontWeight: '700'},
  termsRow: {flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 2, marginBottom: 17},
  termsText: {flex: 1, fontSize: 13, lineHeight: 20, color: '#465875'},
  termsLink: {color: '#4F46F5', fontWeight: '600'},
  switchRow: {flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 28, paddingBottom: 2},
  switchRowCompact: {marginTop: 22},
  switchText: {fontSize: 14, color: '#586782'},
});
