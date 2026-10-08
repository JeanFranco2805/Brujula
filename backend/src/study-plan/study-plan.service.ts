import {BadRequestException, Injectable, NotFoundException} from '@nestjs/common';
import {DatabaseService} from '../database/database.service';
import {UsersService} from '../users/users.service';
import type {StudyPreferences} from '../users/user.types';

export type PlannedSession = {
  id: string;
  materialId: string;
  topicIndex: number;
  title: string;
  date: string;
  startMinute: number;
  durationMinutes: number;
  learningFormat: StudyPreferences['formats'][number];
  status: 'planned' | 'completed' | 'skipped';
};

type MaterialForPlan = {id: string; originalName: string; topics: unknown};
type Topic = {title?: string};

@Injectable()
export class StudyPlanService {
  constructor(private readonly database: DatabaseService, private readonly users: UsersService) {}

  async list(userId: string): Promise<PlannedSession[]> {
    const result = await this.database.query<PlannedSession>(
      `SELECT id, material_id AS "materialId", topic_index AS "topicIndex", title, session_date::text AS date,
              start_minute AS "startMinute", duration_minutes AS "durationMinutes",
              learning_format AS "learningFormat", status
       FROM study_sessions WHERE user_id = $1
       ORDER BY session_date, start_minute, created_at`,
      [userId],
    );
    return result.rows;
  }

  async generate(userId: string, days = 5, startMinute = 18 * 60): Promise<PlannedSession[]> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException('No encontramos este usuario.');

    const materialResult = await this.database.query<MaterialForPlan>(
      `SELECT id, original_name AS "originalName", topics
       FROM study_materials WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    const materials = materialResult.rows.flatMap(material => {
      let topics: unknown = material.topics;
      if (typeof topics === 'string') {
        try { topics = JSON.parse(topics) as unknown; } catch { topics = []; }
      }
      return Array.isArray(topics)
        ? topics.filter((topic): topic is Topic => !!topic && typeof topic === 'object' && typeof (topic as Topic).title === 'string')
          .map((topic, topicIndex) => ({materialId: material.id, title: topic.title!.slice(0, 200), topicIndex}))
        : [];
    });
    if (!materials.length) throw new BadRequestException('Importa un PDF con temas para crear tu plan de estudio.');

    const preferences = user.preferences;
    const plan: Omit<PlannedSession, 'id' | 'status'>[] = [];
    const date = new Date();
    let topicPointer = 0;
    let weekdayCount = 0;
    while (weekdayCount < days) {
      date.setUTCDate(date.getUTCDate() + 1);
      const weekday = date.getUTCDay();
      if (weekday === 0 || weekday === 6) continue;
      const topic = materials[topicPointer % materials.length];
      const format = preferences.formats[topicPointer % preferences.formats.length] ?? 'practice';
      plan.push({
        materialId: topic.materialId,
        topicIndex: topic.topicIndex,
        title: topic.title,
        date: date.toISOString().slice(0, 10),
        startMinute,
        durationMinutes: preferences.minutesPerDay,
        learningFormat: format,
      });
      topicPointer += 1;
      weekdayCount += 1;
    }

    const result = await this.database.query<PlannedSession>(
      `WITH removed AS (
         DELETE FROM study_sessions WHERE user_id = $1 AND session_date >= CURRENT_DATE AND status = 'planned'
       )
       INSERT INTO study_sessions
         (user_id, material_id, topic_index, title, session_date, start_minute, duration_minutes, learning_format)
       SELECT $1, item."materialId", item."topicIndex", item.title, item.date::date,
              item."startMinute", item."durationMinutes", item."learningFormat"
       FROM jsonb_to_recordset($2::jsonb) AS item(
         "materialId" UUID, "topicIndex" INTEGER, title TEXT, date TEXT,
         "startMinute" SMALLINT, "durationMinutes" SMALLINT, "learningFormat" TEXT
       )
       RETURNING id, material_id AS "materialId", topic_index AS "topicIndex", title,
                 session_date::text AS date, start_minute AS "startMinute",
                 duration_minutes AS "durationMinutes", learning_format AS "learningFormat", status`,
      [userId, JSON.stringify(plan)],
    );
    return result.rows;
  }

  async complete(userId: string, id: string): Promise<PlannedSession> {
    const result = await this.database.query<PlannedSession>(
      `UPDATE study_sessions SET status = 'completed', updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND status <> 'skipped'
       RETURNING id, material_id AS "materialId", topic_index AS "topicIndex", title, session_date::text AS date,
                 start_minute AS "startMinute", duration_minutes AS "durationMinutes",
                 learning_format AS "learningFormat", status`,
      [id, userId],
    );
    if (!result.rows[0]) throw new NotFoundException('No encontramos esta sesión o ya no se puede completar.');
    return result.rows[0];
  }

  async reschedule(userId: string, id: string, date: string, startMinute: number): Promise<PlannedSession> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
      throw new BadRequestException('La fecha debe tener el formato YYYY-MM-DD.');
    }
    const result = await this.database.query<PlannedSession>(
      `UPDATE study_sessions SET session_date = $3::date, start_minute = $4, updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND status = 'planned'
       RETURNING id, material_id AS "materialId", topic_index AS "topicIndex", title, session_date::text AS date,
                 start_minute AS "startMinute", duration_minutes AS "durationMinutes",
                 learning_format AS "learningFormat", status`,
      [id, userId, date, startMinute],
    );
    if (!result.rows[0]) throw new NotFoundException('No encontramos una sesión pendiente para reprogramar.');
    return result.rows[0];
  }
}
