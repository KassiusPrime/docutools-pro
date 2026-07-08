import streamlit as st
from pypdf import PdfReader
from docx import Document
from bs4 import BeautifulSoup
from deep_translator import GoogleTranslator
from gtts import gTTS
import io
import json
from datetime import datetime
import os

st.set_page_config(page_title="DocuTools Pro", page_icon="📄", layout="wide")

st.title("📄 DocuTools Pro")
st.subheader("Processador de Documentos, OCR, Tradutor e Conversor de Áudio")
st.write("---")

if 'cache_persistente' not in st.session_state:
    st.session_state['cache_persistente'] = {}

def extrair_txt(file):
    return file.read().decode("utf-8", errors="ignore")

def extrair_pdf(file):
    pdf = PdfReader(file)
    texto = ""
    for page in pdf.pages:
        texto += page.extract_text() + "\n"
    return texto

def extrair_docx(file):
    doc = Document(file)
    texto = "\n".join([para.text for para in doc.paragraphs])
    return texto

def extrair_html(file):
    soup = BeautifulSoup(file.read(), "html.parser")
    return soup.get_text(separator="\n")

def dividir_em_blocos(texto, tamanho_maximo=3500):
    blocos = []
    inicio = 0
    while inicio < len(texto):
        fim = inicio + tamanho_maximo
        if fim < len(texto):
            ultimo_espaco = texto.rfind(' ', inicio, fim)
            if ultimo_espaco > inicio:
                fim = ultimo_espaco
        blocos.append(texto[inicio:fim].strip())
        inicio = fim
    return [b for b in blocos if b]

def traduzir_com_chunking(texto, idioma_destino):
    tradutor = GoogleTranslator(source='auto', target=idioma_destino)
    blocos = dividir_em_blocos(texto, tamanho_maximo=3500)
    texto_traduzido_completo = []
    
    for index, bloco in enumerate(blocos):
        try:
            progresso_percentual = (index + 1) / len(blocos)
            st.write(f"📦 Traduzindo bloco {index + 1} de {len(blocos)}...")
            
            bloco_traduzido = tradutor.translate(bloco)
            texto_traduzido_completo.append(bloco_traduzido)
        except Exception as e:
            st.error(f"❌ Erro ao traduzir bloco {index + 1}: {str(e)}")
            raise
    
    return "\n".join(texto_traduzido_completo)

def gerar_audio_com_chunking(texto, lang_audio='pt'):
    arquivo_saida = io.BytesIO()
    try:
        tts = gTTS(text=texto[:5000], lang=lang_audio, slow=False)
        tts.write_to_fp(arquivo_saida)
    except Exception as e:
        st.error(f"❌ Erro ao gerar áudio: {e}")
        raise
    arquivo_saida.seek(0)
    return arquivo_saida

col1, col2 = st.columns([1, 1])

with col1:
    st.header("1️⃣ Upload do Arquivo")
    uploaded_file = st.file_input("Suporta: PDF, DOCX, HTML e TXT", type=["pdf", "docx", "html", "txt"])
    
    texto_extraido = ""
    
    if uploaded_file is not None:
        nome_arquivo = uploaded_file.name
        st.success(f"✅ Arquivo carregado: {nome_arquivo}")
        st.info(f"📏 Tamanho: {uploaded_file.size / 1024:.2f} KB")
        
        if nome_arquivo.endswith(".txt"):
            texto_extraido = extrair_txt(uploaded_file)
        elif nome_arquivo.endswith(".pdf"):
            texto_extraido = extrair_pdf(uploaded_file)
        elif nome_arquivo.endswith(".docx"):
            texto_extraido = extrair_docx(uploaded_file)
        elif nome_arquivo.endswith(".html"):
            texto_extraido = extrair_html(uploaded_file)
        
        num_blocos = len(dividir_em_blocos(texto_extraido, 3500))
        st.metric("📊 Estatísticas do Texto", f"{len(texto_extraido):,} caracteres em {num_blocos} blocos")
        
        preview_text = texto_extraido[:1000] + "..." if len(texto_extraido) > 1000 else texto_extraido
        st.text_area("📖 Prévia do Texto Extraído:", preview_text, height=200, disabled=True)

with col2:
    st.header("2️⃣ Ferramentas e Saída")
    
    if texto_extraido:
        tab1, tab2, tab3 = st.tabs(["🌍 Tradução", "🔊 Áudio", "📚 Histórico"])
        
        with tab1:
            st.write("### 🌍 Tradução Avançada")
            
            idioma_destino = st.selectbox(
                "Traduzir para:",
                options=["en", "es", "pt", "fr", "it"],
                format_func=lambda x: {"en": "🇺🇸 Inglês", "es": "🇪🇸 Espanhol", "pt": "🇧🇷 Português", "fr": "🇫🇷 Francês", "it": "🇮🇹 Italiano"}[x]
            )
            
            if st.button("🚀 Traduzir Agora", type="primary"):
                with st.spinner("⏳ Processando..."):
                    try:
                        texto_traduzido = traduzir_com_chunking(texto_extraido, idioma_destino)
                        st.session_state['texto_resultado'] = texto_traduzido
                        st.success("✨ Tradução concluída!")
                    except Exception as e:
                        st.error(f"❌ Erro: {e}")
            
            if 'texto_resultado' in st.session_state:
                st.text_area("📄 Resultado da Tradução:", st.session_state['texto_resultado'], height=250, disabled=True)
        
        with tab2:
            st.write("### 🔊 Conversão para Áudio")
            
            if 'texto_resultado' in st.session_state:
                texto_para_audio = st.session_state['texto_resultado']
                idioma_audio = idioma_destino
            else:
                texto_para_audio = texto_extraido
                idioma_audio = 'pt'
            
            st.warning("⚠️ Apenas os primeiros 5000 caracteres serão convertidos em áudio")
            
            if st.button("🎤 Gerar Áudio", type="primary"):
                with st.spinner("🎵 Gerando..."):
                    try:
                        arquivo_audio = gerar_audio_com_chunking(texto_para_audio, lang_audio=idioma_audio)
                        st.audio(arquivo_audio, format="audio/mp3")
                        st.download_button(
                            label="📥 Baixar Áudio (.mp3)",
                            data=arquivo_audio,
                            file_name=f"docutools_{datetime.now().strftime('%Y%m%d_%H%M%S')}.mp3",
                            mime="audio/mp3"
                        )
                    except Exception as e:
                        st.error(f"❌ Erro: {e}")
        
        with tab3:
            st.write("### 📚 Histórico")
            st.info("Histórico de traduções será adicionado aqui")
    
    else:
        st.info("⏸️ Aguardando o upload de um arquivo")

st.write("---")
st.caption("🛠️ Desenvolvido com Streamlit | 🔒 Open-source")
