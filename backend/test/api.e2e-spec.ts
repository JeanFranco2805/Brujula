import 'reflect-metadata';
import {ValidationPipe} from '@nestjs/common';
import {Test} from '@nestjs/testing';
import type {INestApplication} from '@nestjs/common';
import request = require('supertest');
import {AuthController} from '../src/auth/auth.controller';
import {AuthService} from '../src/auth/auth.service';
import {JwtAuthGuard} from '../src/auth/jwt-auth.guard';
import {DatabaseService} from '../src/database/database.service';
import {HealthController} from '../src/health.controller';
import {ProfileController} from '../src/profile/profile.controller';
import {ProfileService} from '../src/profile/profile.service';
import type {StudyPreferences, UserProfile} from '../src/users/user.types';
import {JwtService} from '@nestjs/jwt';
import {MaterialsController} from '../src/materials/materials.controller';
import {MaterialsService} from '../src/materials/materials.service';
import {StudyPlanController} from '../src/study-plan/study-plan.controller';
import {StudyPlanService} from '../src/study-plan/study-plan.service';
import {VoiceNotesController} from '../src/voice-notes/voice-notes.controller';
import {VoiceNotesService} from '../src/voice-notes/voice-notes.service';

describe('Brújula API HTTP (e2e)', () => {
  const profile: UserProfile = {
    id: 'user-1',
    name: 'Jean Franco',
    email: 'jean@example.com',
    preferences: {formats: ['read'], rhythm: 'spaced', minutesPerDay: 25, goal: 'understand'},
    onboardingCompleted: false,
  };
  const session = {accessToken: 'signed-token', user: profile};
  const material = {id: '8e676871-55b2-4e8c-8732-1fa8ee7d910f', originalName: 'Clase.pdf', summary: 'Resumen', keyPoints: [], topics: [], analysisProvider: 'local'};
  const preferences: StudyPreferences = {formats: ['listen', 'visual'], rhythm: 'longBlocks', minutesPerDay: 40, goal: 'exam'};
  const auth = {
    register: jest.fn(),
    login: jest.fn(),
    loginWithGoogle: jest.fn(),
  };
  const profiles = {getProfile: jest.fn(), savePreferences: jest.fn()};
  const materials = {create: jest.fn(), list: jest.fn(), findOne: jest.fn(), remove: jest.fn()};
  const plans = {list: jest.fn(), generate: jest.fn(), complete: jest.fn(), reschedule: jest.fn()};
  const voiceNotes = {create: jest.fn(), list: jest.fn(), findOne: jest.fn(), remove: jest.fn()};
  const database = {query: jest.fn()};
  const jwt = {verifyAsync: jest.fn()};
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController, ProfileController, MaterialsController, StudyPlanController, VoiceNotesController, HealthController],
      providers: [
        {provide: AuthService, useValue: auth},
        {provide: ProfileService, useValue: profiles},
        {provide: MaterialsService, useValue: materials},
        {provide: StudyPlanService, useValue: plans},
        {provide: VoiceNotesService, useValue: voiceNotes},
        {provide: DatabaseService, useValue: database},
        {provide: JwtService, useValue: jwt},
        JwtAuthGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({whitelist: true, forbidNonWhitelisted: true, transform: true}));
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    auth.register.mockResolvedValue(session);
    auth.login.mockResolvedValue(session);
    auth.loginWithGoogle.mockResolvedValue(session);
    profiles.getProfile.mockResolvedValue(profile);
    profiles.savePreferences.mockResolvedValue({...profile, preferences, onboardingCompleted: true});
    materials.create.mockResolvedValue(material);
    materials.list.mockResolvedValue([material]);
    materials.findOne.mockResolvedValue(material);
    materials.remove.mockResolvedValue(undefined);
    plans.list.mockResolvedValue([{id: 'session-1', title: 'Fotosíntesis'}]);
    plans.generate.mockResolvedValue([{id: 'session-1', title: 'Fotosíntesis'}]);
    plans.complete.mockResolvedValue({id: 'session-1', status: 'completed'});
    plans.reschedule.mockResolvedValue({id: 'session-1', date: '2026-10-09', startMinute: 600});
    voiceNotes.create.mockResolvedValue({id: 'note-1', transcript: 'Apuntes de hoy'});
    voiceNotes.list.mockResolvedValue([{id: 'note-1', transcript: 'Apuntes de hoy'}]);
    voiceNotes.findOne.mockResolvedValue({id: 'note-1', transcript: 'Apuntes de hoy'});
    voiceNotes.remove.mockResolvedValue(undefined);
    database.query.mockResolvedValue({rows: []});
    jwt.verifyAsync.mockResolvedValue({sub: profile.id, email: profile.email});
  });

  afterAll(async () => app.close());

  it('registers a valid email account and returns a session', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({name: 'Jean Franco', email: 'jean@example.com', password: 'strong-pass-1'})
      .expect(201);

    expect(response.body).toEqual(session);
    expect(auth.register).toHaveBeenCalledWith({name: 'Jean Franco', email: 'jean@example.com', password: 'strong-pass-1'});
  });

  it.each([
    [{name: '', email: 'jean@example.com', password: 'strong-pass-1'}],
    [{name: '   ', email: 'jean@example.com', password: 'strong-pass-1'}],
    [{name: 'Jean', email: 'invalid-email', password: 'strong-pass-1'}],
    [{name: 'Jean', email: 'jean@example.com', password: 'short'}],
    [{name: 'Jean', email: 'jean@example.com', password: 'strong-pass-1', isAdmin: true}],
  ])('rejects invalid signup input: %o', async body => {
    await request(app.getHttpServer()).post('/api/v1/auth/register').send(body).expect(400);
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('logs in with valid credentials', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({email: 'jean@example.com', password: 'strong-pass-1'})
      .expect(200);

    expect(response.body).toEqual(session);
    expect(auth.login).toHaveBeenCalledWith({email: 'jean@example.com', password: 'strong-pass-1'});
  });

  it('validates Google login input and passes a token to the auth service', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/google')
      .send({idToken: 'google-id-token'})
      .expect(200);

    expect(response.body).toEqual(session);
    expect(auth.loginWithGoogle).toHaveBeenCalledWith('google-id-token');
    await request(app.getHttpServer()).post('/api/v1/auth/google').send({}).expect(400);
  });

  it('requires a bearer token before returning private profile data', async () => {
    await request(app.getHttpServer()).get('/api/v1/profile').expect(401);
    expect(profiles.getProfile).not.toHaveBeenCalled();
  });

  it('returns the signed-in user profile', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/profile')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(response.body).toEqual(profile);
    expect(profiles.getProfile).toHaveBeenCalledWith(profile.id);
  });

  it('rejects invalid access tokens', async () => {
    jwt.verifyAsync.mockRejectedValueOnce(new Error('expired'));
    await request(app.getHttpServer()).get('/api/v1/profile').set('Authorization', 'Bearer invalid-token').expect(401);
  });

  it('saves valid onboarding preferences for the signed-in user', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/v1/profile/preferences')
      .set('Authorization', 'Bearer valid-token')
      .send(preferences)
      .expect(200);

    expect(response.body).toEqual({...profile, preferences, onboardingCompleted: true});
    expect(profiles.savePreferences).toHaveBeenCalledWith(profile.id, preferences);
  });

  it('rejects empty, duplicate and unknown study formats and unrecognized fields', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/profile/preferences')
      .set('Authorization', 'Bearer valid-token')
      .send({...preferences, formats: []})
      .expect(400);
    await request(app.getHttpServer())
      .patch('/api/v1/profile/preferences')
      .set('Authorization', 'Bearer valid-token')
      .send({...preferences, formats: ['read', 'read']})
      .expect(400);
    await request(app.getHttpServer())
      .patch('/api/v1/profile/preferences')
      .set('Authorization', 'Bearer valid-token')
      .send({...preferences, formats: ['watch-video']})
      .expect(400);
    await request(app.getHttpServer())
      .patch('/api/v1/profile/preferences')
      .set('Authorization', 'Bearer valid-token')
      .send({...preferences, debug: true})
      .expect(400);
    expect(profiles.savePreferences).not.toHaveBeenCalled();
  });

  it('protects PDF material routes and lists materials for the signed-in user', async () => {
    await request(app.getHttpServer()).get('/api/v1/materials').expect(401);
    const response = await request(app.getHttpServer())
      .get('/api/v1/materials')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(response.body).toEqual([material]);
    expect(materials.list).toHaveBeenCalledWith(profile.id);
  });

  it('imports PDF uploads and passes the owner id to the material service', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/materials')
      .set('Authorization', 'Bearer valid-token')
      .attach('file', Buffer.from('%PDF-test'), {filename: 'Clase.pdf', contentType: 'application/pdf'})
      .expect(201);

    expect(response.body).toEqual(material);
    expect(materials.create).toHaveBeenCalledWith(profile.id, expect.objectContaining({originalname: 'Clase.pdf'}));
  });

  it('creates a study plan after a PDF is analyzed into topics', async () => {
    const analyzedMaterial = {
      ...material,
      summary: 'La fotosíntesis convierte la luz en energía química.',
      keyPoints: ['Captura de luz', 'Producción de glucosa'],
      topics: [{title: 'Fotosíntesis', explanation: 'Proceso de conversión de luz.', questions: ['¿Qué función cumple la clorofila?']}],
      analysisProvider: 'local',
    };
    const generatedSessions = [{id: 'session-1', materialId: material.id, topicIndex: 0, title: 'Fotosíntesis'}];
    materials.create.mockResolvedValueOnce(analyzedMaterial);
    plans.generate.mockResolvedValueOnce(generatedSessions);

    const upload = await request(app.getHttpServer())
      .post('/api/v1/materials')
      .set('Authorization', 'Bearer valid-token')
      .attach('file', Buffer.from('%PDF-study'), {filename: 'Biologia.pdf', contentType: 'application/pdf'})
      .expect(201);
    expect(upload.body.topics).toEqual(analyzedMaterial.topics);

    const plan = await request(app.getHttpServer())
      .post('/api/v1/study-plan/generate')
      .set('Authorization', 'Bearer valid-token')
      .send({})
      .expect(201);
    expect(plan.body).toEqual(generatedSessions);
    expect(plans.generate).toHaveBeenCalledWith(profile.id, undefined, undefined);
  });

  it('validates material UUIDs and removes only authorized materials', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/materials/not-a-uuid')
      .set('Authorization', 'Bearer valid-token')
      .expect(400);
    await request(app.getHttpServer())
      .delete(`/api/v1/materials/${material.id}`)
      .set('Authorization', 'Bearer valid-token')
      .expect(200)
      .expect({deleted: true});
    expect(materials.remove).toHaveBeenCalledWith(profile.id, material.id);
  });

  it('protects study plan routes and generates a preference-based plan', async () => {
    await request(app.getHttpServer()).get('/api/v1/study-plan').expect(401);
    const response = await request(app.getHttpServer())
      .post('/api/v1/study-plan/generate')
      .set('Authorization', 'Bearer valid-token')
      .send({days: 3, startMinute: 600})
      .expect(201);
    expect(response.body).toEqual([{id: 'session-1', title: 'Fotosíntesis'}]);
    expect(plans.generate).toHaveBeenCalledWith(profile.id, 3, 600);
  });

  it('validates study plan generation and session scheduling input', async () => {
    const authHeader = {Authorization: 'Bearer valid-token'};
    await request(app.getHttpServer()).post('/api/v1/study-plan/generate').set(authHeader).send({days: 8}).expect(400);
    await request(app.getHttpServer()).patch('/api/v1/study-plan/not-a-uuid/complete').set(authHeader).expect(400);
    await request(app.getHttpServer()).patch('/api/v1/study-plan/8e676871-55b2-4e8c-8732-1fa8ee7d910f/schedule')
      .set(authHeader).send({date: 'tomorrow', startMinute: 600}).expect(400);
    expect(plans.generate).not.toHaveBeenCalled();
    expect(plans.reschedule).not.toHaveBeenCalled();
  });

  it('protects voice note routes and stores only the authenticated owner’s transcript', async () => {
    await request(app.getHttpServer()).get('/api/v1/voice-notes').expect(401);
    const response = await request(app.getHttpServer())
      .post('/api/v1/voice-notes')
      .set('Authorization', 'Bearer valid-token')
      .attach('file', Buffer.from('audio'), {filename: 'nota.m4a', contentType: 'audio/mp4'})
      .expect(201);
    expect(response.body).toEqual({id: 'note-1', transcript: 'Apuntes de hoy'});
    expect(voiceNotes.create).toHaveBeenCalledWith(profile.id, expect.objectContaining({originalname: 'nota.m4a'}));
    await request(app.getHttpServer()).delete('/api/v1/voice-notes/not-a-uuid').set('Authorization', 'Bearer valid-token').expect(400);
  });

  it('reports database readiness through the health endpoint', async () => {
    await request(app.getHttpServer()).get('/api/v1/health').expect(200).expect({status: 'ok', database: 'connected'});
    expect(database.query).toHaveBeenCalledWith('SELECT 1');
  });
});
