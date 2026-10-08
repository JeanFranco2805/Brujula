import React, {useCallback, useState} from 'react';
import {router} from 'expo-router';
import {AuthScreen, type AuthFormValues} from '../../screens/AuthScreen';
import {useAuth} from '../../auth/AuthContext';
import {useGoogleSignIn} from '../../auth/google';
import {ApiError} from '../../api/client';

export default function SignupRoute() {
  const {signUp, signInWithGoogle} = useAuth();
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const google = useGoogleSignIn();

  const submit = async ({name, email, password}: AuthFormValues) => {
    setErrorMessage(null);
    setSaving(true);
    try {
      await signUp({name, email, password});
      router.replace('/onboarding');
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setErrorMessage('Ya existe una cuenta con ese correo. Inicia sesión o usa otro correo.');
      } else if (error instanceof ApiError && error.status === 0) {
        setErrorMessage('No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.');
      } else if (error instanceof ApiError && error.status === 400) {
        setErrorMessage(error.message || 'Revisa el nombre, el correo y la contraseña.');
      } else if (error instanceof ApiError && error.status >= 500) {
        setErrorMessage('El servicio no está disponible por ahora. Inténtalo de nuevo en unos minutos.');
      } else {
        setErrorMessage(error instanceof Error && error.message ? error.message : 'No se pudo crear tu cuenta. Revisa tus datos e inténtalo de nuevo.');
      }
    } finally {
      setSaving(false);
    }
  };

  const continueWithGoogle = useCallback(() => google.start(async idToken => {
    setErrorMessage(null);
    setSaving(true);
    try {
      const user = await signInWithGoogle(idToken);
      router.replace(user.onboardingCompleted ? '/(tabs)' : '/onboarding');
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) {
        setErrorMessage('No pudimos conectar con el servicio de acceso. El acceso por Google necesita conexión; puedes usar el formulario de correo.');
      } else if (error instanceof ApiError && error.status === 503) {
        setErrorMessage('El servidor todavía necesita configurar el OAuth Client ID de Google. Puedes crear tu cuenta con correo mientras tanto.');
      } else {
        setErrorMessage('No se pudo validar la cuenta de Google. Inténtalo de nuevo.');
      }
    } finally {
      setSaving(false);
    }
  }), [google, signInWithGoogle]);

  return <AuthScreen mode="signup" onModeChange={() => router.replace('/(auth)/login')} onSubmit={submit} onGooglePress={continueWithGoogle} loading={saving} googleLoading={google.loading} error={errorMessage} onClearError={() => setErrorMessage(null)} />;
}
