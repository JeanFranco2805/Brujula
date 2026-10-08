import {Controller, Delete, Get, Param, ParseUUIDPipe, Post, Req, UploadedFile, UseGuards, UseInterceptors} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import type {AuthenticatedRequest} from '../auth/jwt-auth.guard';
import {JwtAuthGuard} from '../auth/jwt-auth.guard';
import {AudioTranscriptionService, MAX_AUDIO_SIZE_BYTES} from './audio-transcription.service';
import {VoiceNotesService} from './voice-notes.service';

@UseGuards(JwtAuthGuard)
@Controller('voice-notes')
export class VoiceNotesController {
  constructor(private readonly notes: VoiceNotesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', {limits: {fileSize: MAX_AUDIO_SIZE_BYTES}}))
  create(@Req() request: AuthenticatedRequest, @UploadedFile() file?: Express.Multer.File) {
    return this.notes.create(request.user.sub, file as Express.Multer.File);
  }

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.notes.list(request.user.sub);
  }

  @Get(':id')
  findOne(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.notes.findOne(request.user.sub, id);
  }

  @Delete(':id')
  async remove(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    await this.notes.remove(request.user.sub, id);
    return {deleted: true};
  }
}
