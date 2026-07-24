const API_URL =
  import.meta.env.VITE_LITELLM_URL;

const API_KEY =
  import.meta.env.VITE_LITELLM_KEY;

export async function sendToAI(
  model: string,
  messages: {
    role: string;
    content: string;
  }[]
) {
  const response = await fetch(
    `${API_URL}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7
      })
    }
  );

  if (!response.ok) {
    throw new Error(
      `Erro ${response.status}`
    );
  }

  return response.json();
}