import streamlit as st
from pypdf import PdfReader
from docx import Document
from bs4 import BeautifulSoup
from deep_translator import GoogleTranslator
from gtts import gTTS
import io
import json
from datetime import datetime
import tempfile
import os

# ============================================================
# CONFIGURAÇÃO DE PÁGINA
# ============================================================

st.set_page_config(
    page_title="DocuTools Pro",
    page_icon="📄",
    layout="wide",
    initial_sidebar_state="expanded"
)

st.title("📄 DocuTools Pro")
st.subheader("Processador de Documentos, OCR, Tradutor e Conversor de Áudio")
st.write("---")

# ============================================================
# INICIALIZAÇÃO DE ESTADO
# ============================================================

if 'texto_extraido' not in st.session_state:
    st.session_state.texto_extraido = ""

if 'texto_resultado' not in st.session_state:
    st.session_state.texto_resultado = ""

if 'idioma_destino' not in st.session_state:
    st.session_state.idioma_destino = "en"

# ============================================================
# FUNÇÕES DE EXTRAÇÃO
# ============================================================

def extrair_txt(file):
    """Extrai texto de arquivo TXT"""
    try:
        return file.read().decode("utf-8", errors="ignore")
    except Exception as e:
        st.error(f"Erro ao extrair TXT: {e}")
        return ""

def extrair_pdf(file):
    """Extrai texto de arquivo PDF"""
    try:
        pdf = PdfReader(file)
        texto = ""
        for page in pdf.pages:
            texto += page.extract_text() + "\n"
        return texto
    except Exception as e:
        st.error(f"Erro ao extrair PDF: {e}")
        return ""

def extrair_docx(file):
    """Extrai texto de arquivo DOCX"""
    try:
        doc = Document(file)
        texto = "\n".join([para.text for para in doc.paragraphs])
        return texto
    except Exception as e:
        st.error(f"Erro ao extrair DOCX: {e}")
        return ""

def extrair_html(file):
    """Extrai texto de arquivo HTML"""
    try:
        soup = BeautifulSoup(file.read(), "html.parser")
        return soup.get_text(separator="\n")
    except Exception as e:
        st.error(f"Erro ao extrair HTML: {e}")
        return ""

# ============================================================
# FUNÇÕES DE PROCESSAMENTO
# ============================================================

def dividir_em_blocos(texto, tamanho_maximo=3500):
    """Divide texto em blocos seguros para tradução"""
    blocos = []
    inicio = 0
    
    while inicio < len(texto):
        fim = inicio + tamanho_maximo
        
        if fim < len(texto):
            ultimo_espaco = texto.rfind(' ', inicio, fim)
            if ultimo_espaco > inicio:
                fim = ultimo_espaco
        
        bloco = texto[inicio:fim].strip()
        if bloco:
            blocos.append(bloco)
        inicio = fim
    
    return blocos

def traduzir_com_chunking(texto, idioma_destino):
    """Traduz texto grande em blocos"""
    if not texto.strip():
        st.warning("Texto vazio para tradução")
        return ""
    
    try:
        tradutor = GoogleTranslator(source='auto', target=idioma_destino)
        blocos = dividir_em_blocos(texto, tamanho_maximo=3500)
        
        texto_traduzido_completo = []
        progress_bar = st.progress(0)
        status_text = st.empty()
        
        for index, bloco in enumerate(blocos):
            try:
                progresso = (index + 1) / len(blocos)
                progress_bar.progress(progresso)
                status_text.info(f"📦 Traduzindo bloco {index + 1} de {len(blocos)}...")
                
                bloco_traduzido = tradutor.translate(bloco)
                texto_traduzido_completo.append(bloco_traduzido)
                
            except Exception as e:
                st.error(f"Erro no bloco {index + 1}: {str(e)}")
                continue
        
        progress_bar.empty()
        status_text.empty()
        
        return "\n".join(texto_traduzido_completo)
        
    except Exception as e:
        st.error(f"Erro na tradução: {e}")
        return ""

def gerar_audio(texto, lang_audio='pt'):
    """Gera áudio a partir do texto"""
    if not texto.strip():
        st.warning("Texto vazio para áudio")
        return None
    
    try:
        arquivo_saida = io.BytesIO()
        texto_limitado = texto[:5000]
        
        with st.spinner("🎵 Gerando arquivo de áudio..."):
            tts = gTTS(text=texto_limitado, lang=lang_audio, slow=False)
            tts.write_to_fp(arquivo_saida)
        
        arquivo_saida.seek(0)
        return arquivo_saida
        
    except Exception as e:
        st.error(f"Erro ao gerar áudio: {e}")
        return None

# ============================================================
# LAYOUT PRINCIPAL
# ============================================================

col1, col2 = st.columns([1, 1], gap="large")

# ============================================================
# COLUNA 1: UPLOAD E EXTRAÇÃO
# ============================================================

with col1:
    st.header("1️⃣ Upload do Documento")
    
    # Widget de upload com try/except
    try:
        uploaded_file = st.file_uploader(
            "📁 Escolha um arquivo",
            type=["pdf", "docx", "html", "txt"],
            help="Suporta: PDF, DOCX, HTML e TXT"
        )
        
        if uploaded_file is not None:
            nome_arquivo = uploaded_file.name
            tamanho_kb = uploaded_file.size / 1024
            
            st.success(f"✅ Arquivo carregado: **{nome_arquivo}**")
            st.info(f"📏 Tamanho: {tamanho_kb:.2f} KB")
            
            # Verifica tamanho do arquivo
            if tamanho_kb > 10000:
                st.warning("⚠️ Arquivo grande - o processamento pode demorar")
            
            # Extrai texto conforme o tipo
            with st.spinner("📖 Extraindo texto..."):
                if nome_arquivo.endswith(".txt"):
                    st.session_state.texto_extraido = extrair_txt(uploaded_file)
                elif nome_arquivo.endswith(".pdf"):
                    st.session_state.texto_extraido = extrair_pdf(uploaded_file)
                elif nome_arquivo.endswith(".docx"):
                    st.session_state.texto_extraido = extrair_docx(uploaded_file)
                elif nome_arquivo.endswith(".html"):
                    st.session_state.texto_extraido = extrair_html(uploaded_file)
            
            if st.session_state.texto_extraido:
                st.success("✨ Texto extraído com sucesso!")
                
                # Estatísticas
                num_caracteres = len(st.session_state.texto_extraido)
                num_blocos = len(dividir_em_blocos(st.session_state.texto_extraido, 3500))
                num_palavras = len(st.session_state.texto_extraido.split())
                
                col_stat1, col_stat2, col_stat3 = st.columns(3)
                with col_stat1:
                    st.metric("📊 Caracteres", f"{num_caracteres:,}")
                with col_stat2:
                    st.metric("📝 Palavras", f"{num_palavras:,}")
                with col_stat3:
                    st.metric("📦 Blocos", num_blocos)
                
                # Preview
                st.subheader("👀 Prévia do Texto")
                preview_text = st.session_state.texto_extraido[:500] + "..." if num_caracteres > 500 else st.session_state.texto_extraido
                st.text_area(
                    "Primeiros 500 caracteres:",
                    preview_text,
                    height=150,
                    disabled=True
                )
            else:
                st.error("❌ Não consegui extrair o texto. Verifique o arquivo.")
        
        else:
            st.info("👆 Envie um arquivo para começar")
    
    except Exception as e:
        st.error(f"❌ Erro no upload: {e}")

# ============================================================
# COLUNA 2: FERRAMENTAS E SAÍDA
# ============================================================

with col2:
    st.header("2️⃣ Ferramentas e Saída")
    
    if st.session_state.texto_extraido:
        
        # Abas
        tab1, tab2, tab3 = st.tabs(["🌍 Tradução", "🔊 Áudio", "📥 Download"])
        
        # ========== ABA 1: TRADUÇÃO ==========
        with tab1:
            st.subheader("Tradução Avançada")
            
            idiomas = {
                "en": "🇺🇸 Inglês",
                "es": "🇪🇸 Espanhol",
                "pt": "🇧🇷 Português",
                "fr": "🇫🇷 Francês",
                "it": "🇮🇹 Italiano",
                "de": "🇩🇪 Alemão",
                "ja": "🇯🇵 Japonês",
                "zh-cn": "🇨🇳 Chinês (Simplificado)",
                "ru": "🇷🇺 Russo",
                "ar": "🇸🇦 Árabe"
            }
            
            st.session_state.idioma_destino = st.selectbox(
                "Traduzir para:",
                options=list(idiomas.keys()),
                format_func=lambda x: idiomas[x],
                key="select_idioma"
            )
            
            col_btn1, col_btn2 = st.columns(2)
            
            with col_btn1:
                if st.button("🚀 Traduzir", type="primary", use_container_width=True):
                    st.session_state.texto_resultado = traduzir_com_chunking(
                        st.session_state.texto_extraido,
                        st.session_state.idioma_destino
                    )
            
            with col_btn2:
                if st.button("🗑️ Limpar", use_container_width=True):
                    st.session_state.texto_resultado = ""
            
            if st.session_state.texto_resultado:
                st.success("✨ Tradução concluída!")
                st.text_area(
                    "Resultado da tradução:",
                    st.session_state.texto_resultado,
                    height=250,
                    disabled=True
                )
        
        # ========== ABA 2: ÁUDIO ==========
        with tab2:
            st.subheader("Conversão para Áudio")
            
            if st.session_state.texto_resultado:
                texto_para_audio = st.session_state.texto_resultado
                idioma_audio = st.session_state.idioma_destino
                label_audio = "🎤 Gerar Áudio da Tradução"
            else:
                texto_para_audio = st.session_state.texto_extraido
                idioma_audio = "pt"
                label_audio = "🎤 Gerar Áudio do Texto Original"
            
            st.info(f"📢 Será gerado em: {'Português' if idioma_audio == 'pt' else 'Outro idioma'}")
            st.warning("⚠️ Apenas os primeiros 5.000 caracteres serão convertidos")
            
            if st.button(label_audio, type="primary", use_container_width=True):
                arquivo_audio = gerar_audio(texto_para_audio, idioma_audio)
                
                if arquivo_audio:
                    st.audio(arquivo_audio, format="audio/mp3")
                    
                    st.download_button(
                        label="📥 Baixar Áudio (MP3)",
                        data=arquivo_audio,
                        file_name=f"docutools_{datetime.now().strftime('%Y%m%d_%H%M%S')}.mp3",
                        mime="audio/mp3",
                        use_container_width=True
                    )
        
        # ========== ABA 3: DOWNLOAD ==========
        with tab3:
            st.subheader("Baixar Resultados")
            
            if st.session_state.texto_resultado:
                st.text("📄 Tradução disponível para download")
                
                st.download_button(
                    label="📥 Baixar Tradução (TXT)",
                    data=st.session_state.texto_resultado,
                    file_name=f"traducao_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt",
                    mime="text/plain",
                    use_container_width=True
                )
            
            st.text("📝 Texto Original disponível para download")
            st.download_button(
                label="📥 Baixar Texto Original (TXT)",
                data=st.session_state.texto_extraido,
                file_name=f"original_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt",
                mime="text/plain",
                use_container_width=True
            )
    
    else:
        st.info("⏸️ Nenhum texto extraído. Envie um arquivo primeiro.")

# ============================================================
# RODAPÉ
# ============================================================

st.write("---")
col_footer1, col_footer2, col_footer3 = st.columns(3)

with col_footer1:
    st.caption("🛠️ Desenvolvido com Streamlit")

with col_footer2:
    st.caption("🔒 Totalmente Open-source")

with col_footer3:
    st.caption("⚡ Rápido e Seguro")
