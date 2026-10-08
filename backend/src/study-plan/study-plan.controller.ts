import {Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards} from '@nestjs/common';
import type {AuthenticatedRequest} from '../auth/jwt-auth.guard';
import {JwtAuthGuard} from '../auth/jwt-auth.guard';
import {GenerateStudyPlanDto, RescheduleStudySessionDto} from './study-plan.dto';
import {StudyPlanService} from './study-plan.service';

@UseGuards(JwtAuthGuard)
@Controller('study-plan')
export class StudyPlanController {
  constructor(private readonly plans: StudyPlanService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.plans.list(request.user.sub);
  }

  @Post('generate')
  generate(@Req() request: AuthenticatedRequest, @Body() body: GenerateStudyPlanDto) {
    return this.plans.generate(request.user.sub, body.days, body.startMinute);
  }

  @Patch(':id/complete')
  complete(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.plans.complete(request.user.sub, id);
  }

  @Patch(':id/schedule')
  reschedule(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: RescheduleStudySessionDto) {
    return this.plans.reschedule(request.user.sub, id, body.date, body.startMinute);
  }
}
