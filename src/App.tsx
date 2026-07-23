import React, { useState, useRef, useEffect } from 'react';
import {
  FileText, Image as ImageIcon, Volume2, Upload,
  Loader2, FilePlus, Key, RefreshCw, Copy, Check,
  Wand2, Globe, Palette, DownloadCloud, ImagePlus, Paintbrush, Mic
} from 'lucide-react';
import { extractTextFromFile } from './lib/utils';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { jsPDF } from 'jspdf';
import { saveAs } from 'file-saver';

type TabType = 'extract' | 'ai' | 'image' | 'audio' | 'visual-ai';
type AiActionType = 'translate' | 'summarize' | 'grammar' | 'improve';
type EngineType = 'google' | 'openai' | 'gemini' | 'groq';
type VisualTabType = 'generate' | 'edit';
type AudioSubTabType = 'tts' | 'stt';

// Marcador único usado para pedir aos motores de IA baseados em LLM
// (Gemini/Groq/OpenAI) que preservem as quebras de parágrafo. Sem um
// token explícito, esses modelos tendem a "normalizar" o texto e juntar
// tudo em um bloco só quando não há instrução clara sobre formatação.
const PARAGRAPH_MARKER = '¶¶¶';
const MAX_CHUNK_CHARS = 3000;

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsFading(true);
      setTimeout(() => setShowSplash(false), 500);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const [activeTab, setActiveTab] = useState<TabType>('extract');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  // OCR Estados
  const [extractedText, setExtractedText] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copiedExtract, setCopiedExtract] = useState(false);

  // IA Textos Estados
  const [targetLang, setTargetLang] = useState('en');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('docutools_apikey') || '');
  const [aiText, setAiText] = useState('');
  const [isAiWorking, setIsAiWorking] = useState(false);
  const [aiAction, setAiAction] = useState<AiActionType>('translate');
  const [translationEngine, setTranslationEngine] = useState<EngineType>('google');
  const [copiedAi, setCopiedAi] = useState(false);
  const [aiProgress, setAiProgress] = useState<{ done: number; total: number } | null>(null);

  // IA Visual Estados (Pollinations & Hugging Face)
  const [visualTab, setVisualTab] = useState<VisualTabType>('generate');
  const [imagePrompt, setImagePrompt] = useState('');
  const [generatedImage, setGeneratedImage] = useState('');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // Estados do Editor de Imagens
  const [pollinationsKey, setPollinationsKey] = useState(() => localStorage.getItem('docutools_pollinations_key') || '');
  const [editSourceImage, setEditSourceImage] = useState<File | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editedImage, setEditedImage] = useState('');
  const [isEditingImage, setIsEditingImage] = useState(false);
  const editImageInputRef = useRef<HTMLInputElement>(null);

  const languageMap: Record<string, string> = {
    'en': 'Inglês', 'es': 'Espanhol', 'fr': 'Francês',
    'de': 'Alemão', 'it': 'Italiano', 'pt': 'Português'
  };

  // Imagens Estados
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imageFormat, setImageFormat] = useState('pdf');
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Áudio Estados
  const [ttsLang, setTtsLang] = useState('pt-BR');
  const [ttsRate, setTtsRate] = useState(1);
  const [audioSubTab, setAudioSubTab] = useState<AudioSubTabType>('tts');

  // OmniRoute (opcional): se configurado, usa transcrição e TTS via
  // servidor (mais rápido e com voz melhor). Se não, cai no modo local
  // (Whisper no navegador / voz do sistema operacional).
  const [omniRouteUrl, setOmniRouteUrl] = useState(() => localStorage.getItem('docutools_omniroute_url') || '');
  const [omniRouteKey, setOmniRouteKey] = useState(() => localStorage.getItem('docutools_omniroute_key') || '');
  const [isFetchingTts, setIsFetchingTts] = useState(false);

  // Voz -> Texto (transcrição 100% no navegador, via @huggingface/transformers)
  const [sttFile, setSttFile] = useState<File | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeStatus, setTranscribeStatus] = useState('');
  const [transcribedText, setTranscribedText] = useState('');
  const sttFileInputRef = useRef<HTMLInputElement>(null);
  const transcriberRef = useRef<any>(null);

  useEffect(() => { localStorage.setItem('docutools_apikey', apiKey); }, [apiKey]);
  useEffect(() => { localStorage.setItem('docutools_pollinations_key', pollinationsKey); }, [pollinationsKey]);
  useEffect(() => { localStorage.setItem('docutools_omniroute_url', omniRouteUrl); }, [omniRouteUrl]);
  useEffect(() => { localStorage.setItem('docutools_omniroute_key', omniRouteKey); }, [omniRouteKey]);

  useEffect(() => {
    if (activeTab === 'ai' && extractedText && !aiText) { setAiText(extractedText); }
  }, [activeTab, extractedText]);

  const copyToClipboard = async (text: string, type: 'extract' | 'ai') => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    if (type === 'extract') { setCopiedExtract(true); setTimeout(() => setCopiedExtract(false), 2000); }
    else { setCopiedAi(true); setTimeout(() => setCopiedAi(false), 2000); }
  };

  const downloadTxt = (textToSave: string, prefix: string) => {
    if (!textToSave) return;
    const blob = new Blob([textToSave], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, `DocuTools_${prefix}.txt`);
  };

  const downloadDocx = async (textToSave: string, prefix: string) => {
    if (!textToSave) return;
    const doc = new Document({ sections: [{ children: textToSave.split('\n').map((line) => new Paragraph({ children: [new TextRun(line)] })) }] });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `DocuTools_${prefix}.docx`);
  };

  const downloadPdfText = (textToSave: string, prefix: string) => {
    if (!textToSave) return;
    const pdf = new jsPDF();
    const margin = 15;
    const pageWidth = pdf.internal.pageSize.getWidth();
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    const lines = pdf.splitTextToSize(textToSave, pageWidth - margin * 2);
    let cursorY = margin;
    for (let i = 0; i < lines.length; i++) {
      if (cursorY > pdf.internal.pageSize.getHeight() - margin) { pdf.addPage(); cursorY = margin; }
      pdf.text(lines[i], margin, cursorY);
      cursorY += 6;
    }
    pdf.save(`DocuTools_${prefix}.pdf`);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    setProgress(0);
    setFileName(file.name);
    try {
      const text = await extractTextFromFile(file, (p) => setProgress(p));
      setExtractedText(text);
    } catch (error) { alert('Erro ao processar arquivo.'); }
    finally { setIsProcessing(false); }
  };

  // ===================== TRADUÇÃO/IA DE TEXTO =====================

  const buildParagraphChunks = (text: string, maxChars = MAX_CHUNK_CHARS): string[] => {
    const paragraphs = text.split('\n');
    const chunks: string[] = [];
    let current: string[] = [];
    let currentLen = 0;

    for (const paragraph of paragraphs) {
      const addedLen = paragraph.length + PARAGRAPH_MARKER.length;
      if (currentLen + addedLen > maxChars && current.length > 0) {
        chunks.push(current.join(PARAGRAPH_MARKER));
        current = [];
        currentLen = 0;
      }
      current.push(paragraph);
      currentLen += addedLen;
    }
    if (current.length > 0) chunks.push(current.join(PARAGRAPH_MARKER));

    return chunks;
  };

  const withRetry = async <T,>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> => {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err as Error;
        if (attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
        }
      }
    }
    throw lastError ?? new Error('Falha desconhecida.');
  };

  const callGeminiOnce = async (systemPrompt: string, userContent: string): Promise<string> => {
    // Usamos o alias "gemini-flash-latest" (em vez de fixar uma versão como
    // gemini-2.5-flash) porque o Google aposenta modelos com frequência —
    // esse alias é atualizado automaticamente pelo próprio Google para
    // sempre apontar para o Flash "atual", reduzindo a chance de quebrar
    // de novo no futuro. Se mesmo assim der erro de modelo não encontrado,
    // é sinal de que a conta/chave não tem acesso a esse alias — nesse
    // caso, veja em ai.google.dev/gemini-api/docs/models qual nome usar.
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\nTexto original:\n${userContent}` }] }]
      })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error('Resposta vazia da IA.');
    return content;
  };

  const callChatCompletionOnce = async (systemPrompt: string, userContent: string): Promise<string> => {
    const isGroq = translationEngine === 'groq';
    const url = isGroq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
    // A Groq aposentou toda a linha de modelos Llama (anúncio de
    // 17/06/2026). O substituto atual recomendado para uso geral rápido é
    // o openai/gpt-oss-20b.
    const model = isGroq ? 'openai/gpt-oss-20b' : 'gpt-4o-mini';

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        temperature: 0.3
      })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Resposta vazia da IA.');
    return content;
  };

  // Traduz linha por linha usando o endpoint gratuito do Google Tradutor.
  // Evita dois problemas do código anterior:
  // 1. `join('')` grudava as frases sem espaço nenhum.
  // 2. Mandar o documento inteiro numa única requisição GET podia estourar
  //    o limite de tamanho da URL e perdia toda a estrutura de parágrafos.
  const translateLineWithGoogle = async (line: string, targetLangCode: string): Promise<string> => {
    return withRetry(async () => {
      const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLangCode}&dt=t&q=${encodeURIComponent(line)}`);
      if (!res.ok) throw new Error(`Google Tradutor respondeu ${res.status}`);
      const data = await res.json();
      const segments = data[0].map((item: any) => item[0]);
      return segments.join(' ').replace(/ +/g, ' ').trim();
    });
  };

  const translateWithGoogleFree = async (text: string, targetLangCode: string): Promise<string> => {
    const lines = text.split('\n');
    const translatedLines: string[] = [];
    let falhas = 0;

    setAiProgress({ done: 0, total: lines.length });

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) {
        translatedLines.push('');
      } else {
        try {
          translatedLines.push(await translateLineWithGoogle(line, targetLangCode));
        } catch {
          falhas++;
          translatedLines.push(`[Não traduzido] ${line}`);
        }
      }
      setAiProgress({ done: i + 1, total: lines.length });
    }

    if (falhas > 0) {
      alert(`${falhas} linha(s) não puderam ser traduzidas e foram mantidas no idioma original.`);
    }

    return translatedLines.join('\n');
  };

  const handleAiAction = async () => {
    const textToProcess = aiText || extractedText;
    if (!textToProcess.trim()) { alert("Digite ou extraia um texto primeiro."); return; }

    setIsAiWorking(true);
    setAiProgress(null);

    try {
      if (translationEngine === 'google') {
        const translated = await translateWithGoogleFree(textToProcess, targetLang);
        setAiText(translated);
        return;
      }

      if (!apiKey.trim()) {
        alert("Insira sua Chave API para usar este motor.");
        return;
      }

      let basePrompt = "";
      if (aiAction === 'translate') basePrompt = `Traduza para ${languageMap[targetLang]}.`;
      else if (aiAction === 'summarize') basePrompt = "Resuma o texto mantendo os pontos principais.";
      else if (aiAction === 'grammar') basePrompt = "Corrija a gramática e ortografia.";
      else if (aiAction === 'improve') basePrompt = "Melhore a fluidez e o vocabulário.";

      // Resumir naturalmente muda a estrutura do texto (é o objetivo),
      // então não faz sentido forçar a preservação de parágrafos nesse caso.
      if (aiAction === 'summarize') {
        const resultado = await withRetry(() =>
          translationEngine === 'gemini'
            ? callGeminiOnce(`${basePrompt} Retorne apenas o resumo.`, textToProcess)
            : callChatCompletionOnce(`${basePrompt} Retorne apenas o resumo.`, textToProcess)
        );
        setAiText(resultado);
        return;
      }

      const systemPrompt =
        `${basePrompt} O texto contém marcadores de parágrafo representados por "${PARAGRAPH_MARKER}". ` +
        `Mantenha EXATAMENTE os marcadores "${PARAGRAPH_MARKER}" nas mesmas posições relativas, um por quebra de parágrafo original. ` +
        `Não remova, não adicione e não traduza os marcadores. Não junte parágrafos diferentes em um só. ` +
        `Responda APENAS com o texto processado, sem comentários adicionais.`;

      const chunks = buildParagraphChunks(textToProcess);
      setAiProgress({ done: 0, total: chunks.length });

      const processedChunks: string[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const marcadosOriginais = chunks[i].split(PARAGRAPH_MARKER).length;
        const resultado = await withRetry(() =>
          translationEngine === 'gemini'
            ? callGeminiOnce(systemPrompt, chunks[i])
            : callChatCompletionOnce(systemPrompt, chunks[i])
        );

        const partesResultado = resultado.split(PARAGRAPH_MARKER);
        if (partesResultado.length === marcadosOriginais) {
          processedChunks.push(partesResultado.join('\n'));
        } else {
          // A IA alterou a quantidade de marcadores — usamos a resposta
          // como veio em vez de arriscar cortar conteúdo.
          processedChunks.push(resultado.replace(new RegExp(PARAGRAPH_MARKER, 'g'), '\n'));
        }

        setAiProgress({ done: i + 1, total: chunks.length });
      }

      setAiText(processedChunks.join('\n\n'));
    } catch (error: any) {
      alert(`Erro no processamento: ${error.message}`);
    } finally {
      setIsAiWorking(false);
      setAiProgress(null);
    }
  };

  // ===================== IA VISUAL LOGIC =====================

  const handleGenerateImage = () => {
    if (!imagePrompt.trim()) return alert("Descreva a imagem que deseja gerar.");

    setIsGeneratingImage(true);
    setGeneratedImage('');

    const seed = Math.floor(Math.random() * 1000000);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?nologo=true&seed=${seed}`;

    const img = new Image();
    img.src = url;
    img.onload = () => { setGeneratedImage(url); setIsGeneratingImage(false); };
    img.onerror = () => { alert("Erro ao gerar a imagem."); setIsGeneratingImage(false); };
  };

  const handleEditImageSource = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setEditSourceImage(e.target.files[0]);
      setEditedImage('');
    }
  };

  const handleEditCommand = async () => {
    if (!editSourceImage) return alert("Selecione uma imagem primeiro.");
    if (!editPrompt.trim()) return alert("Digite o comando (ex: Make it look like a painting).");

    setIsEditingImage(true);
    setEditedImage('');

    try {
      // Trocamos o Hugging Face (instruct-pix2pix não é mais servido por
      // nenhum provedor no novo sistema de roteamento deles) pelo modelo
      // "kontext" da Pollinations.ai — o mesmo serviço já usado na aba
      // "Gerar", que faz edição de imagem guiada por texto. O endpoint
      // /v1/images/edits aceita o arquivo direto (multipart), sem precisar
      // converter para base64 nem hospedar a imagem em algum lugar antes.
      const formData = new FormData();
      formData.append('image', editSourceImage);
      formData.append('prompt', editPrompt);
      formData.append('model', 'kontext');

      const headers: Record<string, string> = {};
      if (pollinationsKey.trim()) {
        headers['Authorization'] = `Bearer ${pollinationsKey.trim()}`;
      }

      const response = await fetch("https://gen.pollinations.ai/v1/images/edits", {
        method: "POST",
        headers,
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `A API respondeu com status ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        // Segue a convenção da API de edição de imagens da OpenAI (que a
        // Pollinations espelha nesse endpoint): { data: [{ url }] } ou
        // { data: [{ b64_json }] }.
        const data = await response.json();
        const item = data?.data?.[0];
        if (item?.url) {
          setEditedImage(item.url);
        } else if (item?.b64_json) {
          setEditedImage(`data:image/png;base64,${item.b64_json}`);
        } else {
          throw new Error('Resposta da API em formato inesperado.');
        }
      } else {
        // Alguns endpoints da Pollinations devolvem a imagem direto
        // (mesmo padrão do image.pollinations.ai usado na aba "Gerar").
        const blob = await response.blob();
        setEditedImage(URL.createObjectURL(blob));
      }
    } catch (error: any) {
      alert(`Erro na Edição: ${error.message}`);
    } finally {
      setIsEditingImage(false);
    }
  };

  const downloadVisualImage = async (url: string) => {
    if (!url) return;
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      saveAs(blob, `DocuTools_IA_${Date.now()}.jpg`);
    } catch (error) { alert("Erro ao salvar."); }
  };

  // ===================== FIM IA VISUAL =====================

  const handleImagesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedImages((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const processImages = async () => {
    if (selectedImages.length === 0) return;
    setIsProcessing(true); setProgress(0);
    try {
      if (imageFormat === 'pdf') {
        const pdf = new jsPDF();
        for (let i = 0; i < selectedImages.length; i++) {
          const file = selectedImages[i];
          const isPng = file.type === 'image/png';
          const dataUrl = await new Promise<string>((res) => {
            const r = new FileReader(); r.onload = (e) => res(e.target?.result as string); r.readAsDataURL(file);
          });
          let finalDataUrl = dataUrl;
          let format: 'PNG' | 'JPEG' = isPng ? 'PNG' : 'JPEG';
          if (isPng) {
            const img = new Image(); img.src = dataUrl;
            await new Promise((resolve) => { img.onload = resolve; });
            const canvas = document.createElement('canvas');
            canvas.width = img.width; canvas.height = img.height;
            const ctx = canvas.getContext('2d')!;
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0);
            finalDataUrl = canvas.toDataURL('image/jpeg', 0.95); format = 'JPEG';
          }
          const props = pdf.getImageProperties(finalDataUrl);
          const pageWidth = pdf.internal.pageSize.getWidth();
          const pageHeight = (props.height * pageWidth) / props.width;
          if (i > 0) pdf.addPage();
          pdf.addImage(finalDataUrl, format, 0, 0, pageWidth, pageHeight);
          setProgress(Math.round(((i + 1) / selectedImages.length) * 100));
        }
        pdf.save('DocuTools_Imagens.pdf');
      } else {
        for (let i = 0; i < selectedImages.length; i++) {
          const file = selectedImages[i];
          const objectUrl = URL.createObjectURL(file);
          const img = new window.Image(); img.src = objectUrl;
          await new Promise((res) => { img.onload = res; });
          const canvas = document.createElement('canvas');
          canvas.width = img.width; canvas.height = img.height;
          const ctx = canvas.getContext('2d')!;
          if (imageFormat === 'jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
          ctx.drawImage(img, 0, 0);
          const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, `image/${imageFormat}`, 0.95));
          if (blob) saveAs(blob, `DocuTools_Converted_${i + 1}.${imageFormat}`);
          URL.revokeObjectURL(objectUrl);
          setProgress(Math.round(((i + 1) / selectedImages.length) * 100));
        }
      }
    } catch (err) { alert('Erro ao processar imagens.'); }
    finally { setIsProcessing(false); setProgress(0); }
  };

  const speak = async () => {
    const textToSpeak = aiText || extractedText;
    if (!textToSpeak.trim()) { alert("Nenhum texto para ler."); return; }

    // Se o OmniRoute estiver configurado, usa voz neural de verdade
    // (ElevenLabs/OpenAI/etc, via /v1/audio/speech) em vez da voz robótica
    // padrão do sistema operacional.
    if (omniRouteUrl.trim() && omniRouteKey.trim()) {
      setIsFetchingTts(true);
      try {
        const response = await fetch(`${omniRouteUrl.replace(/\/$/, '')}/v1/audio/speech`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${omniRouteKey}`,
          },
          body: JSON.stringify({
            input: textToSpeak,
            // 'alloy' é uma voz padrão amplamente suportada (convenção da
            // API de TTS da OpenAI, que o OmniRoute espelha). Troque pelo
            // nome de voz do provedor que você configurou no dashboard do
            // OmniRoute se quiser outra.
            voice: 'alloy',
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(errText || `OmniRoute respondeu ${response.status}`);
        }

        const blob = await response.blob();
        const audio = new Audio(URL.createObjectURL(blob));
        audio.playbackRate = ttsRate;
        audio.play();
        return;
      } catch (error: any) {
        console.error(error);
        alert(`Falha ao usar voz do OmniRoute (${error.message}). Usando voz do navegador.`);
        // segue para o fallback abaixo
      } finally {
        setIsFetchingTts(false);
      }
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = ttsLang; utterance.rate = ttsRate;
    window.speechSynthesis.speak(utterance);
  };

  // ===================== VOZ -> TEXTO (TRANSCRIÇÃO NO NAVEGADOR) =====================
  // Roda um modelo Whisper (multilíngue, inclui português) inteiramente no
  // navegador via WebAssembly, usando @huggingface/transformers. Sem
  // servidor, sem chave de API — mas o modelo (~40-80MB) baixa na primeira
  // vez, e a transcrição é mais lenta que num servidor com GPU,
  // especialmente em celular.

  const handleSttFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSttFile(e.target.files[0]);
      setTranscribedText('');
    }
  };

  // Downmix para mono: faz a média de todos os canais em vez de descartar
  // canais extras, preservando melhor a qualidade do áudio original.
  const averageChannels = (buffer: AudioBuffer): Float32Array => {
    const { numberOfChannels, length } = buffer;
    const result = new Float32Array(length);
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        result[i] += data[i] / numberOfChannels;
      }
    }
    return result;
  };

  const getTranscriber = async () => {
    if (transcriberRef.current) return transcriberRef.current;

    setTranscribeStatus('Carregando biblioteca de transcrição...');
    // Import dinâmico: só baixa essa biblioteca (pesada) quando a pessoa
    // realmente usar a aba de transcrição, não no carregamento inicial do app.
    const { pipeline } = await import('@huggingface/transformers');

    transcriberRef.current = await pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-base',
      {
        progress_callback: (progress: any) => {
          if (progress?.status === 'progress' && progress?.file) {
            const pct = progress.progress ? Math.round(progress.progress) : 0;
            setTranscribeStatus(`Baixando modelo (${progress.file})... ${pct}%`);
          } else if (progress?.status === 'ready') {
            setTranscribeStatus('Modelo pronto. Transcrevendo...');
          }
        }
      }
    );

    return transcriberRef.current;
  };

  // Transcreve via OmniRoute (servidor próprio, endpoint compatível com
  // OpenAI /v1/audio/transcriptions). Muito mais rápido que rodar Whisper
  // no navegador, e sem precisar baixar modelo nenhum no aparelho.
  const transcribeWithOmniRoute = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', 'whisper-1');

    const response = await fetch(`${omniRouteUrl.replace(/\/$/, '')}/v1/audio/transcriptions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${omniRouteKey}` },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || `OmniRoute respondeu ${response.status}`);
    }

    const data = await response.json();
    return (data.text || '').trim();
  };

  const handleTranscribeAudio = async () => {
    if (!sttFile) { alert("Selecione um arquivo de áudio primeiro."); return; }

    setIsTranscribing(true);
    setTranscribedText('');
    setTranscribeStatus('Preparando áudio...');

    // Caminho 1: OmniRoute configurado -> transcrição no servidor (rápida,
    // sem download de modelo). Se falhar, cai pro Whisper local.
    if (omniRouteUrl.trim() && omniRouteKey.trim()) {
      try {
        setTranscribeStatus('Transcrevendo via OmniRoute...');
        const text = await transcribeWithOmniRoute(sttFile);
        setTranscribedText(text);
        setTranscribeStatus('');
        setIsTranscribing(false);
        return;
      } catch (error: any) {
        console.error('OmniRoute falhou, caindo para transcrição local:', error);
        setTranscribeStatus('OmniRoute falhou — usando transcrição local no navegador...');
      }
    }

    // Caminho 2: Whisper local no navegador (mais lento, mas sempre funciona)
    try {
      const transcriber = await getTranscriber();

      const arrayBuffer = await sttFile.arrayBuffer();
      // O Whisper espera áudio mono a 16kHz — o AudioContext já resampleia
      // automaticamente para a sampleRate configurada aqui.
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass({ sampleRate: 16000 });
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const audioData = audioBuffer.numberOfChannels > 1
        ? averageChannels(audioBuffer)
        : audioBuffer.getChannelData(0);

      setTranscribeStatus('Transcrevendo áudio (pode demorar, dependendo do tamanho e do aparelho)...');

      const result = await transcriber(audioData, {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: false,
      });

      const text = Array.isArray(result)
        ? result.map((r: any) => r.text).join(' ')
        : result.text;

      setTranscribedText((text || '').trim());
      setTranscribeStatus('');
    } catch (error: any) {
      alert(`Erro na transcrição: ${error.message}`);
      setTranscribeStatus('');
    } finally {
      setIsTranscribing(false);
    }
  };

  const sendTranscriptionToAiTab = () => {
    if (!transcribedText.trim()) return;
    setAiText(transcribedText);
    setActiveTab('ai');
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-900 font-sans pb-24 relative overflow-x-hidden">

      {showSplash && (
        <div className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-blue-600 transition-opacity duration-500 ease-in-out ${isFading ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          <div className="w-28 h-28 bg-white rounded-3xl flex items-center justify-center mb-6 shadow-2xl animate-bounce relative overflow-hidden">
            <img src="/logo.png" alt="Logo" className="w-full h-full object-cover z-10 fallback-icon" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <FileText size={48} className="text-blue-600 absolute z-0" />
          </div>
          <h1 className="text-4xl font-black tracking-tight text-white">DocuTools <span className="text-blue-200">Pro</span></h1>
          <p className="mt-3 text-sm font-bold text-blue-200 uppercase tracking-widest animate-pulse">Carregando...</p>
        </div>
      )}

      <header className="bg-white border-b border-slate-200 p-4 shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md relative overflow-hidden">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-cover z-10 fallback-icon" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <FileText size={20} className="absolute z-0" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight">DocuTools <span className="text-blue-600">Pro</span></h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 mt-2">
        {activeTab === 'extract' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            {!extractedText && !isProcessing ? (
              <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-200 rounded-2xl p-10 sm:p-16 flex flex-col items-center gap-5 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all text-center">
                <div className="bg-slate-100 p-5 rounded-full text-slate-400"><Upload size={40} /></div>
                <div>
                  <p className="font-extrabold text-slate-700 text-lg">Toque para enviar arquivo</p>
                  <p className="text-xs text-slate-400 mt-2">PDF, DOCX, TXT, ou Imagens (OCR)</p>
                </div>
                <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp" onChange={handleFileUpload} />
              </div>
            ) : isProcessing ? (
              <div className="flex flex-col items-center justify-center py-20 gap-5 text-center">
                <Loader2 className="animate-spin text-blue-600" size={48} />
                <p className="font-bold text-slate-800 text-lg">Processando... {progress}%</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-200">
                  <span className="font-bold text-slate-700 text-sm truncate max-w-[200px]">{fileName}</span>
                  <button onClick={() => {setExtractedText(''); setFileName('');}} className="text-red-600 font-bold text-sm bg-red-50 px-3 py-1.5 rounded-lg">Limpar</button>
                </div>
                <textarea value={extractedText} onChange={(e) => setExtractedText(e.target.value)} className="w-full h-80 p-4 border border-slate-200 rounded-2xl text-sm font-medium outline-none focus:border-blue-500 transition-all" />
                <div className="grid grid-cols-4 gap-2 sm:gap-3">
                  <button onClick={() => copyToClipboard(extractedText, 'extract')} className="bg-slate-100 py-3 rounded-xl font-bold border text-xs sm:text-sm flex items-center justify-center gap-1">
                    {copiedExtract ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                    {copiedExtract ? 'Copiado!' : 'Copiar'}
                  </button>
                  <button onClick={() => downloadTxt(extractedText, 'Extraido')} className="bg-slate-100 py-3 rounded-xl font-bold border text-xs sm:text-sm">TXT</button>
                  <button onClick={() => downloadPdfText(extractedText, 'Extraido')} className="bg-slate-900 text-white py-3 rounded-xl font-bold text-xs sm:text-sm">PDF</button>
                  <button onClick={() => downloadDocx(extractedText, 'Extraido')} className="bg-blue-600 text-white py-3 rounded-xl font-bold text-xs sm:text-sm">DOCX</button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
              <label className="text-sm font-bold text-slate-700 flex items-center gap-2"><Globe size={18}/> Motor de Inteligência:</label>

              <select
                value={translationEngine}
                onChange={(e) => {
                  setTranslationEngine(e.target.value as EngineType);
                  if (e.target.value === 'google') setAiAction('translate');
                }}
                className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 font-bold text-slate-700 outline-none focus:border-indigo-500 shadow-sm"
              >
                <option value="google">Google Tradutor (Grátis - Sem chave)</option>
                <option value="gemini">Google Gemini (API Gratuita)</option>
                <option value="groq">Groq / GPT-OSS 20B (API Gratuita - Rápido)</option>
                <option value="openai">OpenAI / ChatGPT (API Paga)</option>
              </select>

              {translationEngine !== 'google' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Sua Chave API</label>
                  <input type="password" placeholder={`Insira a chave do ${translationEngine.toUpperCase()} aqui...`} value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="w-full text-sm bg-white border border-slate-300 px-4 py-3 rounded-xl outline-none focus:border-indigo-500 shadow-sm" />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button onClick={() => setAiAction('translate')} className={`py-2 rounded-lg text-sm font-bold border ${aiAction === 'translate' ? 'bg-indigo-100 border-indigo-200 text-indigo-800' : 'bg-white text-slate-600'}`}>Traduzir</button>
              <button disabled={translationEngine === 'google'} onClick={() => setAiAction('summarize')} className={`py-2 rounded-lg text-sm font-bold border disabled:opacity-50 ${aiAction === 'summarize' ? 'bg-indigo-100 border-indigo-200 text-indigo-800' : 'bg-white text-slate-600'}`}>Resumir</button>
              <button disabled={translationEngine === 'google'} onClick={() => setAiAction('grammar')} className={`py-2 rounded-lg text-sm font-bold border disabled:opacity-50 ${aiAction === 'grammar' ? 'bg-indigo-100 border-indigo-200 text-indigo-800' : 'bg-white text-slate-600'}`}>Corrigir</button>
              <button disabled={translationEngine === 'google'} onClick={() => setAiAction('improve')} className={`py-2 rounded-lg text-sm font-bold border disabled:opacity-50 ${aiAction === 'improve' ? 'bg-indigo-100 border-indigo-200 text-indigo-800' : 'bg-white text-slate-600'}`}>Melhorar</button>
            </div>

            {aiAction === 'translate' && (
              <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-700 outline-none focus:border-indigo-500">
                {Object.entries(languageMap).map(([code, name]) => (
                  <option key={code} value={code}>{name}</option>
                ))}
              </select>
            )}

            <div className="flex flex-col space-y-4">
              <textarea value={aiText || extractedText} onChange={(e) => setAiText(e.target.value)} placeholder="Texto original..." className="w-full h-48 p-4 bg-slate-50 border rounded-xl text-sm outline-none focus:border-indigo-500" />
              <button onClick={handleAiAction} disabled={isAiWorking} className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md">
                {isAiWorking ? <Loader2 className="animate-spin" /> : <Wand2 />} {isAiWorking ? 'Processando...' : 'Executar Ação'}
              </button>
              {aiProgress && (
                <p className="text-xs font-bold text-indigo-600 text-center">
                  Processando {aiProgress.done} de {aiProgress.total}...
                </p>
              )}
              <textarea value={aiText} readOnly placeholder="Resultado..." className="w-full h-48 p-4 bg-indigo-50/30 border border-indigo-100 rounded-xl text-sm outline-none" />
              {aiText && (
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => copyToClipboard(aiText, 'ai')} className="bg-slate-100 py-2.5 rounded-lg font-bold border text-xs sm:text-sm flex items-center justify-center gap-1">
                    {copiedAi ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                    {copiedAi ? 'Copiado!' : 'Copiar'}
                  </button>
                  <button onClick={() => downloadTxt(aiText, 'IA')} className="bg-slate-900 text-white py-2.5 rounded-lg font-bold text-xs sm:text-sm">TXT</button>
                  <button onClick={() => downloadDocx(aiText, 'IA')} className="bg-indigo-600 text-white py-2.5 rounded-lg font-bold text-xs sm:text-sm">DOCX</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= ABA IA VISUAL ================= */}
        {activeTab === 'visual-ai' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">

            {/* Abas Superiores (Gerar vs Editar) */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 mb-2">
              <button onClick={() => setVisualTab('generate')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${visualTab === 'generate' ? 'bg-pink-600 text-white shadow-sm' : 'text-slate-500'}`}>Gerar</button>
              <button onClick={() => setVisualTab('edit')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${visualTab === 'edit' ? 'bg-pink-600 text-white shadow-sm' : 'text-slate-500'}`}>Editar</button>
            </div>

            {/* SEÇÃO: GERAR IMAGEM */}
            {visualTab === 'generate' && (
              <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <Palette size={18} className="text-pink-600" /> Crie do Zero (Grátis)
                </label>
                <textarea
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    placeholder="Ex: A futuristic city floating in the clouds, cyberpunk style..."
                    className="w-full h-28 p-4 bg-slate-50 border border-slate-300 rounded-xl text-sm outline-none focus:border-pink-500 resize-none"
                />
                <button
                    onClick={handleGenerateImage}
                    disabled={isGeneratingImage}
                    className="w-full bg-pink-600 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.98]"
                  >
                  {isGeneratingImage ? <Loader2 className="animate-spin" size={20} /> : <Palette size={20} />}
                  {isGeneratingImage ? 'Pintando Pixels...' : 'Gerar Imagem'}
                </button>

                {generatedImage && (
                  <div className="space-y-3 pt-2">
                    <div className="w-full rounded-2xl overflow-hidden border-2 border-slate-200 bg-slate-100 relative">
                      <img src={generatedImage} alt="Gerada" className="w-full h-auto max-h-[350px] object-contain bg-black" />
                    </div>
                    <button onClick={() => downloadVisualImage(generatedImage)} className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md">
                      <DownloadCloud size={20} /> Salvar
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* SEÇÃO: EDITAR IMAGEM (Pollinations.ai / kontext) */}
            {visualTab === 'edit' && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="bg-pink-50 p-4 rounded-xl border border-pink-100 space-y-3">
                  <label className="text-xs font-bold text-pink-800 uppercase flex items-center gap-1"><Key size={14}/> Chave API Pollinations (opcional)</label>
                  <input
                    type="password"
                    placeholder="Cole sua chave aqui (opcional)"
                    value={pollinationsKey}
                    onChange={(e) => setPollinationsKey(e.target.value)}
                    className="w-full text-sm bg-white border border-pink-200 px-4 py-3 rounded-xl outline-none focus:border-pink-500"
                  />
                  <p className="text-[10px] text-pink-600/80 font-bold">Funciona sem chave (uso limitado). Registre-se grátis em auth.pollinations.ai para limites maiores.</p>
                </div>

                <div
                  onClick={() => editImageInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all ${editSourceImage ? 'border-pink-500 bg-pink-50/30' : 'border-slate-300 hover:bg-slate-50'}`}
                >
                  {editSourceImage ? (
                    <img src={URL.createObjectURL(editSourceImage)} className="h-32 object-contain rounded-lg shadow-sm" />
                  ) : (
                    <>
                      <ImagePlus size={32} className="text-slate-400 mb-2" />
                      <span className="text-sm font-bold text-slate-600">Toque para selecionar imagem</span>
                    </>
                  )}
                  <input ref={editImageInputRef} type="file" className="hidden" accept="image/*" onChange={handleEditImageSource} />
                </div>

                <input
                  type="text"
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  placeholder="Comando (Ex: Make it look like a pencil sketch)"
                  className="w-full text-sm bg-slate-50 border border-slate-300 px-4 py-4 rounded-xl outline-none focus:border-pink-500 font-medium"
                />

                <button
                  onClick={handleEditCommand}
                  disabled={isEditingImage || !editSourceImage}
                  className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
                >
                  {isEditingImage ? <Loader2 className="animate-spin" size={20} /> : <Paintbrush size={20} />}
                  {isEditingImage ? 'Aplicando Filtro IA...' : 'Editar Imagem'}
                </button>

                {editedImage && (
                  <div className="space-y-3 pt-2">
                    <div className="w-full rounded-2xl overflow-hidden border-2 border-pink-200 bg-slate-100 relative">
                      <img src={editedImage} alt="Editada" className="w-full h-auto max-h-[350px] object-contain bg-black" />
                    </div>
                    <button onClick={() => downloadVisualImage(editedImage)} className="w-full bg-pink-600 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md">
                      <DownloadCloud size={20} /> Salvar Edição
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= OUTRAS ABAS ================= */}
        {activeTab === 'image' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-6 text-center animate-in fade-in zoom-in-95 duration-200">
            <div onClick={() => imageInputRef.current?.click()} className="border-2 border-dashed border-slate-200 rounded-2xl p-10 sm:p-16 cursor-pointer hover:border-violet-400 hover:bg-violet-50/50 transition-all">
              <FilePlus className="mx-auto text-slate-300 mb-4" size={48} />
              <p className="font-bold text-slate-700">Adicionar Imagens</p>
              <input ref={imageInputRef} type="file" multiple className="hidden" accept="image/*" onChange={handleImagesSelected} />
            </div>
            {selectedImages.length > 0 && (
              <div className="space-y-4">
                <div className="grid grid-cols-4 gap-2">
                  {selectedImages.map((img, i) => <div key={i} className="aspect-square bg-slate-100 rounded-lg overflow-hidden border"><img src={URL.createObjectURL(img)} className="w-full h-full object-cover" /></div>)}
                </div>
                <div className="flex flex-col gap-4 items-center">
                  <select value={imageFormat} onChange={(e) => setImageFormat(e.target.value)} className="w-full border p-3 rounded-xl font-bold bg-slate-50">
                    <option value="pdf">Unificar em PDF</option>
                    <option value="jpeg">Converter para JPG</option>
                    <option value="png">Converter para PNG</option>
                  </select>
                  <button onClick={processImages} disabled={isProcessing} className="w-full bg-violet-600 text-white py-4 rounded-xl font-bold shadow-md">
                    {isProcessing ? `Processando... ${progress}%` : 'Iniciar Processamento'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'audio' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">

            {/* Configuração opcional do OmniRoute (servidor próprio) */}
            <details className="bg-slate-50 rounded-xl border border-slate-200 p-4">
              <summary className="text-xs font-bold text-slate-500 uppercase cursor-pointer">
                ⚙️ Servidor próprio (OmniRoute) — opcional
              </summary>
              <div className="mt-3 space-y-2">
                <p className="text-[11px] text-slate-500">
                  Se você tem um OmniRoute rodando (ex: no seu Oracle Cloud), configure aqui
                  para transcrição mais rápida e vozes de melhor qualidade. Sem isso, o app
                  usa transcrição local no navegador e a voz padrão do sistema.
                </p>
                <input
                  type="text"
                  placeholder="https://api.seudominio.com"
                  value={omniRouteUrl}
                  onChange={(e) => setOmniRouteUrl(e.target.value)}
                  className="w-full text-sm bg-white border border-slate-300 px-3 py-2 rounded-lg outline-none focus:border-orange-500"
                />
                <input
                  type="password"
                  placeholder="Chave de API do OmniRoute"
                  value={omniRouteKey}
                  onChange={(e) => setOmniRouteKey(e.target.value)}
                  className="w-full text-sm bg-white border border-slate-300 px-3 py-2 rounded-lg outline-none focus:border-orange-500"
                />
              </div>
            </details>

            {/* Abas Superiores (Texto->Voz vs Voz->Texto) */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 mb-2">
              <button onClick={() => setAudioSubTab('tts')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${audioSubTab === 'tts' ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-500'}`}>Texto → Voz</button>
              <button onClick={() => setAudioSubTab('stt')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${audioSubTab === 'stt' ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-500'}`}>Voz → Texto</button>
            </div>

            {/* SEÇÃO: TEXTO -> VOZ (TTS, já existia) */}
            {audioSubTab === 'tts' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
                <div className="flex flex-col gap-4 bg-slate-50 p-4 rounded-xl border">
                  <label className="text-xs font-bold text-slate-500 uppercase">Configurações de Voz</label>
                  <select value={ttsLang} onChange={(e) => setTtsLang(e.target.value)} className="w-full border p-3 rounded-lg font-bold bg-white">
                    <option value="pt-BR">Português (BR)</option>
                    <option value="en-US">Inglês (EUA)</option>
                  </select>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold">1x</span>
                    <input type="range" min="0.5" max="2" step="0.1" value={ttsRate} onChange={(e) => setTtsRate(parseFloat(e.target.value))} className="flex-1 accent-orange-500" />
                    <span className="text-sm font-bold">2x</span>
                  </div>
                </div>
                <textarea value={aiText || extractedText} onChange={(e) => setAiText(e.target.value)} className="w-full h-64 p-5 border rounded-2xl text-sm font-medium outline-none focus:border-orange-500 bg-slate-50" placeholder="Texto para leitura..." />
                <div className="flex gap-2 sm:gap-4">
                  <button onClick={speak} disabled={isFetchingTts} className="flex-1 bg-orange-500 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md disabled:opacity-60">
                    {isFetchingTts ? <Loader2 className="animate-spin" size={20} /> : <Volume2 />}
                    {isFetchingTts ? 'Gerando voz...' : 'Play'}
                  </button>
                  <button onClick={() => window.speechSynthesis.cancel()} className="w-24 sm:w-40 bg-slate-900 text-white py-4 rounded-xl font-bold">
                    Stop
                  </button>
                </div>
              </div>
            )}

            {/* SEÇÃO: VOZ -> TEXTO (transcrição no navegador, via Whisper/transformers.js) */}
            {audioSubTab === 'stt' && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                  <p className="text-xs font-bold text-orange-800">
                    Transcrição 100% local, sem servidor e sem chave de API. Na primeira
                    vez, um modelo (~40-80MB) é baixado e fica em cache no navegador.
                    Pode demorar, principalmente em celular.
                  </p>
                </div>

                <div
                  onClick={() => sttFileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all ${sttFile ? 'border-orange-500 bg-orange-50/30' : 'border-slate-300 hover:bg-slate-50'}`}
                >
                  <Mic size={32} className="text-slate-400 mb-2" />
                  <span className="text-sm font-bold text-slate-600">
                    {sttFile ? sttFile.name : 'Toque para selecionar um áudio'}
                  </span>
                  <span className="text-xs text-slate-400 mt-1">MP3, WAV, M4A, OGG...</span>
                  <input ref={sttFileInputRef} type="file" className="hidden" accept="audio/*" onChange={handleSttFileSelected} />
                </div>

                <button
                  onClick={handleTranscribeAudio}
                  disabled={isTranscribing || !sttFile}
                  className="w-full bg-orange-500 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
                >
                  {isTranscribing ? <Loader2 className="animate-spin" size={20} /> : <Mic size={20} />}
                  {isTranscribing ? 'Transcrevendo...' : 'Transcrever Áudio'}
                </button>

                {transcribeStatus && (
                  <p className="text-xs font-bold text-orange-600 text-center">{transcribeStatus}</p>
                )}

                {transcribedText && (
                  <div className="space-y-3">
                    <textarea
                      value={transcribedText}
                      onChange={(e) => setTranscribedText(e.target.value)}
                      className="w-full h-48 p-4 bg-orange-50/30 border border-orange-100 rounded-xl text-sm outline-none"
                    />
                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                      <button onClick={() => downloadTxt(transcribedText, 'Transcricao')} className="bg-slate-100 py-3 rounded-xl font-bold border text-xs sm:text-sm">Baixar TXT</button>
                      <button onClick={sendTranscriptionToAiTab} className="bg-indigo-600 text-white py-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1">
                        <Wand2 size={14} /> Enviar para IA Texto
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)] z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="flex justify-between items-center h-16 max-w-5xl mx-auto px-1 sm:px-4">
          <button onClick={() => setActiveTab('extract')} className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${activeTab === 'extract' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
            <FileText size={20} className={activeTab === 'extract' ? 'fill-blue-100' : ''} />
            <span className="text-[10px] font-bold">OCR</span>
          </button>

          <button onClick={() => setActiveTab('ai')} className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${activeTab === 'ai' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
            <Wand2 size={20} className={activeTab === 'ai' ? 'fill-indigo-100' : ''} />
            <span className="text-[10px] font-bold">IA Texto</span>
          </button>

          <button onClick={() => setActiveTab('visual-ai')} className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${activeTab === 'visual-ai' ? 'text-pink-600' : 'text-slate-400 hover:text-slate-600'}`}>
            <Palette size={20} className={activeTab === 'visual-ai' ? 'fill-pink-100' : ''} />
            <span className="text-[10px] font-bold">IA Arte</span>
          </button>

          <button onClick={() => setActiveTab('image')} className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${activeTab === 'image' ? 'text-violet-600' : 'text-slate-400 hover:text-slate-600'}`}>
            <ImageIcon size={20} className={activeTab === 'image' ? 'fill-violet-100' : ''} />
            <span className="text-[10px] font-bold">Mídia</span>
          </button>

          <button onClick={() => setActiveTab('audio')} className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${activeTab === 'audio' ? 'text-orange-500' : 'text-slate-400 hover:text-slate-600'}`}>
            <Volume2 size={20} className={activeTab === 'audio' ? 'fill-orange-100' : ''} />
            <span className="text-[10px] font-bold">Voz</span>
          </button>
        </div>
      </nav>

    </div>
  );
}
