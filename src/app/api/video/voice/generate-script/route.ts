import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';

interface QueueItem {
  text: string;
  speakerId: number;
  engineUrl: string;
  savePath: string;
  speedScale: number;
  pitchScale: number;
  intonationScale: number;
  volumeScale: number;
  resolve: (duration: number) => void;
  reject: (err: any) => void;
}

const voiceQueue: QueueItem[] = [];
let isProcessing = false;

// Format seconds into SRT timestamp format: HH:MM:SS,mmm
function formatSrtTimestamp(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  const hrsStr = hrs.toString().padStart(2, '0');
  const minsStr = mins.toString().padStart(2, '0');
  const secsStr = secs.toString().padStart(2, '0');
  const msStr = ms.toString().padStart(3, '0');

  return `${hrsStr}:${minsStr}:${secsStr},${msStr}`;
}

// Clean dialogue lines by stripping speaker names and action hints in brackets
function cleanSpokenText(line: string): string {
  let cleaned = line.trim();

  // 1. Remove curly/square/round brackets and their content
  cleaned = cleaned.replace(/\([^)]*\)/g, ''); // (normal brackets)
  cleaned = cleaned.replace(/\[[^\]]*\]/g, ''); // [square brackets]
  cleaned = cleaned.replace(/\{[^}]*\}/g, ''); // {curly brackets}
  cleaned = cleaned.replace(/（[^）]*）/g, ''); // （fullwidth parentheses）
  cleaned = cleaned.replace(/［[^］]*］/g, ''); // ［fullwidth brackets］
  cleaned = cleaned.replace(/｛[^｝]*｝/g, ''); // ｛fullwidth curly braces｝

  // 2. Match Japanese dialogue: Speaker：「Dialogue」
  const jpQuoteMatch = cleaned.match(/^(?:[^「」\s]+)\s*[:：]\s*「([^」]+)」/);
  if (jpQuoteMatch) {
    return jpQuoteMatch[1].trim();
  }

  // 3. Match Standard quotes: Speaker: "Dialogue"
  const stdQuoteMatch = cleaned.match(/^(?:[^"\s]+)\s*[:：]\s*"([^"]+)"/);
  if (stdQuoteMatch) {
    return stdQuoteMatch[1].trim();
  }

  // 4. Match plain speaker format: Speaker: Dialogue
  const plainSpeakerMatch = cleaned.match(/^([A-Za-z0-9\s_ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂÂĐỔỞỚỜỞỨỪỬỮỢỰỶỸửữựửỳỵỷỹđ]{1,25})\s*[:：]\s*(.+)$/i);
  if (plainSpeakerMatch) {
    return plainSpeakerMatch[2].trim();
  }

  // Japanese dialogue without speaker prefix: 「Dialogue」
  const directJpQuoteMatch = cleaned.match(/^「([^」]+)」$/);
  if (directJpQuoteMatch) {
    return directJpQuoteMatch[1].trim();
  }

  // 5. Default fallback: remove leading speaker-like patterns
  cleaned = cleaned.replace(/^[^:：]+[:：]\s*/, '');

  return cleaned.trim();
}

// Extract speaker name from a script line, e.g. "俺：「何してるんだ？」" -> "俺", "Kaito: (ngạc nhiên)" -> "Kaito"
function extractSpeakerName(line: string): string | null {
  const cleaned = line.trim();

  // Match pattern: Speaker:「Dialogue」, Speaker: (Action) Dialogue, Speaker:（Action） Dialogue
  // Speaker can be any characters except colons, parentheses, Japanese quotation brackets
  const match = cleaned.match(/^([^:：()（）「」\n\r]+)\s*[:：]/);
  if (match) {
    const candidate = match[1].trim();
    if (candidate && candidate.length > 0 && candidate.length <= 25) {
      return candidate;
    }
  }
  return null;
}

// Measure duration of WAV file using ffmpeg
function getAudioDuration(filePath: string): number {
  try {
    const cmd = `ffmpeg -i "${filePath}"`;
    execSync(cmd, { stdio: 'pipe' });
  } catch (e: any) {
    const stderr = e.stderr?.toString() || '';
    const match = stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}\.\d+)/) || stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})/);
    if (match) {
      const hours = parseInt(match[1], 10);
      const mins = parseInt(match[2], 10);
      const secs = parseFloat(match[3]);
      return hours * 3600 + mins * 60 + secs;
    }
  }
  return 3.0; // fallback
}

// Perform sequential execution
async function executeTts(item: QueueItem): Promise<number> {
  const { text, speakerId, engineUrl, savePath, speedScale, pitchScale, intonationScale, volumeScale } = item;

  // 1. Get audio query parameters
  const queryUrl = `${engineUrl}/audio_query?text=${encodeURIComponent(text)}&speaker=${speakerId}`;
  const queryRes = await fetch(queryUrl, { method: 'POST' });
  if (!queryRes.ok) {
    const errText = await queryRes.text();
    throw new Error(`Failed to create audio query: ${errText || queryRes.statusText}`);
  }
  
  const queryJson = await queryRes.json();

  // Apply scales
  queryJson.speedScale = speedScale;
  queryJson.pitchScale = pitchScale;
  queryJson.intonationScale = intonationScale;
  queryJson.volumeScale = volumeScale;

  // 2. Synthesize audio
  const synthesisUrl = `${engineUrl}/synthesis?speaker=${speakerId}`;
  const synthesisRes = await fetch(synthesisUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'audio/wav',
    },
    body: JSON.stringify(queryJson),
  });

  if (!synthesisRes.ok) {
    const errText = await synthesisRes.text();
    throw new Error(`Failed to synthesize audio: ${errText || synthesisRes.statusText}`);
  }

  const arrayBuffer = await synthesisRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Ensure output folder exists
  fs.mkdirSync(path.dirname(savePath), { recursive: true });
  fs.writeFileSync(savePath, buffer);

  // Measure audio duration
  const duration = getAudioDuration(savePath);
  return duration;
}

// Perform sequential execution with retries and GPU cooldown
async function executeTtsWithRetry(item: QueueItem, retries = 3, delayMs = 2000): Promise<number> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const duration = await executeTts(item);
      return duration;
    } catch (err: any) {
      console.warn(`[Voice API] Attempt ${attempt}/${retries} failed for text "${item.text.substring(0, 30)}...":`, err.message);
      if (attempt === retries) {
        throw err;
      }
      // Wait for GPU/CPU recovery and cooling
      console.log(`[Voice API] Waiting ${delayMs}ms before retrying...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('Failed to synthesize audio after retries');
}

// Queue execution manager
async function processQueue() {
  if (isProcessing || voiceQueue.length === 0) return;
  isProcessing = true;

  while (voiceQueue.length > 0) {
    const item = voiceQueue.shift();
    if (!item) break;

    try {
      const duration = await executeTtsWithRetry(item);
      item.resolve(duration);
    } catch (err) {
      item.reject(err);
    }
  }

  isProcessing = false;
}

// Add TTS job to the sequential queue
function queueTtsJob(item: Omit<QueueItem, 'resolve' | 'reject'>): Promise<number> {
  return new Promise((resolve, reject) => {
    voiceQueue.push({ ...item, resolve, reject });
    processQueue();
  });
}

function parseSpeakerValue(val: any, defaultEngineUrl: string) {
  if (typeof val === 'string' && val.includes('|')) {
    const parts = val.split('|');
    return {
      id: Number(parts[1]),
      url: parts[0]
    };
  }
  const num = Number(val);
  return {
    id: isNaN(num) ? 0 : num,
    url: defaultEngineUrl
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      scriptText,
      engineUrl = 'http://127.0.0.1:50021',
      voiceDir,
      speakerId,
      speedScale = 1.0,
      pitchScale = 0.0,
      intonationScale = 1.0,
      volumeScale = 1.0,
      gapSeconds = 0.2,
      scriptMode = 'single',
      charVoiceMap = {},
      resume = false
    } = body;

    if (!scriptText || !scriptText.trim()) {
      return NextResponse.json({ success: false, error: 'Kịch bản trống!' }, { status: 400 });
    }
    if (!voiceDir) {
      return NextResponse.json({ success: false, error: 'Thư mục voice không được để trống!' }, { status: 400 });
    }
    if (speakerId === undefined || speakerId === null) {
      return NextResponse.json({ success: false, error: 'Vui lòng chọn nhân vật đọc!' }, { status: 400 });
    }

    const normalizedEngineUrl = engineUrl.replace(/\/+$/, '');

    // Split text into lines and filter out empty ones
    const lines = scriptText.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
    if (lines.length === 0) {
      return NextResponse.json({ success: false, error: 'Kịch bản không chứa nội dung hợp lệ!' }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Clean existing files in the voice directory if not resuming
          if (!resume) {
            if (fs.existsSync(voiceDir)) {
              const files = fs.readdirSync(voiceDir);
              for (const file of files) {
                const filePath = path.join(voiceDir, file);
                if (fs.statSync(filePath).isFile()) {
                  fs.unlinkSync(filePath);
                }
              }
            } else {
              fs.mkdirSync(voiceDir, { recursive: true });
            }
          } else {
            // If resuming, ensure directory exists
            if (!fs.existsSync(voiceDir)) {
              fs.mkdirSync(voiceDir, { recursive: true });
            }
          }

          const generatedFiles: string[] = [];
          const srtBlocks: string[] = [];
          let currentTime = 0.0;

          // Process each line through the sequential queue
          for (let i = 0; i < lines.length; i++) {
            const percent = Math.round((i / lines.length) * 100);
            controller.enqueue(
              encoder.encode(JSON.stringify({ type: 'progress', current: i + 1, total: lines.length, percent }) + '\n')
            );

            const originalLine = lines[i];
            const cleanedLine = cleanSpokenText(originalLine);
            
            // If the line has no voice content (e.g. comment/bracket-only action), skip or use a fallback silent line
            const ttsText = cleanedLine || '...'; 

            const fileIndex = (i + 1).toString().padStart(3, '0');
            const filename = `${fileIndex}.wav`;
            const savePath = path.join(voiceDir, filename);

            // Determine active speaker ID and engine URL for this line
            let activeSpeakerId = 0;
            let activeEngineUrl = normalizedEngineUrl;

            const mainVoiceParsed = parseSpeakerValue(speakerId, normalizedEngineUrl);
            activeSpeakerId = mainVoiceParsed.id;
            activeEngineUrl = mainVoiceParsed.url.replace(/\/+$/, '');

            if (scriptMode === 'multi' && charVoiceMap) {
              const charName = extractSpeakerName(originalLine) || 'Narrator';
              if (charVoiceMap[charName] !== undefined) {
                const parsed = parseSpeakerValue(charVoiceMap[charName], normalizedEngineUrl);
                activeSpeakerId = parsed.id;
                activeEngineUrl = parsed.url.replace(/\/+$/, '');
              }
            }

            let duration = 0;
            let skipped = false;

            // Check if we can reuse the existing file when resuming
            if (resume && fs.existsSync(savePath)) {
              try {
                const stats = fs.statSync(savePath);
                if (stats.isFile() && stats.size > 100) {
                  duration = getAudioDuration(savePath);
                  if (duration > 0) {
                    skipped = true;
                    console.log(`[Voice API] Skipped generating ${filename} (already exists with duration ${duration}s)`);
                  }
                }
              } catch (skipErr) {
                console.error(`[Voice API] Error checking existing file ${filename}, will regenerate:`, skipErr);
              }
            }

            if (!skipped) {
              // Queue the job and await its sequential completion
              duration = await queueTtsJob({
                text: ttsText,
                speakerId: activeSpeakerId,
                engineUrl: activeEngineUrl,
                savePath,
                speedScale: Number(speedScale),
                pitchScale: Number(pitchScale),
                intonationScale: Number(intonationScale),
                volumeScale: Number(volumeScale)
              });
            }

            // Calculate SRT timings
            const startTime = currentTime;
            const endTime = currentTime + duration;
            currentTime = endTime + gapSeconds;

            // Build SRT block
            srtBlocks.push(`${i + 1}`);
            srtBlocks.push(`${formatSrtTimestamp(startTime)} --> ${formatSrtTimestamp(endTime)}`);
            srtBlocks.push(originalLine); // keep the original text with speaker info for matching
            srtBlocks.push(''); // spacing line

            generatedFiles.push(filename);
          }

          const srtContent = srtBlocks.join('\n');
          
          // Export the srt file to the project folder on disk immediately
          try {
            const projectDir = path.dirname(voiceDir);
            const srtFilePath = path.join(projectDir, 'sub.srt');
            fs.writeFileSync(srtFilePath, srtContent, 'utf-8');
            console.log(`[Voice API] Saved sub.srt to: ${srtFilePath}`);
          } catch (srtWriteErr) {
            console.error('[Voice API] Failed to save sub.srt to disk:', srtWriteErr);
          }

          controller.enqueue(
            encoder.encode(JSON.stringify({
              type: 'done',
              success: true,
              srtContent,
              fileCount: generatedFiles.length,
              files: generatedFiles
            }) + '\n')
          );
          controller.close();
        } catch (err: any) {
          controller.enqueue(
            encoder.encode(JSON.stringify({
              type: 'error',
              error: `Lỗi trong quá trình sinh giọng nói: ${err.message}`
            }) + '\n')
          );
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: `Lỗi khởi chạy tiến trình sinh giọng: ${err.message}`
    }, { status: 500 });
  }
}
