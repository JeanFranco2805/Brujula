import {Controller, Delete, Get, Param, ParseUUIDPipe, Post, Req, UploadedFile, UseGuards, UseInterceptors} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import type {AuthenticatedRequest} from '../auth/jwt-auth.guard';
import {JwtAuthGuard} from '../auth/jwt-auth.guard';
import {MAX_PDF_SIZE_BYTES, MaterialsService} from './materials.service';

@UseGuards(JwtAuthGuard)
@Controller('materials')
export class MaterialsController {
  constructor(private readonly materials: MaterialsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', {limits: {fileSize: MAX_PDF_SIZE_BYTES}}))
  importPdf(@Req() request: AuthenticatedRequest, @UploadedFile() file?: Express.Multer.File) {
    return this.materials.create(request.user.sub, file as Express.Multer.File);
  }

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.materials.list(request.user.sub);
  }

  @Get(':id')
  findOne(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.materials.findOne(request.user.sub, id);
  }

  @Delete(':id')
  async remove(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    await this.materials.remove(request.user.sub, id);
    return {deleted: true};
  }
}
