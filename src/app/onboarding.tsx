import React, {useState} from 'react';
import {Redirect, router} from 'expo-router';
import {OnboardingScreen} from '../screens/OnboardingScreen';
import {useAuth} from '../auth/AuthContext';
import {defaultPreferences} from '../types';
import type {StudyPreferences} from '../types';
import {ApiError} from '../api/client';

export default function OnboardingRoute() {
  const {user, savePreferences} = useAuth();
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  if (!user) return <Redirect href="/(auth)/login" />;

  const finish = async (preferences: StudyPreferences) => {
    setErrorMessage(null);
    setSaving(true);
    try {
      await savePreferences(preferences);
      router.replace('/(tabs)');
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) {
        setErrorMessage('No pudimos conectar con el servidor. Tus elecciones siguen aquí; vuelve a intentar guardarlas.');
      } else if (error instanceof ApiError && error.status === 401) {
        setErrorMessage('Tu sesión venció. Inicia sesión otra vez para guardar tus preferencias.');
      } else {
        setErrorMessage('No se pudieron guardar tus preferencias. Inténtalo de nuevo.');
      }
    } finally {
      setSaving(false);
    }
  };

  const initialPreferences = user.onboardingCompleted
    ? user.preferences
    : {...(user.preferences ?? defaultPreferences), formats: []};

  return (
    <OnboardingScreen
      initialPreferences={initialPreferences}
      editing={user.onboardingCompleted}
      loading={saving}
      error={errorMessage}
      onClearError={() => setErrorMessage(null)}
      onCancel={() => router.replace('/(tabs)')}
      onFinish={finish}
    />
  );
}
