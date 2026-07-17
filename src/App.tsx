```react
import React, { useState, useEffect } from 'react';
import { 
  Languages, 
  Image as ImageIcon, 
  Volume2, 
  Cpu, 
  Key, 
  Trash2, 
  FileText, 
  Download, 
  Copy, 
  Play, 
  Pause, 
  Square, 
  FileImage, 
  XCircle, 
  Info, 
  CheckCircle, 
  RefreshCw, 
  Crop,
  Eye,
  EyeOff,
  UploadCloud,
  Terminal
} from 'lucide-react';
import { extractTextFromFile, translateText } from './lib/utils';
import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import * as docx from 'docx';

type Tab = 'translation' | 'images' | 'audio';
type ImgTool = 'resize' | 'convert' | 'pdf';

interface ModalState {
  show: boolean;
  title: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

export default function App() {
  // Estados Gerais da Aplicação
  const [activeTab, setActiveTab] = useState<Tab>('translation');
  const [activeImgTool, setActiveImgTool] = useState<ImgTool>('resize');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  
  // Tradução & OCR
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('pt');
  const [translationFile, setTranslationFile] = useState<File | null>(null);
  const [fileLabel, setFileLabel] = useState('Selecionar arquivo');
  const [logs, setLogs] = useState<string[]>(['Pronto para upload.']);
  const [progressStatus, setProgressStatus] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [showProgress, setShowProgress] = useState(false);
  const [translationResult, setTranslationResult] = useState('');

  // Imagem - Redimensionar
  const [resizeFile, setResizeFile] = useState<File | null>(null);
  const [resizePreview, setResizePreview] = useState('');
  const [resizeWidth, setResizeWidth] = useState(800);
  const [resizeHeight, setResizeHeight] = useState(600);
  const [resizeAspect, setResizeAspect] = useState(true);
  const [originalAspect, setOriginalAspect] = useState(1);
  const [resizedBlobUrl, setResizedBlobUrl] = useState('');

  // Imagem - Converter
  const [convertFile, setConvertFile] = useState<File | null>(null);
  const [convertPreview, setConvertPreview] = useState('');
  const [convertFormat, setConvertFormat] = useState('image/png');
  const [convertedBlobUrl, setConvertedBlobUrl] = useState('');

  // Imagem - PDF Queue
  const [pdfFiles, setPdfFiles] = useState<Array<{ name: string; dataUrl: string }>>([]);

  // Sintetizador de Voz (TTS)
  const [audioText, setAudioText] = useState('DocuTools Pro transformando seu fluxo de trabalho.');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [ttsRate, setTtsRate] = useState(1);
  const [ttsPitch, setTtsPitch] = useState(1);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Modal Customizado
  const [modal, setModal] = useState<ModalState>({
    show: false,
    title: '',
    message: '',
    type: 'info'
  });

  // Carregar dados salvos no início
  useEffect(() => {
    const savedKey = localStorage.getItem('openai_api_key');
    if (savedKey) {
      setApiKey(savedKey);
    }

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const loadVoices = () => {
        const availableVoices = window.speechSynthesis.getVoices();
        setVoices(availableVoices);
        const ptVoice = availableVoices.find(v => v.lang.startsWith('pt'));
        if (ptVoice) setSelectedVoice(ptVoice.name);
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const triggerLog = (msg: string) => {
    setLogs(prev => [...prev, msg]);
  };

  const showModal = (title: string, message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setModal({ show: true, title, message, type });
  };

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.trim();
    setApiKey(value);
    localStorage.setItem('openai_api_key', value);
  };

  const clearCache = () => {
    localStorage.removeItem('openai_api_key');
    setApiKey('');
    setTranslationFile(null);
    setFileLabel('Selecionar arquivo');
    setTranslationResult('');
    setResizeFile(null);
    setResizePreview('');
    setResizedBlobUrl('');
    setConvertFile(null);
    setConvertPreview('');
    setConvertedBlobUrl('');
    setPdfFiles([]);
    setLogs(['Cache limpo e sistema resetado.']);
    showModal('Redefinido', 'Todas as variáveis e chaves foram limpas do seu navegador.', 'success');
  };

  // Processo principal de Tradução & OCR
  const handleTranslationFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      showModal('Arquivo Excede Limite', 'O tamanho máximo do arquivo suportado é 50 MB.', 'error');
      return;
    }

    setTranslationFile(file);
    setFileLabel(file.name);
    triggerLog(`Arquivo carregado: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`);
  };

  const handleProcessTranslation = async () => {
    if (!translationFile) {
      showModal('Arquivo Ausente', 'Por favor, selecione um arquivo válido primeiro.', 'error');
      return;
    }

    setShowProgress(true);
    setTranslationResult('');
    triggerLog('Iniciando processamento e leitura local...');

    try {
      const extracted = await extractTextFromFile(translationFile, (status, percent) => {
        setProgressStatus(status);
        setProgressPercent(percent);
      });

      if (!extracted.trim()) {
        throw new Error('Não foi possível encontrar nenhum texto no documento selecionado.');
      }

      triggerLog(`Texto extraído com sucesso (${extracted.length} caracteres). Traduzindo...`);
      setProgressStatus('Traduzindo conteúdo...');
      setProgressPercent(75);

      const translated = await translateText(extracted, sourceLang, targetLang, apiKey);
      setTranslationResult(translated);
      triggerLog('Processamento e Tradução concluídos!');
      showModal('Concluído!', 'Seu documento foi processado e traduzido com sucesso.', 'success');
    } catch (err: any) {
      triggerLog(`Erro: ${err.message}`);
      showModal('Falha no Processamento', err.message || 'Erro inesperado ao tratar documento.', 'error');
    } finally {
      setShowProgress(false);
    }
  };

  // Funções de Download
  const handleDownloadTxt = () => {
    if (!translationResult) return;
    const blob = new Blob([translationResult], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, 'DocuTools_Resultado.txt');
  };

  const handleDownloadDocx = async () => {
    if (!translationResult) return;
    triggerLog('Empacotando arquivo DOCX...');

    const paragraphs = translationResult.split('\n').map(line => {
      return new docx.Paragraph({
        children: [new docx.TextRun({ text: line, font: 'Arial' })],
        spacing: { after: 120 }
      });
    });

    const doc = new docx.Document({
      sections: [{
        properties: {},
        children: paragraphs
      }]
    });

    const blob = await docx.Packer.toBlob(doc);
    saveAs(blob, 'DocuTools_Resultado.docx');
    triggerLog('Arquivo DOCX pronto e enviado!');
  };

  // --- Lógicas de Imagem ---
  const handleResizeFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setResizeFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        setResizeWidth(img.width);
        setResizeHeight(img.height);
        setOriginalAspect(img.width / img.height);
        setResizePreview(event.target?.result as string);
        setResizedBlobUrl('');
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleResizeDimensionChange = (val: number, type: 'w' | 'h') => {
    if (type === 'w') {
      setResizeWidth(val);
      if (resizeAspect) {
        setResizeHeight(Math.round(val / originalAspect));
      }
    } else {
      setResizeHeight(val);
      if (resizeAspect) {
        setResizeWidth(Math.round(val * originalAspect));
      }
    }
  };

  const executeResize = () => {
    if (!resizePreview) return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = resizeWidth;
      canvas.height = resizeHeight;
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, resizeWidth, resizeHeight);
        canvas.toBlob((blob) => {
          if (blob) {
            setResizedBlobUrl(URL.createObjectURL(blob));
            showModal('Sucesso', 'Imagem redimensionada.', 'success');
          }
        }, 'image/png');
      }
    };
    img.src = resizePreview;
  };

  const handleConvertFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setConvertFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      setConvertPreview(event.target?.result as string);
      setConvertedBlobUrl('');
    };
    reader.readAsDataURL(file);
  };

  const executeConvert = () => {
    if (!convertPreview) return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      if (ctx) {
        if (convertFormat === 'image/jpeg') {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            setConvertedBlobUrl(URL.createObjectURL(blob));
            showModal('Convertido', `Imagem preparada para o formato ${convertFormat.split('/')[1].toUpperCase()}`, 'success');
          }
        }, convertFormat, 0.9);
      }
    };
    img.src = convertPreview;
  };

  // Gerar PDF a partir de imagens
  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        setPdfFiles(prev => [...prev, {
          name: file.name,
          dataUrl: event.target?.result as string
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const executeGeneratePdf = async () => {
    if (pdfFiles.length === 0) return;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    for (let i = 0; i < pdfFiles.length; i++) {
      if (i > 0) pdf.addPage();
      const img = new Image();
      img.src = pdfFiles[i].dataUrl;
      await new Promise(r => img.onload = r);

      const ratio = Math.min(pageWidth / img.width, pageHeight / img.height);
      const drawW = img.width * ratio;
      const drawH = img.height * ratio;
      const x = (pageWidth - drawW) / 2;
      const y = (pageHeight - drawH) / 2;

      pdf.addImage(pdfFiles[i].dataUrl, 'JPEG', x, y, drawW, drawH);
    }
    pdf.save('DocuTools_Imagens.pdf');
    showModal('PDF Salvo', 'Seu arquivo PDF com as imagens foi gerado e baixado.', 'success');
  };

  // --- Áudio (TTS) ---
  const handleSpeak = () => {
    if (!audioText.trim() || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(audioText);
    const activeVoiceObj = voices.find(v => v.name === selectedVoice);
    if (activeVoiceObj) utterance.voice = activeVoiceObj;

    utterance.rate = ttsRate;
    utterance.pitch = ttsPitch;

    utterance.onstart = () => {
      setIsSpeaking(true);
      setIsPaused(false);
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      setIsPaused(false);
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setIsPaused(false);
    };

    window.speechSynthesis.speak(utterance);
  };

  const handlePause = () => {
    if (!window.speechSynthesis) return;
    if (isSpeaking && !isPaused) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    } else if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    }
  };

  const handleStop = () => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row h-screen overflow-hidden text-slate-100 bg-slate-950 font-sans">
      
      {/* BARRA LATERAL */}
      <aside className="w-full md:w-80 custom-gradient border-b md:border-b-0 md:border-r border-slate-800 p-6 flex flex-col justify-between overflow-y-auto shrink-0">
        <div className="space-y-6">
          <div className="flex items-center space-x-3">
            <div className="bg-indigo-600 p-2.5 rounded-xl shadow-lg shadow-indigo-500/30 flex items-center justify-center">
              <Cpu className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-400 bg-clip-text text-transparent">
                DocuTools Pro
              </h1>
              <p className="text-xs text-indigo-400 font-semibold uppercase tracking-wider">v3.5 React</p>
            </div>
          </div>

          <hr className="border-slate-800" />

          {/* Configuração OpenAI API */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-indigo-400" />
                OpenAI API Key
              </label>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-medium">Local</span>
            </div>
            <div className="relative">
              <input 
                type={showKey ? 'text' : 'password'} 
                value={apiKey}
                onChange={handleApiKeyChange}
                placeholder="sk-..." 
                className="w-full bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all pr-10"
              />
              <button 
                onClick={() => setShowKey(!showKey)} 
                className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Sua chave é mantida apenas na memória interna (<code className="bg-slate-900 px-1 py-0.5 rounded">localStorage</code>) e é utilizada diretamente pelo seu navegador.
            </p>
          </div>

          <hr className="border-slate-800" />

          {/* Status do Sistema */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Atividades locais</h3>
            <div className="bg-slate-900/50 border border-slate-800/60 rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                  Tradução
                </span>
                <span className={`font-medium ${apiKey ? 'text-indigo-400 font-semibold' : 'text-slate-300'}`}>
                  {apiKey ? 'GPT-3.5 Premium' : 'MyMemory API'}
                </span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                  OCR Engine
                </span>
                <span className="font-medium text-slate-300">Tesseract Local</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                  Upload Limite
                </span>
                <span className="font-medium text-slate-300">50 MB</span>
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé Lateral */}
        <div className="pt-6 border-t border-slate-800 space-y-3">
          <button 
            onClick={clearCache} 
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 py-2.5 rounded-xl text-xs font-semibold transition-all"
          >
            <Trash2 className="w-4 h-4" />
            Limpar Cache & Resetar
          </button>
          <p className="text-[10px] text-center text-slate-500">Desenvolvido com processamento seguro</p>
        </div>
      </aside>

      {/* ÁREA DE INTERAÇÃO PRINCIPAL */}
      <main className="flex-1 flex flex-col bg-slate-900 overflow-hidden">
        
        {/* HEADER DE ABAS */}
        <header className="bg-slate-950/80 border-b border-slate-800/80 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 shrink-0">
          <nav className="flex gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800 w-full md:w-auto overflow-x-auto">
            <button 
              onClick={() => setActiveTab('translation')} 
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === 'translation' 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/10' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Languages className="w-4 h-4" />
              Tradução & OCR
            </button>
            <button 
              onClick={() => setActiveTab('images')} 
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === 'images' 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/10' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              Ferramentas de Imagem
            </button>
            <button 
              onClick={() => setActiveTab('audio')} 
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === 'audio' 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/10' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Volume2 className="w-4 h-4" />
              Sintetizador Áudio
            </button>
          </nav>

          <div className="hidden md:flex items-center gap-2 text-xs bg-slate-900 border border-slate-800 px-3.5 py-1.5 rounded-full text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Pronto para processar
          </div>
        </header>

        {/* CONTAINER DINÂMICO DE CONTEÚDO */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          
          {/* ================= ABA 1: TRADUÇÃO & OCR ================= */}
          {activeTab === 'translation' && (
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="flex flex-col md:flex-row gap-6">
                
                {/* Lateral Esquerda - Controles de Upload */}
                <div className="w-full md:w-1/3 space-y-5 shrink-0">
                  <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-5 space-y-5">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-400">Origem & Destino</h2>
                    
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-400 font-medium">Idioma de Origem</label>
                        <select 
                          value={sourceLang} 
                          onChange={(e) => setSourceLang(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="auto">Auto-Detectar</option>
                          <option value="pt">Português</option>
                          <option value="en">Inglês</option>
                          <option value="es">Espanhol</option>
                          <option value="fr">Francês</option>
                          <option value="de">Alemão</option>
                          <option value="it">Italiano</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-400 font-medium">Traduzir Para</label>
                        <select 
                          value={targetLang} 
                          onChange={(e) => setTargetLang(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="pt">Português</option>
                          <option value="en">Inglês</option>
                          <option value="es">Espanhol</option>
                          <option value="fr">Francês</option>
                          <option value="de">Alemão</option>
                          <option value="it">Italiano</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs text-slate-400 font-medium">Documento ou Imagem</label>
                      <div 
                        className="border-2 border-dashed border-slate-800 hover:border-indigo-500 rounded-2xl p-6 text-center cursor-pointer transition-all bg-slate-900/20 hover:bg-indigo-950/10 group relative"
                        onClick={() => document.getElementById('input-file-main')?.click()}
                      >
                        <input 
                          type="file" 
                          id="input-file-main" 
                          className="hidden" 
                          accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp" 
                          onChange={handleTranslationFile} 
                        />
                        <div className="space-y-3">
                          <div className="bg-slate-900 w-12 h-12 rounded-xl flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                            <UploadCloud className="w-6 h-6 text-slate-400 group-hover:text-indigo-400" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-slate-200 truncate max-w-[200px] mx-auto">{fileLabel}</p>
                            <p className="text-[10px] text-slate-500">PDF, DOCX, TXT ou Imagem (Max 50MB)</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <button 
                      onClick={handleProcessTranslation}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-4 rounded-xl text-sm transition-all shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 flex items-center justify-center gap-2"
                    >
                      <Play className="w-4 h-4" />
                      Processar & Traduzir
                    </button>
                  </div>

                  {/* Atividade de Logs */}
                  <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-5 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                      <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                      Console de Atividades
                    </h3>
                    <div className="bg-slate-950/80 rounded-xl p-3 font-mono text-[10px] text-slate-400 h-28 overflow-y-auto space-y-1 border border-slate-900">
                      {logs.map((log, index) => (
                        <div key={index} className="text-slate-300">&gt; {log}</div>
                      ))}
                    </div>

                    {showProgress && (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[10px] font-semibold text-slate-400">
                          <span>{progressStatus}</span>
                          <span>{progressPercent}%</span>
                        </div>
                        <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
                          <div className="bg-indigo-500 h-full transition-all duration-300" style={{ width: `${progressPercent}%` }}></div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Exibição de Resultados à Direita */}
                <div className="flex-1 flex flex-col bg-slate-950/40 border border-slate-800/80 rounded-2xl overflow-hidden min-h-[500px]">
                  <div className="border-b border-slate-800/80 px-5 py-4 bg-slate-950/20 flex items-center justify-between">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Resultado
                    </h3>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(translationResult);
                        showModal('Copiado', 'Resultado copiado para a área de transferência.', 'success');
                      }} 
                      className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>

                  <textarea 
                    value={translationResult}
                    onChange={(e) => setTranslationResult(e.target.value)}
                    placeholder="O texto extraído ou traduzido aparecerá aqui. Você pode editar este conteúdo antes de exportar..." 
                    className="flex-1 w-full bg-transparent p-6 text-sm text-slate-200 placeholder-slate-600 focus:outline-none resize-none font-sans leading-relaxed"
                  />

                  <div className="border-t border-slate-800/80 px-5 py-4 bg-slate-950/20 flex flex-wrap gap-3 items-center justify-end">
                    <button 
                      onClick={handleDownloadTxt}
                      disabled={!translationResult}
                      className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white px-4 py-2 rounded-xl text-xs font-semibold border border-slate-800 transition-all disabled:opacity-45"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Baixar TXT
                    </button>
                    <button 
                      onClick={handleDownloadDocx}
                      disabled={!translationResult}
                      className="flex items-center gap-2 bg-indigo-600/90 hover:bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-45"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Baixar DOCX
                    </button>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* ================= ABA 2: FERRAMENTAS DE IMAGEM ================= */}
          {activeTab === 'images' && (
            <div className="max-w-4xl mx-auto space-y-6">
              
              {/* Menu Interno de Imagens */}
              <div className="flex border-b border-slate-800">
                <button 
                  onClick={() => setActiveImgTool('resize')} 
                  className={`px-5 py-3 text-sm font-semibold transition-all ${
                    activeImgTool === 'resize' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Redimensionar
                </button>
                <button 
                  onClick={() => setActiveImgTool('convert')} 
                  className={`px-5 py-3 text-sm font-semibold transition-all ${
                    activeImgTool === 'convert' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Converter Formato
                </button>
                <button 
                  onClick={() => setActiveImgTool('pdf')} 
                  className={`px-5 py-3 text-sm font-semibold transition-all ${
                    activeImgTool === 'pdf' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Imagens para PDF
                </button>
              </div>

              {/* CONTEÚDO: REDIMENSIONAR */}
              {activeImgTool === 'resize' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6 space-y-5">
                    <div 
                      className="border-2 border-dashed border-slate-800 hover:border-indigo-500 rounded-2xl p-6 text-center cursor-pointer transition-all bg-slate-900/20 group"
                      onClick={() => document.getElementById('input-resize-file')?.click()}
                    >
                      <input 
                        type="file" 
                        id="input-resize-file" 
                        className="hidden" 
                        accept="image/*" 
                        onChange={handleResizeFile} 
                      />
                      <div className="space-y-2">
                        <div className="bg-slate-900 w-11 h-11 rounded-lg flex items-center justify-center mx-auto">
                          <ImageIcon className="w-5 h-5 text-slate-400" />
                        </div>
                        <p className="text-xs font-semibold text-slate-200 truncate max-w-[200px] mx-auto">
                          {resizeFile ? resizeFile.name : 'Carregar imagem'}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-400 font-medium">Largura (px)</label>
                        <input 
                          type="number" 
                          value={resizeWidth} 
                          onChange={(e) => handleResizeDimensionChange(parseInt(e.target.value) || 0, 'w')}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-400 font-medium">Altura (px)</label>
                        <input 
                          type="number" 
                          value={resizeHeight} 
                          onChange={(e) => handleResizeDimensionChange(parseInt(e.target.value) || 0, 'h')}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <input 
                        type="checkbox" 
                        id="resize-aspect" 
                        checked={resizeAspect}
                        onChange={(e) => setResizeAspect(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-800" 
                      />
                      <label htmlFor="resize-aspect" className="text-xs text-slate-300 font-medium cursor-pointer">Manter Proporção Original</label>
                    </div>

                    <button 
                      onClick={executeResize}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-lg flex items-center justify-center gap-2"
                    >
                      <Crop className="w-4 h-4" />
                      Executar Redimensionamento
                    </button>
                  </div>

                  <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6 flex flex-col justify-between items-center min-h-[300px]">
                    <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">Prévia do resultado</span>
                    <div className="flex-1 flex items-center justify-center border border-slate-800/40 rounded-xl overflow-hidden bg-slate-950 p-2 max-h-[280px] w-full">
                      {resizedBlobUrl || resizePreview ? (
                        <img src={resizedBlobUrl || resizePreview} className="max-h-full max-w-full object-contain" />
                      ) : (
                        <div className="text-slate-600 text-xs text-center space-y-1">
                          <ImageIcon className="w-8 h-8 mx-auto opacity-40" />
                          <p>Nenhuma imagem processada</p>
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={() => saveAs(resizedBlobUrl, 'DocuTools_Redimensionado.png')}
                      disabled={!resizedBlobUrl}
                      className="w-full bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white py-2.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-40"
                    >
                      Baixar Imagem Processada
                    </button>
                  </div>
                </div>
              )}

              {/* CONTEÚDO: CONVERTER */}
              {activeImgTool === 'convert' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6 space-y-5">
                    <div 
                      className="border-2 border-dashed border-slate-800 hover:border-indigo-500 rounded-2xl p-6 text-center cursor-pointer transition-all bg-slate-900/20 group"
                      onClick={() => document.getElementById('input-convert-file')?.click()}
                    >
                      <input 
                        type="file" 
                        id="input-convert-file" 
                        className="hidden" 
                        accept="image/*" 
                        onChange={handleConvertFile} 
                      />
                      <div className="space-y-2">
                        <div className="bg-slate-900 w-11 h-11 rounded-lg flex items-center justify-center mx-auto">
                          <ImageIcon className="w-5 h-5 text-slate-400" />
                        </div>
                        <p className="text-xs font-semibold text-slate-200 truncate max-w-[200px] mx-auto">
                          {convertFile ? convertFile.name : 'Carregar imagem'}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 font-medium">Formato Desejado</label>
                      <select 
                        value={convertFormat}
                        onChange={(e) => setConvertFormat(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="image/png">PNG</option>
                        <option value="image/jpeg">JPEG / JPG</option>
                        <option value="image/webp">WEBP</option>
                        <option value="image/bmp">BMP</option>
                      </select>
                    </div>

                    <button 
                      onClick={executeConvert}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-lg flex items-center justify-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Converter Formato
                    </button>
                  </div>

                  <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6 flex flex-col justify-between items-center min-h-[300px]">
                    <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">Prévia do resultado</span>
                    <div className="flex-1 flex items-center justify-center border border-slate-800/40 rounded-xl overflow-hidden bg-slate-950 p-2 max-h-[280px] w-full">
                      {convertedBlobUrl || convertPreview ? (
                        <img src={convertedBlobUrl || convertPreview} className="max-h-full max-w-full object-contain" />
                      ) : (
                        <div className="text-slate-600 text-xs text-center space-y-1">
                          <ImageIcon className="w-8 h-8 mx-auto opacity-40" />
                          <p>Nenhuma imagem processada</p>
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={() => saveAs(convertedBlobUrl, `DocuTools_Convertido.${convertFormat.split('/')[1]}`)}
                      disabled={!convertedBlobUrl}
                      className="w-full bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white py-2.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-40"
                    >
                      Baixar Imagem Convertida
                    </button>
                  </div>
                </div>
              )}

              {/* CONTEÚDO: IMAGENS PARA PDF */}
              {activeImgTool === 'pdf' && (
                <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6 space-y-6">
                  <div 
                    className="border-2 border-dashed border-slate-800 hover:border-indigo-500 rounded-2xl p-8 text-center cursor-pointer transition-all bg-slate-900/20"
                    onClick={() => document.getElementById('input-pdf-files')?.click()}
                  >
                    <input 
                      type="file" 
                      id="input-pdf-files" 
                      className="hidden" 
                      accept="image/png, image/jpeg, image/jpg" 
                      multiple 
                      onChange={handlePdfUpload} 
                    />
                    <div className="space-y-3">
                      <div className="bg-slate-900 w-12 h-12 rounded-xl flex items-center justify-center mx-auto">
                        <FileImage className="w-6 h-6 text-indigo-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-200">Selecionar uma ou mais Imagens</p>
                        <p className="text-xs text-slate-500">Aceita formatos estruturados JPG e PNG</p>
                      </div>
                    </div>
                  </div>

                  {pdfFiles.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Imagens na fila ({pdfFiles.length})</h3>
                        <button 
                          onClick={() => setPdfFiles([])} 
                          className="text-xs text-rose-400 hover:text-rose-300 font-medium flex items-center gap-1"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Limpar fila
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-48 overflow-y-auto p-2 border border-slate-900 rounded-xl bg-slate-950/60">
                        {pdfFiles.map((file, idx) => (
                          <div key={idx} className="bg-slate-900 border border-slate-800 rounded-lg p-2 flex flex-col justify-between space-y-2 relative group">
                            <div className="relative w-full aspect-square bg-slate-950 rounded overflow-hidden">
                              <img src={file.dataUrl} className="w-full h-full object-cover" />
                              <span className="absolute top-1 left-1 bg-indigo-600 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">{idx + 1}</span>
                            </div>
                            <div className="flex items-center justify-between gap-1">
                              <p className="text-[9px] text-slate-400 truncate w-2/3">{file.name}</p>
                              <button 
                                onClick={() => setPdfFiles(prev => prev.filter((_, i) => i !== idx))} 
                                className="text-rose-400 hover:text-rose-300"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <button 
                      onClick={executeGeneratePdf}
                      disabled={pdfFiles.length === 0}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-6 rounded-xl text-sm transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-45"
                    >
                      <FileText className="w-4 h-4" />
                      Gerar Documento PDF
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* ================= ABA 3: SINTETIZADOR DE ÁUDIO ================= */}
          {activeTab === 'audio' && (
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6 md:p-8 space-y-6">
                
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-200">Conversor Texto para Voz</h2>
                    <p class="text-xs text-slate-500 font-medium">Sintetização natural baseada na tecnologia Web Speech nativa</p>
                  </div>
                  <div className="bg-indigo-950/40 border border-indigo-900/60 px-3 py-1.5 rounded-full flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider">Web Speech API</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-medium">Texto para Locução</label>
                  <textarea 
                    value={audioText}
                    onChange={(e) => setAudioText(e.target.value)}
                    placeholder="Cole seu texto editado aqui para iniciar a leitura por voz..." 
                    className="w-full min-h-[140px] bg-slate-900/80 border border-slate-800 rounded-xl p-4 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-sans leading-relaxed"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 font-medium">Idioma / Vozes</label>
                    <select 
                      value={selectedVoice}
                      onChange={(e) => setSelectedVoice(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none"
                    >
                      {voices.map((voice, idx) => (
                        <option key={idx} value={voice.name}>
                          {voice.name} ({voice.lang})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs text-slate-400">
                      <span>Velocidade</span>
                      <span className="font-bold text-indigo-400">{ttsRate}x</span>
                    </div>
                    <input 
                      type="range" 
                      min="0.5" 
                      max="2" 
                      step="0.1" 
                      value={ttsRate}
                      onChange={(e) => setTtsRate(parseFloat(e.target.value))}
                      className="w-full accent-indigo-500 bg-slate-900 rounded-lg h-1.5 cursor-pointer" 
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs text-slate-400">
                      <span>Tom (Pitch)</span>
                      <span className="font-bold text-indigo-400">{ttsPitch}</span>
                    </div>
                    <input 
                      type="range" 
                      min="0.5" 
                      max="2" 
                      step="0.1" 
                      value={ttsPitch}
                      onChange={(e) => setTtsPitch(parseFloat(e.target.value))}
                      className="w-full accent-indigo-500 bg-slate-900 rounded-lg h-1.5 cursor-pointer" 
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-800/60">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={handleSpeak}
                      className={`font-semibold px-6 py-3 rounded-xl text-sm transition-all shadow-lg flex items-center justify-center gap-2 ${
                        isSpeaking && !isPaused ? 'bg-emerald-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                      }`}
                    >
                      <Play className="w-4 h-4" />
                      Falar Texto
                    </button>
                    <button 
                      onClick={handlePause}
                      disabled={!isSpeaking}
                      className="bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 px-4 py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-45"
                    >
                      <Pause className="w-4 h-4" />
                      {isPaused ? 'Retomar' : 'Pausar'}
                    </button>
                    <button 
                      onClick={handleStop}
                      className="bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 px-4 py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
                    >
                      <Square className="w-4 h-4" />
                      Parar
                    </button>
                  </div>
                </div>

              </div>
            </div>
          )}

        </div>
      </main>

      {/* MODAL CUSTOMIZADO (SUBSTITUTO ROBUSTO AO ALERT) */}
      {modal.show && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative space-y-4 m-4">
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-xl flex items-center justify-center shrink-0 ${
                modal.type === 'error' ? 'bg-rose-500/10 text-rose-400' : modal.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-indigo-500/10 text-indigo-400'
              }`}>
                {modal.type === 'error' && <XCircle className="w-6 h-6" />}
                {modal.type === 'success' && <CheckCircle className="w-6 h-6" />}
                {modal.type === 'info' && <Info className="w-6 h-6" />}
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">{modal.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{modal.message}</p>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button 
                onClick={() => setModal(prev => ({ ...prev, show: false }))}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-5 py-2.5 rounded-xl text-xs font-semibold transition-all"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

```