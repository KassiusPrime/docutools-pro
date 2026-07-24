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
      apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
      apiKey = ''; // A chave já vai na URL para a API nativa

      // TRADUTOR PARA O PADRÃO GEMINI
      const geminiContents: any[] = [];
      
      messages.forEach((m: any) => {
        // Converte 'system' e 'user' para 'user', e 'assistant' para 'model'
        const role = m.role === 'assistant' ? 'model' : 'user';
        
        // O Gemini não aceita duas mensagens seguidas com a mesma 'role' (ex: user + user).
        // Se a role for igual a anterior, nós fundimos os textos.
        if (geminiContents.length > 0 && geminiContents[geminiContents.length - 1].role === role) {
          geminiContents[geminiContents.length - 1].parts[0].text += `\n\n${m.content}`;
        } else {
          geminiContents.push({ role, parts: [{ text: m.content }] });
        }
      });

      requestBody = { contents: geminiContents };
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
