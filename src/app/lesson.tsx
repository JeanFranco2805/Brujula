import React from 'react';
import {Redirect, router} from 'expo-router';
import {LessonScreen} from '../screens/MainApp';
import {useAuth} from '../auth/AuthContext';
import {defaultPreferences} from '../types';

export default function LessonRoute() {
  const {user} = useAuth();
  if (!user) return <Redirect href="/(auth)/login" />;
  return <LessonScreen preferences={user.preferences ?? defaultPreferences} onBack={() => router.back()} />;
}
