import {BadRequestException, Injectable} from '@nestjs/common';
import {PDFParse} from 'pdf-parse';

export const MAX_EXTRACTED_TEXT_CHARS = 100_000;

@Injectable()
export class PdfTextExtractorService {
  async extract(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({data: buffer});
    try {
      const result = await parser.getText();
      const text = result.text.replace(/\u0000/g, '').trim();
      if (text.length < 20) {
        throw new BadRequestException('No encontramos texto seleccionable en el PDF. Los documentos escaneados requieren OCR.');
      }
      return text.slice(0, MAX_EXTRACTED_TEXT_CHARS);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('No pudimos leer el PDF. Verifica que el archivo no esté dañado.');
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }
}
