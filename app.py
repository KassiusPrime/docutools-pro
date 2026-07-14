import streamlit as st
import pdfplumber
import time
import pytesseract
import openai
import os
from docx import Document
from io import BytesIO
from deep_translator import GoogleTranslator
from gtts import gTTS
from PIL import Image
from pdf2image import convert_from_bytes

# Proteção para o rembg (evita que o app inteiro caia se a IA falhar)
try:
    from rembg import remove
    REMBG_AVAILABLE = True
except Exception:
    REMBG_AVAILABLE = False

# 1. Configurações Iniciais
st.set_page_config(page_title="DocuTools Pro", page_icon="🚀", layout="wide")

# Tentar carregar chave da API
API_KEY = st.secrets.get("OPENAI_API_KEY", None)

# 2. Funções de Cérebro (Lógica)

def call_with_retry(func, *args, retries=3, delay=1, **kwargs):
    for i in range(retries):
        try: return func(*args, **kwargs)
        except Exception as e:
            if i == retries - 1: return None
            time.sleep(delay * (2 ** i))

@st.cache_data
def extrair_texto_completo(file_bytes, file_type):
    text = ""
    try:
        if "pdf" in file_type:
            with pdfplumber.open(BytesIO(file_bytes)) as pdf:
                text = "\n".join([p.extract_text() or "" for p in pdf.pages])
            if len(text.strip()) < 20: # Se for PDF de imagem
                images = convert_from_bytes(file_bytes)
                text = "\n".join([pytesseract.image_to_string(img, lang='por+eng') for img in images])
        elif "officedocument" in file_type:
            doc = Document(BytesIO(file_bytes))
            text = "\n".join([p.text for p in doc.paragraphs])
        else:
            text = file_bytes.decode("utf-8")
        return text
    except Exception as e:
        return f"Erro na extração: {e}"

def traduzir_bloco(texto, de, para):
    """Traduz usando GPT-4o-mini (Pro) ou Google (Free)"""
    if API_KEY:
        try:
            client = openai.OpenAI(api_key=API_KEY)
            res = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": f"Traduza de {de} para {para}. Mantenha parágrafos e termos técnicos. Retorne apenas a tradução."},
                    {"role": "user", "content": texto}
                ]
            )
            return res.choices[0].message.content
        except:
            pass # Fallback se a API falhar ou acabar o crédito
    
    # Fallback Gratuito
    return GoogleTranslator(source='auto', target=para.lower()[:2]).translate(texto)

# 3. Interface (UI)

st.title("🚀 DocuTools Pro")
st.caption("A evolução do processamento de documentos.")

tabs = st.tabs(["🌐 Tradução Pro", "🖼️ Imagem IA", "🔊 Voz", "⚙️ Config"])

with tabs[0]:
    st.subheader("Tradução Inteligente com Preservação de Formato")
    arq = st.file_uploader("Upload (PDF, DOCX, TXT)", type=["pdf", "docx", "txt"], key="doc")
    
    col1, col2 = st.columns(2)
    with col1: de_lang = st.selectbox("Idioma Original", ["Detectar", "English", "Portuguese", "Spanish"])
    with col2: para_lang = st.selectbox("Traduzir para", ["Portuguese", "English", "Spanish", "French"])
    
    if arq and st.button("🚀 Iniciar Processamento"):
        with st.status("Executando motor de tradução...", expanded=True) as s:
            # Extração
            texto_bruto = extrair_texto_completo(arq.getvalue(), arq.type)
            
            # Tradução por parágrafos para não perder a formatação
            paragrafos = texto_bruto.split('\n')
            final = []
            barra = st.progress(0)
            
            for i, p in enumerate(paragrafos):
                if p.strip():
                    # Traduzir cada parágrafo individualmente
                    t = traduzir_bloco(p, de_lang, para_lang)
                    final.append(t)
                else:
                    final.append("")
                barra.progress((i+1)/len(paragrafos))
            
            resultado = "\n".join(final)
            s.update(label="Concluído com sucesso!", state="complete")
        
        st.text_area("Resultado Final", resultado, height=400)
        st.download_button("📥 Baixar Documento Traduzido", resultado, file_name=f"DocuTools_{arq.name}")

with tabs[1]:
    st.subheader("Remoção de Fundo Profissional")
    if not REMBG_AVAILABLE:
        st.error("O motor de remoção de fundo não pôde ser carregado no servidor. Tente reiniciar o app.")
    else:
        img_arq = st.file_uploader("Escolha uma imagem", type=["jpg", "png"], key="img")
        if img_arq and st.button("Remover Fundo"):
            with st.spinner("IA processando imagem..."):
                try:
                    saida = remove(img_arq.getvalue())
                    st.image(saida, width=400)
                    st.download_button("Baixar PNG", saida, "sem_fundo.png")
                except Exception as e:
                    st.error(f"Erro ao processar imagem: {e}")
with tabs[2]:
    st.subheader("Texto para Áudio (MP3)")
    txt_voz = st.text_area("Texto:", "DocuTools Pro transformando seu fluxo de trabalho.")
    if st.button("Gerar Áudio"):
        tts = gTTS(text=txt_voz, lang='pt')
        b = BytesIO()
        tts.write_to_fp(b)
        st.audio(b)

with tabs[3]:
    st.subheader("Status do Sistema")
    if API_KEY:
        st.success("✅ Motor de Tradução: OpenAI GPT-4o-mini (Ativado)")
    else:
        st.warning("⚠️ Motor de Tradução: Básico/Gratuito (Chave OpenAI não detectada)")
    
    if st.button("Limpar Cache do Servidor"):
        st.cache_data.clear()
        st.rerun()

st.sidebar.markdown("---")
st.sidebar.info("DocuTools Pro v2.0 - SaaS Ready")
