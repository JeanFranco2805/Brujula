import {UnauthorizedException, type ExecutionContext} from '@nestjs/common';
import {JwtAuthGuard} from './jwt-auth.guard';

function makeContext(authorization?: string) {
  const request: {headers: {authorization?: string}; user?: {sub: string; email: string}} = {headers: {authorization}};
  const context = {switchToHttp: () => ({getRequest: () => request})} as unknown as ExecutionContext;
  return {context, request};
}

describe('JwtAuthGuard', () => {
  const jwt = {verifyAsync: jest.fn()};
  let guard: JwtAuthGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new JwtAuthGuard(jwt as never);
  });

  it.each([undefined, 'Basic token', 'Bearer', 'Bearer token extra'])(
    'rejects malformed bearer authorization header: %s',
    async authorization => {
      const {context} = makeContext(authorization);
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(jwt.verifyAsync).not.toHaveBeenCalled();
    },
  );

  it('verifies the token and attaches claims to the request', async () => {
    const claims = {sub: 'user-1', email: 'jean@example.com'};
    jwt.verifyAsync.mockResolvedValue(claims);
    const {context, request} = makeContext('Bearer signed-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(jwt.verifyAsync).toHaveBeenCalledWith('signed-token');
    expect(request.user).toEqual(claims);
  });

  it('rejects expired or invalid tokens', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('expired'));
    const {context} = makeContext('Bearer expired-token');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
