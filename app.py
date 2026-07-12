import io
import os
import re
import html
import zipfile
from datetime import datetime

import streamlit as st
from PIL import Image, ImageOps, UnidentifiedImageError
import numpy as np
import cv2
import pytesseract
from pdf2image import convert_from_bytes
from pypdf import PdfReader, PdfWriter
from docx import Document
from deep_translator import GoogleTranslator
from gtts import gTTS
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except Exception:
    pass

# ============================================================
# CONFIGURAÇÃO
# ============================================================

st.set_page_config(
    page_title="DocuTools Pro",
    page_icon="📄",
    layout="wide",
    initial_sidebar_state="expanded"
)

APP_NAME = "DocuTools Pro"
APP_ICON = "📘"
APP_TAGLINE = "Converta, traduza, digitalize e organize documentos em segundos."
MAX_FILE_SIZE_MB = 50
MAX_OCR_PAGES = 10

ICONS = {
    "file-text": "📄",
    "languages": "🌐",
    "files": "📚",
    "scissors": "✂️",
    "image": "🖼️",
    "wand": "🪄",
    "repeat": "🔄",
    "scan": "📷",
    "volume": "🔊",
    "maximize": "📐",
}

LANGUAGES = {
    "Detectar automaticamente": "auto",
    "Português": "pt",
    "Inglês": "en",
    "Espanhol": "es",
    "Francês": "fr",
    "Italiano": "it",
    "Alemão": "de",
    "Holandês": "nl",
    "Russo": "ru",
    "Árabe": "ar",
    "Hindi": "hi",
    "Japonês": "ja",
    "Coreano": "ko",
    "Chinês simplificado": "zh-CN",
    "Chinês tradicional": "zh-TW",
    "Turco": "tr",
    "Polonês": "pl",
    "Ucraniano": "uk",
    "Sueco": "sv",
    "Norueguês": "no",
    "Dinamarquês": "da",
}

OCR_LANGUAGES = {
    "Português": "por",
    "Inglês": "eng",
    "Espanhol": "spa",
    "Francês": "fra",
    "Alemão": "deu",
}

# ============================================================
# COMPONENTES VISUAIS (nativos do Streamlit, sem HTML cru)
# ============================================================

def render_hero():
    st.title(f"{APP_ICON} {APP_NAME}")
    st.caption(APP_TAGLINE)
    st.info("Converta, traduza, digitalize e organize documentos em segundos.")


def render_section_title(icon, title, subtitle=None, color=None):
    emoji = ICONS.get(icon, "📌")
    st.subheader(f"{emoji} {title}")
    if subtitle:
        st.caption(subtitle)


def render_tool_card(icon, title, description, badges=None, color=None):
    emoji = ICONS.get(icon, "📌")
    badges = badges or []
    with st.container(border=True):
        st.markdown(f"**{emoji} {title}**")
        st.write(description)
        if badges:
            st.caption(" • ".join(badges))


def render_steps():
    c1, c2, c3, c4 = st.columns(4)
    with c1:
        st.success("📄 Arquivo")
    with c2:
        st.success("🔎 Extração")
    with c3:
        st.success("🌐 Tradução")
    with c4:
        st.success("⬇️ Download")


# ============================================================
# AUXILIARES
# ============================================================

def now_suffix():
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def sanitize_filename(name):
    name = name or "arquivo"
    name = os.path.splitext(name)[0]
    name = re.sub(r"[^\w\-. ]+", "", name, flags=re.UNICODE)
    name = name.strip().replace(" ", "_")
    return name or "arquivo"


def validate_file_size(uploaded_file, max_mb=MAX_FILE_SIZE_MB):
    if uploaded_file is None:
        return False, "Nenhum arquivo enviado."
    size_mb = uploaded_file.size / (1024 * 1024)
    if size_mb > max_mb:
        return False, f"Arquivo muito grande. Tamanho máximo permitido: {max_mb} MB."
    return True, None


def get_file_bytes(uploaded_file):
    uploaded_file.seek(0)
    return uploaded_file.read()


def make_download_buffer(data):
    buffer = io.BytesIO()
    if isinstance(data, bytes):
        buffer.write(data)
    else:
        buffer.write(str(data).encode("utf-8"))
    buffer.seek(0)
    return buffer


def chunk_text(text, max_chars=4500):
    text = text.strip()
    if not text:
        return []

    chunks = []
    current = ""

    for paragraph in text.splitlines():
        paragraph = paragraph.strip()
        if not paragraph:
            continue

        if len(paragraph) > max_chars:
            if current:
                chunks.append(current.strip())
                current = ""
            for i in range(0, len(paragraph), max_chars):
                chunks.append(paragraph[i:i + max_chars])
            continue

        if len(current) + len(paragraph) + 1 <= max_chars:
            current += paragraph + "\n"
        else:
            if current:
                chunks.append(current.strip())
            current = paragraph + "\n"

    if current.strip():
        chunks.append(current.strip())

    return chunks


def protect_glossary_terms(text, glossary_terms):
    mapping = {}
    for idx, term in enumerate(glossary_terms):
        term = term.strip()
        if not term:
            continue
        placeholder = f"ZXQTERM{idx}ZXQ"
        mapping[placeholder] = term
        text = text.replace(term, placeholder)
    return text, mapping


def restore_glossary_terms(text, mapping):
    for placeholder, term in mapping.items():
        text = text.replace(placeholder, term)
    return text


def translate_text(text, source_lang, target_lang, glossary_terms=None):
    glossary_terms = glossary_terms or []
    protected_text, mapping = protect_glossary_terms(text, glossary_terms)
    chunks = chunk_text(protected_text)

    if not chunks:
        return ""

    translated_parts = []
    progress = st.progress(0)
    status = st.empty()
    total_chunks = len(chunks)

    for index, chunk in enumerate(chunks, start=1):
        status.info(f"Traduzindo parte {index} de {total_chunks}...")
        translated = GoogleTranslator(
            source=source_lang,
            target=target_lang
        ).translate(chunk)
        translated = restore_glossary_terms(translated, mapping)
        translated_parts.append(translated)
        progress.progress(index / total_chunks)

    progress.empty()
    status.success("Tradução concluída.")

    return "\n\n".join(translated_parts).strip()


# ============================================================
# PDF, DOCX E TXT
# ============================================================

def extract_text_from_pdf(uploaded_file):
    valid, error = validate_file_size(uploaded_file)
    if not valid:
        raise ValueError(error)

    file_bytes = get_file_bytes(uploaded_file)
    reader = PdfReader(io.BytesIO(file_bytes))
    pages_text = []

    for index, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        if text.strip():
            pages_text.append(f"--- Página {index} ---\n{text}")

    return "\n\n".join(pages_text).strip()


def extract_text_from_docx(uploaded_file):
    valid, error = validate_file_size(uploaded_file)
    if not valid:
        raise ValueError(error)

    file_bytes = get_file_bytes(uploaded_file)
    doc = Document(io.BytesIO(file_bytes))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]

    tables_text = []
    for table in doc.tables:
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells]
            tables_text.append(" | ".join(cells))

    return "\n".join(paragraphs + tables_text).strip()


def extract_text_from_txt(uploaded_file):
    valid, error = validate_file_size(uploaded_file)
    if not valid:
        raise ValueError(error)

    file_bytes = get_file_bytes(uploaded_file)
    try:
        return file_bytes.decode("utf-8").strip()
    except UnicodeDecodeError:
        return file_bytes.decode("latin-1").strip()


# ============================================================
# OCR
# ============================================================

def preprocess_image_for_ocr(image):
    image = image.convert("RGB")
    img_array = np.array(image)
    gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
    gray = cv2.bilateralFilter(gray, 9, 75, 75)
    threshold = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        2
    )
    return Image.fromarray(threshold)


def ocr_image(image, ocr_language="Português"):
    lang_code = OCR_LANGUAGES.get(ocr_language, "por")
    processed = preprocess_image_for_ocr(image)
    text = pytesseract.image_to_string(processed, lang=lang_code)
    return text.strip()


def ocr_pdf(uploaded_file, ocr_language="Português", dpi=220, max_pages=MAX_OCR_PAGES):
    file_bytes = get_file_bytes(uploaded_file)
    pages = convert_from_bytes(
        file_bytes,
        dpi=dpi,
        first_page=1,
        last_page=max_pages
    )

    extracted_pages = []
    progress = st.progress(0)
    status = st.empty()
    total_pages = len(pages)

    for index, page_image in enumerate(pages, start=1):
        status.info(f"Aplicando OCR na página {index} de {total_pages}...")
        page_text = ocr_image(page_image, ocr_language=ocr_language)
        if page_text:
            extracted_pages.append(f"--- Página {index} ---\n{page_text}")
        progress.progress(index / total_pages)

    progress.empty()
    status.success("OCR concluído.")

    return "\n\n".join(extracted_pages).strip()


def extract_text_from_pdf_auto(uploaded_file, ocr_language="Português", processing_mode="Automático"):
    if processing_mode == "Forçar OCR":
        return ocr_pdf(uploaded_file, ocr_language=ocr_language)

    text = extract_text_from_pdf(uploaded_file)

    if processing_mode == "Somente texto extraível":
        return text

    if len(text.strip()) >= 80:
        return text

    st.warning("Pouco ou nenhum texto detectado no PDF. Aplicando OCR automaticamente.")
    return ocr_pdf(uploaded_file, ocr_language=ocr_language)


def extract_text_from_document(uploaded_file, ocr_language="Português", processing_mode="Automático"):
    extension = uploaded_file.name.lower().split(".")[-1]

    if extension == "pdf":
        return extract_text_from_pdf_auto(
            uploaded_file,
            ocr_language=ocr_language,
            processing_mode=processing_mode
        )

    if extension == "docx":
        return extract_text_from_docx(uploaded_file)

    if extension == "txt":
        return extract_text_from_txt(uploaded_file)

    if extension in ["png", "jpg", "jpeg", "webp", "heic", "heif"]:
        image = open_image_from_upload(uploaded_file)
        return ocr_image(image, ocr_language=ocr_language)

    raise ValueError("Formato não suportado.")


# ============================================================
# CRIAÇÃO DE DOCUMENTOS
# ============================================================

def create_translated_docx(
    title,
    original_filename,
    source_label,
    target_label,
    mode,
    translated_text,
    original_text=None
):
    doc = Document()
    doc.core_properties.author = "DocuTools Pro"
    doc.core_properties.title = title

    doc.add_heading(title, level=1)
    doc.add_paragraph(f"Arquivo original: {original_filename}")
    doc.add_paragraph(f"Idioma de origem: {source_label}")
    doc.add_paragraph(f"Idioma de destino: {target_label}")
    doc.add_paragraph(f"Modo: {mode}")
    doc.add_paragraph(f"Gerado em: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    doc.add_paragraph("Documento gerado automaticamente pelo DocuTools Pro.")
    doc.add_paragraph("")

    if mode == "Bilíngue" and original_text:
        doc.add_heading("Texto original", level=2)
        for paragraph in original_text.split("\n"):
            if paragraph.strip():
                doc.add_paragraph(paragraph.strip())

        doc.add_page_break()
        doc.add_heading("Texto traduzido", level=2)
        for paragraph in translated_text.split("\n"):
            if paragraph.strip():
                doc.add_paragraph(paragraph.strip())
    else:
        doc.add_heading("Texto traduzido", level=2)
        if mode == "Corporativo":
            doc.add_paragraph(
                "Observação: tradução gerada com foco em clareza, estrutura "
                "documental e leitura profissional."
            )
        for paragraph in translated_text.split("\n"):
            if paragraph.strip():
                doc.add_paragraph(paragraph.strip())

    output = io.BytesIO()
    doc.save(output)
    output.seek(0)
    return output


def register_pdf_font():
    possible_fonts = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for font_path in possible_fonts:
        if os.path.exists(font_path):
            pdfmetrics.registerFont(TTFont("DocuToolsFont", font_path))
            return "DocuToolsFont"
    return "Helvetica"


def create_translated_pdf(
    title,
    original_filename,
    source_label,
    target_label,
    mode,
    translated_text,
    original_text=None
):
    output = io.BytesIO()
    font_name = register_pdf_font()

    doc = SimpleDocTemplate(
        output,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "DocuToolsTitle",
        parent=styles["Title"],
        fontName=font_name,
        fontSize=18,
        leading=22,
        spaceAfter=14
    )
    normal_style = ParagraphStyle(
        "DocuToolsNormal",
        parent=styles["Normal"],
        fontName=font_name,
        fontSize=10.5,
        leading=15,
        spaceAfter=8
    )

    story = []
    story.append(Paragraph(html.escape(title), title_style))
    story.append(Paragraph(f"<b>Arquivo original:</b> {html.escape(original_filename)}", normal_style))
    story.append(Paragraph(f"<b>Idioma de origem:</b> {html.escape(source_label)}", normal_style))
    story.append(Paragraph(f"<b>Idioma de destino:</b> {html.escape(target_label)}", normal_style))
    story.append(Paragraph(f"<b>Modo:</b> {html.escape(mode)}", normal_style))
    story.append(Paragraph("Documento gerado automaticamente pelo DocuTools Pro.", normal_style))
    story.append(Spacer(1, 12))

    if mode == "Bilíngue" and original_text:
        story.append(Paragraph("<b>Texto original</b>", normal_style))
        for paragraph in original_text.split("\n"):
            paragraph = paragraph.strip()
            if paragraph:
                story.append(Paragraph(html.escape(paragraph), normal_style))
        story.append(PageBreak())
        story.append(Paragraph("<b>Texto traduzido</b>", normal_style))

    for paragraph in translated_text.split("\n"):
        paragraph = paragraph.strip()
        if paragraph:
            story.append(Paragraph(html.escape(paragraph), normal_style))

    doc.build(story)
    output.seek(0)
    return output


# ============================================================
# IMAGENS
# ============================================================

def open_image_from_upload(uploaded_file):
    valid, error = validate_file_size(uploaded_file)
    if not valid:
        raise ValueError(error)

    file_bytes = get_file_bytes(uploaded_file)
    if not file_bytes:
        raise ValueError("O arquivo enviado está vazio.")

    try:
        image = Image.open(io.BytesIO(file_bytes))
        image = ImageOps.exif_transpose(image)
        image.load()
        return image
    except UnidentifiedImageError:
        raise ValueError(
            "Não foi possível identificar a imagem. Envie PNG, JPG, JPEG, WEBP, HEIC ou HEIF."
        )
    except Exception as e:
        raise ValueError(f"Não foi possível abrir a imagem. Detalhes: {e}")


def image_to_png_bytes(image):
    image = image.convert("RGBA")
    output = io.BytesIO()
    image.save(output, format="PNG")
    output.seek(0)
    return output.getvalue()


def image_to_jpeg_bytes(image, quality=90):
    if image.mode in ("RGBA", "LA", "P"):
        rgba = image.convert("RGBA")
        background = Image.new("RGB", rgba.size, "white")
        background.paste(rgba, mask=rgba.split()[-1])
        image = background
    else:
        image = image.convert("RGB")

    output = io.BytesIO()
    image.save(output, format="JPEG", quality=quality, optimize=True)
    output.seek(0)
    return output.getvalue()


def image_to_webp_bytes(image, quality=90):
    output = io.BytesIO()
    image.save(output, format="WEBP", quality=quality, method=6)
    output.seek(0)
    return output.getvalue()


def apply_background(image, option, custom_color="#ffffff"):
    image = image.convert("RGBA")

    if option == "Transparente":
        return image

    if option == "Branco":
        bg_color = "#ffffff"
    elif option == "Preto":
        bg_color = "#000000"
    else:
        bg_color = custom_color

    background = Image.new("RGBA", image.size, bg_color)
    background.paste(image, mask=image.split()[-1])
    return background.convert("RGB")


def text_stats(text):
    chars = len(text)
    chars_no_spaces = len(text.replace(" ", ""))
    words = len(re.findall(r"\b\w+\b", text, flags=re.UNICODE))
    lines = len(text.splitlines())
    paragraphs = len([p for p in text.split("\n\n") if p.strip()])
    return {
        "Caracteres": chars,
        "Caracteres sem espaços": chars_no_spaces,
        "Palavras": words,
        "Linhas": lines,
        "Parágrafos": paragraphs,
    }


# ============================================================
# SIDEBAR
# ============================================================

with st.sidebar:
    st.markdown(f"# {APP_ICON} {APP_NAME}")
    st.caption("Processador inteligente de documentos")

    menu = st.radio(
        "Navegação",
        [
            "🏠 Início",
            "🌐 Traduzir Documento",
            "📷 Digitalizar documento",
            "📄 PDF - Juntar PDFs",
            "✂️ PDF - Dividir PDF",
            "🔎 PDF - Extrair texto",
            "📝 Word - Extrair texto DOCX",
            "🪄 Imagem - Remover fundo",
            "🔁 Imagem - Converter imagem",
            "📐 Imagem - Redimensionar e comprimir",
            "🖼 Imagem - Imagens para PDF",
            "🔤 Texto - Utilitários",
            "🔊 Áudio - Texto para MP3",
        ]
    )

    st.divider()
    st.info(
        "Para OCR funcionar no Streamlit Cloud, mantenha o `packages.txt` "
        "com Tesseract e Poppler."
    )

# ============================================================
# INÍCIO
# ============================================================

if menu == "🏠 Início":
    render_hero()

    m1, m2, m3, m4 = st.columns(4)
    with m1:
        st.metric("Idiomas", "20+")
    with m2:
        st.metric("Formatos", "10+")
    with m3:
        st.metric("OCR", "Sim")
    with m4:
        st.metric("PDF", "Completo")

    render_section_title(
        icon="languages",
        title="Ferramentas principais",
        subtitle="Traduza, digitalize, converta e organize arquivos em poucos cliques."
    )

    col1, col2, col3 = st.columns(3)
    with col1:
        render_tool_card(
            "languages",
            "Traduzir Documento",
            "Traduza PDF, DOCX, TXT e imagens com OCR automático.",
            ["PDF", "DOCX", "TXT", "OCR"]
        )
    with col2:
        render_tool_card(
            "scan",
            "Digitalizar Documento",
            "Use câmera ou imagem para gerar PDF e extrair texto.",
            ["Câmera", "OCR", "PDF"]
        )
    with col3:
        render_tool_card(
            "files",
            "Ferramentas PDF",
            "Junte, divida e extraia texto de arquivos PDF.",
            ["PDF"]
        )

    col4, col5, col6 = st.columns(3)
    with col4:
        render_tool_card(
            "wand",
            "Remover Fundo",
            "Remova fundos de PNG, JPG, WEBP, HEIC e HEIF.",
            ["PNG", "JPG", "HEIC"]
        )
    with col5:
        render_tool_card(
            "repeat",
            "Converter Imagem",
            "Converta imagens entre PNG, JPG e WEBP.",
            ["PNG", "JPG", "WEBP"]
        )
    with col6:
        render_tool_card(
            "volume",
            "Texto para MP3",
            "Transforme textos em áudio MP3.",
            ["MP3"]
        )

# ============================================================
# TRADUZIR DOCUMENTO
# ============================================================

elif menu == "🌐 Traduzir Documento":
    render_section_title(
        "languages",
        "Traduzir Documento",
        "Traduza PDF, DOCX, TXT ou imagens. PDFs escaneados usam OCR automaticamente."
    )
    render_steps()

    st.info(
        f"O OCR está limitado às primeiras {MAX_OCR_PAGES} páginas para "
        "manter estabilidade no Streamlit Cloud."
    )

    uploaded_file = st.file_uploader(
        "Envie um documento ou imagem",
        type=["pdf", "docx", "txt", "png", "jpg", "jpeg", "webp", "heic", "heif"]
    )

    col1, col2, col3 = st.columns(3)
    with col1:
        source_label = st.selectbox("Idioma de origem", list(LANGUAGES.keys()), index=0)
    with col2:
        target_options = [k for k in LANGUAGES.keys() if k != "Detectar automaticamente"]
        target_label = st.selectbox("Idioma de destino", target_options, index=1)
    with col3:
        output_format = st.selectbox("Formato de saída", ["DOCX", "TXT", "PDF"])

    col4, col5, col6 = st.columns(3)
    with col4:
        translation_mode = st.selectbox("Modo de tradução", ["Simples", "Corporativo", "Bilíngue"])
    with col5:
        processing_mode = st.selectbox(
            "Modo de processamento",
            ["Automático", "Somente texto extraível", "Forçar OCR"]
        )
    with col6:
        ocr_language = st.selectbox("Idioma do OCR", list(OCR_LANGUAGES.keys()), index=0)

    show_preview = st.checkbox("Mostrar prévia do texto extraído", value=True)

    glossary_input = st.text_area(
        "Termos que devem ser preservados, um por linha",
        value="DocuTools\nMicrosoft 365\nPower BI\nSharePoint",
        height=100
    )
    glossary_terms = [term.strip() for term in glossary_input.splitlines() if term.strip()]

    if uploaded_file:
        base_name = sanitize_filename(uploaded_file.name)

        if st.button("🌐 Traduzir documento", type="primary"):
            try:
                source_lang = LANGUAGES[source_label]
                target_lang = LANGUAGES[target_label]

                with st.spinner("Extraindo texto do arquivo..."):
                    original_text = extract_text_from_document(
                        uploaded_file,
                        ocr_language=ocr_language,
                        processing_mode=processing_mode
                    )

                if not original_text.strip():
                    st.error(
                        "Nenhum texto foi encontrado. Tente usar o modo 'Forçar OCR' "
                        "ou envie uma imagem mais nítida."
                    )
                    st.stop()

                st.success("Texto extraído com sucesso.")

                if show_preview:
                    with st.expander("📄 Texto original", expanded=False):
                        st.text(original_text[:5000])

                translated_text = translate_text(
                    original_text,
                    source_lang,
                    target_lang,
                    glossary_terms
                )

                st.success("Documento traduzido com sucesso.")

                with st.expander("🌐 Tradução", expanded=True):
                    st.text(translated_text[:5000])

                title = "Documento Traduzido - DocuTools Pro"

                if output_format == "DOCX":
                    output = create_translated_docx(
                        title,
                        uploaded_file.name,
                        source_label,
                        target_label,
                        translation_mode,
                        translated_text,
                        original_text
                    )
                    st.download_button(
                        "⬇️ Baixar DOCX traduzido",
                        data=output,
                        file_name=f"{base_name}_traduzido_{target_lang}_{now_suffix()}.docx",
                        mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    )

                elif output_format == "TXT":
                    txt_content = (
                        f"{title}\n\n"
                        f"Arquivo original: {uploaded_file.name}\n"
                        f"Idioma de origem: {source_label}\n"
                        f"Idioma de destino: {target_label}\n"
                        f"Modo: {translation_mode}\n"
                        f"Gerado em: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}\n\n"
                        f"{translated_text}"
                    )
                    st.download_button(
                        "⬇️ Baixar TXT traduzido",
                        data=txt_content.encode("utf-8"),
                        file_name=f"{base_name}_traduzido_{target_lang}_{now_suffix()}.txt",
                        mime="text/plain"
                    )

                else:
                    output = create_translated_pdf(
                        title,
                        uploaded_file.name,
                        source_label,
                        target_label,
                        translation_mode,
                        translated_text,
                        original_text
                    )
                    st.download_button(
                        "⬇️ Baixar PDF traduzido",
                        data=output,
                        file_name=f"{base_name}_traduzido_{target_lang}_{now_suffix()}.pdf",
                        mime="application/pdf"
                    )

            except Exception as e:
                st.error(f"Erro ao traduzir documento: {e}")

# ============================================================
# DIGITALIZAR DOCUMENTO
# ============================================================

elif menu == "📷 Digitalizar documento":
    render_section_title(
        "scan",
        "Digitalizar documento",
        "Use câmera ou imagem para gerar PDF, aplicar melhoria visual e extrair texto por OCR."
    )

    input_mode = st.radio("Origem da imagem", ["Enviar imagem", "Usar câmera"])

    uploaded_image = None
    if input_mode == "Enviar imagem":
        uploaded_image = st.file_uploader(
            "Envie uma foto ou imagem do documento",
            type=["png", "jpg", "jpeg", "webp", "heic", "heif"]
        )
    else:
        uploaded_image = st.camera_input("Fotografe o documento")

    col1, col2 = st.columns(2)
    with col1:
        ocr_language = st.selectbox("Idioma para OCR", list(OCR_LANGUAGES.keys()), index=0)
    with col2:
        output_style = st.selectbox(
            "Estilo da digitalização",
            ["Colorido original", "Preto e branco otimizado", "Escala de cinza"]
        )

    if uploaded_image:
        try:
            image = open_image_from_upload(uploaded_image)
            st.image(image, caption="Imagem original", use_container_width=True)

            if st.button("📷 Processar digitalização", type="primary"):
                processed = image
                if output_style == "Preto e branco otimizado":
                    processed = preprocess_image_for_ocr(image)
                elif output_style == "Escala de cinza":
                    processed = image.convert("L")

                st.image(processed, caption="Documento digitalizado", use_container_width=True)

                pdf_buffer = io.BytesIO()
                processed.convert("RGB").save(pdf_buffer, format="PDF")
                pdf_buffer.seek(0)

                st.download_button(
                    "⬇️ Baixar PDF digitalizado",
                    data=pdf_buffer,
                    file_name=f"documento_digitalizado_{now_suffix()}.pdf",
                    mime="application/pdf"
                )

                with st.spinner("Extraindo texto por OCR..."):
                    extracted_text = ocr_image(processed, ocr_language=ocr_language)

                if extracted_text:
                    st.success("Texto extraído com sucesso.")
                    st.text_area("Texto extraído", extracted_text, height=300)
                    st.download_button(
                        "⬇️ Baixar TXT extraído",
                        data=extracted_text.encode("utf-8"),
                        file_name=f"ocr_documento_{now_suffix()}.txt",
                        mime="text/plain"
                    )
                else:
                    st.warning("Nenhum texto foi identificado na imagem.")

        except Exception as e:
            st.error(f"Erro ao digitalizar documento: {e}")

# ============================================================
# PDF - JUNTAR
# ============================================================

elif menu == "📄 PDF - Juntar PDFs":
    render_section_title("files", "Juntar PDFs", "Envie dois ou mais PDFs para gerar um arquivo único.")

    uploaded_files = st.file_uploader("Envie os PDFs", type=["pdf"], accept_multiple_files=True)

    if uploaded_files:
        st.write(f"{len(uploaded_files)} arquivo(s) selecionado(s).")

        if st.button("📄 Juntar PDFs"):
            try:
                writer = PdfWriter()
                for uploaded_file in uploaded_files:
                    valid, error = validate_file_size(uploaded_file)
                    if not valid:
                        st.error(f"{uploaded_file.name}: {error}")
                        st.stop()
                    reader = PdfReader(io.BytesIO(get_file_bytes(uploaded_file)))
                    for page in reader.pages:
                        writer.add_page(page)

                output = io.BytesIO()
                writer.write(output)
                output.seek(0)

                st.success("PDFs unidos com sucesso.")
                st.download_button(
                    "⬇️ Baixar PDF unido",
                    data=output,
                    file_name=f"pdf_unido_{now_suffix()}.pdf",
                    mime="application/pdf"
                )
            except Exception as e:
                st.error(f"Erro ao juntar PDFs: {e}")

# ============================================================
# PDF - DIVIDIR
# ============================================================

elif menu == "✂️ PDF - Dividir PDF":
    render_section_title("scissors", "Dividir PDF", "Extraia um intervalo ou separe todas as páginas.")

    uploaded_file = st.file_uploader("Envie um PDF", type=["pdf"])

    if uploaded_file:
        try:
            valid, error = validate_file_size(uploaded_file)
            if not valid:
                st.error(error)
                st.stop()

            reader = PdfReader(io.BytesIO(get_file_bytes(uploaded_file)))
            total_pages = len(reader.pages)
            st.info(f"O PDF possui {total_pages} página(s).")

            mode = st.radio("Modo de divisão", ["Extrair intervalo de páginas", "Separar todas as páginas"])

            if mode == "Extrair intervalo de páginas":
                col1, col2 = st.columns(2)
                with col1:
                    start_page = st.number_input("Página inicial", min_value=1, max_value=total_pages, value=1)
                with col2:
                    end_page = st.number_input(
                        "Página final", min_value=start_page, max_value=total_pages, value=total_pages
                    )

                if st.button("✂️ Extrair páginas"):
                    writer = PdfWriter()
                    for page_index in range(start_page - 1, end_page):
                        writer.add_page(reader.pages[page_index])

                    output = io.BytesIO()
                    writer.write(output)
                    output.seek(0)

                    st.success("Páginas extraídas com sucesso.")
                    st.download_button(
                        "⬇️ Baixar PDF extraído",
                        data=output,
                        file_name=f"paginas_{start_page}_a_{end_page}_{now_suffix()}.pdf",
                        mime="application/pdf"
                    )
            else:
                if st.button("📦 Separar todas as páginas"):
                    zip_buffer = io.BytesIO()
                    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
                        for index, page in enumerate(reader.pages, start=1):
                            writer = PdfWriter()
                            writer.add_page(page)
                            pdf_buffer = io.BytesIO()
                            writer.write(pdf_buffer)
                            pdf_buffer.seek(0)
                            zip_file.writestr(f"pagina_{index}.pdf", pdf_buffer.getvalue())

                    zip_buffer.seek(0)
                    st.success("Páginas separadas com sucesso.")
                    st.download_button(
                        "⬇️ Baixar ZIP",
                        data=zip_buffer,
                        file_name=f"paginas_separadas_{now_suffix()}.zip",
                        mime="application/zip"
                    )
        except Exception as e:
            st.error(f"Erro ao dividir PDF: {e}")

# ============================================================
# PDF - EXTRAIR TEXTO
# ============================================================

elif menu == "🔎 PDF - Extrair texto":
    render_section_title("file-text", "Extrair texto de PDF", "Extraia texto comum ou aplique OCR em PDFs escaneados.")

    uploaded_file = st.file_uploader("Envie um PDF", type=["pdf"])

    col1, col2 = st.columns(2)
    with col1:
        extraction_mode = st.selectbox("Modo de extração", ["Automático", "Somente texto extraível", "Forçar OCR"])
    with col2:
        ocr_language = st.selectbox("Idioma OCR", list(OCR_LANGUAGES.keys()), index=0)

    if uploaded_file:
        if st.button("🔎 Extrair texto"):
            try:
                text = extract_text_from_pdf_auto(
                    uploaded_file,
                    ocr_language=ocr_language,
                    processing_mode=extraction_mode
                )

                if not text:
                    st.warning("Nenhum texto foi encontrado.")
                else:
                    st.success("Texto extraído com sucesso.")
                    st.text_area("Texto extraído", text, height=400)
                    st.download_button(
                        "⬇️ Baixar TXT",
                        data=make_download_buffer(text),
                        file_name=f"texto_pdf_{now_suffix()}.txt",
                        mime="text/plain"
                    )
            except Exception as e:
                st.error(f"Erro ao extrair texto do PDF: {e}")

# ============================================================
# WORD
# ============================================================

elif menu == "📝 Word - Extrair texto DOCX":
    render_section_title("file-text", "Extrair texto de DOCX", "Extraia texto de documentos Word no formato DOCX.")

    uploaded_file = st.file_uploader("Envie um arquivo DOCX", type=["docx"])

    if uploaded_file:
        if st.button("📝 Extrair texto"):
            try:
                text = extract_text_from_docx(uploaded_file)

                if not text:
                    st.warning("Nenhum texto foi encontrado no DOCX.")
                else:
                    st.success("Texto extraído com sucesso.")
                    st.text_area("Texto extraído", text, height=400)
                    st.download_button(
                        "⬇️ Baixar TXT",
                        data=make_download_buffer(text),
                        file_name=f"texto_docx_{now_suffix()}.txt",
                        mime="text/plain"
                    )
            except Exception as e:
                st.error(f"Erro ao extrair texto do DOCX: {e}")

# ============================================================
# REMOVER FUNDO
# ============================================================

elif menu == "🪄 Imagem - Remover fundo":
    render_section_title("wand", "Remover fundo de imagem", "Envie PNG, JPG, JPEG, WEBP, HEIC ou HEIF.")

    uploaded_file = st.file_uploader(
        "Envie uma imagem", type=["png", "jpg", "jpeg", "webp", "heic", "heif"]
    )

    col_config1, col_config2 = st.columns(2)
    with col_config1:
        background_option = st.selectbox(
            "Fundo final", ["Transparente", "Branco", "Preto", "Cor personalizada"]
        )
    with col_config2:
        custom_color = st.color_picker(
            "Escolha a cor", "#ffffff", disabled=background_option != "Cor personalizada"
        )

    if uploaded_file:
        try:
            original_image = open_image_from_upload(uploaded_file)
            col1, col2 = st.columns(2)

            with col1:
                st.image(original_image, caption="Imagem original", use_container_width=True)

            if st.button("🪄 Remover fundo"):
                try:
                    from rembg import remove

                    with st.status("Removendo fundo...", expanded=True) as status:
                        st.write("Carregando modelo de IA (pode demorar na primeira execução)...")
                        input_png = image_to_png_bytes(original_image)
                        output_bytes = remove(input_png)
                        status.update(label="✅ Fundo removido!", state="complete", expanded=False)

                    result_image = Image.open(io.BytesIO(output_bytes)).convert("RGBA")
                    result_image = apply_background(result_image, background_option, custom_color)

                    with col2:
                        st.image(result_image, caption="Resultado", use_container_width=True)

                    output = io.BytesIO()
                    if background_option == "Transparente":
                        result_image.save(output, format="PNG")
                        file_name = f"imagem_sem_fundo_{now_suffix()}.png"
                        mime = "image/png"
                    else:
                        result_image.save(output, format="JPEG", quality=95, optimize=True)
                        file_name = f"imagem_sem_fundo_{now_suffix()}.jpg"
                        mime = "image/jpeg"
                    output.seek(0)

                    st.success("Fundo removido com sucesso.")
                    st.download_button(
                        "⬇️ Baixar resultado", data=output, file_name=file_name, mime=mime
                    )
                except Exception as e:
                    st.error(f"Erro ao remover fundo: {e}")
        except Exception as e:
            st.error(e)

# ============================================================
# CONVERTER IMAGEM
# ============================================================

elif menu == "🔁 Imagem - Converter imagem":
    render_section_title("repeat", "Converter imagem", "Converta imagens entre PNG, JPG e WEBP.")

    uploaded_file = st.file_uploader(
        "Envie uma imagem", type=["png", "jpg", "jpeg", "webp", "heic", "heif"]
    )
    output_format = st.selectbox("Formato de saída", ["PNG", "JPG", "WEBP"])
    quality = st.slider("Qualidade para JPG/WEBP", min_value=10, max_value=100, value=90)

    if uploaded_file:
        try:
            image = open_image_from_upload(uploaded_file)
            st.image(image, caption="Prévia", use_container_width=True)

            if st.button("🔁 Converter imagem"):
                if output_format == "PNG":
                    data = image_to_png_bytes(image)
                    file_name = f"imagem_convertida_{now_suffix()}.png"
                    mime = "image/png"
                elif output_format == "JPG":
                    data = image_to_jpeg_bytes(image, quality=quality)
                    file_name = f"imagem_convertida_{now_suffix()}.jpg"
                    mime = "image/jpeg"
                else:
                    data = image_to_webp_bytes(image, quality=quality)
                    file_name = f"imagem_convertida_{now_suffix()}.webp"
                    mime = "image/webp"

                st.success("Imagem convertida com sucesso.")
                st.download_button(
                    "⬇️ Baixar imagem convertida",
                    data=make_download_buffer(data),
                    file_name=file_name,
                    mime=mime
                )
        except Exception as e:
            st.error(f"Erro ao converter imagem: {e}")

# ============================================================
# REDIMENSIONAR
# ============================================================

elif menu == "📐 Imagem - Redimensionar e comprimir":
    render_section_title(
        "maximize", "Redimensionar e comprimir imagem", "Altere largura, altura, qualidade e formato final."
    )

    uploaded_file = st.file_uploader(
        "Envie uma imagem", type=["png", "jpg", "jpeg", "webp", "heic", "heif"]
    )

    if uploaded_file:
        try:
            image = open_image_from_upload(uploaded_file)
            original_width, original_height = image.size
            st.info(f"Tamanho original: {original_width} x {original_height}px")
            st.image(image, caption="Imagem original", use_container_width=True)

            keep_ratio = st.checkbox("Manter proporção", value=True)

            col1, col2 = st.columns(2)
            with col1:
                new_width = st.number_input(
                    "Nova largura", min_value=1, max_value=10000, value=original_width
                )
            with col2:
                if keep_ratio:
                    new_height = int((new_width / original_width) * original_height)
                    st.number_input("Nova altura", min_value=1, max_value=10000, value=new_height, disabled=True)
                else:
                    new_height = st.number_input(
                        "Nova altura", min_value=1, max_value=10000, value=original_height
                    )

            output_format = st.selectbox("Formato final", ["PNG", "JPG", "WEBP"])
            quality = st.slider("Qualidade para JPG/WEBP", min_value=10, max_value=100, value=85)

            if st.button("📐 Processar imagem"):
                resized = image.resize((int(new_width), int(new_height)))

                if output_format == "PNG":
                    data = image_to_png_bytes(resized)
                    file_name = f"imagem_redimensionada_{now_suffix()}.png"
                    mime = "image/png"
                elif output_format == "JPG":
                    data = image_to_jpeg_bytes(resized, quality=quality)
                    file_name = f"imagem_redimensionada_{now_suffix()}.jpg"
                    mime = "image/jpeg"
                else:
                    data = image_to_webp_bytes(resized, quality=quality)
                    file_name = f"imagem_redimensionada_{now_suffix()}.webp"
                    mime = "image/webp"

                st.success("Imagem processada com sucesso.")
                st.download_button(
                    "⬇️ Baixar imagem", data=make_download_buffer(data), file_name=file_name, mime=mime
                )
        except Exception as e:
            st.error(f"Erro ao processar imagem: {e}")

# ============================================================
# IMAGENS PARA PDF
# ============================================================

elif menu == "🖼 Imagem - Imagens para PDF":
    render_section_title("image", "Converter imagens em PDF", "Envie uma ou mais imagens e gere um único PDF.")

    uploaded_files = st.file_uploader(
        "Envie as imagens",
        type=["png", "jpg", "jpeg", "webp", "heic", "heif"],
        accept_multiple_files=True
    )

    if uploaded_files:
        st.write(f"{len(uploaded_files)} imagem(ns) selecionada(s).")

        if st.button("🖼 Gerar PDF"):
            try:
                images = []
                for uploaded_file in uploaded_files:
                    image = open_image_from_upload(uploaded_file)
                    if image.mode in ("RGBA", "LA", "P"):
                        rgba = image.convert("RGBA")
                        bg = Image.new("RGB", rgba.size, "white")
                        bg.paste(rgba, mask=rgba.split()[-1])
                        image = bg
                    else:
                        image = image.convert("RGB")
                    images.append(image)

                if not images:
                    st.error("Nenhuma imagem válida foi enviada.")
                    st.stop()

                output = io.BytesIO()
                images[0].save(output, format="PDF", save_all=True, append_images=images[1:])
                output.seek(0)

                st.success("PDF gerado com sucesso.")
                st.download_button(
                    "⬇️ Baixar PDF",
                    data=output,
                    file_name=f"imagens_para_pdf_{now_suffix()}.pdf",
                    mime="application/pdf"
                )
            except Exception as e:
                st.error(f"Erro ao gerar PDF: {e}")

# ============================================================
# TEXTO
# ============================================================

elif menu == "🔤 Texto - Utilitários":
    render_section_title("file-text", "Utilitários de texto", "Conte palavras, limpe espaços e transforme texto rapidamente.")

    text = st.text_area("Digite ou cole seu texto", height=250)
    action = st.selectbox(
        "Escolha uma ação",
        [
            "Contar palavras e caracteres",
            "Converter para MAIÚSCULAS",
            "Converter para minúsculas",
            "Capitalizar frases",
            "Remover espaços extras",
            "Remover linhas vazias",
            "Limpar quebras de linha",
        ]
    )

    if st.button("🔤 Aplicar"):
        if not text.strip():
            st.warning("Insira um texto primeiro.")
            st.stop()

        result = text

        if action == "Contar palavras e caracteres":
            stats = text_stats(text)
            col1, col2, col3 = st.columns(3)
            with col1:
                st.metric("Palavras", stats["Palavras"])
            with col2:
                st.metric("Caracteres", stats["Caracteres"])
            with col3:
                st.metric("Linhas", stats["Linhas"])
            st.json(stats)
        else:
            if action == "Converter para MAIÚSCULAS":
                result = text.upper()
            elif action == "Converter para minúsculas":
                result = text.lower()
            elif action == "Capitalizar frases":
                result = ". ".join(sentence.strip().capitalize() for sentence in text.split(". "))
            elif action == "Remover espaços extras":
                result = re.sub(r"[ \t]+", " ", text)
                result = re.sub(r" *\n *", "\n", result)
            elif action == "Remover linhas vazias":
                result = "\n".join(line for line in text.splitlines() if line.strip())
            elif action == "Limpar quebras de linha":
                result = " ".join(line.strip() for line in text.splitlines() if line.strip())

            st.success("Texto processado.")
            st.text_area("Resultado", result, height=250)
            st.download_button(
                "⬇️ Baixar TXT",
                data=make_download_buffer(result),
                file_name=f"texto_processado_{now_suffix()}.txt",
                mime="text/plain"
            )

# ============================================================
# ÁUDIO
# ============================================================

elif menu == "🔊 Áudio - Texto para MP3":
    render_section_title("volume", "Texto para MP3", "Converta texto em áudio MP3 usando gTTS.")

    text = st.text_area("Digite ou cole o texto", height=250)

    voice_languages = {
        "Português": "pt",
        "Inglês": "en",
        "Espanhol": "es",
        "Francês": "fr",
        "Italiano": "it",
        "Alemão": "de",
        "Japonês": "ja",
        "Coreano": "ko",
    }
    language_label = st.selectbox("Idioma da voz", list(voice_languages.keys()), index=0)
    slow = st.checkbox("Falar mais devagar", value=False)

    if st.button("🔊 Gerar MP3"):
        try:
            if not text.strip():
                st.warning("Insira um texto primeiro.")
                st.stop()

            lang = voice_languages[language_label]

            with st.spinner("Gerando áudio..."):
                tts = gTTS(text=text, lang=lang, slow=slow)
                output = io.BytesIO()
                tts.write_to_fp(output)
                output.seek(0)

            st.success("Áudio gerado com sucesso.")
            st.audio(output, format="audio/mp3")
            output.seek(0)

            st.download_button(
                "⬇️ Baixar MP3",
                data=output,
                file_name=f"audio_{now_suffix()}.mp3",
                mime="audio/mpeg"
            )
        except Exception as e:
            st.error(f"Erro ao gerar áudio: {e}")
