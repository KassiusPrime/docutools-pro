import streamlit as st
import pdfplumber
import time
import pytesseract
from docx import Document
from io import BytesIO
from deep_translator import GoogleTranslator
from gtts import gTTS
from rembg import remove
from PIL import Image
from pdf2image import convert_from_bytes

# Configuração
st.set_page_config(page_title="DocuTools Pro", page_icon="📄", layout="wide")

# --- FUNÇÕES DE NÚCLEO ---

def call_with_retry(func, *args, retries=3, delay=1, **kwargs):
    """Tenta executar uma função de rede várias vezes em caso de falha."""
    for i in range(retries):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            if i == retries - 1: return None
            time.sleep(delay * (2 ** i))
    return None

@st.cache_data
def extrair_texto_total(file_bytes, file_name, file_type):
    """Extrai texto de arquivos. Se o PDF for imagem, tenta usar OCR."""
    text = ""
    try:
        if "pdf" in file_type:
            with pdfplumber.open(BytesIO(file_bytes)) as pdf:
                text = "\n".join([p.extract_text() or "" for p in pdf.pages])
            
            # Se o texto vier vazio (PDF escaneado), usa OCR
            if len(text.strip()) < 10:
                with st.spinner("PDF parece ser imagem. Iniciando OCR (Tesseract)..."):
                    images = convert_from_bytes(file_bytes)
                    text = "\n".join([pytesseract.image_to_string(img, lang='por+eng') for img in images])
        elif "officedocument" in file_type:
            doc = Document(BytesIO(file_bytes))
            text = "\n".join([para.text for para in doc.paragraphs])
        elif "image" in file_type:
            img = Image.open(BytesIO(file_bytes))
            text = pytesseract.image_to_string(img, lang='por+eng')
        else:
            text = file_bytes.decode("utf-8")
        return text
    except Exception as e:
        return f"Erro ao processar arquivo: {str(e)}"

def traduzir_formatado(texto, origem, destino):
    """Traduz parágrafo por parágrafo para manter a estrutura do documento."""
    if not texto.strip(): return ""
    
    translator = GoogleTranslator(source=origem, target=destino)
    linhas = texto.split('\n')
    resultado = []
    
    barra = st.progress(0, text="Traduzindo conteúdo...")
    for i, linha in enumerate(linhas):
        if linha.strip():
            # Tradução individual evita perda de formatação
            trad = call_with_retry(translator.translate, linha)
            resultado.append(trad if trad else linha)
        else:
            resultado.append("")
        barra.progress((i + 1) / len(linhas))
    
    barra.empty()
    return "\n".join(resultado)

# --- UI ---

st.title("🚀 DocuTools Pro")
st.caption("Processamento avançado de Documentos e IA")

tabs = st.tabs(["🌐 Tradutor & OCR", "🖼️ Imagem IA", "🔊 Voz", "🛠️ Extras"])

with tabs[0]:
    st.subheader("Extração e Tradução Inteligente")
    f = st.file_uploader("Suba seu arquivo (PDF, Imagem, DOCX)", type=["pdf", "docx", "txt", "png", "jpg"], key="u1")
    
    col1, col2 = st.columns(2)
    with col1: de = st.selectbox("Idioma Original", ["auto", "en", "pt", "es", "fr"], index=0)
    with col2: para = st.selectbox("Traduzir para", ["pt", "en", "es", "fr"], index=0)
    
    if f:
        if st.button("Processar Documento", type="primary"):
            raw_text = extrair_texto_total(f.getvalue(), f.name, f.type)
            
            st.info("Texto extraído com sucesso. Iniciando tradução...")
            final_text = traduzir_formatado(raw_text, de, para)
            
            st.text_area("Resultado Final:", final_text, height=400)
            st.download_button("Baixar TXT", final_text, file_name=f"DocuTools_{f.name}.txt")

with tabs[1]:
    st.subheader("Remoção de Fundo (IA)")
    img_f = st.file_uploader("Selecione uma foto", type=["jpg", "png"], key="u2")
    if img_f and st.button("Remover Fundo"):
        with st.spinner("Processando IA..."):
            res = remove(img_f.getvalue())
            st.image(res, width=400)
            st.download_button("Baixar PNG", res, "resultado.png")

with tabs[2]:
    st.subheader("Transformar Texto em Áudio")
    t_audio = st.text_area("Digite o texto:", "DocuTools Pro facilita seu trabalho.")
    if st.button("Gerar MP3"):
        tts = gTTS(text=t_audio, lang='pt')
        fp = BytesIO()
        tts.write_to_fp(fp)
        st.audio(fp)

st.sidebar.markdown("### Status do Sistema")
st.sidebar.success("Servidor Ativo")
if st.sidebar.button("Limpar Tudo"):
    st.cache_data.clear()
    st.rerun()
