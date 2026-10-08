import {Body, Controller, HttpCode, HttpStatus, Post} from '@nestjs/common';
import {AuthService} from './auth.service';
import {GoogleLoginDto, LoginDto, RegisterDto} from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.auth.register(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: LoginDto) {
    return this.auth.login(body);
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  loginWithGoogle(@Body() body: GoogleLoginDto) {
    return this.auth.loginWithGoogle(body.idToken);
  }
}
