export const config = {
  runtime: 'edge',
};

const AI_TIMEOUT_MS = 25000;
const MAX_OUTPUT_TOKENS = 1200;
const DEFAULT_OMNIROUTE_BASE_URL = 'http://localhost:20128/v1';

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function readProviderError(data: any, fallback: string) {
  if (!data) return fallback;
  return (
    data?.error?.message ||
    data?.error?.details ||
    data?.error ||
    data?.message ||
    fallback
  );
}

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const body = await req.json();
    const { provider, model, messages } = body;

    if (!provider || !model || !Array.isArray(messages)) {
      return jsonResponse({ error: 'Parâmetros obrigatórios ausentes.' }, 400);
    }

    let apiUrl = '';
    let apiKey = '';
    let requestBody: any = {
      messages,
      temperature: 0.7,
      max_tokens: MAX_OUTPUT_TOKENS,
    };

    // ============================================
    // ROTEAMENTO DE PROVEDORES
    // ============================================
    switch (provider) {
      case 'openrouter':
        apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
        apiKey = process.env.OPENROUTER_API_KEY || '';
        requestBody.model = model;
        break;

      case 'omniroute': {
        const baseUrl =
          process.env.OMNIROUTE_BASE_URL ||
          DEFAULT_OMNIROUTE_BASE_URL;

        apiUrl = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
        apiKey = process.env.OMNIROUTE_API_KEY || 'omniroute';
        requestBody.model = model;
        break;
      }

      case 'groq':
        apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
        apiKey = process.env.GROQ_API_KEY || '';
        requestBody.model = model;
        break;

      case 'gemini':
        apiKey = process.env.GEMINI_API_KEY || '';
        apiUrl =
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const geminiContents: any[] = [];

        for (const m of messages) {
          if (!m?.content) continue;

          const role =
            m.role === 'assistant'
              ? 'model'
              : 'user';

          if (
            geminiContents.length > 0 &&
            geminiContents[geminiContents.length - 1].role === role
          ) {
            geminiContents[
              geminiContents.length - 1
            ].parts[0].text += `\n\n${m.content}`;
          } else {
            geminiContents.push({
              role,
              parts: [{ text: String(m.content) }],
            });
          }
        }

        requestBody = {
          contents: geminiContents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
          },
        };

        break;

      default:
        return jsonResponse({ error: 'Provedor desconhecido.' }, 400);
    }

    if (!apiKey) {
      return jsonResponse({ error: `Chave da API não configurada para ${provider}` }, 500);
    }

    // ============================================
    // HEADERS
    // ============================================
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (provider !== 'gemini') {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    if (provider === 'openrouter') {
      headers['HTTP-Referer'] =
        'https://docutools.vercel.app';
      headers['X-Title'] = 'DocuTools Pro';
    }

    // ============================================
    // CHAMADA DA API
    // ============================================
    const aiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    const responseText = await aiResponse.text();
    let data: any = null;

    try {
      data = responseText ? JSON.parse(responseText) : null;
    } catch {
      data = null;
    }

    if (!aiResponse.ok) {
      console.error('Erro no provedor:', data || responseText);

      return jsonResponse({
        error: readProviderError(data, `Erro na IA (${aiResponse.status})`),
      }, aiResponse.status);
    }

    // ============================================
    // NORMALIZAÇÃO
    // ============================================
    let answer = '';

    if (provider === 'gemini') {
      answer =
        data?.candidates?.[0]?.content?.parts
          ?.map((p: any) => p.text)
          ?.join('') || '';
    } else {
      answer =
        data?.choices?.[0]?.message?.content || '';
    }

    if (!answer) {
      return jsonResponse({ error: 'A IA respondeu sem conteúdo.' }, 502);
    }

    return jsonResponse({ answer });
  } catch (error: any) {
    console.error('Erro interno:', error);

    if (error?.name === 'AbortError') {
      return jsonResponse({
        error: 'Tempo limite ao aguardar a IA. Tente uma mensagem menor ou outro modelo.',
      }, 504);
    }

    return jsonResponse({
      error: error?.message || 'Internal Server Error',
    }, 500);
  } finally {
    clearTimeout(timeoutId);
  }
}
