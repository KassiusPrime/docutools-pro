import Tesseract from 'tesseract.js';

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tiff', 'tif'];
const TEXT_EXTENSIONS = ['txt', 'md', 'csv', 'json', 'xml', 'html', 'css', 'js', 'ts', 'jsx', 'tsx'];

export async function extractTextFromFile(
  file: File,
  onProgress?: (progress: number) => void
): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  if (IMAGE_EXTENSIONS.includes(ext)) {
    return extractTextFromImage(file, onProgress);
  }

  if (TEXT_EXTENSIONS.includes(ext)) {
    if (onProgress) onProgress(100);
    return file.text();
  }

  if (ext === 'pdf') {
    return extractTextFromPdf(file, onProgress);
  }

  if (onProgress) onProgress(100);
  return file.text();
}

async function extractTextFromImage(
  file: File,
  onProgress?: (progress: number) => void
): Promise<string> {
  const result = await Tesseract.recognize(
    file,
    'por+eng',
    {
      logger: (m) => {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress(Math.round(m.progress * 100));
        }
      },
    }
  );
  return result.data.text.trim();
}

async function extractTextFromPdf(
  file: File,
  onProgress?: (progress: number) => void
): Promise<string> {
  try {
    const text = await file.text();
    if (onProgress) onProgress(100);

    const cleanText = text.replace(/%PDF-[\d.]+/, '').trim();
    if (cleanText.length > 100) {
      const readableText = cleanText
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\xFF]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (readableText.length > 50) {
        return readableText;
      }
    }

    return '[PDF sem texto extraível. Converta as páginas para imagens e use o OCR.]';
  } catch {
    if (onProgress) onProgress(100);
    return '[Erro ao processar o PDF]';
  }
}