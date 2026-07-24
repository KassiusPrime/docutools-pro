// api/chat.ts
// Função Serverless da Vercel (Edge Runtime)
// Salve este arquivo na pasta 'api' na raiz do seu projeto.

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { provider, model, messages } = body;

    let apiUrl = '';
    let apiKey = '';
    let requestBody: any = { messages, temperature: 0.7 };

    // ============================================
    // ROTEAMENTO DE PROVEDORES
    // ============================================
    if (provider === 'openrouter') {
      apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
      apiKey = process.env.OPENROUTER_API_KEY || '';
      requestBody.model = model;
    } 
    else if (provider === 'groq') {
      apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
      apiKey = process.env.GROQ_API_KEY || '';
      requestBody.model = model;
    }
    else if (provider === 'gemini') {
      // O Gemini via OpenRouter é mais fácil, mas se quiser usar a chave nativa do Google:
      apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
      apiKey = ''; // A chave já vai na URL para a API nativa
      
      // Converte o padrão OpenAI (messages) para o padrão nativo do Gemini
      const parts = messages.map((m: any) => ({ text: m.content }));
      requestBody = { contents: [{ parts }] };
    } 
    else {
      return new Response(JSON.stringify({ error: 'Provedor desconhecido.' }), { status: 400 });
    }

    if (!apiKey && provider !== 'gemini') {
      return new Response(JSON.stringify({ error: `Chave da API não configurada no Vercel para ${provider}` }), { status: 500 });
    }

    // ============================================
    // CHAMADA PARA A IA
    // ============================================
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // Header exigido pelo OpenRouter
    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://docutools.vercel.app';
      headers['X-Title'] = 'DocuTools Pro';
    }

    const aiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Erro no provedor:', errorText);
      return new Response(JSON.stringify({ error: `Erro na IA: ${aiResponse.status}` }), { status: aiResponse.status });
    }

    const data = await aiResponse.json();

    // ============================================
    // NORMALIZAÇÃO DE RESPOSTA
    // ============================================
    let answer = '';
    if (provider === 'gemini') {
      answer = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      // Padrão OpenAI/OpenRouter/Groq
      answer = data.choices?.[0]?.message?.content || '';
    }

    return new Response(JSON.stringify({ answer }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Erro na API:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}