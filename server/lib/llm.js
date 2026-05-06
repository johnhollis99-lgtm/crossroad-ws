const XAI_BASE = 'https://api.x.ai/v1';

// Strip markdown code fences that some LLMs wrap around JSON output.
function extractJSON(raw) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : raw.trim();
}

async function callLLM(systemPrompt, userPrompt, { temperature = 0.9, maxTokens = 700 } = {}) {
  if (!process.env.XAI_API_KEY) throw new Error('Missing XAI_API_KEY in environment');

  const res = await fetch(`${XAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'grok-2-latest',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
      max_tokens:      maxTokens,
      temperature,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`xAI API ${res.status}: ${body}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? '';
  return JSON.parse(extractJSON(content));
}

module.exports = { callLLM };
