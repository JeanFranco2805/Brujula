import {BadRequestException, ConflictException, Injectable, ServiceUnavailableException, UnauthorizedException} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {JwtService} from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import {OAuth2Client} from 'google-auth-library';
import {UsersService} from '../users/users.service';
import type {UserProfile} from '../users/user.types';
import {LoginDto, RegisterDto} from './auth.dto';

@Injectable()
export class AuthService {
  private readonly googleClient = new OAuth2Client();

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(input: RegisterDto) {
    const name = input.name.trim();
    const email = input.email.trim().normalize('NFC').toLowerCase();
    if (!name) throw new BadRequestException('El nombre es obligatorio.');
    if (Buffer.byteLength(input.password, 'utf8') > 72) {
      throw new BadRequestException('La contraseña no puede superar los 72 bytes UTF-8.');
    }
    const passwordHash = await bcrypt.hash(input.password, 12);

    try {
      const user = await this.users.create({name, email, passwordHash});
      return this.issueSession(user);
    } catch (error) {
      if ((error as {code?: string}).code === '23505') {
        throw new ConflictException('Ya existe una cuenta con este correo electrónico.');
      }
      throw error;
    }
  }

  async login(input: LoginDto) {
    const email = input.email.trim().normalize('NFC').toLowerCase();
    const user = await this.users.findForLogin(email);
    const valid = user?.passwordHash ? await bcrypt.compare(input.password, user.passwordHash) : false;
    if (!user || !valid) throw new UnauthorizedException('Correo o contraseña incorrectos.');

    const {passwordHash: _passwordHash, ...profile} = user;
    return this.issueSession(profile);
  }

  async loginWithGoogle(idToken: string) {
    const clientIds = (this.config.get<string>('GOOGLE_CLIENT_IDS') ?? '')
      .split(',')
      .map(clientId => clientId.trim())
      .filter(Boolean);
    if (clientIds.length === 0) throw new ServiceUnavailableException('El acceso con Google todavía no está configurado.');

    const ticket = await this.googleClient.verifyIdToken({idToken, audience: clientIds}).catch(() => {
      throw new UnauthorizedException('No pudimos validar tu sesión de Google. Inténtalo de nuevo.');
    });
    const payload = ticket.getPayload();

    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      throw new UnauthorizedException('Google no confirmó el correo de esta cuenta.');
    }

    const user = await this.users.findOrCreateGoogleUser({
      subject: payload.sub,
      email: payload.email,
      name: payload.name?.trim() || payload.email.split('@')[0],
    });
    return this.issueSession(user);
  }

  private async issueSession(user: UserProfile) {
    const accessToken = await this.jwt.signAsync({sub: user.id, email: user.email});
    return {accessToken, user};
  }
}
