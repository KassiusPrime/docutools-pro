import React, { useState, useRef } from 'react';
import { FileText, Image as ImageIcon, Languages, Volume2, Download, Trash2, Upload, Loader2, FileDown, Type } from 'lucide-react';
import { extractTextFromFile } from './lib/utils';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { saveAs } from 'file-saver';

export default function App() {
  const [activeTab, setActiveTab] = useState('translate');
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultText, setResultText] = useState('');
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    setProgress(0);
    setFileName(file.name);
    try {
      const text = await extractTextFromFile(file, (p) => setProgress(p));
      setResultText(text);
    } catch (error) {
      alert('Erro ao processar arquivo.');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadTxt = () => {
    const blob = new Blob([resultText], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, `DocuTools_${fileName}.txt`);
  };

  const downloadDocx = async () => {
    const doc = new Document({
      sections: [{
        children: resultText.split('\n').map(line => new Paragraph({ children: [new TextRun(line)] })),
      }],
    });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `DocuTools_${fileName}.docx`);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-12">
      <header className="bg-white border-b border-slate-200 p-4 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1 rounded-lg text-white"><FileText size={24} /></div>
            <h1 className="text-xl font-bold">DocuTools <span className="text-blue-600">Pro</span></h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 mt-6">
        <div className="flex bg-white p-1 rounded-xl border mb-6">
          {['translate', 'image', 'audio'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === tab ? "bg-blue-600 text-white" : "text-slate-500"}`}>
              {tab === 'translate' ? 'OCR & Texto' : tab === 'image' ? 'Imagens' : 'Voz'}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl border p-6 shadow-sm">
          {!resultText && !isProcessing ? (
            <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed rounded-xl p-12 flex flex-col items-center gap-4 cursor-pointer hover:bg-blue-50 transition-all">
              <Upload className="text-slate-400" size={48} />
              <p className="font-bold text-slate-600">Clique para enviar documento ou imagem</p>
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
            </div>
          ) : isProcessing ? (
            <div className="flex flex-col items-center py-12 gap-4">
              <Loader2 className="animate-spin text-blue-600" size={40} />
              <p className="font-bold">Processando: {progress}%</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center text-xs text-slate-500">
                <span>{fileName}</span>
                <button onClick={() => setResultText('')} className="text-red-500 flex items-center gap-1"><Trash2 size={14}/> Limpar</button>
              </div>
              <textarea value={resultText} onChange={(e) => setResultText(e.target.value)} className="w-full h-80 p-4 bg-slate-50 border rounded-xl text-sm font-mono" />
              <div className="flex gap-2">
                <button onClick={downloadTxt} className="flex-1 bg-slate-900 text-white py-3 rounded-xl font-bold flex justify-center gap-2"><Download size={18}/> TXT</button>
                <button onClick={downloadDocx} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold flex justify-center gap-2"><FileDown size={18}/> DOCX</button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}