import { useState, useEffect } from 'react';
import { extractTextFromFile, translateText } from './lib/utils';
import { saveAs } from 'file-saver';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import jsPDF from 'jspdf';

const IDIOMAS: Record<string, string> = {
  'Auto-Detectar': 'auto',
  'Portugues': 'pt',
  'Ingles': 'en',
  'Espanhol': 'es',
  'Frances': 'fr',
  'Alemao': 'de',
  'Italiano': 'it',
};

const VOZES: Record<string, string> = {
  'Portugues': 'pt-BR',
  'Ingles': 'en-US',
  'Espanhol': 'es-ES',
  'Frances': 'fr-FR',
};

type Tab = 'translate' | 'image' | 'audio' | 'system';
type ImgTool = 'resize' | 'convert' | 'topdf';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('translate');
  const [apiKey, setApiKey] = useState(localStorage.getItem('openai_api_key') || '');

  // Translation state
  const [docFile, setDocFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [fromLang, setFromLang] = useState('Auto-Detectar');
  const [toLang, setToLang] = useState('Portugues');
  const [errorMsg, setErrorMsg] = useState('');

  // Image state
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [processedImg, setProcessedImg] = useState<string | null>(null);
  const [imgWidth, setImgWidth] = useState<number>(800);
  const [imgHeight, setImgHeight] = useState<number>(600);
  const [imgFormat, setImgFormat] = useState('PNG');
  const [multiImgs, setMultiImgs] = useState<File[]>([]);
  const [imgTool, setImgTool] = useState<ImgTool>('resize');

  // Audio state
  const [audioText, setAudioText] = useState('DocuTools Pro transformando seu fluxo de trabalho.');
  const [audioLang, setAudioLang] = useState('Portugues');

  useEffect(() => {
    localStorage.setItem('openai_api_key', apiKey);
  }, [apiKey]);

  const handleTranslate = async () => {
    if (!docFile) return;
    setIsProcessing(true);
    setErrorMsg('');
    try {
      const text = await extractTextFromFile(docFile);
      setExtractedText(text);
      const translated = await translateText(text, fromLang, toLang, apiKey);
