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
      inputRate = 0.30;
      outputRate = 2.50;
    } else if (modelLower.includes('pro')) {
      inputRate = 1.25;
      outputRate = 5.00;
    } else {
      inputRate = 0.30;
      outputRate = 2.50;
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

function sanitizeContentForGemini(text: string): string {
  if (!text) return text;
  
  const vnChar = 'a-zA-Z0-9_ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂÂĐỔỞỚỜỞỨỪỬỮỢỰỶỸửữựửỳỵỷỹđ';
  const makeRegex = (pattern: string, flags = 'gi') => {
    return new RegExp(`(?<![${vnChar}])${pattern}(?![${vnChar}])`, flags);
  };

  const replacements: [RegExp, string][] = [
    // Vietnamese phrases
    [makeRegex('giơ ngón (tay )?giữa'), 'tỏ thái độ thách thức'],
    [makeRegex('tay sai'), 'đàn em'],
    [makeRegex('chửi bới'), 'mắng mỏ'],
    [makeRegex('chửi rủa'), 'mắng mỏ'],
    [makeRegex('bóp cổ'), 'ghì chặt cổ'],
    [makeRegex('đánh đập'), 'tác động mạnh'],
    [makeRegex('sát hại'), 'hạ gục'],
    [makeRegex('máu me'), 'vết đỏ'],
    [/(?<=\s|^)máu(?=\s|$|[.,!?;:])/gi, 'vết đỏ'], // match "máu" as a standalone word
    [makeRegex('kinh hoàng'), 'hoảng sợ'],
    [makeRegex('kinh sợ'), 'hoảng sợ'],
    [makeRegex('hét (lên )?thất thanh'), 'hét lớn'],
    [makeRegex('đe dọa'), 'gây áp lực'],
    
    // Additional sensitive words commonly blocked by Gemini
    [makeRegex('giết'), 'hạ gục'],
    [makeRegex('giết người'), 'hại người'],
    [makeRegex('chết'), 'ra đi'],
    [makeRegex('đấm'), 'tác động'],
    [makeRegex('đá'), 'tác động'],
    [makeRegex('bạo lực'), 'căng thẳng'],
    [makeRegex('tự sát'), 'tự hại'],
    [makeRegex('tự tử'), 'tự hại'],
    [makeRegex('súng'), 'vũ khí'],
    [makeRegex('khẩu súng'), 'vũ khí'],
    [makeRegex('bắn súng'), 'tấn công'],
    [makeRegex('tra tấn'), 'hành hạ'],
    [makeRegex('tấn công'), 'áp sát'],
    [makeRegex('tát'), 'tác động vào mặt'],
    [makeRegex('đâm'), 'tấn công'],
    [makeRegex('chém'), 'tấn công'],
    [makeRegex('hiếp dâm'), 'hại'],
    [makeRegex('cưỡng bức'), 'ép buộc'],

    // Japanese insults and sensitive words
    [makeRegex('化石ジジイ', 'g'), '古い職人'],
    [makeRegex('小汚いジジイ', 'g'), '高齢の職人'],
    [makeRegex('貧乏サラリーマン', 'g'), '一般サラリーマン'],
    [makeRegex('クッサ', 'g'), 'においが強い'],
    [makeRegex('ゴミ溜め', 'g'), '古い場所'],
    [makeRegex('ジジイ', 'g'), '高齢者'],
    [makeRegex('じじい', 'g'), '高齢者'],
    [makeRegex('クビ', 'g'), '退職'],
    [makeRegex('ネグリジェ姿', 'g'), '部屋着姿'],
    [makeRegex('最近してないよね', 'g'), '最近あまり話してないよね'],
    [makeRegex('太もも', 'g'), '肩'],
    
    // Vietnamese insults and sensitive words
    [makeRegex('lão già hóa thạch'), 'người cũ'],
    [makeRegex('lão già bẩn thỉu'), 'người lớn tuổi'],
    [makeRegex('nghèo hèn'), 'bình dân'],
    [makeRegex('bần cùng'), 'bình dân'],
    [makeRegex('bốc mùi hôi thối'), 'mùi nồng'],
    [makeRegex('hôi thối'), 'mùi nồng'],
    [makeRegex('bãi rác'), 'nơi bừa bộn'],
    [makeRegex('đống rác'), 'nơi bừa bộn'],
    [makeRegex('cút đi'), 'rời đi'],
    [makeRegex('biến đi'), 'rời đi'],
    [makeRegex('váy ngủ mỏng'), 'đồ bộ mặc nhà'],
    [makeRegex('gần đây không làm chuyện đó'), 'gần đây ít nói chuyện'],
    [makeRegex('đùi'), 'vai'],
    
    // English phrases
    [makeRegex('middle finger'), 'defiant gesture'],
    [makeRegex('henchmen'), 'associates'],
    [makeRegex('henchman'), 'associate'],
    [makeRegex('motherfucker'), 'fool'],
    [makeRegex('bastard'), 'fool'],
    [makeRegex('kill'), 'defeat'],
    [makeRegex('murder'), 'defeat'],
    [makeRegex('blood'), 'stain'],
    [makeRegex('bloody'), 'stained'],
    [makeRegex('threaten'), 'pressure'],
    [makeRegex('screams in horror'), 'screams loudly'],
    [makeRegex('screaming in horror'), 'screaming loudly']
  ];

  let sanitized = text;
  for (const [regex, replacement] of replacements) {
    sanitized = sanitized.replace(regex, replacement);
  }
  return sanitized;
}

async function generateTextContent(payload: any) {
  const { provider, apiKey, modelName, prompt, systemPrompt, responseFormat, responseSchema } = payload;

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
    // Tách các API Key từ chuỗi (hỗ trợ xuống dòng, dấu phẩy, dấu chấm phẩy)
    const keys = apiKey.split(/[\n,;]+/).map((k: string) => k.trim()).filter(Boolean);
    if (keys.length === 0) {
      throw new Error('API Key is required');
    }

    // Sanitize prompt and system prompt for Gemini
    const sanitizedPrompt = sanitizeContentForGemini(prompt);
    const sanitizedSystemPrompt = systemPrompt ? sanitizeContentForGemini(systemPrompt) : undefined;

    const payloadData: any = {
      contents: [
        {
          parts: [{ text: sanitizedPrompt }]
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

    if (sanitizedSystemPrompt) {
      payloadData.systemInstruction = {
        parts: [{ text: sanitizedSystemPrompt }]
      };
    }

    if (responseFormat === 'json' && responseSchema) {
      payloadData.generationConfig.responseSchema = responseSchema;
    }

    let success = false;
    let lastError: any = null;

    for (let idx = 0; idx < keys.length; idx++) {
      const currentKey = keys[idx];
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${currentKey}`;
      
      try {
        console.log(`[Gemini Request] Sử dụng API Key ${idx + 1}/${keys.length}`);
        const geminiRes = await fetch(geminiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payloadData)
        });

        if (!geminiRes.ok) {
          const errData = await geminiRes.text();
          throw new Error(`Gemini Error (HTTP ${geminiRes.status}): ${errData}`);
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
              console.error('[Gemini Blocked] Finish reason:', finishReason, 'Safety Ratings:', ratings);
              console.error('[Gemini Blocked] Prompt content was:', prompt);
              console.error('[Gemini Blocked] System prompt was:', systemPrompt);
              
              let friendlyTip = '';
              if (finishReason === 'SAFETY') {
                friendlyTip = ' (Lưu ý: Kịch bản hoặc nội dung tạo ra bị bộ lọc an toàn của Google chặn. Hãy thử sửa đổi kịch bản để tránh các từ ngữ nhạy cảm/bạo lực hoặc chuyển sang dùng OpenAI/Claude).';
              }
              const safetyError = new Error(`Gemini blocked or failed to generate text. Reason: ${finishReason}. Safety Ratings: ${ratings}.${friendlyTip}`);
              (safetyError as any).isSafetyBlock = true;
              throw safetyError;
            }
          }
          if (resJson.promptFeedback?.blockReason) {
            console.error('[Gemini Blocked] Prompt was blocked. Reason:', resJson.promptFeedback.blockReason);
            console.error('[Gemini Blocked] Prompt content was:', prompt);
            console.error('[Gemini Blocked] System prompt was:', systemPrompt);
            
            let friendlyTip = '';
            if (resJson.promptFeedback.blockReason === 'PROHIBITED_CONTENT') {
              friendlyTip = ' (Lưu ý: Kịch bản hoặc phụ đề có chứa từ ngữ/hành động bị bộ lọc của Google chặn như cử chỉ nhạy cảm, bạo lực hoặc xúc phạm [Ví dụ: "giơ ngón giữa", "tay sai", "chửi bới"]. Hãy thử diễn đạt lại nhẹ nhàng hơn hoặc chuyển sang dùng OpenAI/Claude).';
            }
            const safetyError = new Error(`Gemini prompt was blocked. Reason: ${resJson.promptFeedback.blockReason}.${friendlyTip}`);
            (safetyError as any).isSafetyBlock = true;
            throw safetyError;
          }
          throw new Error(`Gemini returned an empty response.`);
        }

        inputTokens = resJson.usageMetadata?.promptTokenCount || 0;
        outputTokens = resJson.usageMetadata?.candidatesTokenCount || 0;
        success = true;
        break; // Thoát vòng lặp khi thành công
      } catch (err: any) {
        lastError = err;
        console.error(`[Gemini Fallback] API Key ${idx + 1}/${keys.length} thất bại: ${err.message}`);
        
        // Nếu lỗi do bị chặn an toàn (prompt block / safety block), dừng lại luôn để tránh phí công thử các key khác
        if (err.isSafetyBlock || err.message?.includes('blocked') || err.message?.includes('PROHIBITED_CONTENT') || err.message?.includes('Safety Ratings')) {
          throw err;
        }
        
        // Nếu còn key khác, tiếp tục vòng lặp để thử key kế tiếp
        if (idx < keys.length - 1) {
          console.warn(`[Gemini Fallback] Tự động thử API Key tiếp theo...`);
          continue;
        }
      }
    }

    if (!success) {
      throw new Error(`Tất cả ${keys.length} API Key Gemini đều thất bại. Lỗi cuối: ${lastError?.message}`);
    }

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
