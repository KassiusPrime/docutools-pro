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
