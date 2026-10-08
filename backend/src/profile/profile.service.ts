import {Injectable, NotFoundException} from '@nestjs/common';
import {UsersService} from '../users/users.service';
import type {StudyPreferences, UserProfile} from '../users/user.types';

@Injectable()
export class ProfileService {
  constructor(private readonly users: UsersService) {}

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException('No encontramos este usuario.');
    return user;
  }

  async savePreferences(userId: string, preferences: StudyPreferences): Promise<UserProfile> {
    const user = await this.users.updatePreferences(userId, preferences);
    if (!user) throw new NotFoundException('No encontramos este usuario.');
    return user;
  }
}
