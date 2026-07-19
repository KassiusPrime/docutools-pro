import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

// Use a reliable CDN for the PDF worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

export const extractTextFromFile = async (file: File, onProgress?: (p: number) => void): Promise<string> => {
  const type = file.type;
  
  if (type === 'application/pdf') {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let pageText = '';

      // O bug antigo juntava TODOS os itens da página com um único
      // espaço e só adicionava uma quebra de linha no final da página
      // inteira — isso destruía toda a estrutura de linhas/parágrafos.
      // O pdf.js já marca, em cada item, se ele termina uma linha
      // (hasEOL). Usamos essa informação para reconstruir as quebras
      // de linha reais do documento original.
      for (const item of content.items as any[]) {
        pageText += item.str;
        pageText += item.hasEOL ? '\n' : ' ';
      }

      fullText += pageText.trim() + '\n\n';
      if (onProgress) onProgress(Math.round((i / pdf.numPages) * 100));
    }
    return fullText.trim();
  } else if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  } else if (type.startsWith('image/')) {
    const { data: { text } } = await Tesseract.recognize(file, 'por+eng', {
      logger: m => {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress(Math.round(m.progress * 100));
        }
      }
    });
    return text;
  } else if (type === 'text/plain') {
    return await file.text();
  }
  
  // Fallback for unknown text files
  try {
    return await file.text();
  } catch (e) {
    throw new Error('Tipo de arquivo não suportado');
  }
};
