import React, { useState, useRef, useEffect } from 'react';
import {
  FileText, Image as ImageIcon, Volume2, Upload,
  Loader2, FilePlus, Key, Wand2, Palette, DownloadCloud,
  ImagePlus, Paintbrush, Mic, Send, Settings, Copy, FileOutput,
  Languages, Sparkles
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

  // OmniRoute
  const [omniRouteUrl, setOmniRouteUrl] = useState(() => localStorage.getItem('docutools_omniroute_url') || '');
  const [omniRouteKey, setOmniRouteKey] = useState(() => localStorage.getItem('docutools_omniroute_key') || '');

  // IA Visual
  const [visualTab, setVisualTab] = useState<VisualTabType>('generate');
  const [imagePrompt, setImagePrompt] = useState('');
  const [generatedImage, setGeneratedImage] = useState('');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [pollinationsKey] = useState(() => localStorage.getItem('docutools_pollinations_key') || '');
  const [editSourceImage, setEditSourceImage] = useState<File | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const editImageInputRef = useRef<HTMLInputElement>(null);

  // Áudio
  const [ttsLang, setTtsLang] = useState('pt-BR');
  const [ttsRate, setTtsRate] = useState(1);
  const [audioSubTab, setAudioSubTab] = useState<AudioSubTabType>('tts');
  const [sttFile, setSttFile] = useState<File | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribedText, setTranscribedText] = useState('');
  const sttFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { localStorage.setItem('docutools_apikey', apiKey); }, [apiKey]);
  useEffect(() => { localStorage.setItem('docutools_pollinations_key', pollinationsKey); }, [pollinationsKey]);
  useEffect(() => { localStorage.setItem('docutools_omniroute_url', omniRouteUrl); }, [omniRouteUrl]);
  useEffect(() => { localStorage.setItem('docutools_omniroute_key', omniRouteKey); }, [omniRouteKey]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsProcessing(true);
    setProgress(10);

    try {
      const text = await extractTextFromFile(file);
      setExtractedText(text);
      setProgress(100);
    } catch (err) {
      console.error(err);
      alert('Erro ao processar arquivo.');
    } finally {
      setTimeout(() => {
        setIsProcessing(false);
        setProgress(0);
      }, 500);
    }
  };

  const handleAiAction = async () => {
    const textToProcess = extractedText || aiText;
    if (!textToProcess) return alert('Nenhum texto para processar.');
    
    setIsAiWorking(true);
    // Simulação de processamento se não houver chave real
    // Em um app real, aqui chamaria o endpoint da API escolhida
    setTimeout(() => {
      setAiText(`[Simulação ${aiAction}]: ${textToProcess.substring(0, 100)}...`);
      setIsAiWorking(false);
    }, 2000);
  };

  const handleGenerateImage = async () => {
    if (!imagePrompt) return;
    setIsGeneratingImage(true);
    try {
      // Pollinations simple URL generation
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random() * 1000000)}`;
      setGeneratedImage(url);
    } catch (err) {
      alert('Erro ao gerar imagem.');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleDownload = (format: 'pdf' | 'docx' | 'txt') => {
    const text = aiText || extractedText || transcribedText;
    if (!text) return;

    if (format === 'txt') {
      const blob = new Blob([text], { type: 'text/plain' });
      saveAs(blob, `docutools_${Date.now()}.txt`);
    } else if (format === 'pdf') {
      const doc = new jsPDF();
      const splitText = doc.splitTextToSize(text, 180);
      doc.text(splitText, 10, 10);
      doc.save(`docutools_${Date.now()}.pdf`);
    } else if (format === 'docx') {
      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              children: [new TextRun(text)],
            }),
          ],
        }],
      });
      Packer.toBlob(doc).then(blob => {
        saveAs(blob, `docutools_${Date.now()}.docx`);
      });
    }
  };

  const speak = async () => {
    const text = aiText || extractedText || transcribedText;
    if (!text.trim()) return;

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
          const audio = new Audio(url);
          audio.play();
          return;
        }
      } catch (e) {
        console.error("OmniRoute error:", e);
      }
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = ttsLang;
    utterance.rate = ttsRate;
    window.speechSynthesis.speak(utterance);
  };

  if (showSplash) {
    return (
      <div className={`fixed inset-0 bg-blue-600 flex flex-col items-center justify-center transition-opacity duration-500 ${isFading ? 'opacity-0' : 'opacity-100'} z-50`}>
        <div className="bg-white p-6 rounded-3xl shadow-2xl animate-bounce">
          <Wand2 className="w-16 h-16 text-blue-600" />
        </div>
        <h1 className="text-white text-3xl font-bold mt-8 tracking-tight">DocuTools Pro</h1>
        <p className="text-blue-100 mt-2">Sua central de documentos inteligente</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-24 relative overflow-x-hidden">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-xl">
            <Wand2 className="w-6 h-6 text-white" />
          </div>
          <h2 className="font-bold text-xl tracking-tight">DocuTools <span className="text-blue-600">Pro</span></h2>
        </div>
        <button onClick={() => setActiveTab('ai')} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
          <Settings className="w-6 h-6 text-slate-500" />
        </button>
      </header>

      <main className="max-w-4xl mx-auto p-4 md:p-8">
        {/* Navigation Tabs */}
        <div className="flex overflow-x-auto gap-2 mb-8 no-scrollbar pb-2">
          <TabButton active={activeTab === 'extract'} onClick={() => setActiveTab('extract')} icon={<FileText />} label="OCR / Extrair" />
          <TabButton active={activeTab === 'ai'} onClick={() => setActiveTab('ai')} icon={<Sparkles />} label="IA Texto" />
          <TabButton active={activeTab === 'visual-ai'} onClick={() => setActiveTab('visual-ai')} icon={<ImageIcon />} label="IA Visual" />
          <TabButton active={activeTab === 'audio'} onClick={() => setActiveTab('audio')} icon={<Volume2 />} label="Áudio / TTS" />
        </div>

        {/* Content Area */}
        <div className="space-y-6">
          {activeTab === 'extract' && (
            <div className="bg-white rounded-3xl border shadow-sm p-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold mb-2">Extração Inteligente</h3>
                <p className="text-slate-500">Transforme imagens e documentos em texto editável.</p>
              </div>

              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 rounded-3xl p-12 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all group"
              >
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,application/pdf,text/plain" />
                <div className="bg-blue-100 p-4 rounded-2xl mb-4 group-hover:scale-110 transition-transform">
                  <Upload className="w-8 h-8 text-blue-600" />
                </div>
                <p className="font-medium text-slate-700">Clique para upload ou arraste aqui</p>
                <p className="text-sm text-slate-400 mt-1">Imagens, PDF ou TXT</p>
              </div>

              {isProcessing && (
                <div className="mt-8">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-medium">Processando {fileName}...</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}

              {extractedText && (
                <div className="mt-8 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold flex items-center gap-2">
                      <FilePlus className="w-4 h-4" /> Texto Extraído
                    </h4>
                    <div className="flex gap-2">
                      <button onClick={() => { navigator.clipboard.writeText(extractedText); alert('Copiado!'); }} className="p-2 hover:bg-slate-100 rounded-lg"><Copy className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <textarea 
                    value={extractedText} 
                    onChange={(e) => setExtractedText(e.target.value)}
                    className="w-full h-64 p-4 border rounded-2xl bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  />
                  <div className="flex flex-wrap gap-2">
                    <ExportButton icon={<DownloadCloud />} label="Baixar PDF" onClick={() => handleDownload('pdf')} />
                    <ExportButton icon={<FileOutput />} label="Baixar DOCX" onClick={() => handleDownload('docx')} />
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="bg-white rounded-3xl border shadow-sm p-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="mb-6">
                <h3 className="text-2xl font-bold mb-2">Processamento de Linguagem</h3>
                <p className="text-slate-500">Tradução, Resumo e Correção com IA.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="space-y-4">
                  <label className="text-sm font-bold flex items-center gap-2"><Key className="w-4 h-4" /> Configurações de API</label>
                  <select 
                    value={translationEngine} 
                    onChange={(e) => setTranslationEngine(e.target.value as EngineType)}
                    className="w-full p-3 border rounded-xl bg-slate-50 outline-none"
                  >
                    <option value="google">Google Translate (Livre)</option>
                    <option value="openai">OpenAI (GPT-4o)</option>
                    <option value="gemini">Google Gemini</option>
                    <option value="groq">Groq (Llama 3)</option>
                  </select>
                  <input 
                    type="password" 
                    placeholder="Sua Chave API" 
                    value={apiKey} 
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full p-3 border rounded-xl bg-slate-50 outline-none"
                  />
                </div>
                <div className="space-y-4">
                  <label className="text-sm font-bold flex items-center gap-2"><Languages className="w-4 h-4" /> Ação e Idioma</label>
                  <div className="flex gap-2">
                    <select 
                      value={aiAction} 
                      onChange={(e) => setAiAction(e.target.value as AiActionType)}
                      className="flex-1 p-3 border rounded-xl bg-slate-50 outline-none"
                    >
                      <option value="translate">Traduzir</option>
                      <option value="summarize">Resumir</option>
                      <option value="grammar">Gramática</option>
                      <option value="improve">Melhorar Estilo</option>
                    </select>
                    {aiAction === 'translate' && (
                      <select 
                        value={targetLang} 
                        onChange={(e) => setTargetLang(e.target.value)}
                        className="flex-1 p-3 border rounded-xl bg-slate-50 outline-none"
                      >
                        <option value="en">Inglês</option>
                        <option value="pt">Português</option>
                        <option value="es">Espanhol</option>
                        <option value="fr">Francês</option>
                        <option value="de">Alemão</option>
                      </select>
                    )}
                  </div>
                  <button 
                    onClick={handleAiAction}
                    disabled={isAiWorking}
                    className="w-full bg-blue-600 text-white p-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {isAiWorking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
                    Executar Ação IA
                  </button>
                </div>
              </div>

              <textarea 
                placeholder="Insira o texto aqui para processar..."
                value={aiText || extractedText}
                onChange={(e) => setAiText(e.target.value)}
                className="w-full h-64 p-4 border rounded-2xl bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none resize-none mb-4"
              />
              
              <div className="flex flex-wrap gap-2">
                <ExportButton icon={<DownloadCloud />} label="Salvar PDF" onClick={() => handleDownload('pdf')} />
                <button onClick={speak} className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl font-medium transition-colors">
                  <Volume2 className="w-4 h-4" /> Ouvir Texto
                </button>
              </div>
            </div>
          )}

          {activeTab === 'visual-ai' && (
            <div className="bg-white rounded-3xl border shadow-sm p-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="flex gap-4 border-b mb-6">
                <button 
                  onClick={() => setVisualTab('generate')}
                  className={`pb-2 px-2 font-bold border-b-2 transition-colors ${visualTab === 'generate' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'}`}
                >
                  Gerar Imagem
                </button>
                <button 
                  onClick={() => setVisualTab('edit')}
                  className={`pb-2 px-2 font-bold border-b-2 transition-colors ${visualTab === 'edit' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'}`}
                >
                  Editar (IA)
                </button>
              </div>

              {visualTab === 'generate' ? (
                <div className="space-y-6">
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Descreva a imagem que deseja criar..."
                      value={imagePrompt}
                      onChange={(e) => setImagePrompt(e.target.value)}
                      className="flex-1 p-4 border rounded-2xl bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button 
                      onClick={handleGenerateImage}
                      disabled={isGeneratingImage}
                      className="bg-blue-600 text-white px-6 rounded-2xl font-bold flex items-center justify-center hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isGeneratingImage ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
                    </button>
                  </div>

                  {generatedImage && (
                    <div className="relative group rounded-3xl overflow-hidden shadow-lg border">
                      <img src={generatedImage} alt="Generated" className="w-full aspect-square object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                        <a 
                          href={generatedImage} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          download="generated.png"
                          className="bg-white p-4 rounded-2xl text-slate-900 font-bold flex items-center gap-2 hover:scale-105 transition-transform"
                        >
                          <DownloadCloud /> Baixar
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  <div 
                    onClick={() => editImageInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-200 rounded-3xl p-10 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all"
                  >
                    <input type="file" ref={editImageInputRef} onChange={(e) => setEditSourceImage(e.target.files?.[0] || null)} className="hidden" accept="image/*" />
                    <ImagePlus className="w-8 h-8 text-slate-400 mb-2" />
                    <p className="font-medium">{editSourceImage ? editSourceImage.name : 'Selecionar Imagem Original'}</p>
                  </div>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="O que deseja alterar na imagem?"
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      className="flex-1 p-4 border rounded-2xl bg-slate-50 outline-none"
                    />
                    <button 
                      onClick={() => alert('Edição de imagem requer API específica (DALL-E 3 Edit).')}
                      className="bg-blue-600 text-white px-6 rounded-2xl font-bold flex items-center"
                    >
                      <Paintbrush className="w-6 h-6" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'audio' && (
            <div className="bg-white rounded-3xl border shadow-sm p-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="mb-6 p-4 bg-blue-50 rounded-2xl">
                <p className="text-xs font-bold mb-2 uppercase tracking-wider text-blue-600">OmniRoute Cloud (Premium)</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input type="text" placeholder="URL do OmniRoute" value={omniRouteUrl} onChange={e => setOmniRouteUrl(e.target.value)} className="p-3 border rounded-xl bg-white text-sm" />
                  <input type="password" placeholder="Chave API" value={omniRouteKey} onChange={e => setOmniRouteKey(e.target.value)} className="p-3 border rounded-xl bg-white text-sm" />
                </div>
              </div>

              <div className="flex gap-4 border-b mb-6">
                <button 
                  onClick={() => setAudioSubTab('tts')}
                  className={`pb-2 px-2 font-bold border-b-2 transition-colors ${audioSubTab === 'tts' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'}`}
                >
                  Texto para Voz (TTS)
                </button>
                <button 
                  onClick={() => setAudioSubTab('stt')}
                  className={`pb-2 px-2 font-bold border-b-2 transition-colors ${audioSubTab === 'stt' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'}`}
                >
                  Voz para Texto (STT)
                </button>
              </div>

              {audioSubTab === 'tts' ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold">Idioma/Voz</label>
                      <select 
                        value={ttsLang} 
                        onChange={(e) => setTtsLang(e.target.value)}
                        className="w-full p-3 border rounded-xl bg-slate-50"
                      >
                        <option value="pt-BR">Português (Brasil)</option>
                        <option value="en-US">Inglês (EUA)</option>
                        <option value="es-ES">Espanhol (Espanha)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold">Velocidade: {ttsRate}x</label>
                      <input 
                        type="range" 
                        min="0.5" max="2" step="0.1" 
                        value={ttsRate} 
                        onChange={(e) => setTtsRate(parseFloat(e.target.value))}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 mt-4" 
                      />
                    </div>
                  </div>
                  <textarea 
                    placeholder="Texto para narrar..."
                    value={aiText || extractedText}
                    onChange={(e) => setAiText(e.target.value)}
                    className="w-full h-48 p-4 border rounded-2xl bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  />
                  <button 
                    onClick={speak}
                    className="w-full bg-blue-600 text-white p-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700"
                  >
                    <Volume2 className="w-6 h-6" /> Iniciar Narração
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div 
                    onClick={() => sttFileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-200 rounded-3xl p-12 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all"
                  >
                    <input type="file" ref={sttFileInputRef} onChange={(e) => setSttFile(e.target.files?.[0] || null)} className="hidden" accept="audio/*" />
                    <div className="bg-red-50 p-4 rounded-2xl mb-4">
                      <Mic className="w-8 h-8 text-red-500" />
                    </div>
                    <p className="font-medium">{sttFile ? sttFile.name : 'Upload de Áudio para Transcrição'}</p>
                    <p className="text-sm text-slate-400 mt-1">MP3, WAV, M4A</p>
                  </div>
                  <button 
                    onClick={() => {
                      setIsTranscribing(true);
                      setTimeout(() => {
                        setTranscribedText("Transcrição simulada: O DocuTools Pro é uma ferramenta versátil para produtividade com documentos.");
                        setIsTranscribing(false);
                      }, 2000);
                    }}
                    disabled={!sttFile || isTranscribing}
                    className="w-full bg-slate-900 text-white p-4 rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isTranscribing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />}
                    Transcrever Áudio
                  </button>

                  {transcribedText && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold">Resultado da Transcrição</h4>
                        <button onClick={() => { navigator.clipboard.writeText(transcribedText); alert('Copiado!'); }} className="p-2 hover:bg-slate-100 rounded-lg"><Copy className="w-4 h-4" /></button>
                      </div>
                      <div className="p-4 bg-slate-50 border rounded-2xl text-slate-700">
                        {transcribedText}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-6 py-3 flex items-center justify-between z-40 max-w-4xl mx-auto md:rounded-t-3xl md:mb-4 md:shadow-2xl">
        <NavButton active={activeTab === 'extract'} onClick={() => setActiveTab('extract')} icon={<FileText />} label="OCR" />
        <NavButton active={activeTab === 'ai'} onClick={() => setActiveTab('ai')} icon={<Sparkles />} label="IA" />
        <div className="relative -top-8">
          <button 
            onClick={() => setActiveTab('visual-ai')}
            className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all ${activeTab === 'visual-ai' ? 'bg-blue-600 scale-110' : 'bg-slate-900 hover:bg-blue-600'}`}
          >
            <ImageIcon className="w-8 h-8 text-white" />
          </button>
        </div>
        <NavButton active={activeTab === 'audio'} onClick={() => setActiveTab('audio')} icon={<Volume2 />} label="Áudio" />
        <NavButton active={activeTab === 'image'} onClick={() => setActiveTab('visual-ai')} icon={<Palette />} label="Visual" />
      </nav>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactElement, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold whitespace-nowrap transition-all ${active ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-500 hover:bg-slate-100 border'}`}
    >
      {React.cloneElement(icon, { size: 20 } as any)}
      {label}
    </button>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactElement, label: string }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-colors ${active ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
      {React.cloneElement(icon, { size: 24 } as any)}
      <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
    </button>
  );
}

function ExportButton({ icon, label, onClick }: { icon: React.ReactElement, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:border-blue-400 hover:text-blue-600 rounded-xl font-medium transition-all"
    >
      {React.cloneElement(icon, { size: 16 } as any)}
      {label}
    </button>
  );
}
