import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module';
import {UsersModule} from '../users/users.module';
import {StudyPlanController} from './study-plan.controller';
import {StudyPlanService} from './study-plan.service';

@Module({imports: [AuthModule, UsersModule], controllers: [StudyPlanController], providers: [StudyPlanService]})
export class StudyPlanModule {}
