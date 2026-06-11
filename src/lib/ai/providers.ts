import { AIProvider, AIConfig, AIResponse } from './types';
import { SceneMappingRow, ImagePromptRow } from '../db';

// Helper to repair truncated or malformed JSON
export function repairJson(jsonStr: string): string {
  let s = jsonStr.trim();
  
  const stack: ('{' | '[')[] = [];
  let inString = false;
  let isEscaped = false;
  let i = 0;
  
  while (i < s.length) {
    const char = s[i];
    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }
    } else {
      if (char === '"') {
        inString = true;
      } else if (char === '{') {
        stack.push('{');
      } else if (char === '}') {
        if (stack[stack.length - 1] === '{') {
          stack.pop();
        }
      } else if (char === '[') {
        stack.push('[');
      } else if (char === ']') {
        if (stack[stack.length - 1] === '[') {
          stack.pop();
        }
      }
    }
    i++;
  }
  
  let repaired = s;
  
  if (inString) {
    if (isEscaped) {
      repaired = repaired.slice(0, -1);
    }
    const match = repaired.match(/\\u[0-9a-fA-F]{0,3}$/);
    if (match) {
      repaired = repaired.slice(0, -match[0].length);
    }
    repaired += '"';
    inString = false;
  }
  
  let temp = repaired;
  
  while (true) {
    const trimmed = temp.trim();
    if (trimmed.endsWith(':')) {
      temp = trimmed.slice(0, -1);
      continue;
    }
    if (trimmed.endsWith(',')) {
      temp = trimmed.slice(0, -1);
      continue;
    }
    
    // Check for partial booleans/nulls/numbers
    if (trimmed.match(/\b(t|tr|tru)$/i)) {
      temp = trimmed.replace(/\b(t|tr|tru)$/i, 'true');
      continue;
    }
    if (trimmed.match(/\b(f|fa|fal|fals)$/i)) {
      temp = trimmed.replace(/\b(f|fa|fal|fals)$/i, 'false');
      continue;
    }
    if (trimmed.match(/\b(n|nu|nul)$/i)) {
      temp = trimmed.replace(/\b(n|nu|nul)$/i, 'null');
      continue;
    }
    if (trimmed.match(/\d+[\.eE][-+]?$/)) {
      temp = trimmed.replace(/[\.eE][-+]?$/, '');
      continue;
    }
    
    // Check if it ends with a string key
    const stringMatch = trimmed.match(/"[^"\\]*(?:\\.[^"\\]*)*"$/);
    if (stringMatch && stack.length > 0 && stack[stack.length - 1] === '{') {
      const prefix = trimmed.slice(0, trimmed.length - stringMatch[0].length).trim();
      const lastChar = prefix[prefix.length - 1];
      if (lastChar !== ':') {
        // It's a key without a value, strip it
        temp = trimmed.slice(0, -stringMatch[0].length);
        continue;
      }
    }
    
    break;
  }
  
  repaired = temp;
  
  while (stack.length > 0) {
    const openChar = stack.pop();
    if (openChar === '{') {
      repaired += '}';
    } else if (openChar === '[') {
      repaired += ']';
    }
  }
  
  return repaired;
}

// Helper to clean and parse JSON robustly from AI responses
export function cleanAndParseJson<T>(rawText: string): T {
  let cleaned = rawText.trim();
  
  // 1. Try to extract content between ```json and ```
  const markdownRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const match = cleaned.match(markdownRegex);
  if (match && match[1]) {
    cleaned = match[1].trim();
  } else {
    // 2. Try to find the first '{' or '['
    const firstBrace = cleaned.indexOf('{');
    const firstBracket = cleaned.indexOf('[');
    let startIdx = -1;
    
    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      startIdx = firstBrace;
    } else if (firstBracket !== -1) {
      startIdx = firstBracket;
    }
    
    if (startIdx !== -1) {
      cleaned = cleaned.slice(startIdx);
    }
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch (e) {
    try {
      const repaired = repairJson(cleaned);
      return JSON.parse(repaired) as T;
    } catch (e2) {
      try {
        // Fallback: repair missing closing braces in the middle of JSON arrays of objects
        const missingBraceRegex = /([^}\s])(\s*,\s*\{\s*"[a-zA-Z0-9_]+"\s*:)/g;
        const withBraces = cleaned.replace(missingBraceRegex, '$1}$2');
        const repairedWithBraces = repairJson(withBraces);
        return JSON.parse(repairedWithBraces) as T;
      } catch (e3) {
        console.error('JSON parse error. Raw text was:', rawText);
        throw new Error(`Failed to parse AI output as JSON: ${(e2 as Error).message}`);
      }
    }
  }
}


// Extract an array from parsed JSON, handling cases where the AI wrapped it in an object
export function extractArray<T>(parsed: any): T[] {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (parsed && typeof parsed === 'object') {
    // Check if any property is an array
    for (const key of Object.keys(parsed)) {
      if (Array.isArray(parsed[key])) {
        return parsed[key];
      }
    }
  }
  throw new Error('AI response is not an array and does not contain an array field.');
}

async function callProxy(
  provider: string,
  apiKey: string,
  modelName: string,
  prompt: string,
  systemPrompt?: string,
  responseFormat?: string,
  projectId?: string,
  type?: string,
  label?: string
): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number; cost: number } }> {
  const maxRetries = 3;
  let delay = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider,
          apiKey,
          modelName,
          prompt,
          systemPrompt,
          responseFormat,
          projectId,
          type,
          label
        })
      });

      if (!res.ok) {
        // If Rate Limited (429) or Server Error (5xx), trigger retry logic
        if (res.status === 429 || res.status >= 500) {
          if (attempt < maxRetries) {
            console.warn(`[Proxy Warning] Attempt ${attempt} failed with status ${res.status}. Retrying in ${delay}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay *= 2;
            continue;
          }
        }
        
        const errorText = await res.text();
        let parsedErr = errorText;
        try {
          const jsonErr = JSON.parse(errorText);
          parsedErr = jsonErr.error || jsonErr.message || errorText;
        } catch (_) {}
        throw new Error(`[Proxy Error] ${parsedErr}`);
      }

      return await res.json();
    } catch (err) {
      if (attempt === maxRetries) {
        throw err;
      }
      console.warn(`[Proxy Warning] Connection attempt ${attempt} failed: ${(err as Error).message}. Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  throw new Error('[Proxy Error] Maximum retries exceeded.');
}

// System instructions for incremental scene mapping
const SCENE_MAPPING_INCREMENTAL_SYSTEM = `You are a professional storyboard mapping director. Analyze the SRT subtitle chunk and map it to a logical scene flow.
To maintain visual consistency and story continuity, you must respect the existing project context provided:
1. Known Characters: Look at this list. If a character in this chunk matches an existing one, use their exact 'characterId'. Only if you find a completely new character, describe them in 'newCharacters'.
2. Known Locations: Look at this list. If a scene takes place in an existing location, use their exact 'exteriorId'. Only if it's a new location, describe them in 'newExteriors'.
3. Known Props: Look at this list. If a scene contains a prop/item, use their exact 'propId'. Only if you find a completely new prop, describe them in 'newProps'.
4. Previous Plot: Use the recent plot summary to maintain story continuity.
5. Subtitle Range Continuity: Subtitle ranges must be strictly consecutive and non-overlapping. For example, if a scene ends at subtitle index 15, the next scene MUST start at subtitle index 16. Do NOT overlap subtitle indices between scenes (e.g., scene A: 1-15, scene B: 15-20 is INVALID. It must be scene A: 1-15, scene B: 16-20).

[CHARACTER VARIATION RULES]:
For MAIN characters only, you must detect if the context requires a visual variation (change in outfit/clothing based on location/event, or change in age/time like flashback/younger version):
1. Detect changes in location or activities where their clothing should change (e.g., at home, office/work, sport, party/formal events).
2. Detect changes in time (e.g., past memories, flashbacks) where their age/generation should change.
3. Naming convention for variants: [base_character_id]_[variant] (all lowercase, e.g., 'kudo_home', 'kudo_office', 'kudo_sport', 'kudo_young').
4. Registration: If the variant is not in 'knownCharacters', you must list it in 'newCharacters' as a new entry. In its prompt description, specify the unique outfit or age for this variant (e.g., "Kudo at home wearing casual, comfortable home clothing", "Kudo as a younger version wearing a student uniform").
5. Application: In the 'scenes' list, use the exact variant ID (e.g., 'kudo_home') in the 'characters' field for that scene.
6. Do not create variants for minor characters or background extras; only apply this to main characters.

[GUIDELINE FOR NEW CHARACTERS]:
For each new character, generate a prompt matching EXACTLY this format (replace [Name] and [detailed physical description]):
"Character Sheet of [Name], 3-view reference sheet (front, side, back), full body, white background, modern present-day Japan (year 2026) realism, avoiding retro Shouwa-era appearance, grounded Japanese TV drama realism, modern colored manga anime style, [detailed physical description], modern fashionable Japanese clothing, restrained emotional presence, natural standing posture, neutral facial expression, realistic fabric folds, cinematic realism, production design reference sheet."


[GUIDELINE FOR NEW LOCATIONS]:
For each new location/exterior, generate a prompt matching EXACTLY this format (replace [Location_Name_X] and [detailed environment description]):
"Background layout sheet of [Location_Name_X], 4-camera-angle sheet showing 4 different viewpoints/angles (front, reverse, left side, right side) of the same scene in a 2x2 grid layout, empty scene, no people, modern present-day Japan (year 2026) apartment realism, contemporary metropolitan Japanese design, avoiding retro Shouwa-era aesthetics, modern colored manga anime style, [detailed environment description showing consistent furniture and layout across all 4 angles], realistic practical lighting, subtle emotional atmosphere, believable lived-in details, cinematic depth, production-ready environment design reference sheet."

[GUIDELINE FOR NEW PROPS]:
For each new prop, generate a prompt matching EXACTLY this format (replace [Prop_Name_X] and [detailed prop description]):
"Product layout sheet of [Prop_Name_X], showing the item from multiple clean angles (front, side, isometric), isolated on a pure white background, modern present-day Japan design, avoiding retro appearance, modern colored manga anime style, [detailed prop description showing consistent colors, materials, and form], realistic textures, clean studio lighting, production design reference sheet."

Your response MUST BE A JSON OBJECT (NOT AN ARRAY) containing:
{
  "scenes": [
    {
      "stt": number,
      "subtitleRange": "string (e.g. 1-15)",
      "timeRange": "string (e.g. 00:00:01,000 --> 00:03:15,000)",
      "characters": "string (comma-separated character names, e.g. 'taro, mother')",
      "props": "string (comma-separated prop names, e.g. 'car, notebook')",
      "mainSituation": "string (summary of the event)",
      "mainEmotion": "string (overall vibe/feeling)",
      "sceneDescription": "string (visual setting, action, camera angle, including props used)"
    }
  ],
  "newCharacters": [
    {
      "characterId": "lowercase name (must be consistent, e.g. 'taro')",
      "age": "string",
      "gender": "string",
      "personality": "string",
      "role": "string",
      "prompt": "english character prompt matching the format above"
    }
  ],
  "newExteriors": [
    {
      "exteriorId": "lowercase snake_case name (e.g. 'apartment_kitchen')",
      "prompt": "english environment prompt matching the format above"
    }
  ],
  "newProps": [
    {
      "propId": "lowercase name (must be consistent, e.g. 'smartphone')",
      "prompt": "english prop prompt matching the format above"
    }
  ],
  "plotSummary": "string (updated short summary of the story/plot up to the end of this chunk)"
}

Do not include any pre-text or post-text. Return ONLY the JSON object.`;

// System instructions for contextual image prompt generation
const IMAGE_PROMPTS_CONTEXTUAL_SYSTEM = `You are an expert manga storyboard prompt generator. Convert the scene descriptions into image/animation prompts.
To ensure visual consistency, you MUST reference the provided visual styles and layouts for characters, environments, and props:
- For characters: use the character prompts and IDs to identify who is in the scene.
- For locations: use the environment descriptions to identify where the scene is.
- For props: use the prop prompts and IDs to identify what items are in the scene.

[STRICT RULES FOR DESCRIPTION GENERATION]:
1. You MUST refer to characters by their exact names/IDs (e.g., "Kenji", "Aoi"), locations by their exact exterior name/ID (e.g., "classroom"), and props by their exact prop ID (e.g., "smartphone", "notebook").
2. **CỰC KỲ QUAN TRỌNG (STRICT CONSTRAINT)**: Tuyệt đối KHÔNG mô tả chi tiết vật lý ngoại hình của nhân vật (như màu tóc, kiểu tóc, trang phục, chi tiết mặt...) hay tả chi tiết bối cảnh/đạo cụ trong trường "description". Chỉ mô tả hành động, biểu cảm, tư thế, tương tác với đạo cụ và góc máy (ví dụ: "Kenji is looking sad, holding a smartphone, sitting next to Aoi in the classroom").
3. Tuyệt đối KHÔNG viết hoặc mô tả bất kỳ từ khóa style vẽ nào (như nét vẽ manga, anime, màu sắc, (no text, no subtitle, manga color style),...) vào trường "description".
4. Dòng Scene Mapping nào tương ứng chính xác với một dòng output đó.

Your response MUST be a JSON array of objects with EXACTLY this structure:
{
  "stt": number (matching the scene STT),
  "characters": "string (comma-separated character names, e.g. 'kenji, aoi')",
  "props": "string (comma-separated prop names, e.g. 'smartphone')",
  "description": "string (mô tả hành động, biểu cảm, tương tác với đạo cụ, góc quay, tuyệt đối không tả ngoại hình nhân vật/style)",
  "exterior": "string (matching the correct location/exterior ID)",
  "motion": "string (Format: 'Character Motion: ... | Eye Motion: ... | Environment Motion: ... | Camera Motion: ...')"
}

Do not include any conversational filler. Return ONLY the JSON array.`;

export class OpenAIProvider implements AIProvider {
  async generateSceneMappingIncremental(
    srtChunkContent: string,
    knownCharacters: any[],
    knownExteriors: any[],
    knownProps: any[],
    plotSummary: string,
    promptTemplate: string,
    config: AIConfig
  ): Promise<AIResponse<{
    scenes: SceneMappingRow[];
    newCharacters: any[];
    newExteriors: any[];
    newProps: any[];
    plotSummary: string;
  }>> {
    const prompt = `${promptTemplate}

[DỮ LIỆU CỐT TRUYỆN ĐÃ ĐƯỢC PHÁT HIỆN TRƯỚC ĐÓ]:
- Tóm tắt cốt truyện trước đó: ${plotSummary || 'Chưa có'}
- Nhân vật đã biết: ${JSON.stringify(knownCharacters)}
- Bối cảnh đã biết: ${JSON.stringify(knownExteriors)}
- Đạo cụ đã biết: ${JSON.stringify(knownProps)}

[YÊU CẦU ĐOẠN PHỤ ĐỀ CẦN CHIA CẢNH LẦN NÀY]:
${srtChunkContent}`;

    const response = await callProxy(
      'openai',
      config.apiKey,
      config.modelName,
      prompt,
      SCENE_MAPPING_INCREMENTAL_SYSTEM,
      'json',
      config.projectId,
      config.type,
      config.label
    );

    const parsed = cleanAndParseJson<any>(response.text);
    return {
      data: {
        scenes: Array.isArray(parsed.scenes) ? parsed.scenes : [],
        newCharacters: Array.isArray(parsed.newCharacters) ? parsed.newCharacters : [],
        newExteriors: Array.isArray(parsed.newExteriors) ? parsed.newExteriors : [],
        newProps: Array.isArray(parsed.newProps) ? parsed.newProps : [],
        plotSummary: typeof parsed.plotSummary === 'string' ? parsed.plotSummary : ''
      },
      usage: response.usage
    };
  }

  async generateImagePromptsContextual(
    scenes: SceneMappingRow[],
    characterRefs: any[],
    exteriorRefs: any[],
    propRefs: any[],
    promptTemplate: string,
    config: AIConfig
  ): Promise<AIResponse<ImagePromptRow[]>> {
    const prompt = `${promptTemplate}

[THAM CHIẾU NHÂN VẬT & BỐI CẢNH & ĐẠO CỤ (CHỈ DÙNG ĐỂ NHẬN BIẾT - TUYỆT ĐỐI KHÔNG TẢ CHI TIẾT TRONG DESCRIPTION)]:
- Nhân vật tham chiếu: ${JSON.stringify(characterRefs)}
- Bối cảnh tham chiếu: ${JSON.stringify(exteriorRefs)}
- Đạo cụ tham chiếu: ${JSON.stringify(propRefs)}

[DANH SÁCH CÁC PHÂN CẢNH CẦN TẠO PROMPT VẼ ẢNH]:
${JSON.stringify(scenes, null, 2)}`;

    const response = await callProxy(
      'openai',
      config.apiKey,
      config.modelName,
      prompt,
      IMAGE_PROMPTS_CONTEXTUAL_SYSTEM,
      'json',
      config.projectId,
      config.type,
      config.label
    );

    const parsed = cleanAndParseJson<any>(response.text);
    const data = extractArray<ImagePromptRow>(parsed);

    return {
      data,
      usage: response.usage
    };
  }
}

export class GeminiProvider implements AIProvider {
  async generateSceneMappingIncremental(
    srtChunkContent: string,
    knownCharacters: any[],
    knownExteriors: any[],
    knownProps: any[],
    plotSummary: string,
    promptTemplate: string,
    config: AIConfig
  ): Promise<AIResponse<{
    scenes: SceneMappingRow[];
    newCharacters: any[];
    newExteriors: any[];
    newProps: any[];
    plotSummary: string;
  }>> {
    const prompt = `${promptTemplate}

[DỮ LIỆU CỐT TRUYỆN ĐÃ ĐƯỢC PHÁT HIỆN TRƯỚC ĐÓ]:
- Tóm tắt cốt truyện trước đó: ${plotSummary || 'Chưa có'}
- Nhân vật đã biết: ${JSON.stringify(knownCharacters)}
- Bối cảnh đã biết: ${JSON.stringify(knownExteriors)}
- Đạo cụ đã biết: ${JSON.stringify(knownProps)}

[YÊU CẦU ĐOẠN PHỤ ĐỀ CẦN CHIA CẢNH LẦN NÀY]:
${srtChunkContent}`;

    const response = await callProxy(
      'gemini',
      config.apiKey,
      config.modelName,
      prompt,
      SCENE_MAPPING_INCREMENTAL_SYSTEM,
      'json',
      config.projectId,
      config.type,
      config.label
    );

    const parsed = cleanAndParseJson<any>(response.text);
    return {
      data: {
        scenes: Array.isArray(parsed.scenes) ? parsed.scenes : [],
        newCharacters: Array.isArray(parsed.newCharacters) ? parsed.newCharacters : [],
        newExteriors: Array.isArray(parsed.newExteriors) ? parsed.newExteriors : [],
        newProps: Array.isArray(parsed.newProps) ? parsed.newProps : [],
        plotSummary: typeof parsed.plotSummary === 'string' ? parsed.plotSummary : ''
      },
      usage: response.usage
    };
  }

  async generateImagePromptsContextual(
    scenes: SceneMappingRow[],
    characterRefs: any[],
    exteriorRefs: any[],
    propRefs: any[],
    promptTemplate: string,
    config: AIConfig
  ): Promise<AIResponse<ImagePromptRow[]>> {
    const prompt = `${promptTemplate}

[THAM CHIẾU NHÂN VẬT & BỐI CẢNH & ĐẠO CỤ (CHỈ DÙNG ĐỂ NHẬN BIẾT - TUYỆT ĐỐI KHÔNG TẢ CHI TIẾT TRONG DESCRIPTION)]:
- Nhân vật tham chiếu: ${JSON.stringify(characterRefs)}
- Bối cảnh tham chiếu: ${JSON.stringify(exteriorRefs)}
- Đạo cụ tham chiếu: ${JSON.stringify(propRefs)}

[DANH SÁCH CÁC PHÂN CẢNH CẦN TẠO PROMPT VẼ ẢNH]:
${JSON.stringify(scenes, null, 2)}`;

    const response = await callProxy(
      'gemini',
      config.apiKey,
      config.modelName,
      prompt,
      IMAGE_PROMPTS_CONTEXTUAL_SYSTEM,
      'json',
      config.projectId,
      config.type,
      config.label
    );

    const parsed = cleanAndParseJson<any>(response.text);
    const data = extractArray<ImagePromptRow>(parsed);

    return {
      data,
      usage: response.usage
    };
  }
}

export class ClaudeProvider implements AIProvider {
  async generateSceneMappingIncremental(
    srtChunkContent: string,
    knownCharacters: any[],
    knownExteriors: any[],
    knownProps: any[],
    plotSummary: string,
    promptTemplate: string,
    config: AIConfig
  ): Promise<AIResponse<{
    scenes: SceneMappingRow[];
    newCharacters: any[];
    newExteriors: any[];
    newProps: any[];
    plotSummary: string;
  }>> {
    const prompt = `${promptTemplate}

[DỮ LIỆU CỐT TRUYỆN ĐÃ ĐƯỢC PHÁT HIỆN TRƯỚC ĐÓ]:
- Tóm tắt cốt truyện trước đó: ${plotSummary || 'Chưa có'}
- Nhân vật đã biết: ${JSON.stringify(knownCharacters)}
- Bối cảnh đã biết: ${JSON.stringify(knownExteriors)}
- Đạo cụ đã biết: ${JSON.stringify(knownProps)}

[YÊU CẦU ĐOẠN PHỤ ĐỀ CẦN CHIA CẢNH LẦN NÀY]:
${srtChunkContent}`;

    const response = await callProxy(
      'claude',
      config.apiKey,
      config.modelName,
      prompt,
      SCENE_MAPPING_INCREMENTAL_SYSTEM,
      'text',
      config.projectId,
      config.type,
      config.label
    );

    const parsed = cleanAndParseJson<any>(response.text);
    return {
      data: {
        scenes: Array.isArray(parsed.scenes) ? parsed.scenes : [],
        newCharacters: Array.isArray(parsed.newCharacters) ? parsed.newCharacters : [],
        newExteriors: Array.isArray(parsed.newExteriors) ? parsed.newExteriors : [],
        newProps: Array.isArray(parsed.newProps) ? parsed.newProps : [],
        plotSummary: typeof parsed.plotSummary === 'string' ? parsed.plotSummary : ''
      },
      usage: response.usage
    };
  }

  async generateImagePromptsContextual(
    scenes: SceneMappingRow[],
    characterRefs: any[],
    exteriorRefs: any[],
    propRefs: any[],
    promptTemplate: string,
    config: AIConfig
  ): Promise<AIResponse<ImagePromptRow[]>> {
    const prompt = `${promptTemplate}

[THAM CHIẾU NHÂN VẬT & BỐI CẢNH & ĐẠO CỤ (CHỈ DÙNG ĐỂ NHẬN BIẾT - TUYỆT ĐỐI KHÔNG TẢ CHI TIẾT TRONG DESCRIPTION)]:
- Nhân vật tham chiếu: ${JSON.stringify(characterRefs)}
- Bối cảnh tham chiếu: ${JSON.stringify(exteriorRefs)}
- Đạo cụ tham chiếu: ${JSON.stringify(propRefs)}

[DANH SÁCH CÁC PHÂN CẢNH CẦN TẠO PROMPT VẼ ẢNH]:
${JSON.stringify(scenes, null, 2)}`;

    const response = await callProxy(
      'claude',
      config.apiKey,
      config.modelName,
      prompt,
      IMAGE_PROMPTS_CONTEXTUAL_SYSTEM,
      'text',
      config.projectId,
      config.type,
      config.label
    );

    const parsed = cleanAndParseJson<any>(response.text);
    const data = extractArray<ImagePromptRow>(parsed);

    return {
      data,
      usage: response.usage
    };
  }
}
