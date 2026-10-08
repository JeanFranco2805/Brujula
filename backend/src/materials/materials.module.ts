import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module';
import {MaterialsController} from './materials.controller';
import {MaterialsService} from './materials.service';
import {PdfTextExtractorService} from './pdf-text-extractor.service';
import {StudyContentService} from './study-content.service';

@Module({
  imports: [AuthModule],
  controllers: [MaterialsController],
  providers: [MaterialsService, PdfTextExtractorService, StudyContentService],
  exports: [MaterialsService, StudyContentService],
})
export class MaterialsModule {}
