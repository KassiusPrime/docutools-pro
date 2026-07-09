import io
import re
import zipfile
from datetime import datetime

import streamlit as st
from PIL import Image, ImageOps, UnidentifiedImageError

from pypdf import PdfReader, PdfWriter
from docx import Document
from deep_translator import GoogleTranslator
from gtts import gTTS


try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except Exception:
    pass


st.set_page_config(
    page_title="DocuTools Pro",
    page_icon="🧰",
    layout="wide",
    initial_sidebar_state="expanded"
)


APP_NAME = "DocuTools Pro"
MAX_FILE_SIZE_MB = 50


# =========================
# Funções auxiliares
# =========================

def now_suffix():
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def sanitize_filename(name):
    name = name or "arquivo"
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
            "Não foi possível identificar a imagem. "
            "Envie PNG, JPG, JPEG, WEBP, HEIC ou HEIF."
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


def extract_text_from_pdf(uploaded_file):
    valid, error = validate_file_size(uploaded_file)

    if not valid:
        raise ValueError(error)

    file_bytes = get_file_bytes(uploaded_file)
    reader = PdfReader(io.BytesIO(file_bytes))

    pages_text = []

    for index, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        pages_text.append(f"\n\n--- Página {index} ---\n{text}")

    return "\n".join(pages_text).strip()


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

    all_text = paragraphs + tables_text

    return "\n".join(all_text).strip()


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
        "Parágrafos": paragraphs
    }


# =========================
# Sidebar
# =========================

st.sidebar.title("🧰 DocuTools Pro")
st.sidebar.caption("Ferramentas para PDF, Word, imagens, texto e áudio.")

menu = st.sidebar.radio(
    "Escolha uma ferramenta",
    [
        "Início",
        "PDF - Juntar PDFs",
        "PDF - Dividir PDF",
        "PDF - Extrair texto",
        "Word - Extrair texto DOCX",
        "Imagem - Remover fundo",
        "Imagem - Converter imagem",
        "Imagem - Redimensionar e comprimir",
        "Imagem - Imagens para PDF",
        "Texto - Traduzir",
        "Texto - Utilitários",
        "Áudio - Texto para MP3"
    ]
)

st.sidebar.divider()
st.sidebar.info(
    "Para melhor compatibilidade com HEIC/HEIF, mantenha o arquivo "
    "`packages.txt` no projeto."
)


# =========================
# Início
# =========================

if menu == "Início":
    st.title("🧰 DocuTools Pro")
    st.subheader("Ferramentas rápidas para documentos, imagens, texto e áudio.")

    st.write(
        "Escolha uma ferramenta na barra lateral para começar. "
        "Você pode processar PDFs, DOCX, imagens, textos e áudio diretamente pelo navegador."
    )

    col1, col2, col3 = st.columns(3)

    with col1:
        st.info("📄 **PDF**\n\nJuntar, dividir e extrair texto de PDFs.")

    with col2:
        st.success("🖼️ **Imagens**\n\nRemover fundo, converter, redimensionar e gerar PDF.")

    with col3:
        st.warning("🔤 **Texto e Áudio**\n\nTraduzir, limpar texto, contar palavras e gerar MP3.")

    st.divider()

    st.markdown(
        """
        ### Formatos suportados

        **PDF**
        - `.pdf`

        **Word**
        - `.docx`

        **Imagens**
        - `.png`
        - `.jpg`
        - `.jpeg`
        - `.webp`
        - `.heic`
        - `.heif`

        **Saídas**
        - PDF
        - TXT
        - PNG
        - JPG
        - WEBP
        - MP3
        """
    )


# =========================
# PDF - Juntar PDFs
# =========================

elif menu == "PDF - Juntar PDFs":
    st.title("📄 Juntar PDFs")
    st.caption("Envie dois ou mais arquivos PDF para gerar um único PDF.")

    uploaded_files = st.file_uploader(
        "Envie os PDFs",
        type=["pdf"],
        accept_multiple_files=True
    )

    if uploaded_files:
        st.write(f"{len(uploaded_files)} arquivo(s) selecionado(s).")

        if st.button("Juntar PDFs"):
            try:
                writer = PdfWriter()

                for uploaded_file in uploaded_files:
                    valid, error = validate_file_size(uploaded_file)

                    if not valid:
                        st.error(f"{uploaded_file.name}: {error}")
                        st.stop()

                    file_bytes = get_file_bytes(uploaded_file)
                    reader = PdfReader(io.BytesIO(file_bytes))

                    for page in reader.pages:
                        writer.add_page(page)

                output = io.BytesIO()
                writer.write(output)
                output.seek(0)

                st.success("PDFs unidos com sucesso!")

                st.download_button(
                    label="Baixar PDF unido",
                    data=output,
                    file_name=f"pdf_unido_{now_suffix()}.pdf",
                    mime="application/pdf"
                )

            except Exception as e:
                st.error(f"Erro ao juntar PDFs: {e}")


# =========================
# PDF - Dividir PDF
# =========================

elif menu == "PDF - Dividir PDF":
    st.title("✂️ Dividir PDF")
    st.caption("Extraia um intervalo ou separe todas as páginas em arquivos individuais.")

    uploaded_file = st.file_uploader(
        "Envie um PDF",
        type=["pdf"]
    )

    if uploaded_file:
        try:
            valid, error = validate_file_size(uploaded_file)

            if not valid:
                st.error(error)
                st.stop()

            file_bytes = get_file_bytes(uploaded_file)
            reader = PdfReader(io.BytesIO(file_bytes))
            total_pages = len(reader.pages)

            st.info(f"O PDF possui {total_pages} página(s).")

            mode = st.radio(
                "Modo de divisão",
                [
                    "Extrair intervalo de páginas",
                    "Separar todas as páginas"
                ]
            )

            if mode == "Extrair intervalo de páginas":
                col1, col2 = st.columns(2)

                with col1:
                    start_page = st.number_input(
                        "Página inicial",
                        min_value=1,
                        max_value=total_pages,
                        value=1
                    )

                with col2:
                    end_page = st.number_input(
                        "Página final",
                        min_value=start_page,
                        max_value=total_pages,
                        value=total_pages
                    )

                if st.button("Extrair páginas"):
                    writer = PdfWriter()

                    for page_index in range(start_page - 1, end_page):
                        writer.add_page(reader.pages[page_index])

                    output = io.BytesIO()
                    writer.write(output)
                    output.seek(0)

                    st.success("Páginas extraídas com sucesso!")

                    st.download_button(
                        label="Baixar PDF extraído",
                        data=output,
                        file_name=f"paginas_{start_page}_a_{end_page}_{now_suffix()}.pdf",
                        mime="application/pdf"
                    )

            else:
                if st.button("Separar todas as páginas"):
                    zip_buffer = io.BytesIO()

                    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
                        for index, page in enumerate(reader.pages, start=1):
                            writer = PdfWriter()
                            writer.add_page(page)

                            pdf_buffer = io.BytesIO()
                            writer.write(pdf_buffer)
                            pdf_buffer.seek(0)

                            zip_file.writestr(
                                f"pagina_{index}.pdf",
                                pdf_buffer.getvalue()
                            )

                    zip_buffer.seek(0)

                    st.success("Páginas separadas com sucesso!")

                    st.download_button(
                        label="Baixar ZIP com páginas separadas",
                        data=zip_buffer,
                        file_name=f"paginas_separadas_{now_suffix()}.zip",
                        mime="application/zip"
                    )

        except Exception as e:
            st.error(f"Erro ao dividir PDF: {e}")


# =========================
# PDF - Extrair texto
# =========================

elif menu == "PDF - Extrair texto":
    st.title("📄 Extrair texto de PDF")
    st.caption("Extraia texto das páginas de um arquivo PDF.")

    uploaded_file = st.file_uploader(
        "Envie um PDF",
        type=["pdf"]
    )

    if uploaded_file:
        if st.button("Extrair texto"):
            try:
                text = extract_text_from_pdf(uploaded_file)

                if not text:
                    st.warning(
                        "Nenhum texto foi encontrado. "
                        "Este PDF pode ser uma digitalização em imagem."
                    )
                else:
                    st.success("Texto extraído com sucesso!")
                    st.text_area("Texto extraído", text, height=400)

                    st.download_button(
                        label="Baixar TXT",
                        data=make_download_buffer(text),
                        file_name=f"texto_pdf_{now_suffix()}.txt",
                        mime="text/plain"
                    )

            except Exception as e:
                st.error(f"Erro ao extrair texto do PDF: {e}")


# =========================
# Word - Extrair texto DOCX
# =========================

elif menu == "Word - Extrair texto DOCX":
    st.title("📝 Extrair texto de DOCX")
    st.caption("Extraia texto de documentos Word no formato `.docx`.")

    uploaded_file = st.file_uploader(
        "Envie um arquivo DOCX",
        type=["docx"]
    )

    if uploaded_file:
        if st.button("Extrair texto"):
            try:
                text = extract_text_from_docx(uploaded_file)

                if not text:
                    st.warning("Nenhum texto foi encontrado no DOCX.")
                else:
                    st.success("Texto extraído com sucesso!")
                    st.text_area("Texto extraído", text, height=400)

                    st.download_button(
                        label="Baixar TXT",
                        data=make_download_buffer(text),
                        file_name=f"texto_docx_{now_suffix()}.txt",
                        mime="text/plain"
                    )

            except Exception as e:
                st.error(f"Erro ao extrair texto do DOCX: {e}")


# =========================
# Imagem - Remover fundo
# =========================

elif menu == "Imagem - Remover fundo":
    st.title("🖼️ Remover fundo de imagem")
    st.caption(
        "Envie PNG, JPG, JPEG, WEBP, HEIC ou HEIF. "
        "A saída pode ser PNG transparente ou JPG com fundo personalizado."
    )

    uploaded_file = st.file_uploader(
        "Envie uma imagem",
        type=["png", "jpg", "jpeg", "webp", "heic", "heif"]
    )

    col_config1, col_config2 = st.columns(2)

    with col_config1:
        background_option = st.selectbox(
            "Fundo final",
            ["Transparente", "Branco", "Preto", "Cor personalizada"]
        )

    with col_config2:
        custom_color = st.color_picker(
            "Escolha a cor",
            "#ffffff",
            disabled=background_option != "Cor personalizada"
        )

    if uploaded_file:
        try:
            original_image = open_image_from_upload(uploaded_file)

            col1, col2 = st.columns(2)

            with col1:
                st.image(
                    original_image,
                    caption="Imagem original",
                    use_column_width=True
                )

            if st.button("Remover fundo"):
                try:
                    from rembg import remove

                    with st.spinner("Removendo fundo... isso pode levar alguns segundos."):
                        input_png = image_to_png_bytes(original_image)
                        output_bytes = remove(input_png)
                        result_image = Image.open(io.BytesIO(output_bytes)).convert("RGBA")
                        result_image = apply_background(
                            result_image,
                            background_option,
                            custom_color
                        )

                    with col2:
                        st.image(
                            result_image,
                            caption="Resultado",
                            use_column_width=True
                        )

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

                    st.success("Fundo removido com sucesso!")

                    st.download_button(
                        label="Baixar resultado",
                        data=output,
                        file_name=file_name,
                        mime=mime
                    )

                except Exception as e:
                    st.error(f"Erro ao remover fundo: {e}")

        except Exception as e:
            st.error(e)


# =========================
# Imagem - Converter imagem
# =========================

elif menu == "Imagem - Converter imagem":
    st.title("🔁 Converter imagem")
    st.caption("Converta imagens entre PNG, JPG e WEBP. HEIC/HEIF também são aceitos como entrada.")

    uploaded_file = st.file_uploader(
        "Envie uma imagem",
        type=["png", "jpg", "jpeg", "webp", "heic", "heif"]
    )

    output_format = st.selectbox(
        "Formato de saída",
        ["PNG", "JPG", "WEBP"]
    )

    quality = st.slider(
        "Qualidade para JPG/WEBP",
        min_value=10,
        max_value=100,
        value=90
    )

    if uploaded_file:
        try:
            image = open_image_from_upload(uploaded_file)

            st.image(
                image,
                caption="Prévia",
                use_column_width=True
            )

            if st.button("Converter imagem"):
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

                st.success("Imagem convertida com sucesso!")

                st.download_button(
                    label="Baixar imagem convertida",
                    data=make_download_buffer(data),
                    file_name=file_name,
                    mime=mime
                )

        except Exception as e:
            st.error(f"Erro ao converter imagem: {e}")


# =========================
# Imagem - Redimensionar e comprimir
# =========================

elif menu == "Imagem - Redimensionar e comprimir":
    st.title("📐 Redimensionar e comprimir imagem")
    st.caption("Altere largura, altura, qualidade e formato final da imagem.")

    uploaded_file = st.file_uploader(
        "Envie uma imagem",
        type=["png", "jpg", "jpeg", "webp", "heic", "heif"]
    )

    if uploaded_file:
        try:
            image = open_image_from_upload(uploaded_file)
            original_width, original_height = image.size

            st.info(f"Tamanho original: {original_width} x {original_height}px")

            st.image(
                image,
                caption="Imagem original",
                use_column_width=True
            )

            keep_ratio = st.checkbox("Manter proporção", value=True)

            col1, col2 = st.columns(2)

            with col1:
                new_width = st.number_input(
                    "Nova largura",
                    min_value=1,
                    max_value=10000,
                    value=original_width
                )

            with col2:
                if keep_ratio:
                    new_height = int((new_width / original_width) * original_height)

                    st.number_input(
                        "Nova altura",
                        min_value=1,
                        max_value=10000,
                        value=new_height,
                        disabled=True
                    )
                else:
                    new_height = st.number_input(
                        "Nova altura",
                        min_value=1,
                        max_value=10000,
                        value=original_height
                    )

            output_format = st.selectbox(
                "Formato final",
                ["PNG", "JPG", "WEBP"]
            )

            quality = st.slider(
                "Qualidade para JPG/WEBP",
                min_value=10,
                max_value=100,
                value=85
            )

            if st.button("Processar imagem"):
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

                st.success("Imagem processada com sucesso!")

                st.download_button(
                    label="Baixar imagem",
                    data=make_download_buffer(data),
                    file_name=file_name,
                    mime=mime
                )

        except Exception as e:
            st.error(f"Erro ao processar imagem: {e}")


# =========================
# Imagem - Imagens para PDF
# =========================

elif menu == "Imagem - Imagens para PDF":
    st.title("🖼️ Converter imagens em PDF")
    st.caption("Envie uma ou mais imagens e gere um único PDF.")

    uploaded_files = st.file_uploader(
        "Envie as imagens",
        type=["png", "jpg", "jpeg", "webp", "heic", "heif"],
        accept_multiple_files=True
    )

    if uploaded_files:
        st.write(f"{len(uploaded_files)} imagem(ns) selecionada(s).")

        if st.button("Gerar PDF"):
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

                first_image = images[0]
                remaining_images = images[1:]

                first_image.save(
                    output,
                    format="PDF",
                    save_all=True,
                    append_images=remaining_images
                )

                output.seek(0)

                st.success("PDF gerado com sucesso!")

                st.download_button(
                    label="Baixar PDF",
                    data=output,
                    file_name=f"imagens_para_pdf_{now_suffix()}.pdf",
                    mime="application/pdf"
                )

            except Exception as e:
                st.error(f"Erro ao gerar PDF: {e}")


# =========================
# Texto - Traduzir
# =========================

elif menu == "Texto - Traduzir":
    st.title("🌐 Traduzir texto")
    st.caption("Cole um texto ou extraia de PDF/DOCX e traduza para outro idioma.")

    source_mode = st.radio(
        "Origem do texto",
        ["Digitar/colar texto", "Extrair de PDF", "Extrair de DOCX"]
    )

    text = ""

    if source_mode == "Digitar/colar texto":
        text = st.text_area("Texto para traduzir", height=250)

    elif source_mode == "Extrair de PDF":
        uploaded_file = st.file_uploader("Envie um PDF", type=["pdf"])

        if uploaded_file and st.button("Extrair texto do PDF"):
            try:
                extracted = extract_text_from_pdf(uploaded_file)
                st.session_state["texto_para_traduzir_pdf"] = extracted
            except Exception as e:
                st.error(f"Erro ao extrair texto: {e}")

        text = st.session_state.get("texto_para_traduzir_pdf", "")

        if text:
            st.text_area("Texto extraído", text, height=250)

    else:
        uploaded_file = st.file_uploader("Envie um DOCX", type=["docx"])

        if uploaded_file and st.button("Extrair texto do DOCX"):
            try:
                extracted = extract_text_from_docx(uploaded_file)
                st.session_state["texto_para_traduzir_docx"] = extracted
            except Exception as e:
                st.error(f"Erro ao extrair texto: {e}")

        text = st.session_state.get("texto_para_traduzir_docx", "")

        if text:
            st.text_area("Texto extraído", text, height=250)

    languages = {
        "Português": "pt",
        "Inglês": "en",
        "Espanhol": "es",
        "Francês": "fr",
        "Italiano": "it",
        "Alemão": "de",
        "Japonês": "ja",
        "Coreano": "ko",
        "Chinês simplificado": "zh-CN"
    }

    col1, col2 = st.columns(2)

    with col1:
        source_lang_label = st.selectbox(
            "Idioma de origem",
            ["auto"] + list(languages.keys())
        )

    with col2:
        target_lang_label = st.selectbox(
            "Idioma de destino",
            list(languages.keys()),
            index=0
        )

    if st.button("Traduzir"):
        try:
            if not text.strip():
                st.warning("Insira ou extraia um texto antes de traduzir.")
                st.stop()

            source_lang = "auto" if source_lang_label == "auto" else languages[source_lang_label]
            target_lang = languages[target_lang_label]

            chunks = chunk_text(text)
            translated_parts = []

            with st.spinner("Traduzindo..."):
                for chunk in chunks:
                    translated = GoogleTranslator(
                        source=source_lang,
                        target=target_lang
                    ).translate(chunk)

                    translated_parts.append(translated)

            final_text = "\n\n".join(translated_parts)

            st.success("Tradução concluída!")
            st.text_area("Texto traduzido", final_text, height=350)

            st.download_button(
                label="Baixar tradução em TXT",
                data=make_download_buffer(final_text),
                file_name=f"traducao_{now_suffix()}.txt",
                mime="text/plain"
            )

        except Exception as e:
            st.error(f"Erro ao traduzir texto: {e}")


# =========================
# Texto - Utilitários
# =========================

elif menu == "Texto - Utilitários":
    st.title("🔤 Utilitários de texto")
    st.caption("Conte palavras, limpe espaços e transforme texto rapidamente.")

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
            "Limpar quebras de linha"
        ]
    )

    if st.button("Aplicar"):
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
                result = ". ".join(
                    sentence.strip().capitalize()
                    for sentence in text.split(". ")
                )

            elif action == "Remover espaços extras":
                result = re.sub(r"[ \t]+", " ", text)
                result = re.sub(r" *\n *", "\n", result)

            elif action == "Remover linhas vazias":
                result = "\n".join(
                    line for line in text.splitlines()
                    if line.strip()
                )

            elif action == "Limpar quebras de linha":
                result = " ".join(
                    line.strip()
                    for line in text.splitlines()
                    if line.strip()
                )

            st.success("Texto processado!")
            st.text_area("Resultado", result, height=250)

            st.download_button(
                label="Baixar TXT",
                data=make_download_buffer(result),
                file_name=f"texto_processado_{now_suffix()}.txt",
                mime="text/plain"
            )


# =========================
# Áudio - Texto para MP3
# =========================

elif menu == "Áudio - Texto para MP3":
    st.title("🔊 Texto para MP3")
    st.caption("Converta texto em áudio MP3 usando gTTS.")

    text = st.text_area("Digite ou cole o texto", height=250)

    languages = {
        "Português": "pt",
        "Inglês": "en",
        "Espanhol": "es",
        "Francês": "fr",
        "Italiano": "it",
        "Alemão": "de",
        "Japonês": "ja",
        "Coreano": "ko"
    }

    language_label = st.selectbox(
        "Idioma da voz",
        list(languages.keys()),
        index=0
    )

    slow = st.checkbox("Falar mais devagar", value=False)

    if st.button("Gerar MP3"):
        try:
            if not text.strip():
                st.warning("Insira um texto primeiro.")
                st.stop()

            lang = languages[language_label]

            with st.spinner("Gerando áudio..."):
                tts = gTTS(text=text, lang=lang, slow=slow)
                output = io.BytesIO()
                tts.write_to_fp(output)
                output.seek(0)

            st.success("Áudio gerado com sucesso!")

            st.audio(output, format="audio/mp3")

            output.seek(0)

            st.download_button(
                label="Baixar MP3",
                data=output,
                file_name=f"audio_{now_suffix()}.mp3",
                mime="audio/mpeg"
            )

        except Exception as e:
            st.error(f"Erro ao gerar áudio: {e}")
