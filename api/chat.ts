const CLIENT_AI_TIMEOUT_MS = 30000;
const CHAT_API_ENDPOINT = '/api/chats';

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function parseApiResponse(text: string) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

export async function sendToVercel(
  provider: string,
  model: string,
  messages: AiMessage[]
) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), CLIENT_AI_TIMEOUT_MS);

  try {
    const response = await fetch(CHAT_API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model, messages }),
      signal: controller.signal,
    });

    const text = await response.text();
    const data = parseApiResponse(text);

    if (!response.ok) {
      throw new Error(data.error || `Erro no servidor: ${response.status}`);
    }

    return data.answer;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('Tempo limite ao aguardar a IA. Tente uma mensagem menor ou outro modelo.');
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
