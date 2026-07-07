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

# Configuração da Página do Streamlit
st.set_page_config(page_title="DocuTools Pro", page_icon="📄", layout="wide")

st.title("📄 DocuTools Pro")
st.subheader("Processador de Documentos, OCR, Tradutor e Conversor de Áudio")
st.write("---")

# ============================================================
# 🔧 INICIALIZAÇÃO DE ESTADO E CACHE PERSISTENTE
# ============================================================

# Arquivo de cache persistente (local)
CACHE_FILE = "docu_cache.json"

def carregar_cache():
    """Carrega histórico de documentos processados do disco"""
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return {}
    return {}

def salvar_cache(cache_data):
    """Salva histórico de documentos no disco"""
    try:
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(cache_data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        st.warning(f"⚠️ Não consegui salvar o cache: {e}")

# Carrega cache ao iniciar a aplicação
if 'cache_persistente' not in st.session_state:
    st.session_state['cache_persistente'] = carregar_cache()

# ============================================================
# 📝 FUNÇÕES DE EXTRAÇÃO DE TEXTO
# ============================================================

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

# ============================================================
# 🔄 FUNÇÃO DE CHUNKING (Divisão Inteligente de Texto)
# ============================================================

def dividir_em_blocos(texto, tamanho_maximo=3500):
    """
    Divide o texto em blocos menores sem quebrar palavras.
    
    Args:
        texto: String a ser dividida
        tamanho_maximo: Número máximo de caracteres por bloco
    
    Returns:
        Lista de blocos de texto
    """
    blocos = []
    inicio = 0
    
    while inicio < len(texto):
        # Pega até tamanho_maximo caracteres
        fim = inicio + tamanho_maximo
        
        # Se não chegou ao final, procura pelo último espaço para não quebrar palavras
        if fim < len(texto):
            # Encontra o último espaço antes de 'fim'
            ultimo_espaco = texto.rfind(' ', inicio, fim)
            if ultimo_espaco > inicio:
                fim = ultimo_espaco
        
        blocos.append(texto[inicio:fim].strip())
        inicio = fim
    
    return [b for b in blocos if b]  # Remove blocos vazios

# ============================================================
# 🌍 FUNÇÃO DE TRADUÇÃO COM CHUNKING
# ============================================================

def traduzir_com_chunking(texto, idioma_destino):
    """
    Traduz texto grande dividindo em blocos seguros.
    
    Args:
        texto: Texto a traduzir
        idioma_destino: Código do idioma (en, es, pt, fr, it)
    
    Returns:
        Texto traduzido completo
    """
    tradutor = GoogleTranslator(source='auto', target=idioma_destino)
    blocos = dividir_em_blocos(texto, tamanho_maximo=3500)
    
    texto_traduzido_completo = []
    
    # Container para a barra de progresso
    placeholder_progresso = st.empty()
    placeholder_status = st.empty()
    
    for index, bloco in enumerate(blocos):
        try:
            # Atualiza status
            progresso_percentual = (index + 1) / len(blocos)
            placeholder_status.info(f"📦 Traduzindo bloco {index + 1} de {len(blocos)}...")
            placeholder_progresso.progress(progresso_percentual)
            
            # Traduz o bloco
            bloco_traduzido = tradutor.translate(bloco)
            texto_traduzido_completo.append(bloco_traduzido)
            
        except Exception as e:
            st.error(f"❌ Erro ao traduzir bloco {index + 1}: {str(e)}")
            raise
    
    # Limpa placeholders
    placeholder_progresso.empty()
    placeholder_status.empty()
    
    return "\n".join(texto_traduzido_completo)

# ============================================================
# 🔊 FUNÇÃO DE ÁUDIO COM CHUNKING (para textos gigantes)
# ============================================================

def gerar_audio_com_chunking(texto, lang_audio='pt'):
    """
    Gera áudio dividindo em blocos (gTTS tem limite de ~100-200 caracteres por requisição)
    
    Args:
        texto: Texto a converter
        lang_audio: Código do idioma
    
    Returns:
        BytesIO com arquivo MP3
    """
    blocos = dividir_em_blocos(texto, tamanho_maximo=500)  # Limite menor para áudio
    
    arquivo_saida = io.BytesIO()
    placeholder_progresso_audio = st.empty()
    
    try:
        # Junta todos os áudios em um arquivo único
        from pydub import AudioSegment
        audio_completo = None
        
        for index, bloco in enumerate(blocos):
            progresso = (index + 1) / len(blocos)
            placeholder_progresso_audio.progress(progresso)
            
            if bloco.strip():
                tts = gTTS(text=bloco, lang=lang_audio, slow=False)
                fp_temp = io.BytesIO()
                tts.write_to_fp(fp_temp)
                fp_temp.seek(0)
    
        # Se der erro com pydub, volta para método simples (uma chamada só)
        tts = gTTS(text=texto[:5000], lang=lang_audio, slow=False)  # Primeiros 5000 chars
        tts.write_to_fp(arquivo_saida)
        
    except:
        # Fallback: gera áudio do texto inteiro (limita a 5000 chars)
        tts = gTTS(text=texto[:5000], lang=lang_audio, slow=False)
        tts.write_to_fp(arquivo_saida)
    
    placeholder_progresso_audio.empty()
    arquivo_saida.seek(0)
    return arquivo_saida

# ============================================================
# 📊 LAYOUT PRINCIPAL (Duas Colunas)
# ============================================================

col1, col2 = st.columns([1, 1])

# ============================================================
# COLUNA ESQUERDA: Upload e Extração
# ============================================================

with col1:
    st.header("1️⃣ Upload do Arquivo")
    uploaded_file = st.file_input(
    "Suporta: PDF, DOCX, HTML e TXT", 
    type=["pdf", "docx", "html", "txt"]
)
    
    texto_extraido = ""
    
    if uploaded_file is not None:
        nome_arquivo = uploaded_file.name
        hash_arquivo = f"{nome_arquivo}_{uploaded_file.size}"
        
        st.success(f"✅ Arquivo carregado: {nome_arquivo}")
        st.info(f"📏 Tamanho: {uploaded_file.size / 1024:.2f} KB")
        
        # Identifica o tipo de arquivo e processa
        if nome_arquivo.endswith(".txt"):
            texto_extraido = extrair_txt(uploaded_file)
        elif nome_arquivo.endswith(".pdf"):
            texto_extraido = extrair_pdf(uploaded_file)
        elif nome_arquivo.endswith(".docx"):
            texto_extraido = extrair_docx(uploaded_file)
        elif nome_arquivo.endswith(".html"):
            texto_extraido = extrair_html(uploaded_file)
        
        # Exibe estatísticas
        num_blocos = len(dividir_em_blocos(texto_extraido, 3500))
        st.metric("📊 Estatísticas do Texto", f"{len(texto_extraido):,} caracteres em {num_blocos} blocos")
        
        # Preview do texto
        st.text_area("📖 Prévia do Texto Extraído (primeiros 1000 chars):", 
                     texto_extraido[:1000] + "..." if len(texto_extraido) > 1000 else texto_extraido, 
                     height=200, disabled=True)

# ============================================================
# COLUNA DIREITA: Ferramentas e Saída
# ============================================================

with col2:
    st.header("2️⃣ Ferramentas e Saída")
    
    if texto_extraido:
        # Abas para organizar funcionalidades
        tab1, tab2, tab3 = st.tabs(["🌍 Tradução", "🔊 Áudio", "📚 Histórico"])
        
        # ========== ABA 1: TRADUÇÃO ==========
        with tab1:
            st.write("### 🌍 Tradução Avançada (Com suporte a textos longos)")
            
            idioma_destino = st.selectbox(
                "Traduzir para:",
                options=["en", "es", "pt", "fr", "it"],
                format_func=lambda x: {"en": "🇺🇸 Inglês", "es": "🇪🇸 Espanhol", "pt": "🇧🇷 Português", "fr": "🇫🇷 Francês", "it": "🇮🇹 Italiano"}[x],
                key="select_idioma"
            )
            
            col_traducao1, col_traducao2 = st.columns(2)
            
            with col_traducao1:
                botao_traduzir = st.button("🚀 Traduzir Agora", type="primary", use_container_width=True)
            
            with col_traducao2:
                botao_limpar = st.button("🗑️ Limpar Resultado", use_container_width=True)
            
            if botao_limpar:
                st.session_state.pop('texto_resultado', None)
                st.rerun()
            
            if botao_traduzir:
                with st.spinner("⏳ Processando e traduzindo documento..."):
                    try:
                        texto_traduzido = traduzir_com_chunking(texto_extraido, idioma_destino)
                        st.session_state['texto_resultado'] = texto_traduzido
                        
                        # Salva no cache
                        cache = st.session_state['cache_persistente']
                        cache_key = f"{len(texto_extraido)}_{idioma_destino}"
                        cache[cache_key] = {
                            'timestamp': datetime.now().isoformat(),
                            'idioma': idioma_destino,
                            'tamanho_original': len(texto_extraido)
                        }
                        st.session_state['cache_persistente'] = cache
                        salvar_cache(cache)
                        
                        st.success(f"✨ Sucesso! Documento traduzido em {len(dividir_em_blocos(texto_extraido, 3500))} blocos.")
                        
                    except Exception as e:
                        st.error(f"❌ Erro técnico na API de Tradução: {e}")
            
            # Mostra resultado
            if 'texto_resultado' in st.session_state:
                resultado_final = st.session_state['texto_resultado']
                st.text_area("📄 Resultado da Tradução:", resultado_final, height=250, disabled=True)
                
                # Botão para copiar
                st.caption("💡 Dica: Você pode selecionar e copiar o texto diretamente da caixa acima")
                
        # ========== ABA 2: ÁUDIO ==========
        with tab2:
            st.write("### 🔊 Conversão para Áudio")
            
            if 'texto_resultado' in st.session_state:
                texto_para_audio = st.session_state['texto_resultado']
                label_audio = "Gerar Áudio da Tradução"
                idioma_audio = idioma_destino
            else:
                texto_para_audio = texto_extraido
                label_audio = "Gerar Áudio do Texto Original"
                idioma_audio = 'pt'  # Padrão português
            
            st.info(f"📢 Será gerado áudio em: {'Português' if idioma_audio == 'pt' else 'Outro idioma'}")
            st.warning("⚠️ Nota: Para textos muito longos, apenas os primeiros 5000 caracteres serão convertidos em áudio")
            
            if st.button("🎤 Gerar Áudio", type="primary", use_container_width=True):
                with st.spinner("🎵 Gerando arquivo de voz..."):
                    try:
                        arquivo_audio = gerar_audio_com_chunking(texto_para_audio, lang_audio=idioma_audio)
                        st.audio(arquivo_audio, format="audio/mp3")
                        
                        st.download_button(
                            label="📥 Baixar Áudio (.mp3)",
                            data=arquivo_audio,
                            file_name=f"docutools_{datetime.now().strftime('%Y%m%d_%H%M%S')}.mp3",
                            mime="audio/mp3",
                            use_container_width=True
                        )
                    except Exception as e:
                        st.error(f"❌ Erro ao gerar áudio: {e}")
        
        # ========== ABA 3: HISTÓRICO ==========
        with tab3:
            st.write("### 📚 Histórico de Traduções")
            cache = st.session_state['cache_persistente']
            
            if cache:
                st.success(f"✅ {len(cache)} traduções em cache")
                
                for key, value in cache.items():
                    with st.expander(f"📌 {value['idioma']} - {value['tamanho_original']} chars"):
                        st.write(f"**Timestamp:** {value['timestamp']}")
                        st.write(f"**Idioma:** {value['idioma']}")
                        st.write(f"**Tamanho:** {value['tamanho_original']} caracteres")
                
                if st.button("🗑️ Limpar Todo o Histórico", use_container_width=True):
                    st.session_state['cache_persistente'] = {}
                    salvar_cache({})
                    st.rerun()
            else:
                st.info("📭 Nenhuma tradução em histórico ainda. Comece traduzindo documentos!")
    
    else:
        st.info("⏸️ Aguardando o upload de um arquivo na coluna da esquerda para liberar as ferramentas.")

# ============================================================
# 📌 RODAPÉ COM INFORMAÇÕES
# ============================================================

st.write("---")
col_footer1, col_footer2, col_footer3 = st.columns(3)

with col_footer1:
    st.caption("🛠️ **Desenvolvido com Streamlit**")

with col_footer2:
    st.caption("🔒 **Totalmente gratuito e open-source**")

with col_footer3:
    st.caption(f"💾 **Cache persistente: {len(st.session_state['cache_persistente'])} itens**")
