import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  FileText, Volume2, Upload, Loader2, Key, Wand2, Palette, DownloadCloud,
  ImagePlus, Mic, Send, Settings, Copy, FileOutput, Languages, Sparkles,
  X, Check, Type, Bot, MessageSquare, Paperclip, Image as ImageIcon,
  FileVideo, File, Trash2, StopCircle
} from 'lucide-react';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { jsPDF } from 'jspdf';
import { saveAs } from 'file-saver';
import { extractTextFromFile } from './lib/utils';

// ============================================
// TIPOS
// ============================================
type TabType = 'extract' | 'chat' | 'ai' | 'image' | 'audio';
type AiActionType = 'translate' | 'summarize' | 'grammar' | 'improve';
type EngineType = 'google' | 'openai' | 'gemini' | 'groq';
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

// ============================================
// CONSTANTES
// ============================================
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
  { id: 'extract', label: 'OCR', icon: <FileText className="w-4 h-4" /> },
  { id: 'chat', label: 'Chat IA', icon: <MessageSquare className="w-4 h-4" /> },
  { id: 'ai', label: 'Texto', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'image', label: 'Imagem', icon: <ImagePlus className="w-4 h-4" /> },
  { id: 'audio', label: 'Áudio', icon: <Volume2 className="w-4 h-4" /> },
];

const ENGINES: { id: EngineType; label: string; emoji: string }[] = [
  { id: 'google', label: 'Google', emoji: '🌐' },
  { id: 'openai', label: 'OpenAI', emoji: '🤖' },
  { id: 'gemini', label: 'Gemini', emoji: '💎' },
  { id: 'groq', label: 'Groq', emoji: '⚡' },
];

const STORAGE_KEYS = {
  API_KEY: 'docutools_apikey',
  ENGINE: 'docutools_engine',
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================
export default function App() {
  // Splash
  const [showSplash, setShowSplash] = useState(true);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsFading(true);
      setTimeout(() => setShowSplash(false), 500);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Estados gerais
  const [activeTab, setActiveTab] = useState<TabType>('extract');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(STORAGE_KEYS.API_KEY) || '');
  const [translationEngine, setTranslationEngine] = useState<EngineType>('google');

  // OCR
  const [extractedText, setExtractedText] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chat IA
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatFiles, setChatFiles] = useState<ChatFile[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // IA Texto
  const [targetLang, setTargetLang] = useState('en');
  const [aiText, setAiText] = useState('');
  const [aiResult, setAiResult] = useState('');
  const [isAiWorking, setIsAiWorking] = useState(false);
  const [aiAction, setAiAction] = useState<AiActionType>('translate');

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

  // Notificações
  const showNotification = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  // Persistência
  useEffect(() => {
    if (apiKey) localStorage.setItem(STORAGE_KEYS.API_KEY, apiKey);
  }, [apiKey]);

  // Scroll do chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

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
      showNotification('Erro ao extrair texto.', 'error');
    } finally {
      setIsProcessing(false);
      setProgress(100);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showNotification('Copiado!');
    } catch {
      showNotification('Erro ao copiar.', 'error');
    }
  };

  // ==================== EXPORTAÇÃO ====================
  const exportAsTxt = (text: string, name: string) => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, `${name}.txt`);
    showNotification('Exportado como TXT!');
  };

  const exportAsDocx = async (text: string, name: string) => {
    const doc = new Document({
      sections: [{
        properties: {},
        children: text.split('\n').map(line => new Paragraph({ children: [new TextRun(line)] })),
      }],
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

  // ==================== CHAT IA ====================
  const handleChatFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      try {
        let content = '';
        let preview = '';

        if (file.type.startsWith('image/')) {
          // Imagem: converter para base64
          const reader = new FileReader();
          content = await new Promise((resolve) => {
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
          preview = content;
        } else if (file.type.startsWith('video/')) {
          content = `[Vídeo: ${file.name}]`;
          preview = '🎬';
        } else {
          // Documentos: extrair texto
          content = await extractTextFromFile(file, () => {});
        }

        setChatFiles(prev => [...prev, {
          name: file.name,
          type: file.type,
          content,
          preview,
        }]);
      } catch (err) {
        console.error(err);
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
    if (!apiKey && translationEngine !== 'google') {
      showNotification('Configure uma API key nas configurações.', 'error');
      return;
    }

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
      
      // Adicionar conteúdo dos arquivos ao prompt
      if (userMessage.files) {
        for (const file of userMessage.files) {
          if (file.type.startsWith('image/')) {
            prompt += `\n\n[Imagem anexada: ${file.name}]`;
          } else {
            prompt += `\n\n--- Conteúdo de ${file.name} ---\n${file.content}\n--- Fim do arquivo ---`;
          }
        }
      }

      let response = '';

      if (translationEngine === 'openai') {
        const messages: any[] = [
          { role: 'system', content: 'Você é um assistente útil que pode analisar textos, documentos e imagens. Responda sempre em português.' }
        ];

        // Adicionar histórico
        chatMessages.slice(-10).forEach(msg => {
          messages.push({ role: msg.role, content: msg.content });
        });

        // Adicionar mensagem atual com imagens se houver
        const userContent: any[] = [{ type: 'text', text: prompt }];
        if (userMessage.files) {
          for (const file of userMessage.files) {
            if (file.type.startsWith('image/') && file.content.startsWith('data:')) {
              userContent.push({
                type: 'image_url',
                image_url: { url: file.content }
              });
            }
          }
        }

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: userMessage.files?.some(f => f.type.startsWith('image/')) ? 'gpt-4o-mini' : 'gpt-3.5-turbo',
            messages: [...messages, { role: 'user', content: userContent }],
          }),
        });
        const data = await res.json();
        response = data.choices?.[0]?.message?.content || 'Erro na resposta.';
      } else if (translationEngine === 'gemini') {
        const parts: any[] = [{ text: prompt }];
        
        if (userMessage.files) {
          for (const file of userMessage.files) {
            if (file.type.startsWith('image/') && file.content.startsWith('data:')) {
              const base64 = file.content.split(',')[1];
              parts.push({
                inline_data: {
                  mime_type: file.type,
                  data: base64
                }
              });
            }
          }
        }

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts }],
            }),
          }
        );
        const data = await res.json();
        response = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Erro na resposta.';
      } else if (translationEngine === 'groq') {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'llama-3.1-70b-versatile',
            messages: [
              { role: 'system', content: 'Você é um assistente útil. Responda em português.' },
              { role: 'user', content: prompt },
            ],
          }),
        });
        const data = await res.json();
        response = data.choices?.[0]?.message?.content || 'Erro na resposta.';
      } else {
        response = 'Selecione OpenAI, Gemini ou Groq para usar o chat.';
      }

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };

      setChatMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      console.error(err);
      showNotification('Erro ao enviar mensagem.', 'error');
    } finally {
      setIsChatLoading(false);
    }
  };

  // ==================== IA TEXTO ====================
  const handleAiAction = async () => {
    if (!aiText.trim()) {
      showNotification('Insira algum texto.', 'error');
      return;
    }

    setIsAiWorking(true);
    setAiResult('');

    try {
      let result = '';
      const targetLangName = LANGUAGES.find(l => l.code === targetLang)?.name || targetLang;

      if (aiAction === 'translate' && translationEngine === 'google') {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(aiText)}`;
        const res = await fetch(url);
        const data = await res.json();
        result = data[0].map((item: [string]) => item[0]).join('');
      } else if (apiKey) {
        const prompts: Record<AiActionType, string> = {
          translate: `Traduza para ${targetLangName}. Retorne apenas a tradução:`,
          summarize: 'Resuma o texto de forma concisa. Mantenha os pontos principais:',
          grammar: 'Corrija erros de gramática e ortografia. Retorne apenas o texto corrigido:',
          improve: 'Melhore a qualidade da escrita. Torne mais claro e profissional:',
        };

        if (translationEngine === 'openai') {
          const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: 'gpt-3.5-turbo',
              messages: [
                { role: 'system', content: prompts[aiAction] },
                { role: 'user', content: aiText },
              ],
            }),
          });
          const data = await res.json();
          result = data.choices?.[0]?.message?.content || 'Erro na resposta.';
        } else if (translationEngine === 'gemini') {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: `${prompts[aiAction]}\n\n${aiText}` }] }] }),
          });
          const data = await res.json();
          result = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Erro na resposta.';
        } else if (translationEngine === 'groq') {
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: 'llama3-8b-8192',
              messages: [
                { role: 'system', content: prompts[aiAction] },
                { role: 'user', content: aiText },
              ],
            }),
          });
          const data = await res.json();
          result = data.choices?.[0]?.message?.content || 'Erro na resposta.';
        }
      } else {
        showNotification('Configure uma API key.', 'error');
        setIsAiWorking(false);
        return;
      }

      setAiResult(result);
      showNotification('Processado!');
    } catch (err) {
      console.error(err);
      showNotification('Erro ao processar.', 'error');
    } finally {
      setIsAiWorking(false);
    }
  };

  // ==================== IA VISUAL ====================
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

  // ==================== TTS ====================
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

  // ==================== STT (CORRIGIDO) ====================
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
    recognition.interimResults = false; // CORRIGIDO: Desabilita resultados intermediários

    recognition.onresult = (event: any) => {
      // Pega apenas o resultado final mais recente
      const lastResult = event.results[event.results.length - 1];
      if (lastResult.isFinal) {
        const transcript = lastResult[0].transcript;
        setSttResult(prev => prev + (prev ? ' ' : '') + transcript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('STT error:', event.error);
      setIsRecording(false);
      if (event.error !== 'no-speech') {
        showNotification('Erro no reconhecimento.', 'error');
      }
    };

    recognition.onend = () => {
      // Reinicia automaticamente se ainda estiver gravando
      if (isRecording && recognitionRef.current) {
        try {
          recognition.start();
        } catch (e) {
          setIsRecording(false);
        }
      }
    };

    recognitionRef.current = recognition;
    setSttResult('');
    recognition.start();
    setIsRecording(true);
    showNotification('Ouvindo...');
  };

  // ==================== SPLASH ====================
  if (showSplash) {
    return (
      <div className={`fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 transition-opacity duration-500 ${isFading ? 'opacity-0' : 'opacity-100'}`}>
        <div className="text-center">
          <div className="relative inline-block">
            <div className="w-24 h-24 rounded-3xl bg-white/20 backdrop-blur-xl flex items-center justify-center shadow-2xl animate-bounce">
              <FileText className="w-12 h-12 text-white" />
            </div>
            <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center animate-pulse">
              <Sparkles className="w-4 h-4 text-yellow-800" />
            </div>
          </div>
          <h1 className="mt-6 text-4xl font-bold text-white">DocuTools Pro</h1>
          <p className="mt-2 text-white/70">OCR · Chat IA · Áudio · Imagem</p>
        </div>
      </div>
    );
  }

  // ==================== RENDER ====================
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-zinc-100">
      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-medium animate-[slideIn_0.3s_ease] ${notification.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
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
              <h1 className="text-lg font-bold text-gray-900">DocuTools Pro</h1>
              <p className="text-xs text-gray-500">Ferramentas inteligentes</p>
            </div>
          </div>
          <button onClick={() => setShowSettings(!showSettings)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Settings */}
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
              <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Insira sua API key..."
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">Necessário para Chat IA e funções avançadas.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Motor de IA</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex gap-1 bg-white rounded-2xl p-1 shadow-sm border border-gray-200 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-w-[60px] flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-indigo-500 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 pb-8 space-y-6">
        
        {/* ==================== TAB: EXTRACT ==================== */}
        {activeTab === 'extract' && (
          <div className="space-y-6">
            <div onClick={() => fileInputRef.current?.click()} className="bg-white rounded-2xl shadow-sm border-2 border-dashed border-gray-200 hover:border-indigo-400 cursor-pointer p-8 text-center group">
              <input ref={fileInputRef} type="file" onChange={handleFileUpload} accept="image/*,.pdf,.txt,.md,.csv,.json,.xml,.html,.docx,.xlsx" className="hidden" />
              <Upload className="w-12 h-12 mx-auto text-indigo-500 mb-4" />
              <p className="text-lg font-semibold text-gray-700">Clique para upload</p>
              <p className="text-sm text-gray-400">Imagens, PDF, TXT, DOCX, XLSX...</p>
            </div>

            {isProcessing && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-3">
                  <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                  <span className="text-sm text-gray-700">Processando {fileName}... {progress}%</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            {extractedText && !isProcessing && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">Texto Extraído</h3>
                  <div className="flex gap-1">
                    <button onClick={() => copyToClipboard(extractedText)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400"><Copy className="w-4 h-4" /></button>
                    <button onClick={() => { setAiText(extractedText); setActiveTab('ai'); }} className="p-2 hover:bg-indigo-50 rounded-lg text-indigo-500"><Send className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="p-6">
                  <textarea value={extractedText} onChange={(e) => setExtractedText(e.target.value)} className="w-full h-48 text-sm bg-gray-50 rounded-xl p-4 border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-y" />
                </div>
                <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
                  <button onClick={() => exportAsTxt(extractedText, fileName || 'texto')} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium flex items-center gap-2"><FileOutput className="w-4 h-4" />TXT</button>
                  <button onClick={() => exportAsDocx(extractedText, fileName || 'texto')} className="px-4 py-2 bg-blue-100 hover:bg-blue-200 rounded-xl text-sm font-medium text-blue-700 flex items-center gap-2"><FileOutput className="w-4 h-4" />DOCX</button>
                  <button onClick={() => exportAsPdf(extractedText, fileName || 'texto')} className="px-4 py-2 bg-red-100 hover:bg-red-200 rounded-xl text-sm font-medium text-red-700 flex items-center gap-2"><FileOutput className="w-4 h-4" />PDF</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB: CHAT IA ==================== */}
        {activeTab === 'chat' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 220px)', minHeight: '400px' }}>
            {/* Chat Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Bot className="w-4 h-4 text-indigo-500" />
                Chat com IA
                <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">
                  {ENGINES.find(e => e.id === translationEngine)?.emoji} {ENGINES.find(e => e.id === translationEngine)?.label}
                </span>
              </h3>
              {chatMessages.length > 0 && (
                <button onClick={() => setChatMessages([])} className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1">
                  <Trash2 className="w-3 h-3" /> Limpar
                </button>
              )}
            </div>

            {/* Chat Messages */}
            <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatMessages.length === 0 && (
                <div className="text-center text-gray-400 py-12">
                  <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Envie uma mensagem ou arquivo para começar</p>
                  <p className="text-xs mt-2">Suporta imagens, PDFs, DOCX, XLSX, vídeos...</p>
                </div>
              )}
              
              {chatMessages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${msg.role === 'user' ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-700'}`}>
                    {/* Files */}
                    {msg.files && msg.files.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {msg.files.map((file, i) => (
                          <div key={i} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg ${msg.role === 'user' ? 'bg-white/20' : 'bg-gray-200'}`}>
                            {file.type.startsWith('image/') ? <ImageIcon className="w-3 h-3" /> : file.type.startsWith('video/') ? <FileVideo className="w-3 h-3" /> : <File className="w-3 h-3" />}
                            {file.name.length > 20 ? file.name.slice(0, 20) + '...' : file.name}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Content */}
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    <p className={`text-xs mt-1 ${msg.role === 'user' ? 'text-white/60' : 'text-gray-400'}`}>
                      {msg.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}

              {isChatLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-2xl px-4 py-3">
                    <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                  </div>
                </div>
              )}
            </div>

            {/* File Attachments Preview */}
            {chatFiles.length > 0 && (
              <div className="px-4 py-2 border-t border-gray-100 flex flex-wrap gap-2">
                {chatFiles.map((file, i) => (
                  <div key={i} className="flex items-center gap-2 bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg text-sm">
                    {file.preview && file.type.startsWith('image/') ? (
                      <img src={file.preview} alt="" className="w-6 h-6 rounded object-cover" />
                    ) : file.type.startsWith('video/') ? (
                      <FileVideo className="w-4 h-4" />
                    ) : (
                      <File className="w-4 h-4" />
                    )}
                    <span className="max-w-[100px] truncate">{file.name}</span>
                    <button onClick={() => removeChatFile(i)} className="hover:text-red-500">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Chat Input */}
            <div className="px-4 py-4 border-t border-gray-100">
              <div className="flex gap-2">
                <button onClick={() => chatFileInputRef.current?.click()} className="p-3 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-600">
                  <Paperclip className="w-5 h-5" />
                </button>
                <input ref={chatFileInputRef} type="file" multiple onChange={handleChatFileUpload} accept="image/*,video/*,.pdf,.txt,.md,.csv,.json,.xml,.html,.docx,.xlsx" className="hidden" />
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendChatMessage()}
                  placeholder="Digite sua mensagem..."
                  className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <button onClick={sendChatMessage} disabled={isChatLoading} className="p-3 bg-indigo-500 hover:bg-indigo-600 rounded-xl text-white disabled:opacity-50">
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB: AI TEXT ==================== */}
        {activeTab === 'ai' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'translate' as const, label: 'Traduzir', icon: <Languages className="w-4 h-4" /> },
                { id: 'summarize' as const, label: 'Resumir', icon: <FileText className="w-4 h-4" /> },
                { id: 'grammar' as const, label: 'Gramática', icon: <Type className="w-4 h-4" /> },
                { id: 'improve' as const, label: 'Melhorar', icon: <Wand2 className="w-4 h-4" /> },
              ].map((action) => (
                <button key={action.id} onClick={() => setAiAction(action.id)} className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm font-medium ${aiAction === action.id ? 'bg-indigo-500 text-white shadow-md' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  {action.icon} {action.label}
                </button>
              ))}
            </div>

            {aiAction === 'translate' && (
              <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                {LANGUAGES.map((lang) => <option key={lang.code} value={lang.code}>{lang.name}</option>)}
              </select>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-6">
                <textarea value={aiText} onChange={(e) => setAiText(e.target.value)} placeholder="Cole ou digite o texto aqui..." className="w-full h-40 text-sm bg-gray-50 rounded-xl p-4 border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-y" />
              </div>
              <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
                <button onClick={handleAiAction} disabled={isAiWorking} className="px-6 py-2.5 bg-indigo-500 text-white rounded-xl text-sm font-semibold hover:bg-indigo-600 disabled:opacity-50 flex items-center gap-2">
                  {isAiWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {isAiWorking ? 'Processando...' : 'Processar'}
                </button>
              </div>
            </div>

            {aiResult && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">Resultado</h3>
                  <button onClick={() => copyToClipboard(aiResult)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400"><Copy className="w-4 h-4" /></button>
                </div>
                <div className="p-6">
                  <div className="text-sm bg-indigo-50 rounded-xl p-4 whitespace-pre-wrap border border-indigo-100">{aiResult}</div>
                </div>
                <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
                  <button onClick={() => exportAsTxt(aiResult, 'resultado')} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium flex items-center gap-2"><FileOutput className="w-4 h-4" />TXT</button>
                  <button onClick={() => exportAsDocx(aiResult, 'resultado')} className="px-4 py-2 bg-blue-100 hover:bg-blue-200 rounded-xl text-sm font-medium text-blue-700 flex items-center gap-2"><FileOutput className="w-4 h-4" />DOCX</button>
                  <button onClick={() => exportAsPdf(aiResult, 'resultado')} className="px-4 py-2 bg-red-100 hover:bg-red-200 rounded-xl text-sm font-medium text-red-700 flex items-center gap-2"><FileOutput className="w-4 h-4" />PDF</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB: IMAGE ==================== */}
        {activeTab === 'image' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Palette className="w-4 h-4 text-pink-500" />
                  Gerador de Imagens
                </h3>
                <p className="text-xs text-gray-400 mt-1">Pollinations AI - Gratuito</p>
              </div>
              <div className="p-6 space-y-4">
                <textarea value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} placeholder="Descreva a imagem... (ex: 'um gato astronauta no espaço')" className="w-full h-28 text-sm bg-gray-50 rounded-xl p-4 border border-gray-200 focus:ring-2 focus:ring-pink-500 outline-none resize-y" />
                <button onClick={handleGenerateImage} disabled={isGeneratingImage} className="w-full px-6 py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                  {isGeneratingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                  {isGeneratingImage ? 'Gerando...' : 'Gerar Imagem'}
                </button>
              </div>
            </div>

            {generatedImage && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">Imagem Gerada</h3>
                  <a href={generatedImage} download className="px-4 py-2 bg-indigo-100 hover:bg-indigo-200 rounded-xl text-sm font-medium text-indigo-700 flex items-center gap-2">
                    <DownloadCloud className="w-4 h-4" />Download
                  </a>
                </div>
                <div className="p-6">
                  <img src={generatedImage} alt="Generated" className="w-full rounded-xl border border-gray-100" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB: AUDIO ==================== */}
        {activeTab === 'audio' && (
          <div className="space-y-6">
            <div className="flex gap-2 bg-white rounded-2xl p-1.5 shadow-sm border border-gray-200">
              <button onClick={() => setAudioSubTab('tts')} className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium ${audioSubTab === 'tts' ? 'bg-emerald-500 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}>
                <Volume2 className="w-4 h-4" />Texto → Fala
              </button>
              <button onClick={() => setAudioSubTab('stt')} className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium ${audioSubTab === 'stt' ? 'bg-emerald-500 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}>
                <Mic className="w-4 h-4" />Fala → Texto
              </button>
            </div>

            {audioSubTab === 'tts' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
                <textarea value={ttsText} onChange={(e) => setTtsText(e.target.value)} placeholder="Digite o texto para ser falado..." className="w-full h-32 text-sm bg-gray-50 rounded-xl p-4 border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none resize-y" />
                <button onClick={handleTTS} className={`w-full px-6 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 ${isSpeaking ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'}`}>
                  {isSpeaking ? <><StopCircle className="w-4 h-4" />Parar</> : <><Volume2 className="w-4 h-4" />Falar</>}
                </button>
              </div>
            )}

            {audioSubTab === 'stt' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
                <button onClick={handleSTT} className={`w-full px-6 py-8 rounded-2xl font-semibold flex flex-col items-center justify-center gap-3 transition-all ${isRecording ? 'bg-red-50 border-2 border-red-300 text-red-600' : 'bg-emerald-50 border-2 border-emerald-200 text-emerald-600 hover:border-emerald-300'}`}>
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}>
                    <Mic className="w-8 h-8 text-white" />
                  </div>
                  {isRecording ? 'Gravando... Clique para parar' : 'Clique para gravar'}
                </button>

                {sttResult && (
                  <div className="space-y-3">
                    <div className="text-sm bg-gray-50 rounded-xl p-4 whitespace-pre-wrap border border-gray-200 min-h-[100px]">{sttResult}</div>
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => copyToClipboard(sttResult)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium flex items-center gap-2"><Copy className="w-4 h-4" />Copiar</button>
                      <button onClick={() => { setChatInput(sttResult); setActiveTab('chat'); }} className="px-4 py-2 bg-indigo-100 hover:bg-indigo-200 rounded-xl text-sm font-medium text-indigo-700 flex items-center gap-2"><Send className="w-4 h-4" />Enviar ao Chat</button>
                      <button onClick={() => { setAiText(sttResult); setActiveTab('ai'); }} className="px-4 py-2 bg-purple-100 hover:bg-purple-200 rounded-xl text-sm font-medium text-purple-700 flex items-center gap-2"><Sparkles className="w-4 h-4" />Processar</button>
                      <button onClick={() => exportAsTxt(sttResult, 'transcricao')} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium flex items-center gap-2"><FileOutput className="w-4 h-4" />TXT</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200/50 bg-white/50">
        <div className="max-w-5xl mx-auto px-4 py-4 text-center">
          <p className="text-xs text-gray-400">DocuTools Pro — OCR · Chat IA · Tradução · Áudio · Imagem</p>
        </div>
      </footer>
    </div>
  );
}