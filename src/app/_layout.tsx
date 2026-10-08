import React, {useEffect} from 'react';
import {ActivityIndicator, StyleSheet, View} from 'react-native';
import {Stack, useRouter, useSegments} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {AuthProvider, useAuth} from '../auth/AuthContext';
import {colors} from '../theme';

export default function RootLayout() {
  return <SafeAreaProvider><AuthProvider><AuthNavigation /></AuthProvider></SafeAreaProvider>;
}

function AuthNavigation() {
  const {user, loading} = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const firstSegment = segments[0];

  useEffect(() => {
    if (loading) return;
    const inAuth = firstSegment === '(auth)';
    const inOnboarding = firstSegment === 'onboarding';

    if (!user && !inAuth) {
      router.replace('/(auth)/login');
    } else if (user && !user.onboardingCompleted && !inOnboarding) {
      router.replace('/onboarding');
    } else if (user?.onboardingCompleted && (inAuth || inOnboarding)) {
      router.replace('/(tabs)');
    }
  }, [firstSegment, loading, router, user]);

  if (loading) {
    return <View style={styles.loading}><StatusBar style="dark" /><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return <><StatusBar style="dark" /><Stack screenOptions={{headerShown: false, contentStyle: {backgroundColor: colors.background}}} /></>;
}

const styles = StyleSheet.create({loading: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background}});
