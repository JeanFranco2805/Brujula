import React from 'react';
import {router} from 'expo-router';
import {useAuth} from '../auth/AuthContext';
import {MainApp, type TabKey} from './MainApp';

export function AuthenticatedTab({tab}: {tab: TabKey}) {
  const {user, token, signOut, connectLocalAccount} = useAuth();
  if (!user) return null;

  return (
    <MainApp
      account={user}
      accessToken={token}
      activeTab={tab}
      onEditPreferences={() => router.push('/onboarding')}
      onSignOut={() => { void signOut().then(() => router.replace('/(auth)/login')); }}
      onOpenLesson={(materialId, topicIndex) => router.push(materialId
        ? {pathname: '/lesson', params: {materialId, topicIndex: String(topicIndex ?? 0)}}
        : '/lesson')}
      onOpenMaterials={() => router.push('/(tabs)/materials')}
      onOpenPlan={() => router.push('/(tabs)/plan')}
      onConnectLocalAccount={connectLocalAccount}
    />
  );
}
