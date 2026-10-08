import React from 'react';
import {Tabs} from 'expo-router';
import {Ionicons} from '@expo/vector-icons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {colors} from '../../theme';

const icons = {
  index: 'home-outline',
  materials: 'document-text-outline',
  plan: 'calendar-outline',
  progress: 'bar-chart-outline',
} as const;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={({route}) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {height: 66 + insets.bottom, paddingTop: 6, paddingBottom: 6 + insets.bottom, borderTopColor: colors.border, backgroundColor: colors.surface},
        tabBarLabelStyle: {fontSize: 10, fontWeight: '600'},
        tabBarIcon: ({color, size}) => <Ionicons name={icons[route.name as keyof typeof icons] ?? 'ellipse-outline'} size={size} color={color} />,
      })}
    >
      <Tabs.Screen name="index" options={{title: 'Inicio'}} />
      <Tabs.Screen name="materials" options={{title: 'Materiales'}} />
      <Tabs.Screen name="plan" options={{title: 'Plan'}} />
      <Tabs.Screen name="progress" options={{title: 'Progreso'}} />
    </Tabs>
  );
}
