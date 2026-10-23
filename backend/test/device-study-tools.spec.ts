const mockValues = new Map<string, string>();
const mockScheduled = new Map<string, {identifier: string; content: {title?: string; body?: string; data?: Record<string, unknown>}; request?: unknown}>();
const mockScheduleNotification = jest.fn(async (request: {content: {title?: string; body?: string; data?: Record<string, unknown>}; trigger: {date: Date}}) => {
  const identifier = `notification-${mockScheduled.size + 1}`;
  mockScheduled.set(identifier, {identifier, content: request.content, request});
  return identifier;
});
const mockCancelNotification = jest.fn(async (identifier: string) => { mockScheduled.delete(identifier); });
const mockCreateEvent = jest.fn(async (details: Record<string, unknown>) => ({id: `event-${mockCreateEvent.mock.calls.length - 1}`, ...details}));
const mockUpdateEvent = jest.fn(async (_details: Record<string, unknown>) => undefined);
const mockDeleteEvent = jest.fn(async () => undefined);
const mockGetEvent = jest.fn(async (_eventId: string) => ({update: mockUpdateEvent, delete: mockDeleteEvent}));
const mockCalendar = {id: 'calendar-1', allowsModifications: true, isPrimary: true, createEvent: mockCreateEvent};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(mockValues.get(key) ?? null)),
    setItem: jest.fn((key: string, value: string) => { mockValues.set(key, value); return Promise.resolve(); }),
  },
}));

jest.mock('react-native', () => ({Platform: {OS: 'android'}}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({granted: true})),
  requestPermissionsAsync: jest.fn(async () => ({granted: true})),
  getAllScheduledNotificationsAsync: jest.fn(async () => [...mockScheduled.values()]),
  scheduleNotificationAsync: mockScheduleNotification,
  cancelScheduledNotificationAsync: mockCancelNotification,
  SchedulableTriggerInputTypes: {DATE: 'date'},
}));

jest.mock('expo-calendar', () => ({
  EntityTypes: {EVENT: 'event'},
  getCalendarPermissions: jest.fn(async () => ({granted: true})),
  requestCalendarPermissions: jest.fn(async () => ({granted: true})),
  getCalendars: jest.fn(async () => [mockCalendar]),
  ExpoCalendarEvent: {get: mockGetEvent},
}));

import {cancelStudyReminder, exportSessionsToDeviceCalendar, removeSessionFromDeviceCalendar, scheduleStudyReminder, scheduleStudyReminders, syncEnabledStudyTools, type DeviceStudySession} from '../../src/services/device-study-tools';
import {formatLocalDate} from '../../src/services/local-study-planner';

function futureSession(overrides: Partial<DeviceStudySession> = {}): DeviceStudySession {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  return {
    id: 'session-1',
    title: 'Repasar biología',
    date: formatLocalDate(date),
    startMinute: 16 * 60,
    durationMinutes: 25,
    status: 'planned',
    reminderEnabled: true,
    reminderMinutesBefore: 10,
    ...overrides,
  };
}

describe('device study tools', () => {
  beforeEach(() => {
    mockValues.clear();
    mockScheduled.clear();
    jest.clearAllMocks();
  });

  it('schedules local reminders at the selected lead time and keeps other accounts isolated', async () => {
    mockScheduled.set('other-user-reminder', {
      identifier: 'other-user-reminder',
      content: {data: {brujulaStudyReminder: true, ownerId: 'student-b', sessionId: 'session-b'}},
    });

    await expect(scheduleStudyReminders('student-a', [futureSession()])).resolves.toBe(1);

    expect(mockCancelNotification).not.toHaveBeenCalledWith('other-user-reminder');
    const notification = mockScheduleNotification.mock.calls[0][0];
    const expected = new Date(futureSession().date + 'T16:00:00');
    expected.setMinutes(expected.getMinutes() - 10);
    expect(notification.trigger.date.getTime()).toBe(expected.getTime());
    expect(notification.content.body).toContain('10 min');
    expect(notification.content.data).toMatchObject({ownerId: 'student-a', sessionId: 'session-1'});
    expect(mockValues.get('brujula.study-reminders-enabled.v1.student-a')).toBe('true');
  });

  it("clears a user's old reminder when the event is completed or the reminder is removed", async () => {
    mockScheduled.set('student-a-old', {identifier: 'student-a-old', content: {data: {brujulaStudyReminder: true, ownerId: 'student-a', sessionId: 'session-1'}}});
    mockScheduled.set('student-b-old', {identifier: 'student-b-old', content: {data: {brujulaStudyReminder: true, ownerId: 'student-b', sessionId: 'session-2'}}});

    await expect(scheduleStudyReminders('student-a', [futureSession({status: 'completed'})])).resolves.toBe(0);
    await cancelStudyReminder('student-b', 'session-2');

    expect(mockScheduled.has('student-a-old')).toBe(false);
    expect(mockScheduled.has('student-b-old')).toBe(false);
  });

  it('schedules a single reminder without enabling alerts for every study session', async () => {
    const session = futureSession({id: 'personal-1'});

    await expect(scheduleStudyReminder('student-a', session)).resolves.toBe(true);

    expect(mockScheduleNotification).toHaveBeenCalledTimes(1);
    expect(mockValues.has('brujula.study-reminders-enabled.v1.student-a')).toBe(false);
    expect([...mockScheduled.values()][0].content.data).toMatchObject({ownerId: 'student-a', sessionId: 'personal-1'});
  });

  it('preserves previously scheduled reminders if the device denies notification permission', async () => {
    const notifications = jest.requireMock('expo-notifications') as {
      getPermissionsAsync: jest.Mock;
      requestPermissionsAsync: jest.Mock;
    };
    notifications.getPermissionsAsync.mockResolvedValueOnce({granted: false});
    notifications.requestPermissionsAsync.mockResolvedValueOnce({granted: false});
    mockScheduled.set('student-a-reminder', {identifier: 'student-a-reminder', content: {data: {brujulaStudyReminder: true, ownerId: 'student-a', sessionId: 'session-old'}}});

    await expect(scheduleStudyReminders('student-a', [futureSession()])).rejects.toThrow('Activa las notificaciones');

    expect(mockScheduled.has('student-a-reminder')).toBe(true);
    expect(mockCancelNotification).not.toHaveBeenCalled();
  });

  it('creates device calendar events, updates them on later sync, then removes them', async () => {
    const session = futureSession();
    await expect(exportSessionsToDeviceCalendar('student-a', [session])).resolves.toEqual({created: 1, updated: 0});
    const eventId = 'event-0';
    await expect(exportSessionsToDeviceCalendar('student-a', [{...session, title: 'Repasar célula'}])).resolves.toEqual({created: 0, updated: 1});
    expect(mockGetEvent).toHaveBeenCalledWith(eventId);
    expect(mockUpdateEvent).toHaveBeenCalledWith(expect.objectContaining({title: 'Brújula · Repasar célula'}));

    await expect(removeSessionFromDeviceCalendar('student-a', session.id)).resolves.toBe(true);
    expect(mockDeleteEvent).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mockValues.get('brujula.calendar-events.v1.student-a') ?? '{}')).toEqual({});
  });

  it('removes deleted app sessions from the linked device calendar during sync', async () => {
    const session = futureSession();
    await exportSessionsToDeviceCalendar('student-a', [session]);

    await syncEnabledStudyTools('student-a', []);

    expect(mockDeleteEvent).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mockValues.get('brujula.calendar-events.v1.student-a') ?? '{}')).toEqual({});
  });
});
