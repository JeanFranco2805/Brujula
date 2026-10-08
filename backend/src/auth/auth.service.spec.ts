import {BadRequestException, ConflictException, ServiceUnavailableException, UnauthorizedException} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import {OAuth2Client} from 'google-auth-library';
import {AuthService} from './auth.service';

describe('AuthService', () => {
  const profile = {
    id: 'user-1',
    name: 'Jean Franco',
    email: 'jean@example.com',
    preferences: {formats: ['read'], rhythm: 'spaced', minutesPerDay: 25, goal: 'understand'},
    onboardingCompleted: false,
  } as const;
  const users = {
    create: jest.fn(),
    findForLogin: jest.fn(),
    findOrCreateGoogleUser: jest.fn(),
  };
  const jwt = {signAsync: jest.fn()};
  const config = {get: jest.fn()};
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    users.create.mockResolvedValue(profile);
    jwt.signAsync.mockResolvedValue('signed-access-token');
    config.get.mockReturnValue('');
    service = new AuthService(users as never, jwt as never, config as never);
  });

  it('normalizes signup identity, hashes the password and returns a session without credentials', async () => {
    const result = await service.register({name: '  Jean Franco  ', email: '  JEAN@Example.com ', password: 'strong-pass-1'});

    const [created] = users.create.mock.calls[0] as [{name: string; email: string; passwordHash: string}];
    expect(created.name).toBe('Jean Franco');
    expect(created.email).toBe('jean@example.com');
    expect(created.passwordHash).not.toBe('strong-pass-1');
    await expect(bcrypt.compare('strong-pass-1', created.passwordHash)).resolves.toBe(true);
    expect(result).toEqual({accessToken: 'signed-access-token', user: profile});
    expect(jwt.signAsync).toHaveBeenCalledWith({sub: profile.id, email: profile.email});
  });

  it('maps duplicate-email database errors to a conflict response', async () => {
    users.create.mockRejectedValue(Object.assign(new Error('duplicate'), {code: '23505'}));

    await expect(service.register({name: 'Jean', email: 'jean@example.com', password: 'strong-pass-1'}))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects blank names and passwords that exceed bcrypt UTF-8 byte limits', async () => {
    await expect(service.register({name: '   ', email: 'jean@example.com', password: 'strong-pass-1'}))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.register({name: 'Jean', email: 'jean@example.com', password: '🔐'.repeat(19)}))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(users.create).not.toHaveBeenCalled();
  });

  it('propagates unexpected database failures during signup', async () => {
    const failure = new Error('database unavailable');
    users.create.mockRejectedValue(failure);

    await expect(service.register({name: 'Jean', email: 'jean@example.com', password: 'strong-pass-1'}))
      .rejects.toBe(failure);
  });

  it('normalizes login email and strips the stored hash from its session response', async () => {
    const passwordHash = await bcrypt.hash('strong-pass-1', 4);
    users.findForLogin.mockResolvedValue({...profile, email: 'jean@example.com', passwordHash});

    const result = await service.login({email: ' JEAN@Example.com ', password: 'strong-pass-1'});

    expect(users.findForLogin).toHaveBeenCalledWith('jean@example.com');
    expect(result).toEqual({accessToken: 'signed-access-token', user: profile});
    expect(result).not.toHaveProperty('user.passwordHash');
  });

  it('rejects unknown users and incorrect passwords with the same unauthorized error', async () => {
    users.findForLogin.mockResolvedValue(null);
    await expect(service.login({email: 'unknown@example.com', password: 'password'}))
      .rejects.toBeInstanceOf(UnauthorizedException);

    users.findForLogin.mockResolvedValue({...profile, passwordHash: await bcrypt.hash('different-pass', 4)});
    await expect(service.login({email: 'jean@example.com', password: 'wrong-password'}))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects password login for Google-only users', async () => {
    users.findForLogin.mockResolvedValue({...profile, passwordHash: null});

    await expect(service.login({email: 'jean@example.com', password: 'password'}))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('reports Google sign-in as unavailable when no OAuth audience is configured', async () => {
    config.get.mockReturnValue(' , ');

    await expect(service.loginWithGoogle('google-id-token')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('validates Google identity, normalizes the linked user and returns a Brújula session', async () => {
    config.get.mockReturnValue('android-id.apps.googleusercontent.com, web-id.apps.googleusercontent.com');
    const payload = {sub: 'google-sub', email: 'JEAN@Example.com', email_verified: true, name: ' Jean Franco '};
    const verify = jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({getPayload: () => payload} as never);
    users.findOrCreateGoogleUser.mockResolvedValue(profile);

    const result = await service.loginWithGoogle('valid-google-token');

    expect(verify).toHaveBeenCalledWith({
      idToken: 'valid-google-token',
      audience: ['android-id.apps.googleusercontent.com', 'web-id.apps.googleusercontent.com'],
    });
    expect(users.findOrCreateGoogleUser).toHaveBeenCalledWith({subject: 'google-sub', email: 'JEAN@Example.com', name: 'Jean Franco'});
    expect(result).toEqual({accessToken: 'signed-access-token', user: profile});
    verify.mockRestore();
  });

  it('rejects invalid or unverified Google identities', async () => {
    config.get.mockReturnValue('web-id.apps.googleusercontent.com');
    const verify = jest.spyOn(OAuth2Client.prototype, 'verifyIdToken');
    verify.mockRejectedValueOnce(new Error('invalid token') as never);
    await expect(service.loginWithGoogle('bad-token')).rejects.toBeInstanceOf(UnauthorizedException);

    verify.mockResolvedValueOnce({getPayload: () => ({sub: 'google-sub', email: 'jean@example.com', email_verified: false})} as never);
    await expect(service.loginWithGoogle('unverified-token')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(users.findOrCreateGoogleUser).not.toHaveBeenCalled();
    verify.mockRestore();
  });
});
