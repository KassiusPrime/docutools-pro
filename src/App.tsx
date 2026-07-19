import React, { useState, useRef, useEffect } from 'react';
import { 
  FileText, Image as ImageIcon, Volume2, Download, Trash2, Upload, 
  Loader2, FileDown, FilePlus, Languages, Key, RefreshCw, Copy, Check, 
  Wand2, Settings2, Globe
} from 'lucide-react';
import { extractTextFromFile } from './lib/utils';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { jsPDF } from 'jspdf';
import { saveAs } from 'file-saver';

type TabType = 'extract' | 'ai' | 'image' | 'audio';
type AiActionType = 'translate' | 'summarize' | 'grammar' | 'improve';
type EngineType = 'openai' | 'google';

export default function App() {
  // ================= ESTADOS DE TELA DE ABERTURA =================
  const [showSplash, setShowSplash] = useState(true);
  const [isFading, setIsFading] = useState(false);

  // Efeito para esconder a tela de abertura após 2.5 segundos
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsFading(true); // Inicia a transição de opacidade
      setTimeout(() => setShowSplash(false), 500); // Remove do DOM após o fade
    }, 2000); // Tempo que a logo fica na tela
    return () => clearTimeout(timer);
  }, []);

  const [activeTab, setActiveTab] = useState<TabType>('extract');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  // Estados - OCR & Extração
  const [extractedText, setExtractedText] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copiedExtract, setCopiedExtract] = useState(false);

  // Estados - IA e Tradução
  const [targetLang, setTargetLang] = useState('en'); 
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('docutools_apikey') || '');
  const [aiText, setAiText] = useState('');
  const [isAiWorking, setIsAiWorking] = useState(false);
  const [aiAction, setAiAction] = useState<AiActionType>('translate');
  const [translationEngine, setTranslationEngine] = useState<EngineType>('google');
  const [copiedAi, setCopiedAi] = useState(false);

  const languageMap: Record<string, string> = {
    'en': 'Inglês', 'es': 'Espanhol', 'fr': 'Francês', 
    'de': 'Alemão', 'it': 'Italiano', 'pt': 'Português'
  };

  // Estados - Imagens
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imageFormat, setImageFormat] = useState('pdf');
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Estados - Áudio
  const [ttsLang, setTtsLang] = useState('pt-BR');
  const [ttsRate, setTtsRate] = useState(1);

  useEffect(() => { localStorage.setItem('docutools_apikey', apiKey); }, [apiKey]);

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

  const handleAiAction = async () => {
    const textToProcess = aiText || extractedText;
    if (!textToProcess.trim()) { alert("Digite ou extraia um texto primeiro."); return; }
    
    setIsAiWorking(true);

    try {
      if (translationEngine === 'google' && aiAction === 'translate') {
        const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(textToProcess)}`);
        const data = await res.json();
        const translated = data[0].map((item: any) => item[0]).join('');
        setAiText(translated);
        setIsAiWorking(false);
        return;
      }

      if (translationEngine === 'openai' || aiAction !== 'translate') {
        if (!apiKey.trim()) { alert("Insira sua chave OpenAI (sk-...) para usar este motor."); setIsAiWorking(false); return; }

        let systemPrompt = "";
        if (aiAction === 'translate') systemPrompt = `Traduza para ${languageMap[targetLang]}. Mantenha a formatação original. Retorne APENAS a tradução.`;
        else if (aiAction === 'summarize') systemPrompt = "Resuma o texto mantendo os pontos principais. Retorne apenas o resumo.";
        else if (aiAction === 'grammar') systemPrompt = "Corrija a gramática e ortografia. Retorne APENAS o texto corrigido.";
        else if (aiAction === 'improve') systemPrompt = "Melhore a fluidez e o vocabulário. Retorne APENAS o texto reescrito.";

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: textToProcess }
            ],
            temperature: 0.3
          })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        setAiText(data.choices[0].message.content);
      }
    } catch (error: any) {
      alert(`Erro no processamento: ${error.message}`);
    } finally {
      setIsAiWorking(false);
    }
  };

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
          const img = new Image(); img.src = objectUrl;
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

  const speak = () => {
    const textToSpeak = aiText || extractedText;
    if (!textToSpeak.trim()) { alert("Nenhum texto para ler."); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = ttsLang; utterance.rate = ttsRate;
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-900 font-sans pb-24 relative overflow-x-hidden">
      
      {/* TELA DE ABERTURA (SPLASH SCREEN) */}
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

      {/* HEADER PRINCIPAL */}
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

      {/* ÁREA PRINCIPAL DAS ABAS */}
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
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
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
              <label className="text-sm font-bold text-slate-700 flex items-center gap-2"><Globe size={18}/> Motor de Processamento:</label>
              <div className="flex bg-white p-1 rounded-lg border">
                <button onClick={() => {setTranslationEngine('google'); setAiAction('translate');}} className={`flex-1 py-2 text-xs font-bold rounded-md ${translationEngine === 'google' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500'}`}>Google (Grátis)</button>
                <button onClick={() => setTranslationEngine('openai')} className={`flex-1 py-2 text-xs font-bold rounded-md ${translationEngine === 'openai' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>OpenAI (Avançado)</button>
              </div>
              {translationEngine === 'openai' && (
                <input type="password" placeholder="Sua Chave API (sk-...)" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="w-full text-sm bg-white border px-3 py-3 rounded-lg outline-none focus:border-indigo-500" />
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
              <textarea value={aiText} readOnly placeholder="Resultado..." className="w-full h-48 p-4 bg-indigo-50/30 border border-indigo-100 rounded-xl text-sm outline-none" />
            </div>
            
            {aiText && (
              <div className="flex gap-2 justify-end border-t pt-4">
                <button onClick={() => copyToClipboard(aiText, 'ai')} className="bg-slate-100 border px-3 py-2 rounded-lg font-bold text-xs flex items-center gap-1">
                  {copiedAi ? <Check size={14} className="text-green-600" /> : <Copy size={14} />} Copiar
                </button>
              </div>
            )}
          </div>
        )}

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
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-6 animate-in fade-in zoom-in-95 duration-200">
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
              <button onClick={speak} className="flex-1 bg-orange-500 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md">
                <Volume2 /> Play
              </button>
              <button onClick={() => window.speechSynthesis.cancel()} className="w-24 sm:w-40 bg-slate-900 text-white py-4 rounded-xl font-bold">
                Stop
              </button>
            </div>
          </div>
        )}
      </main>

      {/* BARRA DE NAVEGAÇÃO INFERIOR */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)] z-50">
        <div className="flex justify-around items-center h-16 max-w-5xl mx-auto px-2">
          <button onClick={() => setActiveTab('extract')} className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${activeTab === 'extract' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
            <FileText size={22} className={activeTab === 'extract' ? 'fill-blue-100' : ''} />
            <span className="text-[10px] font-bold">OCR</span>
          </button>
          
          <button onClick={() => setActiveTab('ai')} className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${activeTab === 'ai' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
            <Wand2 size={22} className={activeTab === 'ai' ? 'fill-indigo-100' : ''} />
            <span className="text-[10px] font-bold">IA</span>
          </button>

          <button onClick={() => setActiveTab('image')} className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${activeTab === 'image' ? 'text-violet-600' : 'text-slate-400 hover:text-slate-600'}`}>
            <ImageIcon size={22} className={activeTab === 'image' ? 'fill-violet-100' : ''} />
            <span className="text-[10px] font-bold">Imagens</span>
          </button>

          <button onClick={() => setActiveTab('audio')} className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${activeTab === 'audio' ? 'text-orange-500' : 'text-slate-400 hover:text-slate-600'}`}>
            <Volume2 size={22} className={activeTab === 'audio' ? 'fill-orange-100' : ''} />
            <span className="text-[10px] font-bold">Voz</span>
          </button>
        </div>
      </nav>

    </div>
  );
}