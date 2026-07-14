import streamlit as st
import pdfplumber
import os
import time
from docx import Document
from io import BytesIO
from deep_translator import GoogleTranslator
from gtts import gTTS
from rembg import remove
from PIL import Image

# Configuração da Página
st.set_page_config(page_title="DocuTools Pro", page_icon="📄", layout="wide")

# --- FUNÇÕES DE SUPORTE ---

def call_with_retry(func, *args, retries=3, delay=1, **kwargs):
    """Executa funções de rede (tradução/áudio) com tentativas automáticas."""
    for i in range(retries):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            if i == retries - 1: raise e
            time.sleep(delay * (2 ** i))
    return None

@st.cache_data
def extrair_texto(file_bytes, file_type):
    """Extrai texto de PDF, DOCX ou TXT com cache."""
    try:
        if "pdf" in file_type:
            with pdfplumber.open(BytesIO(file_bytes)) as pdf:
                return "\n".join([p.extract_text() or "" for p in pdf.pages])
        elif "officedocument" in file_type:
            doc = Document(BytesIO(file_bytes))
            return "\n".join([para.text for para in doc.paragraphs])
        else:
            return file_bytes.decode("utf-8")
    except Exception as e:
        return f"Erro na extração: {str(e)}"

def traduzir_texto_robusto(texto, origem, destino):
    """Traduz parágrafo por parágrafo para preservar a formatação original."""
    if not texto.strip(): return ""
    
    translator = GoogleTranslator(source=origem, target=destino)
    paragrafos = texto.split('\n')
    traduzidos = []
    
    progresso = st.progress(0, text="Traduzindo parágrafos...")
    for i, p in enumerate(paragrafos):
        if p.strip():
            # Tradução linha a linha evita que o Google 'esmague' o texto
            t = call_with_retry(translator.translate, p)
            traduzidos.append(t if t else p)
        else:
            traduzidos.append("")
        progresso.progress((i + 1) / len(paragrafos))
    
    progresso.empty()
    return "\n".join(traduzidos)

# --- INTERFACE PRINCIPAL ---

st.title("📄 DocuTools Pro")
st.markdown("---")

tab1, tab2, tab3, tab4 = st.tabs(["🌐 Tradutor Pro", "🖼️ Imagem IA", "🔊 Texto para Voz", "📂 PDF Tools"])

with tab1:
    st.subheader("Tradução de Documentos (Preserva Formato)")
    file = st.file_uploader("Upload PDF, DOCX, TXT", type=["pdf", "docx", "txt"], key="tr1")
    
    c1, c2 = st.columns(2)
    with c1: ori = st.selectbox("Origem", ["auto", "en", "es", "fr", "de", "pt"], index=0)
    with c2: dest = st.selectbox("Destino", ["pt", "en", "es", "fr", "de"], index=0)
    
    if file and st.button("Traduzir Agora", type="primary"):
        with st.spinner("Lendo arquivo..."):
            original = extrair_texto(file.getvalue(), file.type)
        
        traduzido = traduzir_texto_robusto(original, ori, dest)
        
        st.text_area("Resultado:", traduzido, height=300)
        st.download_button("Baixar Tradução (.txt)", traduzido, file_name="traduzido.txt")

with tab2:
    st.subheader("Remover Fundo de Imagem")
    img_file = st.file_uploader("Upload Image", type=["jpg", "png", "jpeg"], key="img1")
    if img_file:
        col_a, col_b = st.columns(2)
        col_a.image(img_file, caption="Original")
        
        if st.button("Remover Fundo"):
            with st.spinner("IA processando..."):
                output = remove(img_file.getvalue())
                col_b.image(output, caption="Resultado")
                st.download_button("Baixar PNG", output, "sem_fundo.png", "image/png")

with tab3:
    st.subheader("Gerador de Áudio (MP3)")
    audio_text = st.text_area("Texto para converter:", "Olá, este é o DocuTools Pro.")
    if st.button("Gerar Áudio"):
        with st.spinner("Sintetizando..."):
            tts = gTTS(text=audio_text, lang='pt')
            audio_fp = BytesIO()
            tts.write_to_fp(audio_fp)
            st.audio(audio_fp)

with tab4:
    st.subheader("Utilitários de PDF")
    st.info("Ferramentas de mesclagem e compressão em desenvolvimento para esta versão.")

st.sidebar.image("https://cdn-icons-png.flaticon.com/512/281/281760.png", width=50)
st.sidebar.title("Configurações")
if st.sidebar.button("Limpar Cache"):
    st.cache_data.clear()
    st.rerun()
