import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface TextQueueItem {
  id: string;
  projectId: string;
  type: string; // 'mapping' | 'prompts' | 'general'
  label?: string;
  payload: any;
  resolve: (value: any) => void;
  reject: (reason: any) => void;
}

interface TextLogItem {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'error';
  projectId: string;
  message: string;
}

const textQueue: TextQueueItem[] = [];
const activeTextItems: Array<{ id: string; projectId: string; type: string; label?: string; startTime: string }> = [];
const textLogs: TextLogItem[] = [];
const textConcurrency = 1; // Run AI API requests sequentially to avoid rate limits
let activeTextCount = 0;

function addTextLog(type: 'info' | 'success' | 'error', projectId: string, message: string) {
  const log: TextLogItem = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    timestamp: new Date().toLocaleTimeString(),
    type,
    projectId,
    message
  };
  textLogs.push(log);
  if (textLogs.length > 200) {
    textLogs.shift();
  }
}

function calculateCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const modelLower = model.toLowerCase();
  let inputRate = 0; // per million tokens
  let outputRate = 0; // per million tokens

  if (provider === 'openai') {
    if (modelLower.includes('gpt-4o-mini')) {
      inputRate = 0.15;
      outputRate = 0.60;
    } else if (modelLower.includes('gpt-4o')) {
      inputRate = 2.50;
      outputRate = 10.00;
    } else if (modelLower.includes('o1-mini')) {
      inputRate = 3.00;
      outputRate = 12.00;
    } else if (modelLower.includes('gpt-3.5')) {
      inputRate = 0.50;
      outputRate = 1.50;
    } else {
      inputRate = 2.00;
      outputRate = 6.00;
    }
  } else if (provider === 'gemini') {
    if (modelLower.includes('flash')) {
      inputRate = 0.075;
      outputRate = 0.30;
    } else if (modelLower.includes('pro')) {
      inputRate = 1.25;
      outputRate = 5.00;
    } else {
      inputRate = 0.075;
      outputRate = 0.30;
    }
  } else if (provider === 'claude') {
    if (modelLower.includes('sonnet')) {
      inputRate = 3.00;
      outputRate = 15.00;
    } else if (modelLower.includes('haiku')) {
      inputRate = 0.80;
      outputRate = 4.00;
    } else if (modelLower.includes('opus')) {
      inputRate = 15.00;
      outputRate = 75.00;
    } else {
      inputRate = 3.00;
      outputRate = 15.00;
    }
  }

  const inputCost = (inputTokens / 1_000_000) * inputRate;
  const outputCost = (outputTokens / 1_000_000) * outputRate;
  return inputCost + outputCost;
}

async function generateTextContent(payload: any) {
  const { provider, apiKey, modelName, prompt, systemPrompt, responseFormat } = payload;

  if (!apiKey) {
    throw new Error('API Key is required');
  }
  if (!modelName) {
    throw new Error('Model Name is required');
  }
  if (!prompt) {
    throw new Error('Prompt content is required');
  }

  let responseText = '';
  let inputTokens = 0;
  let outputTokens = 0;

  if (provider === 'openai') {
    const messages: any[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelName,
        messages,
        temperature: 0.2,
        response_format: responseFormat === 'json' ? { type: 'json_object' } : undefined
      })
    });

    if (!openaiRes.ok) {
      const errData = await openaiRes.text();
      throw new Error(`OpenAI Error: ${errData}`);
    }

    const resJson = await openaiRes.json();
    responseText = resJson.choices?.[0]?.message?.content || '';
    if (!responseText) {
      throw new Error(`OpenAI returned an empty response.`);
    }
    inputTokens = resJson.usage?.prompt_tokens || 0;
    outputTokens = resJson.usage?.completion_tokens || 0;

  } else if (provider === 'gemini') {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    const payloadData: any = {
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: responseFormat === 'json' ? 'application/json' : 'text/plain'
      },
      safetySettings: [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_NONE'
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_NONE'
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_NONE'
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_NONE'
        }
      ]
    };

    if (systemPrompt) {
      payloadData.systemInstruction = {
        parts: [{ text: systemPrompt }]
      };
    }

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payloadData)
    });

    if (!geminiRes.ok) {
      const errData = await geminiRes.text();
      throw new Error(`Gemini Error: ${errData}`);
    }

    const resJson = await geminiRes.json();
    responseText = resJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    if (!responseText) {
      const candidate = resJson.candidates?.[0];
      if (candidate) {
        const finishReason = candidate.finishReason;
        if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
          const ratings = candidate.safetyRatings
            ? candidate.safetyRatings.map((r: any) => `${r.category}:${r.probability}`).join(', ')
            : 'none';
          throw new Error(`Gemini blocked or failed to generate text. Reason: ${finishReason}. Safety Ratings: ${ratings}`);
        }
      }
      if (resJson.promptFeedback?.blockReason) {
        throw new Error(`Gemini prompt was blocked. Reason: ${resJson.promptFeedback.blockReason}`);
      }
      throw new Error(`Gemini returned an empty response.`);
    }

    inputTokens = resJson.usageMetadata?.promptTokenCount || 0;
    outputTokens = resJson.usageMetadata?.candidatesTokenCount || 0;

  } else if (provider === 'claude') {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2
      })
    });

    if (!claudeRes.ok) {
      const errData = await claudeRes.text();
      throw new Error(`Claude Error: ${errData}`);
    }

    const resJson = await claudeRes.json();
    responseText = resJson.content?.[0]?.text || '';
    if (!responseText) {
      throw new Error(`Claude returned an empty response.`);
    }
    inputTokens = resJson.usage?.input_tokens || 0;
    outputTokens = resJson.usage?.output_tokens || 0;
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  if (inputTokens === 0) {
    inputTokens = Math.ceil((prompt.length + (systemPrompt?.length || 0)) / 4);
  }
  if (outputTokens === 0) {
    outputTokens = Math.ceil(responseText.length / 4);
  }

  const cost = calculateCost(provider, modelName, inputTokens, outputTokens);

  return {
    text: responseText,
    usage: {
      inputTokens,
      outputTokens,
      cost
    }
  };
}

async function runTextItem(item: TextQueueItem) {
  const { id, projectId, type, label, payload, resolve, reject } = item;
  
  activeTextItems.push({
    id,
    projectId,
    type,
    label,
    startTime: new Date().toLocaleTimeString()
  });

  const typeLabel = type === 'mapping' ? 'Phân tích kịch bản (Scene Mapping)'
                  : type === 'prompts' ? 'Tạo Image Prompts'
                  : 'Yêu cầu AI';

  addTextLog('info', projectId, `Bắt đầu: ${typeLabel}${label ? ` - ${label}` : ''}`);

  try {
    const data = await generateTextContent(payload);

    // Remove from activeTextItems
    const idx = activeTextItems.findIndex(x => x.id === id);
    if (idx !== -1) activeTextItems.splice(idx, 1);

    addTextLog('success', projectId, `Thành công: ${typeLabel}${label ? ` - ${label}` : ''}`);
    resolve(data);
  } catch (err: any) {
    // Remove from activeTextItems
    const idx = activeTextItems.findIndex(x => x.id === id);
    if (idx !== -1) activeTextItems.splice(idx, 1);

    addTextLog('error', projectId, `Thất bại: ${typeLabel}${label ? ` - ${label}` : ''} - Lỗi: ${err.message}`);
    reject(err);
  }
}

async function processTextQueue() {
  if (activeTextCount >= textConcurrency || textQueue.length === 0) return;

  const activeProjectId = activeTextItems.length > 0 ? activeTextItems[0].projectId : null;

  while (activeTextCount < textConcurrency && textQueue.length > 0) {
    let targetIndex = -1;

    if (activeProjectId === null) {
      targetIndex = 0;
    } else {
      targetIndex = textQueue.findIndex(item => item.projectId === activeProjectId);
    }

    if (targetIndex === -1) {
      targetIndex = 0;
    }

    const nextItem = textQueue.splice(targetIndex, 1)[0];
    if (!nextItem) break;

    activeTextCount++;
    runTextItem(nextItem).finally(() => {
      activeTextCount--;
      processTextQueue().catch((err) => console.error('Error running text queue:', err));
    });
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  let filteredQueue = textQueue;
  let filteredActive = activeTextItems;
  let filteredLogs = textLogs;

  if (projectId) {
    filteredQueue = textQueue.filter(item => item.projectId === projectId);
    filteredActive = activeTextItems.filter(item => item.projectId === projectId);
    filteredLogs = textLogs.filter(log => log.projectId === projectId);
  }

  return NextResponse.json({
    queue: filteredQueue.map(item => ({
      id: item.id,
      projectId: item.projectId,
      type: item.type,
      label: item.label
    })),
    active: filteredActive,
    logs: filteredLogs
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId = '', type = 'general', label = '', ...generatorPayload } = body;

    const itemId = `text_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    addTextLog('info', String(projectId), `Đã thêm vào hàng chờ: ${type === 'mapping' ? 'Phân tích kịch bản' : 'Tạo Prompts'}${label ? ` (${label})` : ''}`);

    const data = await new Promise((resolve, reject) => {
      textQueue.push({
        id: itemId,
        projectId: String(projectId),
        type: String(type),
        label: String(label),
        payload: generatorPayload,
        resolve,
        reject
      });

      processTextQueue().catch((err) => console.error('Error running text queue:', err));
    });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
