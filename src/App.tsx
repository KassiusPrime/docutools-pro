import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  FileText, Volume2, Upload,
  Loader2, Key, Wand2, Palette, DownloadCloud,
  ImagePlus, Mic, Send, Settings, Copy, FileOutput,
  Languages, Sparkles, X, Check,
  Type, Bot
} from 'lucide-react';
import { extractTextFromFile } from './lib/utils';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { jsPDF } from 'jspdf';
import { saveAs } from 'file-saver';

type TabType = 'extract' | 'ai' | 'image' | 'audio';
type AiActionType = 'translate' | 'summarize' | 'grammar' | 'improve';
type EngineType = 'google' | 'openai' | 'gemini' | 'groq';
type AudioSubTabType = 'tts' | 'stt';

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'pt', name: 'Português' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'zh', name: '中文' },
  { code: 'ru', name: 'Русский' },
  { code: 'ar', name: 'العربية' },
];

const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'extract', label: 'Extrair Texto', icon: <FileText className="w-4 h-4" /> },
  { id: 'ai', label: 'IA Texto', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'image', label: 'IA Visual', icon: <ImagePlus className="w-4 h-4" /> },
  { id: 'audio', label: 'Áudio', icon: <Volume2 className="w-4 h-4" /> },
];

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
  const [aiResult, setAiResult] = useState('');
  const [isAiWorking, setIsAiWorking] = useState(false);
  const [aiAction, setAiAction] = useState<AiActionType>('translate');
  const [translationEngine, setTranslationEngine] = useState<EngineType>('google');
  const [showSettings, setShowSettings] = useState(false);

  // IA Visual
  const [imagePrompt, setImagePrompt] = useState('');
  const [generatedImage, setGeneratedImage] = useState('');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // Audio
  const [audioSubTab, setAudioSubTab] = useState<AudioSubTabType>('tts');
  const [ttsText, setTtsText] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [sttResult, setSttResult] = useState('');
  const recognitionRef = useRef<any>(null);

  // Notifications
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showNotification = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  // Save API key
  useEffect(() => {
    if (apiKey) localStorage.setItem('docutools_apikey', apiKey);
  }, [apiKey]);

  // ==================== OCR ====================
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
      showNotification('Erro ao extrair texto do arquivo.', 'error');
    } finally {
      setIsProcessing(false);
      setProgress(100);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showNotification('Copiado para a área de transferência!');
    } catch {
      showNotification('Erro ao copiar.', 'error');
    }
  };

  // ==================== Export ====================
  const exportAsTxt = (text: string, name: string) => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, `${name}.txt`);
    showNotification('Exportado como TXT!');
  };

  const exportAsDocx = async (text: string, name: string) => {
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: text.split('\n').map(
            (line) =>
              new Paragraph({
                children: [new TextRun(line)],
              })
          ),
        },
      ],
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
      if (y > 280) {
        pdf.addPage();
        y = 15;
      }
      pdf.text(line, 15, y);
      y += 7;
    });
    pdf.save(`${name}.pdf`);
    showNotification('Exportado como PDF!');
  };

  // ==================== IA Text ====================
  const handleAiAction = async () => {
    if (!aiText.trim()) {
      showNotification('Insira algum texto primeiro.', 'error');
      return;
    }

    setIsAiWorking(true);
    setAiResult('');

    try {
      let result = '';

      if (aiAction === 'translate' && translationEngine === 'google') {
        // Free Google Translate
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(aiText)}`;
        const res = await fetch(url);
        const data = await res.json();
        result = data[0].map((item: any) => item[0]).join('');
      } else if (apiKey) {
        // Use API key for other engines
        const systemPrompts: Record<AiActionType, string> = {
          translate: `Translate the following text to ${LANGUAGES.find((l) => l.code === targetLang)?.name || targetLang}. Only return the translation, nothing else.`,
          summarize: 'Summarize the following text concisely. Keep the main points. Respond in the same language as the input.',
          grammar: 'Fix all grammar and spelling errors in the following text. Only return the corrected text.',
          improve: 'Improve the writing quality of the following text. Make it clearer and more professional. Respond in the same language as the input.',
        };

        if (translationEngine === 'openai') {
          const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: 'gpt-3.5-turbo',
              messages: [
                { role: 'system', content: systemPrompts[aiAction] },
                { role: 'user', content: aiText },
              ],
            }),
          });
          const data = await res.json();
          result = data.choices?.[0]?.message?.content || 'Erro na resposta.';
        } else if (translationEngine === 'gemini') {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [{ text: `${systemPrompts[aiAction]}\n\n${aiText}` }],
                  },
                ],
              }),
            }
          );
          const data = await res.json();
          result = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Erro na resposta.';
        } else if (translationEngine === 'groq') {
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: 'llama3-8b-8192',
              messages: [
                { role: 'system', content: systemPrompts[aiAction] },
                { role: 'user', content: aiText },
              ],
            }),
          });
          const data = await res.json();
          result = data.choices?.[0]?.message?.content || 'Erro na resposta.';
        }
      } else {
        showNotification('Configure uma API key para usar este motor.', 'error');
        setIsAiWorking(false);
        return;
      }

      setAiResult(result);
      showNotification('Processado com sucesso!');
    } catch (err) {
      console.error(err);
      showNotification('Erro ao processar texto com IA.', 'error');
    } finally {
      setIsAiWorking(false);
    }
  };

  // ==================== Image Generation ====================
  const handleGenerateImage = async () => {
    if (!imagePrompt.trim()) {
      showNotification('Insira uma descrição para a imagem.', 'error');
      return;
    }

    setIsGeneratingImage(true);
    setGeneratedImage('');

    try {
      const encodedPrompt = encodeURIComponent(imagePrompt);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=768&height=768&nologo=true&seed=${Date.now()}`;

      // Preload the image
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Falha ao gerar imagem'));
        img.src = imageUrl;
      });

      setGeneratedImage(imageUrl);
      showNotification('Imagem gerada com sucesso!');
    } catch (err) {
      console.error(err);
      showNotification('Erro ao gerar imagem.', 'error');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const downloadImage = () => {
    if (!generatedImage) return;
    const link = document.createElement('a');
    link.href = generatedImage;
    link.download = `docutools-image-${Date.now()}.png`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification('Download iniciado!');
  };

  // ==================== Audio TTS ====================
  const handleTTS = () => {
    if (!ttsText.trim()) {
      showNotification('Insira algum texto para falar.', 'error');
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
    utterance.onerror = () => {
      setIsSpeaking(false);
      showNotification('Erro na síntese de voz.', 'error');
    };

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  // ==================== Audio STT ====================
  const handleSTT = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      showNotification('Reconhecimento de voz não suportado neste navegador.', 'error');
      return;
    }

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = true;

    let finalText = '';

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript + ' ';
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setSttResult(finalText + interim);
    };

    recognition.onerror = (event: any) => {
      console.error('STT error:', event.error);
      setIsRecording(false);
      showNotification('Erro no reconhecimento de voz.', 'error');
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setSttResult('');
    showNotification('Ouvindo... Fale agora.');
  };

  // ==================== Splash Screen ====================
  if (showSplash) {
    return (
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 transition-opacity duration-500 ${
          isFading ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div className="text-center">
          <div className="relative inline-block">
            <div className="w-24 h-24 rounded-3xl bg-white/20 backdrop-blur-xl flex items-center justify-center shadow-2xl animate-bounce">
              <FileText className="w-12 h-12 text-white" />
            </div>
            <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center animate-pulse shadow-lg">
              <Sparkles className="w-4 h-4 text-yellow-800" />
            </div>
          </div>
          <h1 className="mt-6 text-4xl font-bold text-white tracking-tight">DocuTools Pro</h1>
          <p className="mt-2 text-white/70 text-lg">OCR · IA · Áudio · Imagem</p>
          <div className="mt-6 flex justify-center">
            <div className="w-48 h-1 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full animate-[loading_2s_ease-in-out]" style={{ width: '100%' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==================== Main Render ====================
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-zinc-100">
      {/* Notification */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-medium animate-[slideIn_0.3s_ease] ${
            notification.type === 'success'
              ? 'bg-emerald-500 text-white'
              : 'bg-red-500 text-white'
          }`}
        >
          {notification.type === 'success' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
          {notification.msg}
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-200/50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">DocuTools Pro</h1>
              <p className="text-xs text-gray-500">Ferramentas inteligentes de documentos</p>
            </div>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Settings Panel */}
      {showSettings && (
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Key className="w-5 h-5 text-indigo-500" />
                Configurações de API
              </h3>
              <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API Key (OpenAI / Gemini / Groq)</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Insira sua API key..."
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
              />
              <p className="text-xs text-gray-400 mt-1">
                Necessário para IA de texto (exceto tradução Google). Armazenado localmente.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Motor de IA</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['google', 'openai', 'gemini', 'groq'] as EngineType[]).map((engine) => (
                  <button
                    key={engine}
                    onClick={() => setTranslationEngine(engine)}
                    className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                      translationEngine === engine
                        ? 'bg-indigo-500 text-white shadow-md'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {engine === 'google' ? '🌐 Google' : engine === 'openai' ? '🤖 OpenAI' : engine === 'gemini' ? '💎 Gemini' : '⚡ Groq'}
                  </button>
                ))}
              </div>
              {translationEngine === 'google' && (
                <p className="text-xs text-emerald-600 mt-1">✅ Google Translate é gratuito e não requer API key.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab Bar */}
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex gap-2 bg-white rounded-2xl p-1.5 shadow-sm border border-gray-200">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-indigo-500 text-white shadow-md'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 pb-8 space-y-6">
        {/* ==================== TAB: Extract ==================== */}
        {activeTab === 'extract' && (
          <div className="space-y-6">
            {/* Upload Area */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="bg-white rounded-2xl shadow-sm border-2 border-dashed border-gray-200 hover:border-indigo-400 transition-all cursor-pointer p-8 sm:p-12 text-center group"
            >
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileUpload}
                accept="image/*,.pdf,.txt,.md,.csv,.json,.xml,.html"
                className="hidden"
              />
              <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-50 flex items-center justify-center group-hover:bg-indigo-100 transition-colors mb-4">
                <Upload className="w-8 h-8 text-indigo-500" />
              </div>
              <p className="text-lg font-semibold text-gray-700">Clique para fazer upload</p>
              <p className="text-sm text-gray-400 mt-1">Imagens (OCR), PDF, TXT, MD, CSV, JSON</p>
            </div>

            {/* Progress */}
            {isProcessing && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-3">
                  <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                  <span className="text-sm font-medium text-gray-700">
                    Processando {fileName}... {progress}%
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Results */}
            {extractedText && !isProcessing && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-500" />
                    <h3 className="text-sm font-semibold text-gray-700">Texto Extraído</h3>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {extractedText.length} caracteres
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => copyToClipboard(extractedText)}
                      className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Copiar"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setAiText(extractedText)}
                      className="p-2 rounded-lg hover:bg-indigo-50 text-indigo-400 hover:text-indigo-600 transition-colors"
                      title="Enviar para IA"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="p-6">
                  <textarea
                    value={extractedText}
                    onChange={(e) => setExtractedText(e.target.value)}
                    className="w-full h-48 text-sm text-gray-700 bg-gray-50 rounded-xl p-4 border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-y"
                  />
                </div>
                {/* Export */}
                <div className="px-6 py-4 border-t border-gray-100 flex flex-wrap gap-2">
                  <button
                    onClick={() => exportAsTxt(extractedText, fileName || 'texto')}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-gray-700 transition-colors flex items-center gap-2"
                  >
                    <FileOutput className="w-4 h-4" />
                    TXT
                  </button>
                  <button
                    onClick={() => exportAsDocx(extractedText, fileName || 'texto')}
                    className="px-4 py-2 bg-blue-100 hover:bg-blue-200 rounded-xl text-sm font-medium text-blue-700 transition-colors flex items-center gap-2"
                  >
                    <FileOutput className="w-4 h-4" />
                    DOCX
                  </button>
                  <button
                    onClick={() => exportAsPdf(extractedText, fileName || 'texto')}
                    className="px-4 py-2 bg-red-100 hover:bg-red-200 rounded-xl text-sm font-medium text-red-700 transition-colors flex items-center gap-2"
                  >
                    <FileOutput className="w-4 h-4" />
                    PDF
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB: AI Text ==================== */}
        {activeTab === 'ai' && (
          <div className="space-y-6">
            {/* AI Actions */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                [
                  { id: 'translate', label: 'Traduzir', icon: <Languages className="w-4 h-4" />, color: 'blue' },
                  { id: 'summarize', label: 'Resumir', icon: <FileText className="w-4 h-4" />, color: 'green' },
                  { id: 'grammar', label: 'Gramática', icon: <Type className="w-4 h-4" />, color: 'orange' },
                  { id: 'improve', label: 'Melhorar', icon: <Wand2 className="w-4 h-4" />, color: 'purple' },
                ] as const
              ).map((action) => (
                <button
                  key={action.id}
                  onClick={() => setAiAction(action.id)}
                  className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm font-medium transition-all ${
                    aiAction === action.id
                      ? 'bg-indigo-500 text-white shadow-md'
                      : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                  }`}
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
            </div>

            {/* Language Selector (for translate) */}
            {aiAction === 'translate' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Idioma de destino</label>
                <select
                  value={targetLang}
                  onChange={(e) => setTargetLang(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Input */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Bot className="w-4 h-4 text-indigo-500" />
                  Texto de Entrada
                </h3>
              </div>
              <div className="p-6">
                <textarea
                  value={aiText}
                  onChange={(e) => setAiText(e.target.value)}
                  placeholder="Cole ou digite o texto aqui..."
                  className="w-full h-40 text-sm text-gray-700 bg-gray-50 rounded-xl p-4 border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-y"
                />
              </div>
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  Motor: {translationEngine === 'google' ? '🌐 Google (grátis)' : translationEngine === 'openai' ? '🤖 OpenAI' : translationEngine === 'gemini' ? '💎 Gemini' : '⚡ Groq'}
                </span>
                <button
                  onClick={handleAiAction}
                  disabled={isAiWorking}
                  className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl text-sm font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {isAiWorking ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {isAiWorking ? 'Processando...' : 'Processar'}
                </button>
              </div>
            </div>

            {/* Result */}
            {aiResult && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-500" />
                    Resultado
                  </h3>
                  <div className="flex gap-1">
                    <button
                      onClick={() => copyToClipboard(aiResult)}
                      className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="p-6">
                  <div className="text-sm text-gray-700 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-4 whitespace-pre-wrap border border-indigo-100">
                    {aiResult}
                  </div>
                </div>
                <div className="px-6 py-4 border-t border-gray-100 flex flex-wrap gap-2">
                  <button
                    onClick={() => exportAsTxt(aiResult, 'resultado-ia')}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-gray-700 transition-colors flex items-center gap-2"
                  >
                    <FileOutput className="w-4 h-4" />
                    TXT
                  </button>
                  <button
                    onClick={() => exportAsDocx(aiResult, 'resultado-ia')}
                    className="px-4 py-2 bg-blue-100 hover:bg-blue-200 rounded-xl text-sm font-medium text-blue-700 transition-colors flex items-center gap-2"
                  >
                    <FileOutput className="w-4 h-4" />
                    DOCX
                  </button>
                  <button
                    onClick={() => exportAsPdf(aiResult, 'resultado-ia')}
                    className="px-4 py-2 bg-red-100 hover:bg-red-200 rounded-xl text-sm font-medium text-red-700 transition-colors flex items-center gap-2"
                  >
                    <FileOutput className="w-4 h-4" />
                    PDF
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB: Image ==================== */}
        {activeTab === 'image' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Palette className="w-4 h-4 text-pink-500" />
                  Gerador de Imagens IA
                </h3>
                <p className="text-xs text-gray-400 mt-1">Powered by Pollinations AI - Gratuito, sem API key</p>
              </div>
              <div className="p-6 space-y-4">
                <textarea
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  placeholder="Descreva a imagem que deseja gerar... (ex: 'um gato astronauta flutuando no espaço, estilo cartoon')"
                  className="w-full h-28 text-sm text-gray-700 bg-gray-50 rounded-xl p-4 border border-gray-200 focus:ring-2 focus:ring-pink-500 focus:border-transparent outline-none resize-y"
                />
                <button
                  onClick={handleGenerateImage}
                  disabled={isGeneratingImage}
                  className="w-full px-6 py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-xl text-sm font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isGeneratingImage ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Gerando imagem...
                    </>
                  ) : (
                    <>
                      <ImagePlus className="w-4 h-4" />
                      Gerar Imagem
                    </>
                  )}
                </button>
              </div>
            </div>

            {generatedImage && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">Imagem Gerada</h3>
                  <button
                    onClick={downloadImage}
                    className="px-4 py-2 bg-indigo-100 hover:bg-indigo-200 rounded-xl text-sm font-medium text-indigo-700 transition-colors flex items-center gap-2"
                  >
                    <DownloadCloud className="w-4 h-4" />
                    Download
                  </button>
                </div>
                <div className="p-6">
                  <img
                    src={generatedImage}
                    alt="Generated"
                    className="w-full rounded-xl shadow-sm border border-gray-100"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB: Audio ==================== */}
        {activeTab === 'audio' && (
          <div className="space-y-6">
            {/* Sub-tabs */}
            <div className="flex gap-2 bg-white rounded-2xl p-1.5 shadow-sm border border-gray-200">
              <button
                onClick={() => setAudioSubTab('tts')}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  audioSubTab === 'tts'
                    ? 'bg-emerald-500 text-white shadow-md'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Volume2 className="w-4 h-4" />
                Texto para Fala
              </button>
              <button
                onClick={() => setAudioSubTab('stt')}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  audioSubTab === 'stt'
                    ? 'bg-emerald-500 text-white shadow-md'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Mic className="w-4 h-4" />
                Fala para Texto
              </button>
            </div>

            {audioSubTab === 'tts' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-emerald-500" />
                    Texto para Fala (TTS)
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">Usa a API nativa do navegador - Gratuito</p>
                </div>
                <div className="p-6 space-y-4">
                  <textarea
                    value={ttsText}
                    onChange={(e) => setTtsText(e.target.value)}
                    placeholder="Digite o texto para ser falado..."
                    className="w-full h-32 text-sm text-gray-700 bg-gray-50 rounded-xl p-4 border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none resize-y"
                  />
                  <button
                    onClick={handleTTS}
                    className={`w-full px-6 py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                      isSpeaking
                        ? 'bg-red-500 text-white hover:bg-red-600'
                        : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:shadow-lg'
                    }`}
                  >
                    {isSpeaking ? (
                      <>
                        <X className="w-4 h-4" />
                        Parar
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-4 h-4" />
                        Falar
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {audioSubTab === 'stt' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Mic className="w-4 h-4 text-emerald-500" />
                    Fala para Texto (STT)
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">Usa reconhecimento de voz do navegador - Gratuito</p>
                </div>
                <div className="p-6 space-y-4">
                  <button
                    onClick={handleSTT}
                    className={`w-full px-6 py-6 rounded-2xl text-sm font-semibold transition-all flex flex-col items-center justify-center gap-3 ${
                      isRecording
                        ? 'bg-red-50 border-2 border-red-300 text-red-600'
                        : 'bg-emerald-50 border-2 border-emerald-200 text-emerald-600 hover:border-emerald-300'
                    }`}
                  >
                    <div
                      className={`w-16 h-16 rounded-full flex items-center justify-center ${
                        isRecording ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'
                      }`}
                    >
                      <Mic className="w-8 h-8 text-white" />
                    </div>
                    {isRecording ? 'Ouvindo... Clique para parar' : 'Clique para começar a gravar'}
                  </button>

                  {sttResult && (
                    <div className="space-y-3">
                      <div className="text-sm text-gray-700 bg-gray-50 rounded-xl p-4 whitespace-pre-wrap border border-gray-200 min-h-[100px]">
                        {sttResult}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => copyToClipboard(sttResult)}
                          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-gray-700 transition-colors flex items-center gap-2"
                        >
                          <Copy className="w-4 h-4" />
                          Copiar
                        </button>
                        <button
                          onClick={() => {
                            setAiText(sttResult);
                            setActiveTab('ai');
                            showNotification('Texto enviado para IA!');
                          }}
                          className="px-4 py-2 bg-indigo-100 hover:bg-indigo-200 rounded-xl text-sm font-medium text-indigo-700 transition-colors flex items-center gap-2"
                        >
                          <Send className="w-4 h-4" />
                          Enviar para IA
                        </button>
                        <button
                          onClick={() => exportAsTxt(sttResult, 'transcricao')}
                          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-gray-700 transition-colors flex items-center gap-2"
                        >
                          <FileOutput className="w-4 h-4" />
                          TXT
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200/50 bg-white/50 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 text-center">
          <p className="text-xs text-gray-400">
            DocuTools Pro — OCR · Tradução · IA · Áudio · Geração de Imagens
          </p>
        </div>
      </footer>
    </div>
  );
}
