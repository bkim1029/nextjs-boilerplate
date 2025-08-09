// /api/translate.js
// Vercel Edge Function for secure Claude API calls

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers });
  }

  // Only allow POST requests
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await request.json();
    const { password, text, contextBefore, contextAfter, mode } = body;

    // Verify access password
    if (password !== process.env.ACCESS_PASSWORD) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare context for Claude
    let contextPrompt = "";
    
    if (contextBefore && contextBefore.length > 0) {
      contextPrompt += "이전 문맥 (참고용):\n";
      contextBefore.slice(-10).forEach((seg, idx) => {
        contextPrompt += `[${idx + 1}] 원문: ${seg.source}\n`;
        if (seg.target) {
          contextPrompt += `    번역: ${seg.target}\n`;
        }
      });
      contextPrompt += "\n";
    }
    
    if (contextAfter && contextAfter.length > 0) {
      contextPrompt += "이후 문맥 (참고용):\n";
      contextAfter.slice(0, 10).forEach((seg, idx) => {
        contextPrompt += `[${idx + 1}] 원문: ${seg.source}\n`;
        if (seg.target) {
          contextPrompt += `    번역: ${seg.target}\n`;
        }
      });
      contextPrompt += "\n";
    }

    // Construct the prompt based on mode
    let systemPrompt = "You are a professional translator specializing in English to Korean translation. ";
    
    switch(mode) {
      case 'quality':
        systemPrompt += "Focus on creating the most natural and accurate Korean translation, considering all nuances and context.";
        break;
      case 'speed':
        systemPrompt += "Provide a quick, accurate translation while maintaining essential meaning.";
        break;
      default:
        systemPrompt += "Provide a balanced translation that is both accurate and natural.";
    }

    const userPrompt = `${contextPrompt}
현재 번역할 문장:
"${text}"

위의 영어 문장을 한국어로 번역해주세요. 앞뒤 문맥을 참고하여 자연스럽고 정확한 번역을 제공해주세요.
번역된 한국어 문장만 출력하세요. 추가 설명은 필요 없습니다.`;

    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-opus-20240229', // or claude-3-sonnet-20240229 for faster/cheaper
        max_tokens: 1000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ]
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    const translation = data.content[0].text.trim();

    // Log usage (optional)
    console.log(`Translated: "${text.substring(0, 50)}..." -> "${translation.substring(0, 50)}..."`);

    return new Response(
      JSON.stringify({ 
        translation,
        usage: data.usage // Include token usage for monitoring
      }),
      { 
        status: 200, 
        headers: { ...headers, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Translation error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Translation failed', 
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...headers, 'Content-Type': 'application/json' } 
      }
    );
  }
}