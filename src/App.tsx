import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  FileText, Volume2, Upload, Loader2, Key, Wand2, Palette, DownloadCloud,
  ImagePlus, Mic, Send, Settings, Copy, FileOutput, Languages, Sparkles,
  X, Check, Type, Bot, MessageSquare, Paperclip, Image as ImageIcon,
  FileVideo, File, Trash2, StopCircle, SplitSquareHorizontal
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
// SERVIÇO: CHAMADA PARA NOSSA PRÓPRIA API (VERCEL)
// ============================================
const CLIENT_AI_TIMEOUT_MS = 60000;
const CHAT_API_ENDPOINT = '/api/chat';

function parseApiResponse(text: string) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

export async function sendToVercel(provider: string, model: string, messages: any[]) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), CLIENT_AI_TIMEOUT_MS);

  try {
    const response = await fetch(CHAT_API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model, messages }),
      signal: controller.signal,
    });

    const text = await response.text();
    const data = parseApiResponse(text);

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
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tiff', 'tif'];
const TEXT_EXTENSIONS = ['txt', 'md', 'csv', 'json', 'xml', 'html', 'css', 'js', 'ts', 'jsx', 'tsx'];

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
    } catch (e) { return '[Erro ao processar o PDF]'; }
  }

  if (ext === 'docx') {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      if (onProgress) onProgress(100);
      return result.value;
    } catch (e) { return '[Erro no DOCX]'; }
  }

  if (ext === 'xlsx' || ext === 'xls') {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const wb = xlsx.read(arrayBuffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (onProgress) onProgress(100);
      return xlsx.utils.sheet_to_csv(ws);
    } catch (e) { return '[Erro na Planilha]'; }
  }

  if (onProgress) onProgress(100);
  return file.text();
}

// ============================================
// TIPOS E CONSTANTES
// ============================================
type TabType = 'extract' | 'chat' | 'compare' | 'ai' | 'image' | 'audio';
type AiActionType = 'translate' | 'summarize' | 'grammar' | 'improve';
type AudioSubTabType = 'tts' | 'stt';

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

const LANGUAGES = [
  { code: 'en', name: 'English' }, { code: 'pt', name: 'Português' },
  { code: 'es', name: 'Español' }, { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' }, { code: 'it', name: 'Italiano' },
  { code: 'ja', name: '日本語' }, { code: 'ko', name: '한국어' },
  { code: 'zh', name: '中文' }, { code: 'ru', name: 'Русский' },
  { code: 'ar', name: 'العربية' },
];

const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'extract', label: 'OCR', icon: <FileText className="w-4 h-4" /> },
  { id: 'chat', label: 'Chat IA', icon: <MessageSquare className="w-4 h-4" /> },
  { id: 'compare', label: 'Arena', icon: <SplitSquareHorizontal className="w-4 h-4" /> },
  { id: 'ai', label: 'Texto', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'image', label: 'Imagem', icon: <ImagePlus className="w-4 h-4" /> },
  { id: 'audio', label: 'Áudio', icon: <Volume2 className="w-4 h-4" /> },
];

const ENGINES = [
  { id: 'deepseek', provider: 'openrouter', model: 'deepseek/deepseek-chat', label: 'DeepSeek', emoji: '🧠' },
  { id: 'qwen', provider: 'openrouter', model: 'qwen/qwen-2.5-72b-instruct', label: 'Qwen', emoji: '🚀' },
  { id: 'claude', provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet', label: 'Claude', emoji: '🎯' },
  { id: 'gemini', provider: 'gemini', model: 'gemini-1.5-flash', label: 'Gemini', emoji: '💎' },
  { id: 'groq', provider: 'groq', model: 'llama-3.1-70b-versatile', label: 'Groq', emoji: '⚡' },
];

// ============================================
// COMPONENTE PRINCIPAL
// ============================================
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
    localStorage.setItem('docutools_engine', translationEngine);
  }, [translationEngine]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleFileUpload
