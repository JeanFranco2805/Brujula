import {Module} from '@nestjs/common';
import {ConfigModule} from '@nestjs/config';
import {AuthModule} from './auth/auth.module';
import {DatabaseModule} from './database/database.module';
import {HealthController} from './health.controller';
import {ProfileModule} from './profile/profile.module';
import {UsersModule} from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({isGlobal: true, envFilePath: '.env'}),
    DatabaseModule,
    AuthModule,
    ProfileModule,
    UsersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
