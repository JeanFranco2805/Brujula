import {BadRequestException} from '@nestjs/common';
import {PDFParse} from 'pdf-parse';
import {MAX_EXTRACTED_TEXT_CHARS, PdfTextExtractorService} from './pdf-text-extractor.service';

const mockGetText = jest.fn();
const mockDestroy = jest.fn();

jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation(() => ({getText: mockGetText, destroy: mockDestroy})),
}));

describe('PdfTextExtractorService', () => {
  let service: PdfTextExtractorService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetText.mockResolvedValue({text: '  Contenido del documento\u0000 con texto suficiente.  '});
    mockDestroy.mockResolvedValue(undefined);
    service = new PdfTextExtractorService();
  });

  it('extracts and cleans document text, then releases parser resources', async () => {
    await expect(service.extract(Buffer.from('%PDF-example'))).resolves.toBe('Contenido del documento con texto suficiente.');
    expect(PDFParse).toHaveBeenCalledWith({data: Buffer.from('%PDF-example')});
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it('rejects image-only PDFs that have no selectable text', async () => {
    mockGetText.mockResolvedValueOnce({text: 'short'});
    await expect(service.extract(Buffer.from('%PDF-example'))).rejects.toBeInstanceOf(BadRequestException);
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it('caps extracted text to bound processing and database storage', async () => {
    mockGetText.mockResolvedValueOnce({text: `Readable material. ${'x'.repeat(MAX_EXTRACTED_TEXT_CHARS + 1)}`});
    const text = await service.extract(Buffer.from('%PDF-example'));
    expect(text).toHaveLength(MAX_EXTRACTED_TEXT_CHARS);
  });

  it('converts parser failures to a user-safe bad-request response', async () => {
    mockGetText.mockRejectedValueOnce(new Error('internal parser details'));
    await expect(service.extract(Buffer.from('%PDF-example'))).rejects.toThrow('No pudimos leer el PDF.');
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });
});
