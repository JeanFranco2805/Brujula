import {ConflictException, Injectable} from '@nestjs/common';
import {DatabaseService} from '../database/database.service';
import type {StudyPreferences, UserCredentials, UserProfile} from './user.types';

@Injectable()
export class UsersService {
  constructor(private readonly database: DatabaseService) {}

  async create(input: {name: string; email: string; passwordHash: string}): Promise<UserProfile> {
    const result = await this.database.query<UserProfile>(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, preferences, onboarding_completed AS "onboardingCompleted"`,
      [input.name, input.email, input.passwordHash],
    );
    return result.rows[0];
  }

  async findForLogin(email: string): Promise<UserCredentials | null> {
    const result = await this.database.query<UserCredentials>(
      `SELECT id, name, email, password_hash AS "passwordHash", preferences,
              onboarding_completed AS "onboardingCompleted"
       FROM users WHERE email = $1`,
      [email],
    );
    return result.rows[0] ?? null;
  }

  async findById(id: string): Promise<UserProfile | null> {
    const result = await this.database.query<UserProfile>(
      `SELECT id, name, email, preferences, onboarding_completed AS "onboardingCompleted"
       FROM users WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findOrCreateGoogleUser(input: {subject: string; email: string; name: string}): Promise<UserProfile> {
    const result = await this.database.query<UserProfile>(
      `INSERT INTO users (name, email, password_hash, google_subject)
       VALUES ($1, $2, NULL, $3)
       ON CONFLICT (LOWER(email)) DO UPDATE
         SET google_subject = COALESCE(users.google_subject, EXCLUDED.google_subject), updated_at = NOW()
         WHERE users.google_subject IS NULL OR users.google_subject = EXCLUDED.google_subject
       RETURNING id, name, email, preferences, onboarding_completed AS "onboardingCompleted"`,
      [input.name, input.email.trim().normalize('NFC').toLowerCase(), input.subject],
    );
    if (!result.rows[0]) throw new ConflictException('Esta cuenta de Google está vinculada a otro usuario.');
    return result.rows[0];
  }

  async updatePreferences(id: string, preferences: StudyPreferences): Promise<UserProfile | null> {
    const result = await this.database.query<UserProfile>(
      `UPDATE users
       SET preferences = $2::jsonb, onboarding_completed = TRUE, updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, email, preferences, onboarding_completed AS "onboardingCompleted"`,
      [id, JSON.stringify(preferences)],
    );
    return result.rows[0] ?? null;
  }
}
