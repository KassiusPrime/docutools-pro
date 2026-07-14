import streamlit as st
import pdfplumber
import time
import re
import pytesseract
import openai
from docx import Document
from io import BytesIO
from deep_translator import GoogleTranslator
from gtts import gTTS
from PIL import Image
from pdf2image import convert_from_bytes

# Import protegido: se a IA de imagem falhar, o app continua vivo
try:
    from rembg import remove
    REMBG_AVAILABLE = True
except Exception:
    REMBG_AVAILABLE = False

# ---------------- CONFIGURAÇÃO ----------------
st.set_page_config(page_title="DocuTools Pro", page_icon="🚀", layout="wide")

try:
    API_KEY = st.secrets.get("OPENAI_API_KEY", None)
except Exception:
    API_KEY = None

MAX_MB = 50
MAX_OCR_PAGES = 25

IDIOMAS = {
    "Auto-Detectar": "auto",
    "Português": "pt",
    "Inglês": "en",
    "Espanhol": "es",
    "Francês": "fr",
    "Alemão": "de",
    "Italiano": "it",
}

VOZES = {"Português": "pt", "Inglês": "en", "Espanhol": "es", "Francês": "fr"}

# Estado persistente (resultados não somem ao clicar em "Baixar")
for k in ("resultado", "nome_arquivo", "avisos", "img_resultado", "audio_mp3"):
    st.session_state.setdefault(k, None)

# ---------------- FUNÇÕES ----------------

def call_with_retry(func, *args, retries=3, delay=1, **kwargs):
    """Executa função de rede com até 3 tentativas e backoff exponencial."""
    for i in range(retries):
        try:
            return func(*args, **kwargs)
        except Exception:
            if i == retries - 1:
                return None
            time.sleep(delay * (2 ** i))
    return None


def tem_conteudo_traduzivel(linha):
    """Linhas sem letras (ex: '---', '123', '***') não vão ao tradutor."""
    return bool(re.search(r"[A-Za-zÀ-ÿ]", linha))


@st.cache_data(show_spinner=False)
def extrair_texto(file_bytes, file_type):
    """Extrai texto de PDF/DOCX/TXT/Imagem. PDF escaneado -> OCR automático."""
    try:
        if "pdf" in file_type:
            with pdfplumber.open(BytesIO(file_bytes)) as pdf:
                texto = "\n".join([p.extract_text() or "" for p in pdf.pages])
            if len(texto.strip()) < 20:  # PDF de imagem -> OCR
                imagens = convert_from_bytes(
                    file_bytes, dpi=200, first_page=1, last_page=MAX_OCR_PAGES
                )
                texto = "\n".join(
                    [pytesseract.image_to_string(img, lang="por+eng") for img in imagens]
                )
            return texto, None
        elif "officedocument" in file_type:
            doc = Document(BytesIO(file_bytes))
            return "\n".join([p.text for p in doc.paragraphs]), None
        elif "image" in file_type:
            img = Image.open(BytesIO(file_bytes))
            return pytesseract.image_to_string(img, lang="por+eng"), None
        else:
            try:
                return file_bytes.decode("utf-8"), None
            except UnicodeDecodeError:
                return file_bytes.decode("latin-1"), None
    except Exception as e:
        return None, str(e)


def traduzir_openai(texto, de, para):
    client = openai.OpenAI(api_key=API_KEY)
    res = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": f"Traduza de {de} para {para}. Preserve termos técnicos "
                f"e a estrutura. Retorne APENAS o texto traduzido.",
            },
            {"role": "user", "content": texto},
        ],
        temperature=0.2,
    )
    return res.choices[0].message.content


def traduzir_bloco(texto, de, para):
    """NUNCA retorna None. No pior caso, devolve o texto original."""
    if not texto or not texto.strip() or not tem_conteudo_traduzivel(texto):
        return texto or ""

    if API_KEY:
        resposta = call_with_retry(traduzir_openai, texto, de, para)
        if isinstance(resposta, str) and resposta.strip():
            return resposta

    origem = IDIOMAS.get(de, "auto")
    destino = IDIOMAS.get(para, "pt")
    resultado = call_with_retry(
        GoogleTranslator(source=origem, target=destino).translate, texto
    )
    return resultado if isinstance(resultado, str) and resultado.strip() else texto


def traduzir_documento(texto, de, para):
    """Parágrafo por parágrafo: estrutura idêntica ao original."""
    linhas = texto.split("\n")
    if not linhas:
        return "", 0

    final, falhas = [], 0
    barra = st.progress(0, text="Traduzindo parágrafos...")
    for i, linha in enumerate(linhas):
        if linha.strip():
            t = traduzir_bloco(linha, de, para)
            if t == linha and tem_conteudo_traduzivel(linha) and de != para:
                falhas += 1
            final.append(t if isinstance(t, str) else linha)
        else:
            final.append("")
        barra.progress((i + 1) / len(linhas))
    barra.empty()
    return "\n".join(final), falhas


def gerar_docx(texto):
    doc = Document()
    for linha in texto.split("\n"):
        doc.add_paragraph(linha)
    buf = BytesIO()
    doc.save(buf)
    return buf.getvalue()


# ---------------- INTERFACE ----------------

st.title("🚀 DocuTools Pro")
st.caption("Processamento inteligente de documentos — Tradução, OCR, Imagem e Áudio")

tabs = st.tabs(["🌐 Tradução & OCR", "🖼️ Imagem IA", "🔊 Áudio", "⚙️ Sistema"])

# ---- ABA 1: TRADUÇÃO ----
with tabs[0]:
    st.subheader("Tradução com preservação de estrutura")
    arq = st.file_uploader(
        "Envie PDF, DOCX, TXT ou Imagem",
        type=["pdf", "docx", "txt", "png", "jpg", "jpeg"],
        key="up_doc",
    )

    col1, col2 = st.columns(2)
    with col1:
        de_lang = st.selectbox("Idioma original", list(IDIOMAS.keys()), index=0)
    with col2:
        destinos = [k for k in IDIOMAS if k != "Auto-Detectar"]
        para_lang = st.selectbox("Traduzir para", destinos, index=0)

    if arq:
        if arq.size > MAX_MB * 1024 * 1024:
            st.error(f"Arquivo excede {MAX_MB} MB.")
            st.stop()

        if st.button("🚀 Traduzir Documento", type="primary", key="btn_trad"):
            with st.status("Processando...", expanded=True) as status:
                st.write("📖 Extraindo texto (OCR automático se necessário)...")
                texto, erro = extrair_texto(arq.getvalue(), arq.type)

                if erro:
                    status.update(label="Falha na extração", state="error")
                    st.error(f"Erro ao ler o arquivo: {erro}")
                    st.stop()
                if not texto or not texto.strip():
                    status.update(label="Documento vazio", state="error")
                    st.warning("Nenhum texto encontrado no documento.")
                    st.stop()

                st.write("🌐 Traduzindo parágrafo por parágrafo...")
                resultado, falhas = traduzir_documento(texto, de_lang, para_lang)

                st.session_state.resultado = resultado
                st.session_state.nome_arquivo = arq.name
                st.session_state.avisos = falhas
                status.update(label="Concluído!", state="complete")

    if st.session_state.resultado:
        if st.session_state.avisos:
            st.warning(
                f"{st.session_state.avisos} trecho(s) mantidos no idioma original "
                f"(instabilidade momentânea do tradutor)."
            )
        st.text_area("Resultado:", st.session_state.resultado, height=350)

        c1, c2 = st.columns(2)
        with c1:
            st.download_button(
                "📥 Baixar TXT",
                st.session_state.resultado,
                file_name=f"DocuTools_{st.session_state.nome_arquivo}.txt",
                key="dl_txt",
            )
        with c2:
            st.download_button(
                "📥 Baixar DOCX",
                gerar_docx(st.session_state.resultado),
                file_name=f"DocuTools_{st.session_state.nome_arquivo}.docx",
                mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                key="dl_docx",
            )

# ---- ABA 2: IMAGEM ----
with tabs[1]:
    st.subheader("Remoção de fundo com IA")
    if not REMBG_AVAILABLE:
        st.error("Motor de imagem indisponível no servidor. Reinicie o app.")
    else:
        img_arq = st.file_uploader(
            "Envie uma imagem", type=["jpg", "png", "jpeg"], key="up_img"
        )
        if img_arq:
            ca, cb = st.columns(2)
            ca.image(img_arq, caption="Original", use_container_width=True)

            if st.button("✨ Remover Fundo", key="btn_bg"):
                with st.spinner("IA processando (1ª execução baixa o modelo)..."):
                    saida = call_with_retry(remove, img_arq.getvalue(), retries=2)
                if saida:
                    st.session_state.img_resultado = saida
                else:
                    st.error("Falha ao processar. Tente novamente.")

            if st.session_state.img_resultado:
                cb.image(
                    st.session_state.img_resultado,
                    caption="Sem fundo",
                    use_container_width=True,
                )
                st.download_button(
                    "📥 Baixar PNG",
                    st.session_state.img_resultado,
                    "sem_fundo.png",
                    "image/png",
                    key="dl_png",
                )

# ---- ABA 3: ÁUDIO ----
with tabs[2]:
    st.subheader("Texto para voz (MP3)")
    txt_voz = st.text_area(
        "Texto:", "DocuTools Pro transformando seu fluxo de trabalho.", key="tts_txt"
    )
    voz = st.selectbox("Idioma da voz", list(VOZES.keys()), key="tts_lang")

    if st.button("🔊 Gerar Áudio", key="btn_tts"):
        if not txt_voz.strip():
            st.warning("Digite um texto primeiro.")
        else:
            with st.spinner("Sintetizando voz..."):
                def _gera():
                    tts = gTTS(text=txt_voz, lang=VOZES[voz])
                    b = BytesIO()
                    tts.write_to_fp(b)
                    return b.getvalue()

                audio = call_with_retry(_gera)
            if audio:
                st.session_state.audio_mp3 = audio
            else:
                st.error("Serviço de voz indisponível. Tente em instantes.")

    if st.session_state.audio_mp3:
        st.audio(st.session_state.audio_mp3, format="audio/mp3")
        st.download_button(
            "📥 Baixar MP3",
            st.session_state.audio_mp3,
            "audio_docutools.mp3",
            "audio/mp3",
            key="dl_mp3",
        )

# ---- ABA 4: SISTEMA ----
with tabs[3]:
    st.subheader("Status do sistema")
    c1, c2, c3 = st.columns(3)
    c1.metric("Motor de Tradução", "GPT-4o-mini" if API_KEY else "Google (grátis)")
    c2.metric("Imagem IA", "Ativo" if REMBG_AVAILABLE else "Indisponível")
    c3.metric("Limite de upload", f"{MAX_MB} MB")

    if not API_KEY:
        st.info(
            "💡 Configure OPENAI_API_KEY em Settings → Secrets no Streamlit Cloud "
            "para ativar tradução premium."
        )

    if st.button("🧹 Limpar cache e resultados", key="btn_reset"):
        st.cache_data.clear()
        for k in ("resultado", "nome_arquivo", "avisos", "img_resultado", "audio_mp3"):
            st.session_state[k] = None
        st.rerun()

st.sidebar.markdown("### 🚀 DocuTools Pro")
st.sidebar.caption("v3.0 — Estável")
st.sidebar.markdown("---")
st.sidebar.write("✅ Tradução resiliente com retry")
st.sidebar.write("✅ OCR automático (por/eng)")
st.sidebar.write("✅ Resultados persistentes")
