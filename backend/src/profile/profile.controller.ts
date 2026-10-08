import {Body, Controller, Get, Patch, Req, UseGuards} from '@nestjs/common';
import {AuthenticatedRequest, JwtAuthGuard} from '../auth/jwt-auth.guard';
import {PreferencesDto} from './preferences.dto';
import {ProfileService} from './profile.service';

@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Get()
  getProfile(@Req() request: AuthenticatedRequest) {
    return this.profiles.getProfile(request.user.sub);
  }

  @Patch('preferences')
  savePreferences(@Req() request: AuthenticatedRequest, @Body() body: PreferencesDto) {
    return this.profiles.savePreferences(request.user.sub, body);
  }
}
