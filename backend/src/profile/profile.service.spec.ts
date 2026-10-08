import {NotFoundException} from '@nestjs/common';
import {ProfileService} from './profile.service';
import type {StudyPreferences, UserProfile} from '../users/user.types';

describe('ProfileService', () => {
  const profile: UserProfile = {
    id: 'user-1',
    name: 'Jean Franco',
    email: 'jean@example.com',
    preferences: {formats: ['read'], rhythm: 'spaced', minutesPerDay: 25, goal: 'understand'},
    onboardingCompleted: false,
  };
  const users = {findById: jest.fn(), updatePreferences: jest.fn()};
  let service: ProfileService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProfileService(users as never);
  });

  it('returns a public user profile', async () => {
    users.findById.mockResolvedValue(profile);
    await expect(service.getProfile(profile.id)).resolves.toEqual(profile);
  });

  it('returns not found when the profile id does not exist', async () => {
    users.findById.mockResolvedValue(null);
    await expect(service.getProfile('missing-id')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('saves preferences through the user service', async () => {
    const preferences: StudyPreferences = {formats: ['practice'], rhythm: 'longBlocks', minutesPerDay: 15, goal: 'habit'};
    const updated = {...profile, preferences, onboardingCompleted: true};
    users.updatePreferences.mockResolvedValue(updated);
    await expect(service.savePreferences(profile.id, preferences)).resolves.toEqual(updated);
    expect(users.updatePreferences).toHaveBeenCalledWith(profile.id, preferences);
  });

  it('returns not found when saving preferences for a missing user', async () => {
    users.updatePreferences.mockResolvedValue(null);
    await expect(service.savePreferences('missing-id', profile.preferences)).rejects.toBeInstanceOf(NotFoundException);
  });
});
