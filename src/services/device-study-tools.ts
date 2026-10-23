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
  reminderEnabled?: boolean;
  reminderMinutesBefore?: number;
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

function ownerKey(base: string, ownerId: string) {
  return `${base}.${encodeURIComponent(ownerId)}`;
}

function isBrujulaReminder(notification: Notifications.NotificationRequest, ownerId: string) {
  return notification.content.data?.brujulaStudyReminder === true
    && (notification.content.data?.ownerId === ownerId || notification.content.data?.ownerId === undefined);
}

async function loadCalendarEventIds(ownerId: string) {
  const key = ownerKey(CALENDAR_EVENT_IDS_KEY, ownerId);
  let saved: string | null = await AsyncStorage.getItem(key);
  if (saved === null) {
    saved = await AsyncStorage.getItem(CALENDAR_EVENT_IDS_KEY);
    if (saved !== null) await AsyncStorage.setItem(key, saved);
  }
  try { return JSON.parse(saved ?? '{}') as Record<string, string>; } catch { return {}; }
}

async function loadOwnerSetting(key: string, ownerId: string) {
  const ownerScopedKey = ownerKey(key, ownerId);
  const scoped = await AsyncStorage.getItem(ownerScopedKey);
  if (scoped !== null) return scoped;
  const previous = await AsyncStorage.getItem(key);
  if (previous !== null) await AsyncStorage.setItem(ownerScopedKey, previous);
  return previous;
}

export async function scheduleStudyReminders(ownerId: string, sessions: DeviceStudySession[]) {
  const now = Date.now();
  const upcoming = sessions.flatMap(session => {
    if (session.status !== 'planned' || session.reminderEnabled === false) return [];
    const sessionDate = createLocalSessionDate(session.date, session.startMinute);
    const reminderDate = new Date(sessionDate.getTime() - (session.reminderMinutesBefore ?? 0) * 60_000);
    if (reminderDate.getTime() <= now) return [];
    return [{session, reminderDate}];
  });

  if (!upcoming.length) {
    const existing = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(existing
      .filter(item => isBrujulaReminder(item, ownerId))
      .map(item => Notifications.cancelScheduledNotificationAsync(item.identifier)));
    await AsyncStorage.setItem(ownerKey(REMINDERS_ENABLED_KEY, ownerId), 'true');
    return 0;
  }

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error('Activa las notificaciones de Brújula en los ajustes del dispositivo.');

  const existing = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(existing
    .filter(item => isBrujulaReminder(item, ownerId))
    .map(item => Notifications.cancelScheduledNotificationAsync(item.identifier)));

  try {
    await Promise.all(upcoming.map(({session, reminderDate}) => {
      const leadMinutes = session.reminderMinutesBefore ?? 0;
      return Notifications.scheduleNotificationAsync({
        content: {
          title: 'Hora de estudiar',
          body: leadMinutes ? `Empieza en ${leadMinutes} min: ${session.title}` : `Tu sesión de ${session.title} empieza ahora.`,
          data: {brujulaStudyReminder: true, ownerId, sessionId: session.id},
        },
        trigger: {type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminderDate},
      });
    }));
  } catch (error) {
    const partial = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(partial
      .filter(item => isBrujulaReminder(item, ownerId))
      .map(item => Notifications.cancelScheduledNotificationAsync(item.identifier)));
    throw error;
  }
  await AsyncStorage.setItem(ownerKey(REMINDERS_ENABLED_KEY, ownerId), 'true');
  return upcoming.length;
}

export async function scheduleStudyReminder(ownerId: string, session: DeviceStudySession) {
  await cancelStudyReminder(ownerId, session.id);
  if (session.status !== 'planned' || session.reminderEnabled === false) return false;
  const sessionDate = createLocalSessionDate(session.date, session.startMinute);
  const leadMinutes = session.reminderMinutesBefore ?? 0;
  const reminderDate = new Date(sessionDate.getTime() - leadMinutes * 60_000);
  if (reminderDate.getTime() <= Date.now()) return false;

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error('Activa las notificaciones de Brújula en los ajustes del dispositivo.');
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Hora de estudiar',
      body: leadMinutes ? `Empieza en ${leadMinutes} min: ${session.title}` : `Tu sesión de ${session.title} empieza ahora.`,
      data: {brujulaStudyReminder: true, ownerId, sessionId: session.id},
    },
    trigger: {type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminderDate},
  });
  return true;
}

export async function exportSessionsToDeviceCalendar(ownerId: string, sessions: DeviceStudySession[]) {
  let permission = await Calendar.getCalendarPermissions(false);
  if (!permission.granted) permission = await Calendar.requestCalendarPermissions(false);
  if (!permission.granted) throw new Error('Permite el acceso al calendario para crear y administrar tus sesiones.');

  const calendar = Platform.OS === 'ios'
    ? Calendar.getDefaultCalendarSync()
    : (await Calendar.getCalendars(Calendar.EntityTypes.EVENT)).find(item => item.allowsModifications && item.isPrimary)
      ?? (await Calendar.getCalendars(Calendar.EntityTypes.EVENT)).find(item => item.allowsModifications);
  if (!calendar) throw new Error('No encontramos un calendario editable en este dispositivo.');

  const calendarKey = ownerKey(CALENDAR_EVENT_IDS_KEY, ownerId);
  const savedIds = await loadCalendarEventIds(ownerId);
  let created = 0;
  let updated = 0;
  const now = Date.now();
  for (const session of sessions) {
    if (session.status !== 'planned') continue;
    const startDate = createLocalSessionDate(session.date, session.startMinute);
    if (startDate.getTime() <= now) continue;
    const endDate = new Date(startDate.getTime() + session.durationMinutes * 60_000);
    const eventDetails = {
      title: `Brújula · ${session.title}`,
      startDate,
      endDate,
      notes: 'Sesión guardada localmente por Brújula. Puedes editarla desde la app o el calendario del dispositivo.',
    };
    if (savedIds[session.id]) {
      const event = await Calendar.ExpoCalendarEvent.get(savedIds[session.id]);
      await event.update(eventDetails);
      updated += 1;
      continue;
    }
    const event = await calendar.createEvent(eventDetails);
    savedIds[session.id] = event.id;
    created += 1;
  }
  const retainedIds = new Set(sessions.map(session => session.id));
  for (const [sessionId, eventId] of Object.entries(savedIds)) {
    if (retainedIds.has(sessionId)) continue;
    try {
      const event = await Calendar.ExpoCalendarEvent.get(eventId);
      await event.delete();
      delete savedIds[sessionId];
    } catch {
      // Keep the mapping so a later sync can retry deletion after calendar access is restored.
    }
  }
  await AsyncStorage.setItem(calendarKey, JSON.stringify(savedIds));
  await AsyncStorage.setItem(ownerKey(CALENDAR_SYNC_ENABLED_KEY, ownerId), 'true');
  return {created, updated};
}

export async function syncEnabledStudyTools(ownerId: string, sessions: DeviceStudySession[]) {
  const [remindersEnabled, calendarSyncEnabled] = await Promise.all([
    loadOwnerSetting(REMINDERS_ENABLED_KEY, ownerId),
    loadOwnerSetting(CALENDAR_SYNC_ENABLED_KEY, ownerId),
  ]);
  const updates: Promise<unknown>[] = [];
  if (remindersEnabled === 'true') updates.push(scheduleStudyReminders(ownerId, sessions));
  if (calendarSyncEnabled === 'true') updates.push(exportSessionsToDeviceCalendar(ownerId, sessions));
  await Promise.all(updates);
}

export async function cancelStudyReminder(ownerId: string, sessionId: string) {
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  const reminders = existing.filter(item => isBrujulaReminder(item, ownerId) && item.content.data?.sessionId === sessionId);
  await Promise.all(reminders.map(item => Notifications.cancelScheduledNotificationAsync(item.identifier)));
}

export async function removeSessionFromDeviceCalendar(ownerId: string, sessionId: string) {
  const calendarKey = ownerKey(CALENDAR_EVENT_IDS_KEY, ownerId);
  const savedIds = await loadCalendarEventIds(ownerId);
  const eventId = savedIds[sessionId];
  if (!eventId) return false;
  try {
    const event = await Calendar.ExpoCalendarEvent.get(eventId);
    await event.delete();
  } catch {
    throw new Error('No se pudo eliminar el evento del calendario. Revisa el permiso y vuelve a sincronizar.');
  }
  delete savedIds[sessionId];
  await AsyncStorage.setItem(calendarKey, JSON.stringify(savedIds));
  return true;
}

export function createLocalSessionDate(date: string, startMinute: number) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, Math.floor(startMinute / 60), startMinute % 60, 0, 0);
}
