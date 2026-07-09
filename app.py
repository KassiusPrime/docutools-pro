import streamlit as st
from pypdf import PdfReader
from docx import Document
from bs4 import BeautifulSoup
from deep_translator import GoogleTranslator
from gtts import gTTS
from fpdf import FPDF
from PIL import Image
import io
import os
import time
from datetime import datetime

# Tentar importar rembg (removedor de fundo)
try:
    from rembg import remove as remove_background
    HAS_REMBG = True
except ImportError:
    HAS_REMBG = False

# ============================================================
# CONFIGURAÇÃO DE PÁGINA
# ============================================================

st.set_page_config(
    page_title="DocuTools Pro",
    page_icon="📄",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Limite rígido de upload (em KB). Mantenha isso alinhado com
# [server] maxUploadSize em .streamlit/config.toml (veja instruções).
LIMITE_UPLOAD_KB = 50 * 1024  # 50 MB

st.title("📄 DocuTools Pro")
st.subheader("Processador de Documentos, OCR, Tradutor, Áudio e Conversor de Formatos")
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
# FONTE COM FALLBACK (para conversão em imagem)
# ============================================================

def obter_fonte(tamanho=20):
    """
    Tenta carregar uma fonte TrueType legível em ordem de preferência.
    Em servidores Linux (Streamlit Cloud, Docker) 'arial.ttf' quase nunca
    existe, então tentamos alternativas comuns antes de cair no fallback
    feio do Pillow (load_default).
    """
    from PIL import ImageFont

    candidatos = [
        "arial.ttf",
        "Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",  # macOS
        "C:\\Windows\\Fonts\\arial.ttf",                  # Windows
    ]

    for caminho in candidatos:
        try:
            return ImageFont.truetype(caminho, tamanho)
        except Exception:
            continue

    # Fallback final: fonte padrão do Pillow (permite tamanho a partir do Pillow 9.2+)
    try:
        return ImageFont.load_default(size=tamanho)
    except TypeError:
        return ImageFont.load_default()

# ============================================================
# FUNÇÕES DE EXTRAÇÃO (com cache)
# ============================================================
# Observação: passamos bytes (via getvalue()) em vez do objeto UploadedFile
# diretamente, porque o cache do Streamlit precisa de um argumento hasheável
# de forma estável entre reruns.

@st.cache_data(show_spinner=False)
def extrair_txt(file_bytes: bytes) -> str:
    """Extrai texto de arquivo TXT"""
    try:
        return file_bytes.decode("utf-8", errors="ignore")
    except Exception as e:
        st.error(f"Erro ao extrair TXT: {e}")
        return ""

@st.cache_data(show_spinner=False)
def extrair_pdf(file_bytes: bytes) -> str:
    """Extrai texto de arquivo PDF"""
    try:
        pdf = PdfReader(io.BytesIO(file_bytes))
        texto = ""
        for page in pdf.pages:
            texto += (page.extract_text() or "") + "\n"
        return texto
    except Exception as e:
        st.error(f"Erro ao extrair PDF: {e}")
        return ""

@st.cache_data(show_spinner=False)
def extrair_docx(file_bytes: bytes) -> str:
    """Extrai texto de arquivo DOCX"""
    try:
        doc = Document(io.BytesIO(file_bytes))
        texto = "\n".join([para.text for para in doc.paragraphs])
        return texto
    except Exception as e:
        st.error(f"Erro ao extrair DOCX: {e}")
        return ""

@st.cache_data(show_spinner=False)
def extrair_html(file_bytes: bytes) -> str:
    """Extrai texto de arquivo HTML"""
    try:
        soup = BeautifulSoup(file_bytes, "html.parser")
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

def traduzir_bloco_com_retry(tradutor, bloco, max_tentativas=3):
    """
    Traduz um único bloco com retry e backoff exponencial.
    Protege contra erros 429 (rate limit) do endpoint não-oficial
    do Google Translate usado pelo deep-translator.
    """
    ultimo_erro = None
    for tentativa in range(max_tentativas):
        try:
            return tradutor.translate(bloco)
        except Exception as e:
            ultimo_erro = e
            if tentativa < max_tentativas - 1:
                time.sleep(2 ** tentativa)  # 1s, 2s, 4s...
    raise ultimo_erro

def traduzir_com_chunking(texto, idioma_destino):
    """Traduz texto grande em blocos, com retry por bloco"""
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

                bloco_traduzido = traduzir_bloco_com_retry(tradutor, bloco)
                texto_traduzido_completo.append(bloco_traduzido)

                # Pequena pausa entre blocos para reduzir chance de rate limit
                time.sleep(0.5)

            except Exception as e:
                st.error(f"Erro no bloco {index + 1} (após tentativas): {str(e)}")
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
# FUNÇÕES DE CONVERSÃO
# ============================================================

def converter_para_pdf(texto):
    """Converte texto para PDF"""
    try:
        pdf = FPDF()
        pdf.add_page()
        pdf.set_auto_page_break(auto=True, margin=15)
        pdf.set_font("Helvetica", size=11)

        for linha in texto.split('\n'):
            linha_sanitizada = linha.encode('latin-1', 'replace').decode('latin-1')
            if linha_sanitizada.strip():
                pdf.multi_cell(0, 10, text=linha_sanitizada)
            else:
                pdf.ln(5)

        return pdf.output()
    except Exception as e:
        st.error(f"Erro ao converter PDF: {e}")
        return None

def converter_para_docx(texto):
    """Converte texto para DOCX"""
    try:
        doc = Document()
        doc.add_paragraph(texto)
        docx_bytes = io.BytesIO()
        doc.save(docx_bytes)
        return docx_bytes.getvalue()
    except Exception as e:
        st.error(f"Erro ao converter DOCX: {e}")
        return None

def converter_para_html(texto):
    """Converte texto para HTML"""
    try:
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>DocuTools Pro Export</title>
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    margin: 20px;
                    line-height: 1.6;
                    background-color: #f5f5f5;
                }}
                .container {{
                    background-color: white;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }}
                pre {{
                    background-color: #f0f0f0;
                    padding: 15px;
                    border-radius: 5px;
                    overflow-x: auto;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <h1>📄 DocuTools Pro - Documento Exportado</h1>
                <p>Gerado em: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}</p>
                <pre>{texto}</pre>
            </div>
        </body>
        </html>
        """
        return html_content.encode('utf-8')
    except Exception as e:
        st.error(f"Erro ao converter HTML: {e}")
        return None

def converter_para_imagem(texto, formato='png'):
    """Converte texto para imagem (PNG ou JPG)"""
    try:
        from PIL import ImageDraw

        width = 1200
        height = max(800, len(texto.split('\n')) * 30)
        img = Image.new('RGB', (width, height), color='white')
        draw = ImageDraw.Draw(img)

        font = obter_fonte(20)

        y = 20
        margin = 20

        for linha in texto.split('\n'):
            while len(linha) > 0:
                draw.text((margin, y), linha[:80], fill='black', font=font)
                linha = linha[80:]
                y += 30
                if y > height - 50:
                    break
            if y > height - 50:
                break

        img_bytes = io.BytesIO()
        if formato.lower() in ['jpg', 'jpeg']:
            img = img.convert('RGB')
            img.save(img_bytes, format='JPEG', quality=95)
        else:
            img.save(img_bytes, format='PNG')

        return img_bytes.getvalue()
    except Exception as e:
        st.error(f"Erro ao converter imagem: {e}")
        return None

def remover_fundo_imagem(arquivo_imagem):
    """Remove fundo da imagem usando rembg"""
    if not HAS_REMBG:
        st.error("❌ A biblioteca 'rembg' não está instalada. Verifique o requirements.txt")
        return None

    try:
        img_bytes = arquivo_imagem.read()

        with st.status("🎨 Removendo fundo...", expanded=True) as status:
            st.write("Carregando modelo de IA (pode demorar na primeira execução)...")
            resultado = remove_background(img_bytes)
            status.update(label="✅ Fundo removido!", state="complete", expanded=False)

        return resultado
    except Exception as e:
        st.error(f"Erro ao remover fundo: {e}")
        return None

# ============================================================
# SIDEBAR: RESETAR ESTADO
# ============================================================

with st.sidebar:
    st.header("⚙️ Opções")
    if st.button("🗑️ Resetar tudo", use_container_width=True, key="btn_reset_geral"):
        for chave in ["texto_extraido", "texto_resultado", "idioma_destino"]:
            st.session_state.pop(chave, None)
        st.rerun()

# ============================================================
# LAYOUT PRINCIPAL
# ============================================================

col1, col2 = st.columns([1, 1], gap="large")

# ============================================================
# COLUNA 1: UPLOAD E EXTRAÇÃO
# ============================================================

with col1:
    st.header("1️⃣ Upload do Documento")

    try:
        uploaded_file = st.file_uploader(
            "📁 Escolha um arquivo",
            type=["pdf", "docx", "html", "txt"],
            help=f"Suporta: PDF, DOCX, HTML e TXT (limite {LIMITE_UPLOAD_KB // 1024} MB)"
        )

        if uploaded_file is not None:
            nome_arquivo = uploaded_file.name
            tamanho_kb = uploaded_file.size / 1024

            # Limite rígido: interrompe o processamento se ultrapassar
            if tamanho_kb > LIMITE_UPLOAD_KB:
                st.error(
                    f"❌ Arquivo muito grande ({tamanho_kb / 1024:.1f} MB). "
                    f"O limite é {LIMITE_UPLOAD_KB / 1024:.0f} MB."
                )
                st.stop()

            st.success(f"✅ Arquivo carregado: **{nome_arquivo}**")
            st.info(f"📏 Tamanho: {tamanho_kb:.2f} KB")

            if tamanho_kb > 10000:
                st.warning("⚠️ Arquivo grande - o processamento pode demorar")

            file_bytes = uploaded_file.getvalue()

            with st.spinner("📖 Extraindo texto..."):
                if nome_arquivo.endswith(".txt"):
                    st.session_state.texto_extraido = extrair_txt(file_bytes)
                elif nome_arquivo.endswith(".pdf"):
                    st.session_state.texto_extraido = extrair_pdf(file_bytes)
                elif nome_arquivo.endswith(".docx"):
                    st.session_state.texto_extraido = extrair_docx(file_bytes)
                elif nome_arquivo.endswith(".html"):
                    st.session_state.texto_extraido = extrair_html(file_bytes)

            if st.session_state.texto_extraido:
                st.success("✨ Texto extraído com sucesso!")

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

                st.subheader("👀 Prévia do Texto")
                preview_text = st.session_state.texto_extraido[:500] + "..." if num_caracteres > 500 else st.session_state.texto_extraido
                st.text_area(
                    "Primeiros 500 caracteres:",
                    preview_text,
                    height=150,
                    disabled=True,
                    key="preview_texto_extraido"
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

        tab1, tab2, tab3, tab4 = st.tabs(["🌍 Tradução", "🔊 Áudio", "🔄 Conversão", "📥 Download"])

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
                if st.button("🚀 Traduzir", type="primary", use_container_width=True, key="btn_traduzir"):
                    st.session_state.texto_resultado = traduzir_com_chunking(
                        st.session_state.texto_extraido,
                        st.session_state.idioma_destino
                    )

            with col_btn2:
                if st.button("🗑️ Limpar", use_container_width=True, key="btn_limpar_traducao"):
                    st.session_state.texto_resultado = ""

            if st.session_state.texto_resultado:
                st.success("✨ Tradução concluída!")
                st.text_area(
                    "Resultado da tradução:",
                    st.session_state.texto_resultado,
                    height=250,
                    disabled=True,
                    key="preview_traducao"
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

            if st.button(label_audio, type="primary", use_container_width=True, key="btn_gerar_audio"):
                arquivo_audio = gerar_audio(texto_para_audio, idioma_audio)

                if arquivo_audio:
                    st.audio(arquivo_audio, format="audio/mp3")

                    st.download_button(
                        label="📥 Baixar Áudio (MP3)",
                        data=arquivo_audio,
                        file_name=f"docutools_{datetime.now().strftime('%Y%m%d_%H%M%S')}.mp3",
                        mime="audio/mp3",
                        use_container_width=True,
                        key="download_audio"
                    )

        # ========== ABA 3: CONVERSÃO ==========
        with tab3:
            st.subheader("🔄 Converter para Múltiplos Formatos")

            col_conv1, col_conv2 = st.columns(2)

            with col_conv1:
                if st.button("📄 Converter para PDF", use_container_width=True, key="btn_conv_pdf"):
                    resultado = converter_para_pdf(st.session_state.texto_extraido)
                    if resultado:
                        st.download_button(
                            "💾 Baixar PDF",
                            resultado,
                            f"documento_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf",
                            "application/pdf",
                            use_container_width=True,
                            key="download_pdf"
                        )

                if st.button("📋 Converter para DOCX", use_container_width=True, key="btn_conv_docx"):
                    resultado = converter_para_docx(st.session_state.texto_extraido)
                    if resultado:
                        st.download_button(
                            "💾 Baixar DOCX",
                            resultado,
                            f"documento_{datetime.now().strftime('%Y%m%d_%H%M%S')}.docx",
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                            use_container_width=True,
                            key="download_docx"
                        )

                if st.button("🌐 Converter para HTML", use_container_width=True, key="btn_conv_html"):
                    resultado = converter_para_html(st.session_state.texto_extraido)
                    if resultado:
                        st.download_button(
                            "💾 Baixar HTML",
                            resultado,
                            f"documento_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html",
                            "text/html",
                            use_container_width=True,
                            key="download_html"
                        )

            with col_conv2:
                if st.button("🖼️ Converter para PNG", use_container_width=True, key="btn_conv_png"):
                    resultado = converter_para_imagem(st.session_state.texto_extraido, 'png')
                    if resultado:
                        st.download_button(
                            "💾 Baixar PNG",
                            resultado,
                            f"documento_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png",
                            "image/png",
                            use_container_width=True,
                            key="download_png"
                        )

                if st.button("🖼️ Converter para JPG", use_container_width=True, key="btn_conv_jpg"):
                    resultado = converter_para_imagem(st.session_state.texto_extraido, 'jpg')
                    if resultado:
                        st.download_button(
                            "💾 Baixar JPG",
                            resultado,
                            f"documento_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg",
                            "image/jpeg",
                            use_container_width=True,
                            key="download_jpg"
                        )

                if st.button("📝 Converter para TXT", use_container_width=True, key="btn_conv_txt"):
                    st.download_button(
                        "💾 Baixar TXT",
                        st.session_state.texto_extraido.encode('utf-8'),
                        f"documento_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt",
                        "text/plain",
                        use_container_width=True,
                        key="download_txt"
                    )

        # ========== ABA 4: DOWNLOAD ==========
        with tab4:
            st.subheader("📥 Downloads Disponíveis")

            st.write("**📝 Texto Original:**")
            st.download_button(
                "📥 Baixar Texto Original (TXT)",
                st.session_state.texto_extraido.encode('utf-8'),
                f"original_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt",
                "text/plain",
                use_container_width=True,
                key="download_original_txt"
            )

            if st.session_state.texto_resultado:
                st.write("**🌍 Texto Traduzido:**")
                st.download_button(
                    "📥 Baixar Tradução (TXT)",
                    st.session_state.texto_resultado.encode('utf-8'),
                    f"traducao_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt",
                    "text/plain",
                    use_container_width=True,
                    key="download_traducao_txt"
                )

    else:
        st.info("⏸️ Nenhum texto extraído. Envie um arquivo primeiro.")

# ============================================================
# SEÇÃO 3: REMOVEDOR DE FUNDO
# ============================================================

st.write("---")
st.header("🎨 Removedor de Fundo de Imagem")

col_img1, col_img2 = st.columns(2, gap="large")

uploaded_image = None

with col_img1:
    st.subheader("Upload da Imagem")

    if HAS_REMBG:
        uploaded_image = st.file_uploader(
            "📸 Escolha uma imagem",
            type=["png", "jpg", "jpeg"],
            key="image_uploader",
            help="Suporta: PNG, JPG, JPEG"
        )

        if uploaded_image is not None:
            img = Image.open(uploaded_image)
            st.image(img, caption="Imagem Original", use_container_width=True)

            st.write(f"Dimensões: {img.size[0]}x{img.size[1]} pixels")
            st.write(f"Tamanho: {uploaded_image.size / 1024:.2f} KB")

    else:
        st.error("❌ Removedor de fundo desativado. Biblioteca 'rembg' não está instalada.")
        st.info("Para ativar, adicione 'rembg' ao requirements.txt")

with col_img2:
    st.subheader("Processamento")

    if HAS_REMBG and uploaded_image is not None:
        if st.button("🎨 Remover Fundo", type="primary", use_container_width=True, key="btn_remover_fundo"):
            resultado = remover_fundo_imagem(uploaded_image)

            if resultado:
                st.success("✨ Fundo removido com sucesso!")

                img_resultado = Image.open(io.BytesIO(resultado))
                st.image(img_resultado, caption="Imagem Sem Fundo", use_container_width=True)

                st.download_button(
                    "📥 Baixar Imagem Sem Fundo",
                    resultado,
                    f"sem_fundo_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png",
                    "image/png",
                    use_container_width=True,
                    key="download_sem_fundo"
                )
    else:
        st.info("👆 Envie uma imagem para remover o fundo")

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
