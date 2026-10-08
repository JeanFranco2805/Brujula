import {Module} from '@nestjs/common';
import {ConfigModule} from '@nestjs/config';
import {AuthModule} from './auth/auth.module';
import {DatabaseModule} from './database/database.module';
import {HealthController} from './health.controller';
import {MaterialsModule} from './materials/materials.module';
import {ProfileModule} from './profile/profile.module';
import {StudyPlanModule} from './study-plan/study-plan.module';
import {UsersModule} from './users/users.module';
import {VoiceNotesModule} from './voice-notes/voice-notes.module';

@Module({
  imports: [
    ConfigModule.forRoot({isGlobal: true, envFilePath: '.env'}),
    DatabaseModule,
    AuthModule,
    MaterialsModule,
    ProfileModule,
    StudyPlanModule,
    UsersModule,
    VoiceNotesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
