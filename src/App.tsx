import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  FileText, Volume2, Upload, Loader2, Wand2, Palette, DownloadCloud,
  ImagePlus, Mic, Send, Copy, FileOutput, Languages, Sparkles,
  X, Check, Type, Bot, MessageSquare, Paperclip, Image as ImageIcon,
  FileVideo, File, Trash2, StopCircle, SplitSquareHorizontal, ShieldCheck
} from 'lucide-react';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { jsPDF } from 'jspdf';
import { saveAs } from 'file-saver';
import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import * as mammoth from 'mammoth';
import * as xlsx from 'xlsx';

// Config do Worker do PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// ============================================
// SERVIÇO: CHAMADA PARA NOSSA PRÓPRIA API (VERCEL)
// ============================================
async function sendToAI(provider: string, model: string, messages: any[]) {
  const response = await fetch('/api/chat', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, model, messages })
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || `Erro no servidor: ${response.status}`);
  }
  
  return data.answer;
}

// ============================================
// SERVIÇO: EXTRAÇÃO DE TEXTO (UTILS)
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
      return text.trim() || '[PDF escaneado. Use conversão para imagem para rodar o OCR.]';
    } catch (e) { return '[Erro ao ler o PDF]'; }
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
// CONSTANTES E CONFIGURAÇÕES DE MODELOS
// ============================================
type TabType = 'extract' | 'chat' | 'compare' | 'ai' | 'image' | 'audio';
type AiActionType = 'translate' | 'summarize' | 'grammar' | 'improve';
type AudioSubTabType = 'tts' | 'stt';

const ENGINES = [
  { id: 'deepseek', provider: 'openrouter', model: 'deepseek/deepseek-chat', label: 'DeepSeek', emoji: '🧠' },
  { id: 'qwen', provider: 'openrouter', model: 'qwen/qwen-2.5-72b-instruct', label: 'Qwen', emoji: '🚀' },
  { id: 'claude', provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet', label: 'Claude', emoji: '🎯' },
  { id: 'gemini', provider: 'gemini', model: 'gemini-1.5-flash', label: 'Gemini', emoji: '💎' },
  { id: 'groq', provider: 'groq', model: 'llama-3.1-70b-versatile', label: 'Groq', emoji: '⚡' },
];

const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'extract', label: 'OCR & Docs', icon: <FileText className="w-4 h-4" /> },
  { id: 'chat', label: 'Chat', icon: <MessageSquare className="w-4 h-4" /> },
  { id: 'compare', label: 'Comparar', icon: <SplitSquareHorizontal className="w-4 h-4" /> },
  { id: 'ai', label: 'Ferramentas', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'image', label: 'Imagem', icon: <ImagePlus className="w-4 h-4" /> },
  { id: 'audio', label: 'Áudio', icon: <Volume2 className="w-4 h-4" /> },
];

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [isFading, setIsFading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('extract');
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const [selectedEngineId, setSelectedEngineId] = useState(() => localStorage.getItem('docutools_engine') || 'deepseek');
  const currentEngine = ENGINES.find(e => e.id === selectedEngineId) || ENGINES[0];

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [extractedText, setExtractedText] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatFiles, setChatFiles] = useState<any[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const [comparePrompt, setComparePrompt] = useState('');
  const [compareResults, setCompareResults] = useState<any[]>([]);
  const [isComparing, setIsComparing] = useState(false);

  const [aiText, setAiText] = useState('');
  const [aiResult, setAiResult] = useState('');
  const [isAiWorking, setIsAiWorking] = useState(false);
  const [aiAction, setAiAction] = useState<AiActionType>('translate');

  const showNotification = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  useEffect(() => {
    localStorage.setItem('docutools_engine', selectedEngineId);
  }, [selectedEngineId]);

  useEffect(() => {
    if (chatContainerRef.current) chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
  }, [chatMessages]);

  useEffect(() => {
    const timer = setTimeout(() => { setIsFading(true); setTimeout(() => setShowSplash(false), 500); }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const handleChatFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      try {
        let content = '';
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          content = await new Promise((res) => { reader.onload = () => res(reader.result as string); reader.readAsDataURL(file); });
        } else {
          content = await extractTextFromFile(file, () => {});
        }
        setChatFiles(prev => [...prev, { name: file.name, type: file.type, content }]);
      } catch (err) { showNotification(`Erro em ${file.name}`, 'error'); }
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() && chatFiles.length === 0) return;

    const userMsg = { id: Date.now().toString(), role: 'user', content: chatInput, files: [...chatFiles] };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput(''); setChatFiles([]); setIsChatLoading(true);

    try {
      let prompt = userMsg.content;
      if (userMsg.files.length > 0) {
        let textContext = prompt + '\n\n';
        for (const file of userMsg.files) {
           if (!file.type.startsWith('image/')) {
             textContext += `[Arquivo: ${file.name}]\n${file.content}\n`;
           }
        }
        prompt = textContext;
      }

      const messages = [
        { role: 'system', content: 'Você é o DocuTools Pro, um assistente inteligente. Responda em português.' },
        ...chatMessages.slice(-6).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: prompt }
      ];

      const answer = await sendToAI(currentEngine.provider, currentEngine.model, messages);
      setChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: answer }]);
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleCompare = async () => {
    if (!comparePrompt.trim()) return;
    setIsComparing(true); setCompareResults([]);

    const modelsToTest = [
      { id: 'claude', provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
      { id: 'deepseek', provider: 'openrouter', model: 'deepseek/deepseek-chat' },
      { id: 'gemini', provider: 'gemini', model: 'gemini-1.5-flash' }
    ];

    try {
      const messages = [{ role: 'user', content: comparePrompt }];
      const results = await Promise.all(
        modelsToTest.map(async (m) => {
          try {
             const answer = await sendToAI(m.provider, m.model, messages);
             return { name: m.id, text: answer };
          } catch (e: any) {
             return { name: m.id, text: `⚠️ Erro: ${e.message}` };
          }
        })
      );
      setCompareResults(results);
    } finally {
      setIsComparing(false);
    }
  };

  if (showSplash) {
    return (
      <div className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-900 transition-opacity duration-500 ${isFading ? 'opacity-0' : 'opacity-100'}`}>
        <div className="text-center text-white">
          <ShieldCheck className="w-16 h-16 mx-auto mb-4 text-emerald-400" />
          <h1 className="text-3xl font-bold">DocuTools Pro</h1>
          <p className="opacity-80 mt-2">API Segura na Vercel</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-medium ${notification.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
          {notification.msg}
        </div>
      )}

      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">DocuTools Hub</h1>
              <p className="text-xs text-gray-500">Zero keys no navegador</p>
            </div>
          </div>
          <div className="hidden sm:flex gap-2">
            {ENGINES.map((engine) => (
              <button 
                key={engine.id} 
                onClick={() => setSelectedEngineId(engine.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedEngineId === engine.id ? 'bg-slate-900 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {engine.emoji} {engine.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="sm:hidden px-4 py-2 bg-white border-b overflow-x-auto whitespace-nowrap">
         {ENGINES.map((engine) => (
            <button key={engine.id} onClick={() => setSelectedEngineId(engine.id)} className={`px-3 py-1.5 mr-2 rounded-lg text-sm font-medium inline-block ${selectedEngineId === engine.id ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}>
              {engine.emoji} {engine.label}
            </button>
         ))}
      </div>

      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex gap-1 bg-white rounded-2xl p-1.5 shadow-sm border overflow-x-auto">
          {TABS.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}>
              {tab.icon} <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 pb-8 space-y-6">
        
        {activeTab === 'chat' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[65vh]">
            <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <span className="font-semibold flex items-center gap-2 text-slate-700">
                <Bot className="w-5 h-5"/> Usando {currentEngine.label} 
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1"><ShieldCheck className="w-3 h-3"/> API Oculta</span>
              </span>
              <button onClick={() => setChatMessages([])} className="text-sm text-slate-400 hover:text-red-500">Limpar</button>
            </div>
            
            <div ref={chatContainerRef} className="flex-1 p-6 overflow-y-auto space-y-4">
              {chatMessages.length === 0 && (
                <div className="text-center text-slate-400 mt-10">Inicie a conversa com a inteligência do {currentEngine.label}.</div>
              )}
              {chatMessages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-4 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-800'}`}>
                     <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              ))}
              {isChatLoading && <div className="flex"><div className="bg-slate-100 p-4 rounded-2xl"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div></div>}
            </div>

            <div className="p-4 border-t">
               <div className="flex gap-2">
                 <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChatMessage()} className="flex-1 bg-slate-50 border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-slate-900" placeholder="Mensagem..." />
                 <button onClick={sendChatMessage} className="bg-slate-900 text-white px-5 rounded-xl hover:bg-slate-800"><Send className="w-5 h-5" /></button>
               </div>
            </div>
          </div>
        )}

        {activeTab === 'compare' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow border p-6">
              <h2 className="text-lg font-semibold mb-2">Arena de Modelos</h2>
              <p className="text-sm text-slate-500 mb-4">Prompt único disparado para o servidor Vercel testando Claude, DeepSeek e Gemini ao mesmo tempo.</p>
              <textarea value={comparePrompt} onChange={(e) => setComparePrompt(e.target.value)} placeholder="Ex: Explique física quântica para uma criança..." className="w-full h-24 p-4 border rounded-xl text-sm bg-slate-50 focus:ring-slate-900 outline-none mb-4" />
              <button onClick={handleCompare} disabled={isComparing || !comparePrompt} className="w-full py-3 bg-slate-900 text-white rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                {isComparing ? <Loader2 className="w-5 h-5 animate-spin" /> : <SplitSquareHorizontal className="w-5 h-5" />} Disparar
              </button>
            </div>

            {compareResults.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {compareResults.map((res, idx) => (
                  <div key={idx} className="bg-white rounded-2xl shadow border flex flex-col h-[500px]">
                    <div className="p-3 bg-slate-50 border-b font-bold text-slate-700 capitalize rounded-t-2xl">{res.name}</div>
                    <div className="p-4 flex-1 overflow-y-auto text-sm text-slate-600 whitespace-pre-wrap">{res.text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'extract' && (
           <div className="space-y-6">
             <div onClick={() => fileInputRef.current?.click()} className="bg-white rounded-2xl shadow-sm border-2 border-dashed border-indigo-200 hover:border-indigo-400 cursor-pointer p-10 text-center transition-colors">
               <input ref={fileInputRef} type="file" onChange={async (e) => {
                 const file = e.target.files?.[0];
                 if (!file) return;
                 setFileName(file.name); setIsProcessing(true); setProgress(0); setExtractedText('');
                 try {
                   const text = await extractTextFromFile(file, setProgress);
                   setExtractedText(text); showNotification('Documento processado!');
                 } catch(err) { showNotification('Erro na extração', 'error'); } 
                 finally { setIsProcessing(false); setProgress(100); }
               }} accept="image/*,.pdf,.txt,.docx,.xlsx,.csv" className="hidden" />
               <Upload className="w-12 h-12 mx-auto text-indigo-500 mb-4" />
               <p className="text-lg font-semibold text-gray-700">Clique para upload de documento</p>
               <p className="text-sm text-gray-400">Extrai de: Imagens, PDF, TXT, DOCX, XLSX</p>
             </div>
             
             {isProcessing && (
               <div className="bg-white rounded-xl p-6 shadow border"><p>Lendo {fileName} ({progress}%)...</p></div>
             )}
             {extractedText && !isProcessing && (
               <div className="bg-white rounded-2xl shadow border p-6">
                  <textarea value={extractedText} onChange={e => setExtractedText(e.target.value)} className="w-full h-64 text-sm bg-gray-50 p-4 border rounded-xl" />
                  <div className="mt-4 flex gap-2">
                     <button onClick={() => { setChatInput(extractedText); setActiveTab('chat'); }} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-medium">Analisar no Chat</button>
                  </div>
               </div>
             )}
           </div>
        )}
      </main>
    </div>
  );
}