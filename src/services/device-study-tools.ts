import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Calendar from 'expo-calendar';
import * as Notifications from 'expo-notifications';
import {Platform} from 'react-native';

export type DeviceStudySession = {
  id: string;
  title: string;
  date: string;
  startMinute: number;
  durationMinutes: number;
  status: 'planned' | 'completed' | 'skipped';
};

const CALENDAR_EVENT_IDS_KEY = 'brujula.calendar-events.v1';
const CALENDAR_SYNC_ENABLED_KEY = 'brujula.calendar-sync-enabled.v1';
const REMINDERS_ENABLED_KEY = 'brujula.study-reminders-enabled.v1';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function scheduleStudyReminders(sessions: DeviceStudySession[]) {
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error('Activa las notificaciones de Brújula en los ajustes del dispositivo.');

  const existing = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(existing
    .filter(item => item.content.data?.brujulaStudyReminder === true)
    .map(item => Notifications.cancelScheduledNotificationAsync(item.identifier)));

  const now = Date.now();
  const upcoming = sessions.flatMap(session => {
    if (session.status === 'completed') return [];
    const date = createLocalSessionDate(session.date, session.startMinute);
    if (date.getTime() <= now) return [];
    return [Notifications.scheduleNotificationAsync({
      content: {
        title: 'Hora de estudiar',
        body: `Tu sesión de ${session.title} empieza ahora.`,
        data: {brujulaStudyReminder: true, sessionId: session.id},
      },
      trigger: {type: Notifications.SchedulableTriggerInputTypes.DATE, date},
    })];
  });
  await Promise.all(upcoming);
  await AsyncStorage.setItem(REMINDERS_ENABLED_KEY, 'true');
  return upcoming.length;
}

export async function exportSessionsToDeviceCalendar(sessions: DeviceStudySession[]) {
  let permission = await Calendar.getCalendarPermissions(Platform.OS === 'ios');
  if (!permission.granted) permission = await Calendar.requestCalendarPermissions(Platform.OS === 'ios');
  if (!permission.granted) throw new Error('Permite el acceso al calendario para exportar tus sesiones.');

  const calendar = Platform.OS === 'ios'
    ? Calendar.getDefaultCalendarSync()
    : (await Calendar.getCalendars(Calendar.EntityTypes.EVENT)).find(item => item.allowsModifications && item.isPrimary)
      ?? (await Calendar.getCalendars(Calendar.EntityTypes.EVENT)).find(item => item.allowsModifications);
  if (!calendar) throw new Error('No encontramos un calendario editable en este dispositivo.');

  let savedIds: Record<string, string> = {};
  try { savedIds = JSON.parse((await AsyncStorage.getItem(CALENDAR_EVENT_IDS_KEY)) ?? '{}') as Record<string, string>; } catch { savedIds = {}; }
  let created = 0;
  for (const session of sessions) {
    if (session.status === 'completed') continue;
    const startDate = createLocalSessionDate(session.date, session.startMinute);
    const endDate = new Date(startDate.getTime() + session.durationMinutes * 60_000);
    const eventDetails = {
      title: `Brújula · ${session.title}`,
      startDate,
      endDate,
      notes: 'Sesión generada por Brújula. Puedes editarla desde el calendario del dispositivo.',
    };
    if (savedIds[session.id]) {
      try {
        const event = await Calendar.ExpoCalendarEvent.get(savedIds[session.id]);
        await event.update(eventDetails);
        continue;
      } catch {
        delete savedIds[session.id];
      }
    }
    const event = await calendar.createEvent(eventDetails);
    savedIds[session.id] = event.id;
    created += 1;
  }
  await AsyncStorage.setItem(CALENDAR_EVENT_IDS_KEY, JSON.stringify(savedIds));
  await AsyncStorage.setItem(CALENDAR_SYNC_ENABLED_KEY, 'true');
  return created;
}

export async function syncEnabledStudyTools(sessions: DeviceStudySession[]) {
  const [remindersEnabled, calendarSyncEnabled] = await Promise.all([
    AsyncStorage.getItem(REMINDERS_ENABLED_KEY),
    AsyncStorage.getItem(CALENDAR_SYNC_ENABLED_KEY),
  ]);
  const updates: Promise<unknown>[] = [];
  if (remindersEnabled === 'true') updates.push(scheduleStudyReminders(sessions));
  if (calendarSyncEnabled === 'true') updates.push(exportSessionsToDeviceCalendar(sessions));
  await Promise.all(updates);
}

export async function cancelStudyReminder(sessionId: string) {
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  const reminders = existing.filter(item => item.content.data?.brujulaStudyReminder === true && item.content.data?.sessionId === sessionId);
  await Promise.all(reminders.map(item => Notifications.cancelScheduledNotificationAsync(item.identifier)));
}

export function createLocalSessionDate(date: string, startMinute: number) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, Math.floor(startMinute / 60), startMinute % 60, 0, 0);
}
