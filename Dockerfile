FROM python:3.11-slim

# Garante que o Linux instale sem pedir "Y/N"
ENV DEBIAN_FRONTEND=noninteractive

# Instala as dependências pesadas de sistema (Tesseract, PDF, LibGL)
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-por \
    tesseract-ocr-eng \
    tesseract-ocr-spa \
    tesseract-ocr-fra \
    tesseract-ocr-deu \
    poppler-utils \
    fonts-dejavu-core \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia os requisitos e instala
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copia o seu código (app.py)
COPY . .

# Expõe a porta que o Render vai usar
EXPOSE 8501

# Inicia o app garantindo que ele não tente burlar o Render
CMD ["streamlit", "run", "app.py", "--server.port=8501", "--server.address=0.0.0.0", "--server.enableCORS=false"]
