import React, { useState, useRef, useEffect } from 'react';
import { 
  FileText, Image as ImageIcon, Volume2, Download, Trash2, Upload, 
  Loader2, FileDown, FilePlus, Languages, Key, RefreshCw, Copy, Check, 
  Wand2, Settings2, Globe, Palette, DownloadCloud, ImagePlus, Paintbrush
} from 'lucide-react';
import { extractTextFromFile } from './lib/utils';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { jsPDF } from 'jspdf';
import { saveAs } from 'file-saver';

type TabType = 'extract' | 'ai' | 'image' | 'audio' | 'visual-ai';
type AiActionType = 'translate' | 'summarize' | 'grammar' | 'improve';
type EngineType = 'google' | 'openai' | 'gemini' | 'groq';
type VisualTabType = 'generate' | 'edit';

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

  // OCR Estados
  const [extractedText, setExtractedText] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copiedExtract, setCopiedExtract] = useState(false);

  // IA Textos Estados
  const [targetLang, setTargetLang] = useState('en'); 
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('docutools_apikey') || '');
  const [aiText, setAiText] = useState('');
  const [isAiWorking, setIsAiWorking] = useState(false);
  const [aiAction, setAiAction] = useState<AiActionType>('translate');
  const [translationEngine, setTranslationEngine] = useState<EngineType>('google');
  const [copiedAi, setCopiedAi] = useState(false);

  // IA Visual Estados (Pollinations & Hugging Face)
  const [visualTab, setVisualTab] = useState<VisualTabType>('generate');
  const [imagePrompt, setImagePrompt] = useState('');
  const [generatedImage, setGeneratedImage] = useState('');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  
  // Estados do Editor de Imagens
  const [hfKey, setHfKey] = useState(() => localStorage.getItem('docutools_hf_key') || '');
  const [editSourceImage, setEditSourceImage] = useState<File | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editedImage, setEditedImage] = useState('');
  const [isEditingImage, setIsEditingImage] = useState(false);
  const editImageInputRef = useRef<HTMLInputElement>(null);

  const languageMap: Record<string, string> = {
    'en': 'Inglês', 'es': 'Espanhol', 'fr': 'Francês', 
    'de': 'Alemão', 'it': 'Italiano', 'pt': 'Português'
  };

  // Imagens Estados
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imageFormat, setImageFormat] = useState('pdf');
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Áudio Estados
  const [ttsLang, setTtsLang] = useState('pt-BR');
  const [ttsRate, setTtsRate] = useState(1);

  useEffect(() => { localStorage.setItem('docutools_apikey', apiKey); }, [apiKey]);
  useEffect(() => { localStorage.setItem('docutools_hf_key', hfKey); }, [hfKey]);

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
      if (translationEngine === 'google') {
        const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(textToProcess)}`);
        const data = await res.json();
        const translated = data[0].map((item: any) => item[0]).join('');
        setAiText(translated);
        setIsAiWorking(false);
        return;
      }

      if (!apiKey.trim()) { 
        alert("Insira sua Chave API para usar este motor."); 
        setIsAiWorking(false); 
        return; 
      }

      let systemPrompt = "";
      if (aiAction === 'translate') systemPrompt = `Traduza para ${languageMap[targetLang]}. Mantenha a formatação original. Retorne APENAS a tradução.`;
      else if (aiAction === 'summarize') systemPrompt = "Resuma o texto mantendo os pontos principais. Retorne apenas o resumo.";
      else if (aiAction === 'grammar') systemPrompt = "Corrija a gramática e ortografia. Retorne APENAS o texto corrigido.";
      else if (aiAction === 'improve') systemPrompt = "Melhore a fluidez e o vocabulário. Retorne APENAS o texto reescrito.";

      if (translationEngine === 'gemini') {
        // Corrigido para a versão mais recente do modelo Flash
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${systemPrompt}\n\nTexto original:\n${textToProcess}` }] }]
          })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        setAiText(data.candidates[0].content.parts[0].text);
      } 
      else {
        // Lógica para Groq e OpenAI (Atualizado para gpt-4o-mini)
        const isGroq = translationEngine === 'groq';
        const url = isGroq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
        const model = isGroq ? 'llama3-8b-8192' : 'gpt-4o-mini';

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: model,
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

  // ===================== IA VISUAL LOGIC =====================

  const handleGenerateImage = () => {
    if (!imagePrompt.trim()) return alert("Descreva a imagem que deseja gerar.");
    
    setIsGeneratingImage(true);
    setGeneratedImage('');
    
    const seed = Math.floor(Math.random() * 1000000);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?nologo=true&seed=${seed}`;
    
    const img = new Image();
    img.src = url;
    img.onload = () => { setGeneratedImage(url); setIsGeneratingImage(false); };
    img.onerror = () => { alert("Erro ao gerar a imagem."); setIsGeneratingImage(false); };
  };

  const handleEditImageSource = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setEditSourceImage(e.target.files[0]);
      setEditedImage('');
    }
  };

  const handleEditCommand = async () => {
    if (!hfKey.trim()) return alert("Insira a chave do Hugging Face nas configurações da aba.");
    if (!editSourceImage) return alert("Selecione uma imagem primeiro.");
    if (!editPrompt.trim()) return alert("Digite o comando (ex: Make it look like a painting).");

    setIsEditingImage(true);
    setEditedImage('');

    try {
      const getBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
      });

      const base64Data = await getBase64(editSourceImage);

      const response = await fetch("https://api-inference.huggingface.co/models/timbrooks/instruct-pix2pix", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${hfKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: {
            image: base64Data.split(',')[1],
            prompt: editPrompt
          }
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.error && errorData.error.includes("is currently loading")) {
           throw new Error("O modelo da IA está inicializando. Aguarde 20 segundos e tente de novo!");
        }
        throw new Error(errorData.error || 'Falha na comunicação com a API.');
      }

      const blob = await response.blob();
      setEditedImage(URL.createObjectURL(blob));
    } catch (error: any) {
      alert(`Erro na Edição: ${error.message}`);
    } finally {
      setIsEditingImage(false);
    }
  };

  const downloadVisualImage = async (url: string) => {
    if (!url) return;
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      saveAs(blob, `DocuTools_IA_${Date.now()}.jpg`);
    } catch (error) { alert("Erro ao salvar."); }
  };

  // ===================== FIM IA VISUAL =====================

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
          const img = new window.Image(); img.src = objectUrl;
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
              <label className="text-sm font-bold text-slate-700 flex items-center gap-2"><Globe size={18}/> Motor de Inteligência:</label>
              
              <select 
                value={translationEngine} 
                onChange={(e) => {
                  setTranslationEngine(e.target.value as EngineType);
                  if (e.target.value === 'google') setAiAction('translate');
                }} 
                className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 font-bold text-slate-700 outline-none focus:border-indigo-500 shadow-sm"
              >
                <option value="google">Google Tradutor (Grátis - Sem chave)</option>
                <option value="gemini">Google Gemini 1.5 (API Gratuita)</option>
                <option value="groq">Groq / Llama 3 (API Gratuita - Rápido)</option>
                <option value="openai">OpenAI / ChatGPT (API Paga)</option>
              </select>

              {translationEngine !== 'google' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Sua Chave API</label>
                  <input type="password" placeholder={`Insira a chave do ${translationEngine.toUpperCase()} aqui...`} value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="w-full text-sm bg-white border border-slate-300 px-4 py-3 rounded-xl outline-none focus:border-indigo-500 shadow-sm" />
                </div>
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
          </div>
        )}

        {/* ================= ABA IA VISUAL ================= */}
        {activeTab === 'visual-ai' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            
            {/* Abas Superiores (Gerar vs Editar) */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 mb-2">
              <button onClick={() => setVisualTab('generate')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${visualTab === 'generate' ? 'bg-pink-600 text-white shadow-sm' : 'text-slate-500'}`}>Gerar</button>
              <button onClick={() => setVisualTab('edit')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${visualTab === 'edit' ? 'bg-pink-600 text-white shadow-sm' : 'text-slate-500'}`}>Editar</button>
            </div>

            {/* SEÇÃO: GERAR IMAGEM */}
            {visualTab === 'generate' && (
              <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <Palette size={18} className="text-pink-600" /> Crie do Zero (Grátis)
                </label>
                <textarea 
                    value={imagePrompt} 
                    onChange={(e) => setImagePrompt(e.target.value)} 
                    placeholder="Ex: A futuristic city floating in the clouds, cyberpunk style..." 
                    className="w-full h-28 p-4 bg-slate-50 border border-slate-300 rounded-xl text-sm outline-none focus:border-pink-500 resize-none" 
                />
                <button 
                    onClick={handleGenerateImage} 
                    disabled={isGeneratingImage} 
                    className="w-full bg-pink-600 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.98]"
                  >
                  {isGeneratingImage ? <Loader2 className="animate-spin" size={20} /> : <Palette size={20} />} 
                  {isGeneratingImage ? 'Pintando Pixels...' : 'Gerar Imagem'}
                </button>

                {generatedImage && (
                  <div className="space-y-3 pt-2">
                    <div className="w-full rounded-2xl overflow-hidden border-2 border-slate-200 bg-slate-100 relative">
                      <img src={generatedImage} alt="Gerada" className="w-full h-auto max-h-[350px] object-contain bg-black" />
                    </div>
                    <button onClick={() => downloadVisualImage(generatedImage)} className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md">
                      <DownloadCloud size={20} /> Salvar
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* SEÇÃO: EDITAR IMAGEM (Hugging Face) */}
            {visualTab === 'edit' && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="bg-pink-50 p-4 rounded-xl border border-pink-100 space-y-3">
                  <label className="text-xs font-bold text-pink-800 uppercase flex items-center gap-1"><Key size={14}/> Chave API Hugging Face</label>
                  <input 
                    type="password" 
                    placeholder="Cole sua chave hf_... aqui" 
                    value={hfKey} 
                    onChange={(e) => setHfKey(e.target.value)} 
                    className="w-full text-sm bg-white border border-pink-200 px-4 py-3 rounded-xl outline-none focus:border-pink-500" 
                  />
                  <p className="text-[10px] text-pink-600/80 font-bold">Obrigatório para edição. Crie grátis em huggingface.co</p>
                </div>

                <div 
                  onClick={() => editImageInputRef.current?.click()} 
                  className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all ${editSourceImage ? 'border-pink-500 bg-pink-50/30' : 'border-slate-300 hover:bg-slate-50'}`}
                >
                  {editSourceImage ? (
                    <img src={URL.createObjectURL(editSourceImage)} className="h-32 object-contain rounded-lg shadow-sm" />
                  ) : (
                    <>
                      <ImagePlus size={32} className="text-slate-400 mb-2" />
                      <span className="text-sm font-bold text-slate-600">Toque para selecionar imagem</span>
                    </>
                  )}
                  <input ref={editImageInputRef} type="file" className="hidden" accept="image/*" onChange={handleEditImageSource} />
                </div>

                <input 
                  type="text" 
                  value={editPrompt} 
                  onChange={(e) => setEditPrompt(e.target.value)}
                  placeholder="Comando (Ex: Make it look like a pencil sketch)" 
                  className="w-full text-sm bg-slate-50 border border-slate-300 px-4 py-4 rounded-xl outline-none focus:border-pink-500 font-medium"
                />

                <button 
                  onClick={handleEditCommand} 
                  disabled={isEditingImage || !editSourceImage} 
                  className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
                >
                  {isEditingImage ? <Loader2 className="animate-spin" size={20} /> : <Paintbrush size={20} />} 
                  {isEditingImage ? 'Aplicando Filtro IA...' : 'Editar Imagem'}
                </button>

                {editedImage && (
                  <div className="space-y-3 pt-2">
                    <div className="w-full rounded-2xl overflow-hidden border-2 border-pink-200 bg-slate-100 relative">
                      <img src={editedImage} alt="Editada" className="w-full h-auto max-h-[350px] object-contain bg-black" />
                    </div>
                    <button onClick={() => downloadVisualImage(editedImage)} className="w-full bg-pink-600 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md">
                      <DownloadCloud size={20} /> Salvar Edição
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= OUTRAS ABAS ================= */}
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

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)] z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="flex justify-between items-center h-16 max-w-5xl mx-auto px-1 sm:px-4">
          <button onClick={() => setActiveTab('extract')} className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${activeTab === 'extract' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
            <FileText size={20} className={activeTab === 'extract' ? 'fill-blue-100' : ''} />
            <span className="text-[10px] font-bold">OCR</span>
          </button>
          
          <button onClick={() => setActiveTab('ai')} className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${activeTab === 'ai' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
            <Wand2 size={20} className={activeTab === 'ai' ? 'fill-indigo-100' : ''} />
            <span className="text-[10px] font-bold">IA Texto</span>
          </button>

          <button onClick={() => setActiveTab('visual-ai')} className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${activeTab === 'visual-ai' ? 'text-pink-600' : 'text-slate-400 hover:text-slate-600'}`}>
            <Palette size={20} className={activeTab === 'visual-ai' ? 'fill-pink-100' : ''} />
            <span className="text-[10px] font-bold">IA Arte</span>
          </button>

          <button onClick={() => setActiveTab('image')} className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${activeTab === 'image' ? 'text-violet-600' : 'text-slate-400 hover:text-slate-600'}`}>
            <ImageIcon size={20} className={activeTab === 'image' ? 'fill-violet-100' : ''} />
            <span className="text-[10px] font-bold">Mídia</span>
          </button>

          <button onClick={() => setActiveTab('audio')} className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${activeTab === 'audio' ? 'text-orange-500' : 'text-slate-400 hover:text-slate-600'}`}>
            <Volume2 size={20} className={activeTab === 'audio' ? 'fill-orange-100' : ''} />
            <span className="text-[10px] font-bold">Voz</span>
          </button>
        </div>
      </nav>

    </div>
  );
}