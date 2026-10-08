import {Test} from '@nestjs/testing';
import type {INestApplication} from '@nestjs/common';
import {AppModule} from '../src/app.module';
import {DatabaseService} from '../src/database/database.service';

describe('AppModule bootstrap (e2e)', () => {
  let app: INestApplication;
  const originalJwtSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-only-jwt-secret-with-more-than-32-characters';
    const moduleRef = await Test.createTestingModule({imports: [AppModule]})
      .overrideProvider(DatabaseService)
      .useValue({query: jest.fn().mockResolvedValue({rows: [{'?column?': 1}]})})
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
    } finally {
      if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = originalJwtSecret;
    }
  });

  it('resolves the full module graph and starts the application', () => {
    expect(app).toBeDefined();
  });
});
