import React from 'react';
import {Redirect, router, useLocalSearchParams} from 'expo-router';
import {LessonScreen} from '../screens/MainApp';
import {useAuth} from '../auth/AuthContext';
import {defaultPreferences} from '../types';

export default function LessonRoute() {
  const {user} = useAuth();
  const {materialId, topicIndex} = useLocalSearchParams<{materialId?: string; topicIndex?: string}>();
  if (!user) return <Redirect href="/(auth)/login" />;
  return <LessonScreen
    ownerId={user.id}
    preferences={user.preferences ?? defaultPreferences}
    materialId={typeof materialId === 'string' ? materialId : undefined}
    topicIndex={typeof topicIndex === 'string' ? Math.max(0, Number(topicIndex) || 0) : 0}
    onBack={() => router.back()}
  />;
}
