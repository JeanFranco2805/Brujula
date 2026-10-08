import React, {useCallback, useState} from 'react';
import {router} from 'expo-router';
import {AuthScreen, type AuthFormValues} from '../../screens/AuthScreen';
import {useAuth} from '../../auth/AuthContext';
import {useGoogleSignIn} from '../../auth/google';
import {ApiError} from '../../api/client';

export default function LoginRoute() {
  const {signIn, signInWithGoogle} = useAuth();
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const google = useGoogleSignIn();

  const submit = async ({email, password}: AuthFormValues) => {
    setErrorMessage(null);
    setSaving(true);
    try {
      const user = await signIn({email, password});
      router.replace(user.onboardingCompleted ? '/(tabs)' : '/onboarding');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setErrorMessage('El correo o la contraseña no coinciden. Revisa tus datos e inténtalo de nuevo.');
      } else if (error instanceof ApiError && error.status === 404) {
        setErrorMessage('No encontramos una cuenta guardada en este dispositivo. Crea una cuenta para empezar.');
      } else if (error instanceof ApiError && error.status === 0) {
        setErrorMessage('No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.');
      } else if (error instanceof ApiError && error.status >= 500) {
        setErrorMessage('El servicio no está disponible por ahora. Inténtalo de nuevo en unos minutos.');
      } else {
        setErrorMessage('No se pudo iniciar sesión. Revisa tus datos e inténtalo de nuevo.');
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

  return <AuthScreen mode="login" onModeChange={() => router.push('/(auth)/signup')} onSubmit={submit} onGooglePress={continueWithGoogle} loading={saving} googleLoading={google.loading} error={errorMessage} onClearError={() => setErrorMessage(null)} />;
}
