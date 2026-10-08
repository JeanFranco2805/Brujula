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
} from 'react-native';
import {FontAwesome, Ionicons} from '@expo/vector-icons';
import {AppPage, Brand, Field, PrimaryButton} from '../components/ui';
import {colors, radius, spacing} from '../theme';

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
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const isSignup = mode === 'signup';
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
    <AppPage>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.topline}>
            <Brand />
            <View style={styles.secureBadge}><Ionicons name="shield-checkmark-outline" size={13} color={colors.teal} /><Text style={styles.secureBadgeText}>ACCESO SEGURO</Text></View>
          </View>
          <View style={styles.heroArt}>
            <View style={styles.heroOrb} />
            <View style={styles.heroMark}>
              <Ionicons name="compass-outline" size={39} color={colors.teal} />
            </View>
          </View>
          <Text style={styles.eyebrow}>TU ESPACIO PARA APRENDER</Text>
          <Text style={styles.title}>{isSignup ? 'Crea tu cuenta' : 'Hola de nuevo'}</Text>
          <Text style={styles.subtitle}>{isSignup ? 'Crea tu perfil y personaliza tu experiencia en unos pasos.' : 'Retoma tu camino de estudio cuando quieras.'}</Text>

          <View style={styles.formCard}>
            {visibleError ? (
              <View accessibilityRole="alert" style={styles.errorBanner}>
                <Ionicons name="alert-circle-outline" size={19} color={colors.danger} />
                <Text style={styles.errorText}>{visibleError}</Text>
              </View>
            ) : null}
            {isSignup ? (
              <Field label="Nombre" icon="person-outline" value={name} onChangeText={value => {setName(value); clearErrors();}} placeholder="Tu nombre" autoCapitalize="words" maxLength={80} returnKeyType="next" />
            ) : null}
            <Field label="Correo electrónico" icon="mail-outline" value={email} onChangeText={value => {setEmail(value); clearErrors();}} placeholder="nombre@correo.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" maxLength={254} returnKeyType="next" />
            <Field label="Contraseña" icon="lock-closed-outline" value={password} onChangeText={value => {setPassword(value); clearErrors();}} placeholder={isSignup ? 'Entre 8 y 72 caracteres' : 'Tu contraseña'} secureTextEntry autoComplete={isSignup ? 'new-password' : 'password'} textContentType={isSignup ? 'newPassword' : 'password'} maxLength={72} returnKeyType="done" onSubmitEditing={submit} />
            {isSignup ? <Text style={styles.helper}>Mínimo 8 caracteres</Text> : (
              <Pressable onPress={() => Alert.alert('Recuperar contraseña', 'La recuperación por correo todavía no está habilitada.')} hitSlop={8} style={styles.forgot}>
                <Text style={styles.link}>¿Olvidaste tu contraseña?</Text>
              </Pressable>
            )}

            {isSignup ? (
              <Pressable style={styles.termsRow} onPress={() => setAcceptedTerms(!acceptedTerms)} accessibilityRole="checkbox" accessibilityState={{checked: acceptedTerms}}>
                <Ionicons name={acceptedTerms ? 'checkbox' : 'square-outline'} size={21} color={acceptedTerms ? colors.primary : colors.muted} />
                <Text style={styles.termsText}>Acepto los términos y la política de privacidad</Text>
              </Pressable>
            ) : null}

            <PrimaryButton title={isSignup ? 'Crear cuenta' : 'Iniciar sesión'} onPress={submit} loading={loading} />
          </View>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>O CONTINÚA CON</Text>
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
                <FontAwesome name="google" size={18} color="#4285F4" />
                <Text style={styles.googleButtonText}>Continuar con Google</Text>
              </>
            )}
          </Pressable>

          <View style={styles.switchRow}>
            <Text style={styles.switchText}>{isSignup ? '¿Ya tienes cuenta?' : '¿Aún no tienes cuenta?'}</Text>
            <Pressable onPress={() => onModeChange(isSignup ? 'login' : 'signup')} hitSlop={8}>
              <Text style={styles.link}>{isSignup ? 'Iniciar sesión' : 'Crear cuenta'}</Text>
            </Pressable>
          </View>

          <View style={styles.demoNote}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.teal} />
            <Text style={styles.demoNoteText}>{isSignup ? 'Si el servidor no está disponible, podrás empezar con una cuenta guardada en este dispositivo.' : 'Tu sesión queda guardada en este dispositivo para que puedas retomar tu estudio.'}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </AppPage>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  content: {flexGrow: 1, paddingHorizontal: 24, paddingTop: spacing.md, paddingBottom: spacing.xl, alignItems: 'stretch'},
  topline: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  secureBadge: {flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.tealSoft},
  secureBadgeText: {fontSize: 9, fontWeight: '800', letterSpacing: 0.5, color: colors.teal},
  heroArt: {height: 101, alignSelf: 'center', width: 150, marginTop: 14, marginBottom: 2, alignItems: 'center', justifyContent: 'center'},
  heroOrb: {position: 'absolute', width: 82, height: 82, borderRadius: 41, backgroundColor: '#E7F4F1'},
  heroMark: {width: 62, height: 62, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#164E48', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: {width: 0, height: 5}, elevation: 2},
  eyebrow: {fontSize: 10, letterSpacing: 1.25, fontWeight: '800', color: colors.teal, textAlign: 'center', marginTop: 6},
  title: {fontSize: 29, lineHeight: 35, fontWeight: '800', letterSpacing: -0.7, color: colors.text, textAlign: 'center', marginTop: 5},
  subtitle: {fontSize: 14, lineHeight: 20, color: colors.muted, textAlign: 'center', marginTop: 6, marginBottom: 20},
  formCard: {width: '100%', padding: 17, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface},
  errorBanner: {flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FEF3F2', borderWidth: 1, borderColor: '#FECDCA', borderRadius: radius.sm, padding: 11, marginBottom: 16},
  errorText: {flex: 1, fontSize: 13, lineHeight: 18, color: colors.danger, fontWeight: '600'},
  divider: {flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, marginBottom: 13},
  dividerLine: {height: 1, flex: 1, backgroundColor: colors.border},
  dividerText: {fontSize: 10, letterSpacing: 0.8, color: colors.muted, fontWeight: '700'},
  googleButton: {height: 52, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface},
  googlePressed: {backgroundColor: '#F9FAFB'},
  googleDisabled: {opacity: 0.6},
  googleButtonText: {fontSize: 15, color: colors.text, fontWeight: '700'},
  googleLoading: {fontSize: 14, color: colors.muted, fontWeight: '600'},
  helper: {fontSize: 12, color: colors.muted, marginTop: -8, marginBottom: 16},
  forgot: {alignSelf: 'flex-end', marginTop: -7, marginBottom: 20},
  link: {fontSize: 14, color: colors.primary, fontWeight: '700'},
  termsRow: {flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 0, marginBottom: 18},
  termsText: {flex: 1, fontSize: 13, lineHeight: 18, color: colors.muted},
  switchRow: {flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 23, marginBottom: 22},
  switchText: {fontSize: 14, color: colors.muted},
  demoNote: {flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 11, marginTop: 15},
  demoNoteText: {flex: 1, fontSize: 11, lineHeight: 16, color: colors.muted},
});
