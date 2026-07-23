import React, { useState, useRef, useEffect } from 'react';
import {
  FileText, Image as ImageIcon, Volume2, Upload,
  Loader2, FilePlus, Key, Wand2, Globe, Palette, DownloadCloud,
  ImagePlus, Paintbrush, Mic, Send, Settings
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

  // OCR
  const [extractedText, setExtractedText] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // IA Texto
  const [targetLang, setTargetLang] = useState('en');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('docutools_apikey') || '');
  const [aiText, setAiText] = useState('');
  const [isAiWorking, setIsAiWorking] = useState(false);
  const [aiAction, setAiAction] = useState<AiActionType>('translate');
  const [translationEngine, setTranslationEngine] = useState<EngineType>('google');
  const [aiProgress, setAiProgress] = useState<{ done: number; total: number } | null>(null);

  // OmniRoute (opcional)
  const [omniRouteUrl, setOmniRouteUrl] = useState(() => localStorage.getItem('docutools_omniroute_url') || '');
  const [omniRouteKey, setOmniRouteKey] = useState(() => localStorage.getItem('docutools_omniroute_key') || '');

  // IA Visual
  const [visualTab, setVisualTab] = useState<VisualTabType>('generate');
  const [imagePrompt, setImagePrompt] = useState('');
  const [generatedImage, setGeneratedImage] = useState('');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [pollinationsKey, setPollinationsKey] = useState(() => localStorage.getItem('docutools_pollinations_key') || '');
  const [editSourceImage, setEditSourceImage] = useState<File | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editedImage, setEditedImage] = useState('');
  const [isEditingImage, setIsEditingImage] = useState(false);
  const editImageInputRef = useRef<HTMLInputElement>(null);

  // Áudio
  const [ttsLang, setTtsLang] = useState('pt-BR');
  const [ttsRate, setTtsRate] = useState(1);
  const [audioSubTab, setAudioSubTab] = useState<AudioSubTabType>('tts');
  const [sttFile, setSttFile] = useState<File | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeStatus, setTranscribeStatus] = useState('');
  const [transcribedText, setTranscribedText] = useState('');
  const sttFileInputRef = useRef<HTMLInputElement>(null);

  const languageMap: Record<string, string> = {
    'en': 'Inglês', 'es': 'Espanhol', 'fr': 'Francês',
    'de': 'Alemão', 'it': 'Italiano', 'pt': 'Português'
  };

  useEffect(() => { localStorage.setItem('docutools_apikey', apiKey); }, [apiKey]);
  useEffect(() => { localStorage.setItem('docutools_pollinations_key', pollinationsKey); }, [pollinationsKey]);
  useEffect(() => { localStorage.setItem('docutools_omniroute_url', omniRouteUrl); }, [omniRouteUrl]);
  useEffect(() => { localStorage.setItem('docutools_omniroute_key', omniRouteKey); }, [omniRouteKey]);

  // ... (mantenha as funções handleFileUpload, handleAiAction, handleGenerateImage, handleEditCommand, etc. do seu código anterior)

  const speak = async () => {
    const text = aiText || extractedText;
    if (!text.trim()) return;

    // Tenta OmniRoute primeiro
    if (omniRouteUrl && omniRouteKey) {
      try {
        const res = await fetch(`${omniRouteUrl}/v1/audio/speech`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${omniRouteKey}`
          },
          body: JSON.stringify({ model: "tts-1", voice: "nova", input: text })
        });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          new Audio(url).play();
          return;
        }
      } catch {}
    }

    // Fallback navegador
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = ttsLang;
    utterance.rate = ttsRate;
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-900 font-sans pb-24 relative overflow-x-hidden">
      {/* Seu header, splash, main e nav permanecem iguais ao seu código original */}
      {/* Apenas certifique-se de ter a aba de áudio e as configurações do OmniRoute */}

      {/* Exemplo da aba áudio com OmniRoute */}
      {activeTab === 'audio' && (
        <div className="bg-white rounded-3xl border shadow-sm p-6">
          {/* Config OmniRoute */}
          <div className="mb-6 p-4 bg-blue-50 rounded-2xl">
            <p className="text-xs font-bold mb-2">OmniRoute (opcional)</p>
            <input type="text" placeholder="URL do OmniRoute" value={omniRouteUrl} onChange={e => setOmniRouteUrl(e.target.value)} className="w-full p-3 border rounded-xl mb-2" />
            <input type="password" placeholder="Chave API" value={omniRouteKey} onChange={e => setOmniRouteKey(e.target.value)} className="w-full p-3 border rounded-xl" />
          </div>

          {/* resto da aba áudio */}
        </div>
      )}
    </div>
  );
}