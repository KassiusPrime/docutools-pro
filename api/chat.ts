export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method Not Allowed' }),
      {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    const body = await req.json();
    const { provider, model, messages } = body;

    if (!provider || !model || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({
          error: 'Parâmetros obrigatórios ausentes.',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    let apiUrl = '';
    let apiKey = '';
    let requestBody: any = {
      messages,
      temperature: 0.7,
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

      case 'groq':
        apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
        apiKey = process.env.GROQ_API_KEY || '';
        requestBody.model = model;
        break;

      case 'gemini':
        apiUrl =
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

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
          },
        };

        break;

      default:
        return new Response(
          JSON.stringify({
            error: 'Provedor desconhecido.',
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        );
    }

    if (!apiKey && provider !== 'gemini') {
      return new Response(
        JSON.stringify({
          error: `Chave da API não configurada para ${provider}`,
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // ============================================
    // HEADERS
    // ============================================
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
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
    });

    const data = await aiResponse.json();

    if (!aiResponse.ok) {
      console.error('Erro no provedor:', data);

      return new Response(
        JSON.stringify({
          error:
            data?.error?.message ||
            data?.error ||
            `Erro na IA (${aiResponse.status})`,
        }),
        {
          status: aiResponse.status,
          headers: { 'Content-Type': 'application/json' },
        }
      );
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

    return new Response(
      JSON.stringify({ answer }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Erro interno:', error);

    return new Response(
      JSON.stringify({
        error: error?.message || 'Internal Server Error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
