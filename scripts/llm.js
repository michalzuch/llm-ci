const baseUrl = (process.env.LLM_BASE_URL || 'http://localhost:11434/v1').replace(/\/$/, '');
const model = process.env.LLM_MODEL || 'qwen2.5:3b';
const apiKey = process.env.LLM_API_KEY || 'ollama';

export async function chat(messages, { retries = 1 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, messages, temperature: 0.2 }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`LLM request failed (${res.status}): ${text}`);
      }
      const data = await res.json();
      return data.choices[0].message.content;
    } catch (err) {
      lastError = err;
      if (attempt < retries) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function chatJson(messages) {
  const raw = await chat(messages);
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON object found in response');
    return JSON.parse(match[0]);
  } catch {
    // retry once with explicit instruction
    const strictMessages = [
      ...messages,
      { role: 'assistant', content: raw },
      {
        role: 'user',
        content: 'Your response was not valid JSON. Reply with ONLY a raw JSON object, no markdown, no explanation.',
      },
    ];
    const raw2 = await chat(strictMessages, { retries: 0 });
    const match2 = raw2.match(/\{[\s\S]*\}/);
    if (!match2) throw new Error(`LLM did not return JSON after retry. Got: ${raw2.slice(0, 200)}`);
    return JSON.parse(match2[0]);
  }
}
