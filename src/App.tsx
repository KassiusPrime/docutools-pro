import { ChangeEvent, useRef, useState } from "react";
import { 
  Download, 
  FileDown, 
  FileImage, 
  FileText, 
  Image as ImageIcon, 
  LoaderCircle, 
  Trash2, 
  Upload, 
  Volume2 
} from "lucide-react";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { saveAs } from "file-saver";
import { extractTextFromFile } from "./lib/utils";

type Tab = "extract" | "image" | "voice";
type ImageFormat = "png" | "jpg" | "webp";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("extract");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingMessage, setProcessingMessage] = useState("");
  const [resultText, setResultText] = useState("");
  const [fileName, setFileName] = useState("");
  const [voiceText, setVoiceText] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [imageName, setImageName] = useState("");
  const [imageFormat, setImageFormat] = useState<ImageFormat>("png");

  const documentInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const cleanFileName = (name: string) => {
    return name.replace(/\.[^/.]+$/, "") || "documento";
  };

  const handleDocumentUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setProgress(0);
    setProcessingMessage("Lendo seu arquivo...");
    setFileName(file.name);

    try {
      const extractedText = await extractTextFromFile(file, (value) => {
        setProgress(value);
        setProcessingMessage(
          value > 0 ? `Processando documento: ${value}%` : "Preparando..."
        );
      });
      setResultText(extractedText);
      setVoiceText(extractedText);
      setProgress(100);
      setProcessingMessage("Concluído!");
    } catch (error) {
      console.error(error);
      alert(
        "Não foi possível processar este arquivo. Tente novamente com PDF, DOCX, TXT, PNG ou JPG."
      );
      setResultText("");
    } finally {
      window.setTimeout(() => {
        setIsProcessing(false);
        setProgress(0);
        setProcessingMessage("");
      }, 500);
    }
  };

  const downloadTxt = () => {
    if (!resultText.trim()) return;
    const blob = new Blob([resultText], {
      type: "text/plain;charset=utf-8",
    });
    saveAs(blob, `DocuTools_${cleanFileName(fileName)}.txt`);
  };

  const downloadDocx = async () => {
    if (!resultText.trim()) return;
    const doc = new Document({
      sections: [
        {
          children: resultText.split(/\r?\n/).map(
            (line) =>
              new Paragraph({
                children: [new TextRun(line || " ")],
              })
          ),
        },
      ],
    });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `DocuTools_${cleanFileName(fileName)}.docx`);
  };

  const clearDocument = () => {
    setResultText("");
    setFileName("");
    setVoiceText("");
    if (documentInputRef.current) {
      documentInputRef.current.value = "";
    }
  };

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Escolha uma imagem válida.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result as string);
      setImageName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const convertImage = async () => {
    if (!imagePreview) {
      alert("Escolha uma imagem antes de converter.");
      return;
    }

    setIsProcessing(true);
    setProcessingMessage("Convertendo imagem...");

    try {
      const image = new Image();
      image.src = imagePreview;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Falha ao carregar imagem."));
      });

      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Canvas não suportado.");
      }

      if (imageFormat === "jpg") {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }

      context.drawImage(image, 0, 0);

      const mimeType =
        imageFormat === "jpg"
          ? "image/jpeg"
          : imageFormat === "webp"
          ? "image/webp"
          : "image/png";

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, mimeType, 0.92);
      });

      if (!blob) {
        throw new Error("Não foi possível gerar a imagem.");
      }

      saveAs(blob, `DocuTools_${cleanFileName(imageName)}.${imageFormat}`);
    } catch (error) {
      console.error(error);
      alert("Não foi possível converter a imagem.");
    } finally {
      setIsProcessing(false);
      setProcessingMessage("");
    }
  };

  const clearImage = () => {
    setImagePreview("");
    setImageName("");
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  };

  const speakText = () => {
    if (!voiceText.trim()) {
      alert("Digite ou envie um texto antes de ouvir.");
      return;
    }
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(voiceText);
    speech.lang = "pt-BR";
    speech.rate = 0.95;
    speech.pitch = 1;
    window.speechSynthesis.speak(speech);
  };

  const stopSpeech = () => {
    window.speechSynthesis.cancel();
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: "extract",
      label: "OCR e Texto",
      icon: <FileText size={18} />,
    },
    {
      id: "image",
      label: "Imagens",
      icon: <ImageIcon size={18} />,
    },
    {
      id: "voice",
      label: "Voz",
      icon: <Volume2 size={18} />,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-600 p-2 text-white shadow-md shadow-blue-200">
              <FileText size={24} />
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight sm:text-xl">
                DocuTools <span className="text-blue-600">Pro</span>
              </h1>
              <p className="hidden text-xs text-slate-500 sm:block">
                OCR, documentos, imagens e voz
              </p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
            Online
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
        <section className="mb-6">
          <p className="mb-2 text-sm font-semibold text-blue-600">
            Ferramentas inteligentes
          </p>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            Trabalhe com seus documentos.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            Extraia textos de PDFs, documentos e imagens, converta formatos e ouça qualquer conteúdo diretamente pelo navegador.
          </p>
        </section>

        <nav className="mb-6 grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-2 py-3 text-xs font-bold transition-all sm:text-sm ${
                activeTab === tab.id
                  ? "bg-blue-600 text-white shadow-md shadow-blue-200"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        {activeTab === "extract" && (
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-gradient-to-r from-blue-50 to-white px-5 py-5 sm:px-7">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-blue-100 p-2 text-blue-600">
                  <FileText size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">
                    Extração de texto e OCR
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Envie PDF, DOCX, TXT, PNG ou JPG.
                  </p>
                </div>
              </div>
            </div>
            <div className="p-5 sm:p-7">
              {!resultText && !isProcessing && (
                <div
                  onClick={() => documentInputRef.current?.click()}
                  className="group cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-10 text-center transition-all hover:border-blue-400 hover:bg-blue-50 sm:p-14"
                >
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm transition-colors group-hover:bg-blue-600 group-hover:text-white">
                    <Upload size={30} />
                  </div>
                  <h4 className="mt-5 font-bold text-slate-800">
                    Toque aqui para enviar seu arquivo
                  </h4>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
                    O texto será extraído automaticamente. Em imagens, o DocuTools usa OCR.
                  </p>
                  <input
                    ref={documentInputRef}
                    type="file"
                    accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,image/png,image/jpeg,application/pdf,text/plain"
                    className="hidden"
                    onChange={handleDocumentUpload}
                  />
                  <span className="mt-6 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white">
                    Escolher arquivo
                  </span>
                </div>
              )}

              {isProcessing && (
                <div className="flex min-h-72 flex-col items-center justify-center text-center">
                  <div className="rounded-2xl bg-blue-50 p-4 text-blue-600">
                    <LoaderCircle className="animate-spin" size={36} />
                  </div>
                  <h4 className="mt-5 font-bold text-slate-900">
                    {processingMessage || "Processando..."}
                  </h4>
                  <p className="mt-1 text-sm text-slate-500">
                    Aguarde alguns instantes.
                  </p>
                  <div className="mt-6 h-3 w-full max-w-sm overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all duration-300"
                      style={{ width: `${Math.max(progress, 8)}%` }}
                    />
                  </div>
                  <span className="mt-2 text-xs font-bold text-blue-600">
                    {progress}%
                  </span>
                </div>
              )}

              {resultText && !isProcessing && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-500">
                        Arquivo processado
                      </p>
                      <p className="truncate text-sm font-bold text-slate-800">
                        {fileName}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={clearDocument}
                      className="flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold text-red-600 transition-colors hover:bg-red-50"
                    >
                      <Trash2 size={15} /> Limpar
                    </button>
                  </div>
                  <textarea
                    value={resultText}
                    onChange={(event) => {
                      setResultText(event.target.value);
                      setVoiceText(event.target.value);
                    }}
                    className="h-80 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-sm leading-6 text-slate-700 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    placeholder="O texto extraído aparecerá aqui."
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={downloadTxt}
                      className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-4 text-sm font-bold text-white transition hover:bg-slate-800"
                    >
                      <Download size={19} /> Baixar TXT
                    </button>
                    <button
                      type="button"
                      onClick={downloadDocx}
                      className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-4 text-sm font-bold text-white shadow-md shadow-blue-200 transition hover:bg-blue-700"
                    >
                      <FileDown size={19} /> Baixar DOCX
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "image" && (
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white px-5 py-5 sm:px-7">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-violet-100 p-2 text-violet-600">
                  <ImageIcon size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">
                    Conversor de imagem
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Converta JPG, PNG e WEBP em poucos segundos.
                  </p>
                </div>
              </div>
            </div>
            <div className="p-5 sm:p-7">
              {!imagePreview ? (
                <div
                  onClick={() => imageInputRef.current?.click()}
                  className="group cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-10 text-center transition-all hover:border-violet-400 hover:bg-violet-50"
                >
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm group-hover:bg-violet-600 group-hover:text-white">
                    <FileImage size={30} />
                  </div>
                  <h4 className="mt-5 font-bold text-slate-800">
                    Escolher uma imagem
                  </h4>
                  <p className="mt-2 text-sm text-slate-500">
                    PNG, JPG, JPEG ou WEBP
                  </p>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                    <img
                      src={imagePreview}
                      alt="Prévia da imagem enviada"
                      className="max-h-96 w-full object-contain"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <span className="truncate text-sm font-bold text-slate-700">
                      {imageName}
                    </span>
                    <button
                      type="button"
                      onClick={clearImage}
                      className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={15} /> Remover
                    </button>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-700">
                      Converter para
                    </label>
                    <select
                      value={imageFormat}
                      onChange={(event) =>
                        setImageFormat(event.target.value as ImageFormat)
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                    >
                      <option value="png">PNG</option>
                      <option value="jpg">JPG</option>
                      <option value="webp">WEBP</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={convertImage}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-4 text-sm font-bold text-white shadow-md shadow-violet-200 transition hover:bg-violet-700"
                  >
                    <Download size={19} /> Converter e baixar imagem
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "voice" && (
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-gradient-to-r from-orange-50 to-white px-5 py-5 sm:px-7">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-orange-100 p-2 text-orange-600">
                  <Volume2 size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">
                    Texto para voz
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Ouça o texto usando a voz disponível no seu navegador.
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-4 p-5 sm:p-7">
              <textarea
                value={voiceText}
                onChange={(event) => setVoiceText(event.target.value)}
                className="h-72 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700 outline-none transition focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-100"
                placeholder="Digite ou cole o texto que deseja ouvir..."
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={speakText}
                  className="flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-4 text-sm font-bold text-white shadow-md shadow-orange-200 transition hover:bg-orange-600"
                >
                  <Volume2 size={19} /> Ouvir texto
                </button>
                <button
                  type="button"
                  onClick={stopSpeech}
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  <Trash2 size={19} /> Parar áudio
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
      <footer className="px-4 py-10 text-center text-xs text-slate-400">
        <p>© 2026 DocuTools Pro</p>
        <p className="mt-1">
          Seus arquivos são processados diretamente no navegador.
        </p>
      </footer>
    </div>
  );
}
