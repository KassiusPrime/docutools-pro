import React, { useState, useRef, useEffect } from 'react';
import { 
  FileText, Image as ImageIcon, Volume2, Download, Trash2, Upload, 
  Loader2, FileDown, FilePlus, Languages, Key, RefreshCw, Copy, Check, 
  Wand2, Settings2
} from 'lucide-react';
import { extractTextFromFile } from './lib/utils';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { jsPDF } from 'jspdf';
import { saveAs } from 'file-saver';

type TabType = 'extract' | 'ai' | 'image' | 'audio';
type AiActionType = 'translate' | 'summarize' | 'grammar' | 'improve';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('extract');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const [extractedText, setExtractedText] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copiedExtract, setCopiedExtract] = useState(false);

  const [targetLang, setTargetLang] = useState('Inglês');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('docutools_apikey') || '');
  const [aiText, setAiText] = useState('');
  const [isAiWorking, setIsAiWorking] = useState(false);
  const [aiAction, setAiAction] = useState<AiActionType>('translate');
  const [copiedAi, setCopiedAi] = useState(false);

  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imageFormat, setImageFormat] = useState('pdf');
  const imageInputRef = useRef<HTMLInputElement>(null);

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
    if (!apiKey.trim()) { alert("Insira sua chave OpenAI (sk-...)."); return; }
    setIsAiWorking(true);
    let systemPrompt = "";
    if (aiAction === 'translate') systemPrompt = `Traduza para: ${targetLang}. Retorne apenas a tradução.`;
    else if (aiAction === 'summarize') systemPrompt = "Resuma o texto mantendo os pontos principais.";
    else if (aiAction === 'grammar') systemPrompt = "Corrija a gramática e ortografia. Retorne apenas o texto corrigido.";
    else if (aiAction === 'improve') systemPrompt = "Melhore a fluidez e o vocabulário do texto.";
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'gpt-3.5-turbo', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: textToProcess }], temperature: 0.3 })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      setAiText(data.choices[0].message.content);
    } catch (error: any) { alert(`Erro: ${error.message}`); }
    finally { setIsAiWorking(false); }
  };

  const processImages = async () => {
    if (selectedImages.length === 0) return;
    setIsProcessing(true);
    setProgress(0);
    try {
      if (imageFormat === 'pdf') {
        const pdf = new jsPDF();
        for (let i = 0; i < selectedImages.length; i++) {
          const file = selectedImages[i];
          const dataUrl = await new Promise<string>((res) => { const r = new FileReader(); r.onload = (e) => res(e.target?.result as string); r.readAsDataURL(file); });
          const props = pdf.getImageProperties(dataUrl);
          const pageWidth = pdf.internal.pageSize.getWidth();
          const pageHeight = (props.height * pageWidth) / props.width;
          if (i > 0) pdf.addPage();
          pdf.addImage(dataUrl, 'JPEG', 0, 0, pageWidth, pageHeight);
          setProgress(Math.round(((i + 1) / selectedImages.length) * 100));
        }
        pdf.save('DocuTools_Imagens.pdf');
      } else {
        for (let i = 0; i < selectedImages.length; i++) {
          const file = selectedImages[i];
          const objectUrl = URL.createObjectURL(file);
          const img = new Image();
          img.src = objectUrl;
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-12">
      <header className="bg-white border-b border-slate-200 p-4 shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl text-white shadow-md shadow-blue-200"><RefreshCw size={24} /></div>
            <div><h1 className="text-xl font-black tracking-tight">DocuTools <span className="text-blue-600">Pro</span></h1></div>
          </div>
          <div className="px-3 py-1 bg-green-50 rounded-full border border-green-100 text-xs font-bold text-green-700 shadow-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Privado
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 mt-6">
        <div className="flex flex-wrap bg-white p-1.5 rounded-2xl border border-slate-200 mb-8 shadow-sm gap-1">
          <button onClick={() => setActiveTab('extract')} className={`flex-1 py-3 px-2 flex items-center justify-center gap-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'extract' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
            <FileText size={18} /> <span className="hidden sm:inline">OCR</span>
          </button>
          <button onClick={() => setActiveTab('ai')} className={`flex-1 py-3 px-2 flex items-center justify-center gap-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'ai' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
            <Wand2 size={18} /> IA
          </button>
          <button onClick={() => setActiveTab('image')} className={`flex-1 py-3 px-2 flex items-center justify-center gap-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'image' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
            <ImageIcon size={18} /> Imagens
          </button>
          <button onClick={() => setActiveTab('audio')} className={`flex-1 py-3 px-2 flex items-center justify-center gap-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'audio' ? 'bg-orange-500 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
            <Volume2 size={18} /> Voz
          </button>
        </div>

        {activeTab === 'extract' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-5">
            {!extractedText && !isProcessing ? (
              <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-200 rounded-2xl p-16 flex flex-col items-center gap-5 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all">
                <div className="bg-slate-100 p-5 rounded-full text-slate-400"><Upload size={40} /></div>
                <p className="font-extrabold text-slate-700 text-lg">Clique para enviar arquivo</p>
                <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp" onChange={handleFileUpload} />
              </div>
            ) : isProcessing ? (
              <div className="flex flex-col items-center justify-center py-20 gap-5 text-center">
                <Loader2 className="animate-spin text-blue-600" size={48} />
                <p className="font-bold text-slate-800 text-lg">Processando... {progress}%</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <span className="font-bold text-slate-700 truncate max-w-xs">{fileName}</span>
                  <button onClick={() => setExtractedText('')} className="text-red-600 font-bold text-sm">Limpar</button>
                </div>
                <textarea value={extractedText} onChange={(e) => setExtractedText(e.target.value)} className="w-full h-96 p-5 border border-slate-200 rounded-2xl text-sm font-medium outline-none focus:border-blue-500 transition-all" />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button onClick={() => downloadTxt(extractedText, 'Extraido')} className="bg-slate-100 py-3 rounded-xl font-bold border">Salvar TXT</button>
                  <button onClick={() => downloadPdfText(extractedText, 'Extraido')} className="bg-slate-900 text-white py-3 rounded-xl font-bold">Salvar PDF</button>
                  <button onClick={() => downloadDocx(extractedText, 'Extraido')} className="bg-blue-600 text-white py-3 rounded-xl font-bold">Salvar DOCX</button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
              <h2 className="text-lg font-bold">Assistente IA</h2>
              <input type="password" placeholder="Chave sk-..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="w-full sm:w-64 text-sm bg-slate-50 border px-3 py-2 rounded-lg outline-none focus:border-indigo-500" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {['translate', 'summarize', 'grammar', 'improve'].map(act => (
                <button key={act} onClick={() => setAiAction(act as AiActionType)} className={`py-2 rounded-lg text-sm font-bold border ${aiAction === act ? 'bg-indigo-100 border-indigo-200 text-indigo-800' : 'bg-white text-slate-600'}`}>
                  {act === 'translate' ? 'Traduzir' : act === 'summarize' ? 'Resumir' : act === 'grammar' ? 'Corrigir' : 'Melhorar'}
                </button>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <textarea value={aiText || extractedText} onChange={(e) => setAiText(e.target.value)} placeholder="Texto original..." className="flex-1 h-64 p-4 bg-slate-50 border rounded-xl text-sm outline-none focus:border-indigo-500" />
              <button onClick={handleAiAction} disabled={isAiWorking} className="sm:w-32 bg-indigo-600 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2">
                {isAiWorking ? <Loader2 className="animate-spin" /> : <Wand2 />}
              </button>
              <textarea value={aiText} readOnly placeholder="Resultado..." className="flex-1 h-64 p-4 bg-indigo-50/30 border border-indigo-100 rounded-xl text-sm outline-none" />
            </div>
          </div>
        )}

        {activeTab === 'image' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6 text-center">
            <div onClick={() => imageInputRef.current?.click()} className="border-2 border-dashed border-slate-200 rounded-2xl p-16 cursor-pointer hover:border-violet-400 hover:bg-violet-50/50 transition-all">
              <FilePlus className="mx-auto text-slate-300 mb-4" size={48} />
              <p className="font-bold text-slate-700">Adicionar Imagens</p>
              <input ref={imageInputRef} type="file" multiple className="hidden" accept="image/*" onChange={handleImagesSelected} />
            </div>
            {selectedImages.length > 0 && (
              <div className="space-y-4">
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {selectedImages.map((img, i) => <div key={i} className="aspect-square bg-slate-100 rounded-lg overflow-hidden border"><img src={URL.createObjectURL(img)} className="w-full h-full object-cover" /></div>)}
                </div>
                <div className="flex flex-col sm:flex-row gap-4 items-center">
                  <select value={imageFormat} onChange={(e) => setImageFormat(e.target.value)} className="w-full sm:w-64 border p-3 rounded-xl font-bold">
                    <option value="pdf">Unificar em PDF</option>
                    <option value="jpeg">Converter para JPG</option>
                    <option value="png">Converter para PNG</option>
                  </select>
                  <button onClick={processImages} disabled={isProcessing} className="flex-1 w-full bg-violet-600 text-white py-4 rounded-xl font-bold">Iniciar Processamento</button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'audio' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 bg-slate-50 p-4 rounded-xl border">
              <select value={ttsLang} onChange={(e) => setTtsLang(e.target.value)} className="flex-1 border p-2 rounded-lg font-bold">
                <option value="pt-BR">Português (BR)</option>
                <option value="en-US">Inglês (EUA)</option>
              </select>
              <input type="range" min="0.5" max="2" step="0.1" value={ttsRate} onChange={(e) => setTtsRate(parseFloat(e.target.value))} className="flex-1 accent-orange-500" />
            </div>
            <textarea value={aiText || extractedText} onChange={(e) => setAiText(e.target.value)} className="w-full h-64 p-5 border rounded-2xl text-sm font-medium outline-none focus:border-orange-500" placeholder="Texto para leitura..." />
            <button onClick={speak} className="w-full bg-orange-500 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2">
              <Volume2 /> Reproduzir
            </button>
          </div>
        )}
      </main>
      <footer className="mt-16 text-center text-slate-400 font-bold text-[10px]">© 2026 DocuTools Pro • 100% Processamento Local</footer>
    </div>
  );
}