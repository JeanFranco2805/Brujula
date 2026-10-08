import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module';
import {MaterialsModule} from '../materials/materials.module';
import {AudioTranscriptionService} from './audio-transcription.service';
import {VoiceNotesController} from './voice-notes.controller';
import {VoiceNotesService} from './voice-notes.service';

@Module({
  imports: [AuthModule, MaterialsModule],
  controllers: [VoiceNotesController],
  providers: [AudioTranscriptionService, VoiceNotesService],
})
export class VoiceNotesModule {}
