import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  FileText, Volume2, Upload, Loader2, Key, Wand2, Palette, DownloadCloud,
  ImagePlus, Mic, Send, Settings, Copy, FileOutput, Languages, Sparkles, X, 
  Check, Type, Bot, MessageSquare, Paperclip, Image as ImageIcon, FileVideo, 
  File, Trash2, StopCircle, SplitSquareHorizontal 
} from 'lucide-react';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { jsPDF } from 'jspdf';
import { saveAs } from 'file-saver';
import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import * as mammoth from 'mammoth';
import * as xlsx from 'xlsx';

// Configuração do Worker do PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// ============================================
// TIPOS E CONSTANTES
// ============================================
type TabType = 'extract' | 'chat' | 'compare' | 'ai' | 'image' | 'audio';
type AiActionType = 'translate' | 'summarize' | 'grammar' | 'improve';
type AudioSubTabType = 'tts' | 'stt';

type AiMessage = { role: 'system' | 'user' | 'assistant'; content: string; };

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  files?: ChatFile[];
  timestamp: Date;
}

interface ChatFile {
  name: string;
  type: string;
  content: string;
  preview?: string;
}

const CLIENT_AI_TIMEOUT_MS = 30000;

const LANGUAGES = [
  { code: 'en', name: 'English' }, { code: 'pt', name: 'Português' },
  { code: 'es', name: 'Español' }, { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' }, { code: 'it', name: 'Italiano' },
  { code: 'ja', name: '日本語' }, { code: 'ko', name: '한국어' },
  { code: 'zh', name: '中文' }, { code: 'ru', name: 'Русский' },
  { code: 'ar', name: 'العربية' },
];

const ENGINES = [
  { id: 'deepseek', provider: 'openrouter', model: 'deepseek/deepseek-chat', label: 'DeepSeek', emoji: '🧠' },
  { id: 'qwen', provider: 'openrouter', model: 'qwen/qwen-2.5-72b-instruct', label: 'Qwen', emoji: '🚀' },
  { id: 'claude', provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet', label: 'Claude', emoji: '🎯' },
  { id: 'gemini', provider: 'gemini', model: 'gemini-1.5-flash', label: 'Gemini', emoji: '💎' },
  { id: 'groq', provider: 'groq', model: 'llama-3.1-70b-versatile', label: 'Groq', emoji: '⚡' },
];

const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'extract', label: 'OCR', icon: <FileText className="w-5 h-5" /> },
  { id: 'chat', label: 'Chat IA', icon: <Bot className="w-5 h-5" /> },
  { id: 'compare', label: 'Arena', icon: <SplitSquareHorizontal className="w-5 h-5" /> },
  { id: 'ai', label: 'Texto', icon: <Type className="w-5 h-5" /> },
  { id: 'image', label: 'Imagem', icon: <ImageIcon className="w-5 h-5" /> },
  { id: 'audio', label: 'Áudio', icon: <Volume2 className="w-5 h-5" /> },
];

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tiff', 'tif'];
const TEXT_EXTENSIONS = ['txt', 'md', 'csv', 'json', 'xml', 'html', 'css', 'js', 'ts', 'jsx', 'tsx'];

// ============================================
// SERVIÇO: CHAMADA PARA NOSSA PRÓPRIA API (VERCEL)
// ============================================
async function sendToVercel(provider: string, model: string, messages: AiMessage[]) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), CLIENT_AI_TIMEOUT_MS);
  
  try {
    const response = await fetch('/api/chat', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, model, messages }),
      signal: controller.signal
    });
    
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `Erro no servidor: ${response.status}`);
    }
    return data.answer;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('Tempo limite ao aguardar a IA. Tente uma mensagem menor ou outro modelo.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

// ============================================
// SERVIÇO: EXTRAÇÃO DE TEXTO
// ============================================
export async function extractTextFromFile(file: File, onProgress?: (p: number) => void): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  
  if (IMAGE_EXTENSIONS.includes(ext)) {
    const result = await Tesseract.recognize(file, 'por+eng', {
      logger: (m) => { if (m.status === 'recognizing text' && onProgress) onProgress(Math.round(m.progress * 100)); },
    });
    return result.data.text.trim();
  }
  
  if (TEXT_EXTENSIONS.includes(ext)) {
    if (onProgress) onProgress(100);
    return file.text();
  }
  
  if (ext === 'pdf') {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        if (onProgress) onProgress(Math.round((i / pdf.numPages) * 100));
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((s: any) => s.str).join(' ') + '\n\n';
      }
      return text.trim() || '[PDF sem texto extraível. Tente rodar como imagem.]';
    } catch (e) {
      return '[Erro ao processar o PDF]';
    }
  }
  
  if (ext === 'docx') {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      if (onProgress) onProgress(100);
      return result.value;
    } catch (e) {
      return '[Erro no DOCX]';
    }
  }
  
  if (ext === 'xlsx' || ext === 'xls') {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const wb = xlsx.read(arrayBuffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (onProgress) onProgress(100);
      return xlsx.utils.sheet_to_csv(ws);
    } catch (e) {
      return '[Erro na Planilha]';
    }
  }
  
  if (onProgress) onProgress(100);
  return file.text();
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================
export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [isFading, setIsFading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('extract');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  
  const [translationEngine, setTranslationEngine] = useState(() => localStorage.getItem('docutools_engine') || 'deepseek');
  const currentEngine = ENGINES.find(e => e.id === translationEngine) || ENGINES[0];
  
  const [extractedText, setExtractedText] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatFiles, setChatFiles] = useState<ChatFile[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  
  const [comparePrompt, setComparePrompt] = useState('');
  const [compareResults, setCompareResults] = useState<any[]>([]);
  const [isComparing, setIsComparing] = useState(false);
  
  const [targetLang, setTargetLang] = useState('en');
  const [aiText, setAiText] = useState('');
  const [aiResult, setAiResult] = useState('');
  const [isAiWorking, setIsAiWorking] = useState(false);
  const [aiAction, setAiAction] = useState<AiActionType>('translate');
  
  const [imagePrompt, setImagePrompt] = useState('');
  const [generatedImage, setGeneratedImage] = useState('');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  
  const [audioSubTab, setAudioSubTab] = useState<AudioSubTabType>('tts');
  const [ttsText, setTtsText] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [sttResult, setSttResult] = useState('');
  const recognitionRef = useRef<any>(null);

  const showNotification = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsFading(true);
      setTimeout(() => setShowSplash(false), 500);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem('docutools_engine', translationEngine);
  }, [translationEngine]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showNotification('Copiado!');
    } catch {
      showNotification('Erro ao copiar.', 'error');
    }
  };

  const exportAsTxt = (text: string, name: string) => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, `${name}.txt`);
    showNotification('Exportado como TXT!');
  };

  const exportAsDocx = async (text: string, name: string) => {
    const doc = new Document({
      sections: [{ properties: {}, children: text.split('\n').map(line => new Paragraph({ children: [new TextRun(line)] })) }],
    });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${name}.docx`);
    showNotification('Exportado como DOCX!');
  };

  const exportAsPdf = (text: string, name: string) => {
    const pdf = new jsPDF();
    const lines = pdf.splitTextToSize(text, 180);
    let y = 15;
    lines.forEach((line: string) => {
      if (y > 280) { pdf.addPage(); y = 15; }
      pdf.text(line, 15, y);
      y += 7;
    });
    pdf.save(`${name}.pdf`);
    showNotification('Exportado como PDF!');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setIsProcessing(true);
    setProgress(0);
    setExtractedText('');
    try {
      const text = await extractTextFromFile(file, (p) => setProgress(p));
      setExtractedText(text);
      showNotification('Texto extraído com sucesso!');
    } catch (err) {
      console.error(err);
      showNotification('Erro ao extrair texto.', 'error');
    } finally {
      setIsProcessing(false);
      setProgress(100);
    }
  };

  const handleChatFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      try {
        let content = '';
        let preview = '';
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          content = await new Promise((resolve) => {
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
          preview = content;
        } else {
          content = await extractTextFromFile(file, () => {});
        }
        setChatFiles(prev => [...prev, { name: file.name, type: file.type, content, preview }]);
      } catch (err) {
        showNotification(`Erro ao processar ${file.name}`, 'error');
      }
    }
    e.target.value = '';
  };

  const removeChatFile = (index: number) => {
    setChatFiles(prev => prev.filter((_, i) => i !== index));
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() && chatFiles.length === 0) return;
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: chatInput,
      files: chatFiles.length > 0 ? [...chatFiles] : undefined,
      timestamp: new Date(),
    };
    
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setChatFiles([]);
    setIsChatLoading(true);
    
    try {
      let prompt = chatInput;
      if (userMessage.files) {
        for (const file of userMessage.files) {
          if (!file.type.startsWith('image/')) {
            prompt += `\n\n--- Conteúdo de ${file.name} ---\n${file.content}\n--- Fim do arquivo ---`;
          }
        }
      }
      
      const messages: AiMessage[] = [
        { role: 'system', content: 'Você é um assistente útil que pode analisar textos, documentos e imagens. Responda sempre em português.' },
        ...chatMessages.slice(-10).map(msg => ({ role: msg.role, content: msg.content })),
        { role: 'user', content: prompt }
      ];
      
      const response = await sendToVercel(currentEngine.provider, currentEngine.model, messages);
      setChatMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      }]);
    } catch (err: any) {
      showNotification(err.message || 'Erro ao comunicar com a IA.', 'error');
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleAiAction = async () => {
    if (!aiText.trim()) {
      showNotification('Insira algum texto.', 'error');
      return;
    }
    setIsAiWorking(true);
    setAiResult('');
    try {
      const targetLangName = LANGUAGES.find(l => l.code === targetLang)?.name || targetLang;
      const prompts: Record<AiActionType, string> = {
        translate: `Traduza para ${targetLangName}. Retorne apenas a tradução:`,
        summarize: 'Resuma o texto de forma concisa. Mantenha os pontos principais:',
        grammar: 'Corrija erros de gramática e ortografia. Retorne apenas o texto corrigido:',
        improve: 'Melhore a qualidade da escrita. Torne mais claro e profissional:',
      };
      const messages: AiMessage[] = [
        { role: 'system', content: prompts[aiAction] },
        { role: 'user', content: aiText }
      ];
      const response = await sendToVercel(currentEngine.provider, currentEngine.model, messages);
      setAiResult(response);
      showNotification('Processado!');
    } catch (err) {
      showNotification('Erro ao processar na Vercel.', 'error');
    } finally {
      setIsAiWorking(false);
    }
  };

  const handleCompare = async () => {
    if (!comparePrompt.trim()) return;
    setIsComparing(true);
    setCompareResults([]);
    const modelsToTest = [
      { id: 'claude', provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
      { id: 'deepseek', provider: 'openrouter', model: 'deepseek/deepseek-chat' },
      { id: 'gemini', provider: 'gemini', model: 'gemini-1.5-flash' }
    ];
    try {
      const messages: AiMessage[] = [{ role: 'user', content: comparePrompt }];
      const results = await Promise.all(
        modelsToTest.map(async (m) => {
          try {
            const answer = await sendToVercel(m.provider, m.model, messages);
            return { name: m.id, text: answer };
          } catch (e: any) {
            return { name: m.id, text: `⚠️ Falha 404 (Backend não encontrado).` };
          }
        })
      );
      setCompareResults(results);
    } finally {
      setIsComparing(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!imagePrompt.trim()) {
      showNotification('Insira uma descrição.', 'error');
      return;
    }
    setIsGeneratingImage(true);
    setGeneratedImage('');
    try {
      const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=768&height=768&nologo=true&seed=${Date.now()}`;
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => reject();
        img.src = imageUrl;
      });
      setGeneratedImage(imageUrl);
      showNotification('Imagem gerada!');
    } catch {
      showNotification('Erro ao gerar imagem.', 'error');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleTTS = () => {
    if (!ttsText.trim()) {
      showNotification('Insira algum texto.', 'error');
      return;
    }
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(ttsText);
    utterance.lang = 'pt-BR';
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => { setIsSpeaking(false); showNotification('Erro na síntese.', 'error'); };
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const handleSTT = () => {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      showNotification('Não suportado neste navegador.', 'error');
      return;
    }
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event: any) => {
      const lastResult = event.results[event.results.length - 1];
      if (lastResult.isFinal) {
        const transcript = lastResult[0].transcript;
        setSttResult(prev => prev + (prev ? ' ' : '') + transcript);
      }
    };
    recognition.onerror = (event: any) => {
      setIsRecording(false);
      if (event.error !== 'no-speech') showNotification('Erro no reconhecimento.', 'error');
    };
    recognition.onend = () => {
      if (isRecording && recognitionRef.current) {
        try { recognition.start(); } catch (e) { setIsRecording(false); }
      }
    };
    recognitionRef.current = recognition;
    setSttResult('');
    recognition.start();
    setIsRecording(true);
    showNotification('Ouvindo...');
  };

  if (showSplash) {
    return (
      <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 transition-opacity duration-500 ${isFading ? 'opacity-0' : 'opacity-100'}`}>
        <Sparkles className="w-16 h-16 text-white mb-4 animate-pulse" />
        <h1 className="text-4xl font-bold text-white mb-2">DocuTools Pro</h1>
        <p className="text-white/80">OCR · Chat IA · Áudio · Imagem</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 text-gray-800 font-sans overflow-hidden">
      
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-medium animate-[slideIn_0.3s_ease] ${notification.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
          {notification.type === 'success' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
          {notification.msg}
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2"><Settings className="w-6 h-6" /> Configurações de API (Vercel)</h2>
              <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Motor de IA Padrão</label>
                <div className="grid grid-cols-2 gap-2">
                  {ENGINES.map((engine) => (
                    <button
                      key={engine.id}
                      onClick={() => setTranslationEngine(engine.id)}
                      className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${translationEngine === engine.id ? 'bg-indigo-500 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      {engine.emoji} {engine.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-gray-500 text-center">As chaves reais estão seguras no painel da Vercel.</p>
            </div>
          </div>
        </div>
      )}

      <aside className="w-20 md:w-64 bg-white border-r border-gray-200 flex flex-col items-center md:items-start py-6 flex-shrink-0 transition-all">
        <div className="px-6 mb-8 flex items-center gap-3">
          <Sparkles className="w-8 h-8 text-indigo-500 flex-shrink-0" />
          <span className="text-xl font-bold hidden md:block bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-purple-600">DocuTools Pro</span>
        </div>
        <nav className="w-full px-3 space-y-2 flex-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all font-medium ${activeTab === tab.id ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}
            >
              {tab.icon}
              <span className="hidden md:block">{tab.label}</span>
            </button>
          ))}
        </nav>
        <div className="w-full px-3 mt-auto">
          <button onClick={() => setShowSettings(true)} className="w-full flex items-center justify-center md:justify-start gap-3 px-3 py-3 rounded-xl transition-all font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900">
            <Settings className="w-5 h-5 flex-shrink-0" />
            <span className="hidden md:block">Configurações</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 h-full overflow-y-auto p-4 md:p-8 relative">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {activeTab === 'extract' && (
            <div className="space-y-6">
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 flex flex-col items-center justify-center text-center">
                <Upload className="w-12 h-12 text-indigo-500 mb-4" />
                <h2 className="text-xl font-bold mb-2">Extração de Texto (OCR)</h2>
                <p className="text-gray-500 mb-6">Envie Imagens, PDF, DOCX ou Planilhas</p>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".png,.jpg,.jpeg,.pdf,.docx,.xlsx,.txt,.csv" />
                <button onClick={() => fileInputRef.current?.click()} className="px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-xl transition-colors">
                  Selecionar Arquivo
                </button>
              </div>

              {isProcessing && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 text-center">
                  <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-3" />
                  <p className="font-medium text-gray-700">Processando {fileName}... {progress}%</p>
                  <div className="w-full h-2 bg-gray-100 rounded-full mt-4 overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}

              {extractedText && !isProcessing && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-lg flex items-center gap-2"><FileText className="w-5 h-5 text-indigo-500" /> Texto Extraído</h3>
                    <div className="flex gap-2">
                      <button onClick={() => copyToClipboard(extractedText)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400" title="Copiar"><Copy className="w-5 h-5" /></button>
                      <button onClick={() => { setAiText(extractedText); setActiveTab('ai'); }} className="p-2 hover:bg-indigo-50 rounded-lg text-indigo-500" title="Processar IA"><Wand2 className="w-5 h-5" /></button>
                    </div>
                  </div>
                  <textarea value={extractedText} onChange={(e) => setExtractedText(e.target.value)} className="w-full h-64 text-sm bg-gray-50 rounded-xl p-4 border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-y" />
                  <div className="flex gap-3 overflow-x-auto">
                    <button onClick={() => exportAsTxt(extractedText, fileName || 'texto')} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium flex items-center gap-2">TXT</button>
                    <button onClick={() => exportAsDocx(extractedText, fileName || 'texto')} className="px-4 py-2 bg-blue-100 hover:bg-blue-200 rounded-xl text-sm font-medium text-blue-700 flex items-center gap-2">DOCX</button>
                    <button onClick={() => exportAsPdf(extractedText, fileName || 'texto')} className="px-4 py-2 bg-red-100 hover:bg-red-200 rounded-xl text-sm font-medium text-red-700 flex items-center gap-2">PDF</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col h-[75vh]">
              {/* Header do Chat (Área onde estava o erro de Regex) */}
              <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <Bot className="w-6 h-6 text-indigo-500" />
                  <div>
                    <h2 className="font-bold text-gray-800">Chat com IA</h2>
                    <p className="text-xs text-gray-500 flex items-center gap-1">{currentEngine?.emoji} {currentEngine?.label}</p>
                  </div>
                </div>
                {chatMessages.length > 0 && (
                  <button onClick={() => setChatMessages([])} className="px-3 py-1.5 text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-lg flex items-center gap-1 transition-colors">
                    <Trash2 className="w-3 h-3" /> Limpar
                  </button>
                )}
              </div>

              {/* Área de Mensagens */}
              <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/30">
                {chatMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-3">
                    <MessageSquare className="w-12 h-12 text-gray-200" />
                    <p>Envie uma mensagem ou um documento para iniciar.</p>
                  </div>
                ) : (
                  chatMessages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] p-4 rounded-2xl ${msg.role === 'user' ? 'bg-indigo-500 text-white rounded-br-sm' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'}`}>
                        <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</div>
                      </div>
                    </div>
                  ))
                )}
                
                {isChatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-gray-200 p-4 rounded-2xl rounded-bl-sm shadow-sm flex items-center gap-3 text-sm text-gray-500">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-500" /> <span>Gerando resposta...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Preview de Arquivos Anexados */}
              {chatFiles.length > 0 && (
                <div className="px-4 py-3 bg-white border-t border-gray-100 flex gap-3 overflow-x-auto">
                  {chatFiles.map((file, i) => (
                    <div key={i} className="relative flex-shrink-0 w-16 h-16 rounded-xl border border-gray-200 overflow-hidden group bg-gray-50 flex items-center justify-center">
                      {file.preview ? (
                        <img src={file.preview} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <FileText className="w-6 h-6 text-indigo-300" />
                      )}
                      <button onClick={() => removeChatFile(i)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Input Area */}
              <div className="p-4 bg-white border-t border-gray-200 flex gap-2 items-end">
                <input type="file" ref={chatFileInputRef} onChange={handleChatFileUpload} className="hidden" multiple />
                <button onClick={() => chatFileInputRef.current?.click()} className="p-3 mb-1 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-xl transition-colors">
                  <Paperclip className="w-5 h-5" />
                </button>
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Digite sua mensagem..."
                  className="flex-1 bg-gray-50 rounded-xl px-4 py-3 min-h-[52px] max-h-32 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 border border-gray-200 resize-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
                  }}
                />
                <button 
                  onClick={sendChatMessage} 
                  disabled={isChatLoading || (!chatInput.trim() && chatFiles.length === 0)} 
                  className="p-3 mb-1 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {activeTab === 'compare' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-6">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2 mb-2"><SplitSquareHorizontal className="w-6 h-6 text-indigo-500" /> Arena de Modelos</h2>
                <p className="text-sm text-gray-500">Envie o mesmo prompt para Claude, DeepSeek e Gemini simultaneamente.</p>
              </div>
              <textarea value={comparePrompt} onChange={(e) => setComparePrompt(e.target.value)} placeholder="Digite o prompt de teste..." className="w-full h-32 p-4 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none" />
              <button onClick={handleCompare} disabled={isComparing || !comparePrompt} className="w-full py-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors">
                {isComparing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
                {isComparing ? 'Aguardando respostas das IAs...' : 'Disparar para Modelos'}
              </button>
              
              {compareResults.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  {compareResults.map((res, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3">
                      <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                        <span className="font-bold text-gray-700 capitalize">{res.name}</span>
                        <button onClick={() => copyToClipboard(res.text)} className="text-gray-400 hover:text-indigo-500"><Copy className="w-4 h-4" /></button>
                      </div>
                      <div className="text-sm text-gray-600 whitespace-pre-wrap max-h-96 overflow-y-auto">{res.text}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { id: 'translate' as const, label: 'Traduzir', icon: <Languages className="w-5 h-5" /> },
                  { id: 'summarize' as const, label: 'Resumir', icon: <FileText className="w-5 h-5" /> },
                  { id: 'grammar' as const, label: 'Gramática', icon: <Check className="w-5 h-5" /> },
                  { id: 'improve' as const, label: 'Melhorar', icon: <Sparkles className="w-5 h-5" /> },
                ].map((action) => (
                  <button key={action.id} onClick={() => setAiAction(action.id)} className={`flex items-center justify-center gap-2 px-3 py-4 rounded-xl text-sm font-medium transition-all ${aiAction === action.id ? 'bg-indigo-500 text-white shadow-md' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    {action.icon} <span className="hidden md:inline">{action.label}</span>
                  </button>
                ))}
              </div>

              {aiAction === 'translate' && (
                <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                  {LANGUAGES.map((lang) => ( <option key={lang.code} value={lang.code}>{lang.name}</option> ))}
                </select>
              )}

              <textarea value={aiText} onChange={(e) => setAiText(e.target.value)} placeholder="Cole o texto aqui..." className="w-full h-48 p-4 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none resize-y" />
              
              <button onClick={handleAiAction} disabled={isAiWorking || !aiText} className="w-full py-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors">
                {isAiWorking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
                {isAiWorking ? 'Processando...' : 'Processar Texto'}
              </button>

              {aiResult && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-lg">Resultado</h3>
                    <button onClick={() => copyToClipboard(aiResult)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400"><Copy className="w-5 h-5" /></button>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-xl text-sm text-gray-700 whitespace-pre-wrap border border-gray-100">{aiResult}</div>
                  <div className="flex gap-3 overflow-x-auto pt-2">
                    <button onClick={() => exportAsTxt(aiResult, 'resultado')} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium">TXT</button>
                    <button onClick={() => exportAsDocx(aiResult, 'resultado')} className="px-4 py-2 bg-blue-100 hover:bg-blue-200 rounded-xl text-sm font-medium text-blue-700">DOCX</button>
                    <button onClick={() => exportAsPdf(aiResult, 'resultado')} className="px-4 py-2 bg-red-100 hover:bg-red-200 rounded-xl text-sm font-medium text-red-700">PDF</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'image' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-6">
              <div className="flex items-center gap-3 mb-2">
                <Palette className="w-8 h-8 text-pink-500" />
                <div>
                  <h2 className="text-xl font-bold">Gerador de Imagens</h2>
                  <p className="text-sm text-gray-500">Pollinations AI - Gratuito</p>
                </div>
              </div>
              <textarea value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} placeholder="Descreva a imagem detalhadamente... (ex: 'um gato astronauta no espaço')" className="w-full h-32 text-sm bg-gray-50 rounded-xl p-4 border border-gray-200 focus:ring-2 focus:ring-pink-500 outline-none resize-y" />
              <button onClick={handleGenerateImage} disabled={isGeneratingImage || !imagePrompt} className="w-full py-4 bg-pink-500 hover:bg-pink-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors">
                {isGeneratingImage ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
                {isGeneratingImage ? 'Gerando...' : 'Gerar Imagem'}
              </button>
              
              {generatedImage && (
                <div className="mt-8 space-y-4">
                  <h3 className="font-bold text-lg border-b border-gray-100 pb-2">Imagem Gerada</h3>
                  <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                    <img src={generatedImage} alt="Gerada por IA" className="w-full h-auto object-contain" />
                  </div>
                  <a href={generatedImage} target="_blank" rel="noreferrer" download="imagem-gerada.jpg" className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors">
                    <DownloadCloud className="w-5 h-5" /> Download
                  </a>
                </div>
              )}
            </div>
          )}

          {activeTab === 'audio' && (
            <div className="space-y-6">
              <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
                <button onClick={() => setAudioSubTab('tts')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-all ${audioSubTab === 'tts' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Texto → Fala</button>
                <button onClick={() => setAudioSubTab('stt')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-all ${audioSubTab === 'stt' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Fala → Texto</button>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                {audioSubTab === 'tts' && (
                  <div className="space-y-4">
                    <textarea value={ttsText} onChange={(e) => setTtsText(e.target.value)} placeholder="Digite o texto para ser falado..." className="w-full h-40 text-sm bg-gray-50 rounded-xl p-4 border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none resize-y" />
                    <button onClick={handleTTS} className={`w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors ${isSpeaking ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-emerald-500 hover:bg-emerald-600 text-white'}`}>
                      {isSpeaking ? <StopCircle className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                      {isSpeaking ? 'Parar Leitura' : 'Falar Texto'}
                    </button>
                  </div>
                )}

                {audioSubTab === 'stt' && (
                  <div className="space-y-6">
                    <button onClick={handleSTT} className={`w-full py-12 rounded-2xl font-semibold flex flex-col items-center justify-center gap-4 transition-all border-2 ${isRecording ? 'bg-red-50 border-red-200 text-red-600' : 'bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100'}`}>
                      <div className={`w-20 h-20 rounded-full flex items-center justify-center text-white shadow-lg ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}>
                        <Mic className="w-8 h-8" />
                      </div>
                      <span className="text-lg">{isRecording ? 'Gravando... Clique para parar' : 'Clique para começar a falar'}</span>
                    </button>

                    {sttResult && (
                      <div className="space-y-4 mt-6">
                        <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl min-h-[100px] text-sm text-gray-700">{sttResult}</div>
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => copyToClipboard(sttResult)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium flex items-center gap-2"><Copy className="w-4 h-4"/> Copiar</button>
                          <button onClick={() => { setChatInput(sttResult); setActiveTab('chat'); }} className="px-4 py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-xl text-sm font-medium flex items-center gap-2"><Bot className="w-4 h-4"/> Enviar ao Chat</button>
                          <button onClick={() => { setAiText(sttResult); setActiveTab('ai'); }} className="px-4 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-xl text-sm font-medium flex items-center gap-2"><Wand2 className="w-4 h-4"/> Processar IA</button>
                          <button onClick={() => exportAsTxt(sttResult, 'transcricao')} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium">TXT</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
