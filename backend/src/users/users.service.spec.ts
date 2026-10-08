import {ConflictException} from '@nestjs/common';
import {UsersService} from './users.service';
import type {StudyPreferences, UserProfile} from './user.types';

describe('UsersService', () => {
  const profile: UserProfile = {
    id: 'user-1',
    name: 'Jean Franco',
    email: 'jean@example.com',
    preferences: {formats: ['read'], rhythm: 'spaced', minutesPerDay: 25, goal: 'understand'},
    onboardingCompleted: false,
  };
  const database = {query: jest.fn()};
  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    database.query.mockResolvedValue({rows: [profile]});
    service = new UsersService(database as never);
  });

  it('creates a user with a password hash and returns only the public profile', async () => {
    await expect(service.create({name: profile.name, email: profile.email, passwordHash: '$2b$hash'})).resolves.toEqual(profile);
    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO users'), [profile.name, profile.email, '$2b$hash']);
    expect(database.query.mock.calls[0][0]).toContain('RETURNING id, name, email');
  });

  it('loads credentials for login and returns null for unknown email', async () => {
    const credentials = {...profile, passwordHash: '$2b$hash'};
    database.query.mockResolvedValueOnce({rows: [credentials]});
    await expect(service.findForLogin(profile.email)).resolves.toEqual(credentials);
    expect(database.query.mock.calls[0][0]).toContain('password_hash AS "passwordHash"');

    database.query.mockResolvedValueOnce({rows: []});
    await expect(service.findForLogin('missing@example.com')).resolves.toBeNull();
  });

  it('loads a public user by id and returns null when it does not exist', async () => {
    await expect(service.findById(profile.id)).resolves.toEqual(profile);
    expect(database.query.mock.calls[0]).toEqual([expect.stringContaining('WHERE id = $1'), [profile.id]]);

    database.query.mockResolvedValueOnce({rows: []});
    await expect(service.findById('missing-id')).resolves.toBeNull();
  });

  it('creates or links a Google user using a normalized email and subject', async () => {
    await expect(service.findOrCreateGoogleUser({subject: 'google-sub', email: ' JEAN@Example.com ', name: 'Jean'})).resolves.toEqual(profile);
    expect(database.query.mock.calls[0][0]).toContain('ON CONFLICT (LOWER(email))');
    expect(database.query.mock.calls[0][1]).toEqual(['Jean', 'jean@example.com', 'google-sub']);
  });

  it('rejects a Google identity already linked to a different account', async () => {
    database.query.mockResolvedValueOnce({rows: []});
    await expect(service.findOrCreateGoogleUser({subject: 'other-sub', email: profile.email, name: profile.name}))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('persists complete study preferences and marks onboarding complete', async () => {
    const preferences: StudyPreferences = {formats: ['listen', 'visual'], rhythm: 'longBlocks', minutesPerDay: 40, goal: 'exam'};
    const updated = {...profile, preferences, onboardingCompleted: true};
    database.query.mockResolvedValueOnce({rows: [updated]});

    await expect(service.updatePreferences(profile.id, preferences)).resolves.toEqual(updated);
    expect(database.query.mock.calls[0][0]).toContain('onboarding_completed = TRUE');
    expect(database.query.mock.calls[0][1]).toEqual([profile.id, JSON.stringify(preferences)]);
  });

  it('returns null when preference updates target a missing account', async () => {
    database.query.mockResolvedValueOnce({rows: []});
    await expect(service.updatePreferences(profile.id, profile.preferences)).resolves.toBeNull();
  });
});
