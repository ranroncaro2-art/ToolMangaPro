import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { parseSRT } from '../../../../lib/srtParser';

export const dynamic = 'force-dynamic';

// Helper to parse timestamp to seconds
function parseTimestampToSeconds(ts: string): number {
  if (!ts) return 0;
  const cleaned = ts.trim().replace(',', '.');
  const parts = cleaned.split(':');
  if (parts.length === 3) {
    const hrs = parseFloat(parts[0]);
    const mins = parseFloat(parts[1]);
    const secs = parseFloat(parts[2]);
    return hrs * 3600 + mins * 60 + secs;
  } else if (parts.length === 2) {
    const mins = parseFloat(parts[0]);
    const secs = parseFloat(parts[1]);
    return mins * 60 + secs;
  } else {
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }
}

// Subtitle range parser (e.g. "12-18" or "12")
function getSubtitlesForScene(subtitleRange: string, blocks: any[]): any[] {
  if (!subtitleRange) return [];
  const parts = subtitleRange.split('-').map(x => parseInt(x.trim(), 10));
  if (parts.length === 1 && !isNaN(parts[0])) {
    const id = parts[0];
    return blocks.filter(b => b.id === id);
  } else if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    const start = parts[0];
    const end = parts[1];
    return blocks.filter(b => b.id >= start && b.id <= end);
  }
  return [];
}

// Helper to check if a scene has its video or image asset
function checkSceneAsset(resolvedSaveDir: string, stt: number, videoType: string): { hasAsset: boolean; type: 'video' | 'image' | 'none' } {
  const localImagesDir = path.join(resolvedSaveDir, 'images');
  const localVideosDir = path.join(resolvedSaveDir, 'videos');
  
  const stt_padded = String(stt).padStart(2, '0');
  
  const imgExts = ['.png', '.jpg', '.jpeg', '.PNG', '.JPG', '.JPEG', '.webp', '.WEBP'];
  const vidExts = ['.mp4', '.MP4', '.avi', '.AVI', '.mov', '.MOV', '.webm', '.WEBM'];
  
  const imgNames = [
    `shot_${stt_padded}`, 
    `shot_${stt}`,
    `${stt_padded}`,
    `${stt}`
  ];
  
  const vidNames = [
    `segment_${stt_padded}`, 
    `segment_${stt}`,
    `${stt_padded}`,
    `${stt}`
  ];

  let hasVideo = false;
  if (fs.existsSync(localVideosDir) && videoType !== 'images_only') {
    for (const ext of vidExts) {
      for (const name of vidNames) {
        const fpath = path.join(localVideosDir, name + ext);
        if (fs.existsSync(fpath)) {
          hasVideo = true;
          break;
        }
      }
      if (hasVideo) break;
    }
  }

  let hasImage = false;
  if (fs.existsSync(localImagesDir) && videoType !== 'videos_only') {
    for (const ext of imgExts) {
      for (const name of imgNames) {
        const fpath = path.join(localImagesDir, name + ext);
        if (fs.existsSync(fpath)) {
          hasImage = true;
          break;
        }
      }
      if (hasImage) break;
    }
  }

  if (videoType === 'videos_only') {
    return { hasAsset: hasVideo, type: hasVideo ? 'video' : 'none' };
  } else if (videoType === 'images_only') {
    return { hasAsset: hasImage, type: hasImage ? 'image' : 'none' };
  } else {
    const hasAsset = hasVideo || hasImage;
    return { 
      hasAsset, 
      type: hasVideo ? 'video' : (hasImage ? 'image' : 'none') 
    };
  }
}

// Helper to check voice folder count
function checkVoiceFiles(resolvedSaveDir: string): { found: number; files: string[] } {
  const voiceDir = path.join(resolvedSaveDir, 'voice');
  if (!fs.existsSync(voiceDir)) {
    return { found: 0, files: [] };
  }
  try {
    const audioExts = ['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.flac'];
    const files = fs.readdirSync(voiceDir)
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return audioExts.includes(ext);
      });
    return { found: files.length, files };
  } catch (e) {
    return { found: 0, files: [] };
  }
}

// Global tracking structure for background processes
const globalAny: any = global;
if (!globalAny.activeExports) {
  globalAny.activeExports = new Map<string, any>();
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }

    const activeExports = globalAny.activeExports;
    const existing = activeExports.get(projectId);
    if (existing) {
      return NextResponse.json(existing.progress);
    }

    // Fallback to reading the JSON progress file from disk
    const progressPath = path.join(process.cwd(), `src/lib/export_progress_${projectId}.json`);
    if (fs.existsSync(progressPath)) {
      try {
        const data = fs.readFileSync(progressPath, 'utf-8');
        return NextResponse.json(JSON.parse(data));
      } catch (err) {
        console.error('Failed to read progress file from disk:', err);
      }
    }

    return NextResponse.json({ status: 'idle', logs: [] });
  } catch (error: any) {
    console.error('[Export Video API] GET status error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  console.log('[Export Video API] Received POST request');
  try {
    const body = await req.json();
    const {
      projectId,
      projectName,
      sceneMapping = [],
      imagePrompts = [],
      srtContent = '',
      style = {},
      videoSaveDir,
      videoType = 'mixed',
      bgmVolumeDb = -18,
      bgmSuggestions = [],
      burnSubtitles = false,
      validateOnly = false
    } = body;

    console.log('[Export Video API] Request payload parsed successfully:', {
      projectId,
      projectName,
      sceneMappingCount: sceneMapping.length,
      imagePromptsCount: imagePrompts.length,
      videoSaveDir,
      videoType,
      bgmVolumeDb,
      bgmSuggestionsCount: bgmSuggestions.length,
      validateOnly
    });

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }

    if (!videoSaveDir) {
      console.log('[Export Video API] Error: videoSaveDir is missing');
      return NextResponse.json({ error: 'Chưa cấu hình thư mục lưu video trong Cấu hình dự án!' }, { status: 400 });
    }

    if (sceneMapping.length === 0) {
      console.log('[Export Video API] Error: sceneMapping is empty');
      return NextResponse.json({ error: 'Không có phân cảnh nào để xuất!' }, { status: 400 });
    }

    // Check if there is an active export already running
    const activeExports = globalAny.activeExports;
    const existing = activeExports.get(projectId);
    if (existing && existing.isAlive && !validateOnly) {
      console.log(`[Export Video API] Project ${projectId} is already rendering.`);
      return NextResponse.json({ success: true, message: 'Already rendering' });
    }

    // Resolve output path
    const resolvedSaveDir = videoSaveDir.startsWith('~/')
      ? path.join(process.env.HOME || process.env.USERPROFILE || '', videoSaveDir.slice(2))
      : videoSaveDir;

    console.log('[Export Video API] Resolved save directory:', resolvedSaveDir);

    if (!fs.existsSync(resolvedSaveDir)) {
      console.log('[Export Video API] Creating save directory...');
      fs.mkdirSync(resolvedSaveDir, { recursive: true });
    }

    // Resolve voice path automatically
    const resolvedVoiceDir = path.join(resolvedSaveDir, 'voice');
    if (!fs.existsSync(resolvedVoiceDir)) {
      console.log('[Export Video API] Creating voice directory...');
      fs.mkdirSync(resolvedVoiceDir, { recursive: true });
    }

    // Parse SRT
    console.log('[Export Video API] Parsing SRT content...');
    const srtBlocks = parseSRT(srtContent).blocks;
    console.log('[Export Video API] Parsed SRT blocks:', srtBlocks.length);

    // Scan & Validate Assets
    console.log('[Export Video API] Scanning and validating assets...');
    const validationErrors: string[] = [];
    const expectedVoiceCount = srtBlocks.length;
    const voiceCheck = checkVoiceFiles(resolvedSaveDir);
    console.log('[Export Video API] Voice files check:', voiceCheck.found, 'found, expected:', expectedVoiceCount);
    if (voiceCheck.found < expectedVoiceCount) {
      validationErrors.push(`- Thiếu tệp âm thanh thuyết minh (MP3): Có ${voiceCheck.found}/${expectedVoiceCount} file (Thiếu ${expectedVoiceCount - voiceCheck.found} file trong thư mục \\voice).`);
    }

    const missingAssets: string[] = [];
    sceneMapping.forEach((scene: any) => {
      const stt = scene.stt;
      const assetCheck = checkSceneAsset(resolvedSaveDir, stt, videoType);
      if (!assetCheck.hasAsset) {
        missingAssets.push(String(stt));
      }
    });

    console.log('[Export Video API] Missing assets count:', missingAssets.length);

    if (missingAssets.length > 0) {
      if (videoType === 'images_only') {
        validationErrors.push(`- Thiếu ảnh cho ${missingAssets.length} phân cảnh (STT ${missingAssets.join(', ')} trong thư mục \\images).`);
      } else if (videoType === 'videos_only') {
        validationErrors.push(`- Thiếu video cho ${missingAssets.length} phân cảnh (STT ${missingAssets.join(', ')} trong thư mục \\videos).`);
      } else {
        validationErrors.push(`- Thiếu ảnh hoặc video cho ${missingAssets.length} phân cảnh (STT ${missingAssets.join(', ')}).`);
      }
    }

    // Validate BGM files
    const missingBgms: string[] = [];
    if (bgmSuggestions && bgmSuggestions.length > 0) {
      bgmSuggestions.forEach((bgm: any) => {
        if (!bgm.audioFile) {
          missingBgms.push(`  + Đoạn "${bgm.title || 'BGM'}" (Chưa chọn file local)`);
        } else {
          const bgmPath = path.join(resolvedSaveDir, 'bgm', bgm.audioFile);
          if (!fs.existsSync(bgmPath)) {
            missingBgms.push(`  + Đoạn "${bgm.title || 'BGM'}" (Thiếu file: ${bgm.audioFile})`);
          }
        }
      });
    }
    if (missingBgms.length > 0) {
      validationErrors.push(`- Thiếu tệp nhạc nền BGM cho các đoạn nhạc:\n${missingBgms.join('\n')}`);
    }

    if (validationErrors.length > 0) {
      console.log('[Export Video API] Validation errors found:', validationErrors);
      const errorMsg = `THIẾU DỮ LIỆU CẦN THIẾT:\n${validationErrors.join('\n')}\nVui lòng chuẩn bị đầy đủ tệp tin trước khi xuất video!`;
      return NextResponse.json({ success: false, error: errorMsg, errors: validationErrors }, { status: 400 });
    }

    if (validateOnly) {
      return NextResponse.json({ success: true, message: 'Tất cả dữ liệu đã đầy đủ và sẵn sàng!' });
    }

    const cleanProjectName = (projectName || 'storyboard')
      .replace(/[^a-zA-Z0-9\-_]/g, '_')
      .replace(/_+/g, '_');
    const finalVideoFileName = `final_movie_${cleanProjectName}_${Date.now()}.mp4`;
    const finalVideoPath = path.join(resolvedSaveDir, finalVideoFileName);

    console.log('[Export Video API] Output video path:', finalVideoPath);

    // Build payload structure
    const compilerScenes = sceneMapping.map((scene: any) => {
      const [startStr, endStr] = (scene.timeRange || '').split('-->').map((x: string) => x.trim());
      const sceneStart = parseTimestampToSeconds(startStr);
      const sceneEnd = parseTimestampToSeconds(endStr);
      const targetDuration = Math.max(0.5, sceneEnd - sceneStart);

      const promptRow = imagePrompts.find((p: any) => p.stt === scene.stt);
      const sceneSubs = getSubtitlesForScene(scene.subtitleRange, srtBlocks);

      return {
        stt: scene.stt,
        sceneStart,
        targetDuration,
        videoUrl: promptRow?.videoUrl || null,
        imageUrl: promptRow?.imageUrl || null,
        subtitles: sceneSubs.map(s => ({
          id: s.id,
          startTime: s.startTime,
          endTime: s.endTime,
          text: s.text
        }))
      };
    });

    // Resolve BGM segments and check file existence
    const bgmSegments = bgmSuggestions.map((bgm: any) => {
      const parts = (bgm.timeRange || '').split('-').map((p: string) => p.trim());
      let start = 0;
      let end = 0;
      if (parts.length === 2) {
        const parseTimeStr = (str: string): number => {
          const p = str.replace(',', '.').split(':');
          if (p.length === 3) {
            return parseFloat(p[0]) * 3600 + parseFloat(p[1]) * 60 + parseFloat(p[2]);
          } else if (p.length === 2) {
            return parseFloat(p[0]) * 60 + parseFloat(p[1]);
          } else {
            return parseFloat(p[0]) || 0;
          }
        };
        start = parseTimeStr(parts[0]);
        end = parseTimeStr(parts[1]);
      }
      
      const audioPath = bgm.audioFile ? path.join(resolvedSaveDir, 'bgm', bgm.audioFile) : null;
      return {
        audioPath,
        start,
        end
      };
    }).filter((x: any) => x.audioPath && fs.existsSync(x.audioPath));

    const compilerPayload = {
      scenes: compilerScenes,
      style,
      outputFile: finalVideoPath,
      videoType,
      voiceDir: resolvedVoiceDir,
      bgm: {
        volumeDb: bgmVolumeDb,
        segments: bgmSegments
      },
      srtContent,
      burnSubtitles
    };

    const tempPayloadPath = path.join(process.cwd(), `src/lib/temp_payload_${projectId || 'export'}.json`);
    console.log('[Export Video API] Writing temp payload file:', tempPayloadPath);
    fs.writeFileSync(tempPayloadPath, JSON.stringify(compilerPayload, null, 2), 'utf-8');

    const isPackaged = process.env.ELECTRON_PACKAGED === 'true';
    let execCmd = '';
    let args: string[] = [];

    if (isPackaged) {
      execCmd = path.join(process.cwd(), '..', 'bin', 'videoCompiler.exe');
      args = [tempPayloadPath];
      console.log('[Export Video API] Running in packaged mode. Executable path:', execCmd);
    } else {
      let pythonExe = 'c:\\PHAN MEM\\tool-manga\\backend\\.venv\\Scripts\\python.exe';
      if (!fs.existsSync(pythonExe)) {
        pythonExe = 'C:\\Users\\ADMIN\\AppData\\Local\\Programs\\Python\\Python313\\python.exe';
      }
      if (!fs.existsSync(pythonExe)) {
        pythonExe = 'python';
      }
      execCmd = pythonExe;
      const scriptPath = path.join(process.cwd(), 'src/lib/videoCompiler.py');
      args = ['-u', scriptPath, tempPayloadPath];
      console.log('[Export Video API] Running in development mode. Python path:', execCmd, 'Script:', scriptPath);
    }

    // Prepare initial progress state
    const progress = {
      status: 'started',
      current: 0,
      total: 0,
      percent: 0,
      message: 'Khởi tạo tiến trình xuất phim...',
      filePath: finalVideoPath,
      fileName: finalVideoFileName,
      logs: ['[System] Khởi tạo tiến trình xuất phim...']
    };

    const progressPath = path.join(process.cwd(), `src/lib/export_progress_${projectId}.json`);
    
    const saveProgress = () => {
      try {
        fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2), 'utf-8');
      } catch (err) {
        console.error('Failed to write progress to disk:', err);
      }
    };

    saveProgress();

    console.log('[Export Video API] Spawning background compiler process...');
    const child = spawn(execCmd, args);

    const exportEntry = {
      child,
      isAlive: true,
      progress
    };
    activeExports.set(projectId, exportEntry);

    child.on('error', (err) => {
      console.error('[Export Video Stream] Failed to start python child process:', err);
      exportEntry.isAlive = false;
      progress.status = 'failed';
      progress.message = `Không thể khởi chạy tiến trình Python: ${err.message}`;
      progress.logs.push(`[System Error] Không thể khởi chạy tiến trình Python: ${err.message}`);
      saveProgress();
    });

    child.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          console.log('[Export Video Python stdout]:', trimmed);
          progress.logs.push(trimmed);
          if (progress.logs.length > 500) {
            progress.logs.shift();
          }

          const progressMatch = trimmed.match(/Processing Scene (\d+)\/(\d+)/i);
          if (progressMatch) {
            const current = parseInt(progressMatch[1], 10);
            const total = parseInt(progressMatch[2], 10);
            progress.status = 'processing';
            progress.current = current;
            progress.total = total;
            progress.percent = Math.round(((current - 1) / total) * 100);
            progress.message = `Đang kết xuất phân cảnh ${current}/${total} (${Math.round(((current - 1) / total) * 100)}%)`;
          } else if (trimmed.includes('Video export complete!')) {
            progress.status = 'completed';
            progress.percent = 100;
            progress.message = 'Biên dịch video tổng hợp thành công!';
          } else {
            progress.message = trimmed;
          }
          saveProgress();
        }
      }
    });

    child.stderr.on('data', (data) => {
      const logLine = data.toString().trim();
      if (logLine) {
        console.warn('[Export Video Python stderr]:', logLine);
        progress.logs.push(logLine);
        if (progress.logs.length > 500) {
          progress.logs.shift();
        }
        saveProgress();
      }
    });

    child.on('close', (code) => {
      console.log('[Export Video Stream] Subprocess closed with code:', code);
      exportEntry.isAlive = false;

      // Cleanup temp file
      try {
        if (fs.existsSync(tempPayloadPath)) {
          console.log('[Export Video Stream] Cleaning up temp payload file...');
          fs.unlinkSync(tempPayloadPath);
        }
      } catch (err) {
        console.error('[Export Video Stream] Failed to cleanup temp payload file:', err);
      }

      if (code !== 0) {
        progress.status = 'failed';
        progress.message = `Quá trình render thất bại với mã thoát: ${code}`;
        progress.logs.push(`[System] Quá trình render thất bại với mã thoát: ${code}`);
      } else {
        progress.status = 'completed';
        progress.percent = 100;
        progress.message = 'Biên dịch video tổng hợp thành công!';
        progress.logs.push('[System] Biên dịch video tổng hợp thành công!');
      }
      saveProgress();
    });

    // Return success immediately to client so it can start polling
    return NextResponse.json({ success: true, message: 'Export started successfully' });

  } catch (error: any) {
    console.error('[Export Video API] Unhandled route error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
