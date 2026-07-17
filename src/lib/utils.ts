import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

// Configura o motor worker do PDF.js a partir de um CDN estável compatível com a versão instalada
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js`;

/**
 * Extrai texto de arquivos (PDF, DOCX, Imagem ou TXT) utilizando processamento local.
 */
export const extractTextFromFile = async (
  file: File,
  onProgress?: (status: string, percent: number) => void
): Promise<string> => {
  const fileType = file.type;

  if (fileType === 'application/pdf' || file.name.endsWith('.pdf')) {
    onProgress?.('Lendo PDF...', 15);
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    const totalPages = pdf.numPages;

    for (let i = 1; i <= totalPages; i++) {
      onProgress?.(`Extraindo texto digital da página ${i}/${totalPages}...`, 15 + (i / totalPages) * 35);
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n';
    }

    // Se o texto extraído for muito pequeno, realiza OCR nas páginas automaticamente
    if (fullText.trim().length < 40) {
      onProgress?.('Texto nativo insuficiente. Iniciando motor de OCR...', 50);
      fullText = '';
      const worker = await Tesseract.createWorker();
      await worker.loadLanguage('por+eng');
      await worker.initialize('por+eng');

      for (let i = 1; i <= totalPages; i++) {
        onProgress?.(`Renderizando e rodando OCR na página ${i}/${totalPages}...`, 50 + (i / totalPages) * 45);
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (context) {
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          await page.render({ canvasContext: context, viewport }).promise;
          const { data: { text } } = await worker.recognize(canvas);
          fullText += text + '\n';
        }
      }
      await worker.terminate();
    }
    return fullText;

  } else if (
    fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
    file.name.endsWith('.docx')
  ) {
    onProgress?.('Lendo documento DOCX...', 40);
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    onProgress?.('Texto extraído com sucesso!', 100);
    return result.value;

  } else if (fileType.startsWith('image/') || /\.(png|jpg|jpeg|webp)$/i.test(file.name)) {
    onProgress?.('Iniciando reconhecimento OCR na imagem...', 30);
    const worker = await Tesseract.createWorker();
    await worker.loadLanguage('por+eng');
    await worker.initialize('por+eng');
    
    const { data: { text } } = await worker.recognize(file);
    await worker.terminate();
    onProgress?.('Leitura concluída!', 100);
    return text;

  } else {
    // Tratamento de arquivos de texto comuns
    onProgress?.('Lendo arquivo de texto simples...', 50);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Falha ao ler o arquivo de texto simples.'));
      reader.readAsText(file);
    });
  }
};

/**
 * Gerencia a tradução inteligente. Utiliza a API da OpenAI se uma Key válida
 * estiver presente, caso contrário faz fallback para a tradução gratuita via MyMemory.
 */
export const translateText = async (
  text: string,
  from: string,
  to: string,
  apiKey?: string
): Promise<string> => {
  if (apiKey && apiKey.startsWith('sk-')) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            { 
              role: 'system', 
              content: `Você é um tradutor especialista. Traduza o texto de ${from} para ${to}. Preserve a formatação do documento, listas, quebras de linhas, termos técnicos e o tom original.` 
            },
            { role: 'user', content: text }
          ],
          temperature: 0.3
        })
      });

      const data = await response.json();
      if (data.choices?.[0]?.message?.content) {
        return data.choices[0].message.content;
      }
      throw new Error(data.error?.message || 'Resposta inesperada do GPT.');
    } catch (e: any) {
      console.warn('Erro OpenAI, acionando fallback gratuito...', e);
      return `[Erro na API OpenAI: ${e.message || e}]. Tentando tradução de emergência...\n\n` + await translateFreeFallback(text, from, to);
    }
  }

  return translateFreeFallback(text, from, to);
};

/**
 * Tradução de Fallback segmentada por parágrafos via API pública do MyMemory.
 */
const translateFreeFallback = async (text: string, from: string, to: string): Promise<string> => {
  try {
    const paragraphs = text.split('\n');
    const translatedParagraphs = [];

    for (const para of paragraphs) {
      if (!para.trim()) {
        translatedParagraphs.push('');
        continue;
      }
      const response = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(para)}&langpair=${from}|${to}`
      );
      const data = await response.json();
      if (data.responseData?.translatedText) {
        translatedParagraphs.push(data.responseData.translatedText);
      } else {
        translatedParagraphs.push(para);
      }
    }

    return translatedParagraphs.join('\n');
  } catch (error) {
    return `[Erro ao realizar tradução gratuita de fallback]. Original:\n\n${text}`;
  }
};