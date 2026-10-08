import React from 'react';
import {router} from 'expo-router';
import {useAuth} from '../auth/AuthContext';
import {MainApp, type TabKey} from './MainApp';

export function AuthenticatedTab({tab}: {tab: TabKey}) {
  const {user, signOut} = useAuth();
  if (!user) return null;

  return (
    <MainApp
      account={user}
      activeTab={tab}
      onEditPreferences={() => router.push('/onboarding')}
      onSignOut={() => { void signOut().then(() => router.replace('/(auth)/login')); }}
      onOpenLesson={() => router.push('/lesson')}
    />
  );
}
