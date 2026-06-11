import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { parseSRT, SubtitleBlock } from '../lib/srtParser';
import FolderPickerModal from './FolderPickerModal';
import { 
  Play, 
  Pause, 
  SkipForward, 
  SkipBack, 
  Volume2, 
  VolumeX, 
  Sliders, 
  Maximize2, 
  Minimize2, 
  Clock, 
  Type, 
  AlignJustify,
  Tv,
  Film,
  Sparkles,
  ChevronRight,
  Eye,
  Save,
  Settings,
  FolderOpen,
  Music,
  RefreshCw,
  Copy,
  Check
} from 'lucide-react';

// Time parser helper
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
function getSubtitlesForScene(subtitleRange: string, blocks: SubtitleBlock[]): SubtitleBlock[] {
  if (!subtitleRange) return [];
  const parts = subtitleRange.split('-').map(x => parseInt(x.trim(), 10));
  if (parts.length === 1 && !isNaN(parts[0])) {
    const id = parts[0];
    return blocks.filter(b => {
      const origId = b.id >= 1000 ? Math.floor(b.id / 1000) : b.id;
      return origId === id;
    });
  } else if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    const start = parts[0];
    const end = parts[1];
    return blocks.filter(b => {
      const origId = b.id >= 1000 ? Math.floor(b.id / 1000) : b.id;
      return origId >= start && origId <= end;
    });
  }
  return [];
}

// Proportional duration splitter for long subtitle blocks (supporting both CJK and non-CJK)
function splitLongSubtitleBlock(block: SubtitleBlock, maxWords: number = 7): SubtitleBlock[] {
  const text = block.text.trim();
  const isCjk = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/.test(text);

  let chunkTexts: string[] = [];

  if (isCjk) {
    const limit = Math.max(10, maxWords * 3); // Scale CJK limit (e.g. 7 * 3 = 21 chars)
    const puncs = /[、。！？，．？！]/;
    const parts: string[] = [];
    let current = '';
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      current += char;
      if (puncs.test(char) || char === ' ' || char === '　') {
        // Look ahead to check if the next character is a closing bracket/quote
        while (i + 1 < text.length && /[」』）\)"'\]］]/.test(text[i + 1])) {
          i++;
          current += text[i];
        }
        
        if (current.length >= 10 || i === text.length - 1) {
          parts.push(current.trim());
          current = '';
        }
      }
    }
    if (current.trim()) {
      parts.push(current.trim());
    }
    
    for (const p of parts) {
      if (p.length <= limit) {
        chunkTexts.push(p);
      } else {
        let temp = p;
        while (temp.length > limit) {
          chunkTexts.push(temp.substring(0, limit));
          temp = temp.substring(limit);
        }
        if (temp) {
          if (chunkTexts.length > 0 && temp.length <= 3) {
            chunkTexts[chunkTexts.length - 1] += temp;
          } else {
            chunkTexts.push(temp);
          }
        }
      }
    }
  } else {
    // Non-CJK text (space-separated)
    const words = text.replace(/\s+/g, ' ').split(' ');
    if (words.length <= maxWords || maxWords <= 0) {
      return [block];
    }
    const chunks: string[][] = [];
    for (let i = 0; i < words.length; i += maxWords) {
      chunks.push(words.slice(i, i + maxWords));
    }
    chunkTexts = chunks.map(c => c.join(' '));
  }

  if (chunkTexts.length <= 1) {
    return [block];
  }

  const result: SubtitleBlock[] = [];
  const startSec = parseTimestampToSeconds(block.startTime);
  const endSec = parseTimestampToSeconds(block.endTime);
  const totalDuration = endSec - startSec;
  const totalChars = chunkTexts.reduce((sum, t) => sum + t.length, 0);

  // Helper to format seconds back to SRT format timestamp: HH:MM:SS,mmm
  const formatSecondsToSRTTime = (sec: number): string => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  };

  let currentStart = startSec;
  for (let i = 0; i < chunkTexts.length; i++) {
    const t = chunkTexts[i];
    const chunkDuration = totalDuration * (t.length / (totalChars || 1));
    const currentEnd = currentStart + chunkDuration;

    result.push({
      id: block.id * 1000 + i,
      timeRange: `${formatSecondsToSRTTime(currentStart)} --> ${formatSecondsToSRTTime(currentEnd)}`,
      startTime: formatSecondsToSRTTime(currentStart),
      endTime: formatSecondsToSRTTime(currentEnd),
      text: t
    });

    currentStart = currentEnd;
  }

  return result;
}

// Helper to format seconds to MM:SS
function formatTime(seconds: number): string {
  if (isNaN(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Auto-wrap subtitle sentences to balanced shorter lines
function wrapSubtitleText(text: string, maxLineLength: number = 38): string {
  if (!text) return '';
  const cleanedText = text.replace(/\s+/g, ' ').trim();
  if (cleanedText.length <= maxLineLength) return cleanedText;

  const words = cleanedText.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length === 0) {
      currentLine = word;
    } else if (currentLine.length + 1 + word.length <= maxLineLength) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines.join('\n');
}

function pathGetFilename(p: string): string {
  if (!p) return '';
  return p.substring(p.lastIndexOf('\\') + 1).substring(p.lastIndexOf('/') + 1);
}

function getSplitSubDuration(
  sub: SubtitleBlock,
  subToVoiceMap: Record<number, { path: string; duration: number }>,
  srtBlocks: SubtitleBlock[]
): number {
  const origId = sub.id >= 1000 ? Math.floor(sub.id / 1000) : sub.id;
  if (!subToVoiceMap[sub.id]) {
    const sStart = parseTimestampToSeconds(sub.startTime);
    const sEnd = parseTimestampToSeconds(sub.endTime);
    return Math.max(0.5, sEnd - sStart);
  }

  const totalDur = subToVoiceMap[sub.id].duration;
  // Find all split parts for this original ID
  const parts = srtBlocks.filter(b => {
    const bOrigId = b.id >= 1000 ? Math.floor(b.id / 1000) : b.id;
    return bOrigId === origId;
  });

  if (parts.length <= 1) {
    return totalDur;
  }

  // Distribute duration proportionally by character length
  const totalChars = parts.reduce((sum, p) => sum + p.text.length, 0);
  return totalDur * (sub.text.length / (totalChars || 1));
}

interface SceneTimeInfo {
  index: number;
  stt: number;
  timeRange: string;
  subtitleRange: string;
  sceneStart: number;
  sceneEnd: number;
  targetDuration: number;
  playerStartOffset: number;
  videoUrl?: string;
  imageUrl?: string;
  sceneDescription: string;
  mainSituation: string;
}

interface BgmSegmentCardProps {
  row: any;
  idx: number;
  isActive: boolean;
  bgmFiles: any[];
  updateBgmSuggestionCell: (id: string, colId: string, value: any) => void;
  regenerateBgmPrompt: (id: string) => Promise<void>;
  bgmPlayerState: 'idle' | 'loading' | 'ready' | 'error';
}

function BgmSegmentCard({
  row,
  idx,
  isActive,
  bgmFiles,
  updateBgmSuggestionCell,
  regenerateBgmPrompt,
  bgmPlayerState
}: BgmSegmentCardProps) {
  const [copied, setCopied] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(row.sunoPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      await regenerateBgmPrompt(row.id);
    } catch (e) {
      alert('Tạo lại prompt thất bại: ' + (e as Error).message);
    } finally {
      setIsRegenerating(false);
    }
  };

  const fileExists = row.audioFile && bgmFiles.some((f: any) => f.name === row.audioFile);
  let statusBadge = null;

  if (!row.audioFile) {
    statusBadge = (
      <span className="shrink-0 text-[8px] font-bold uppercase px-1.5 py-0.5 rounded tracking-wide bg-amber-950/40 text-amber-500 border border-amber-900/40">
        Thiếu tệp
      </span>
    );
  } else if (!fileExists) {
    statusBadge = (
      <span className="shrink-0 text-[8px] font-bold uppercase px-1.5 py-0.5 rounded tracking-wide bg-red-950/40 text-red-500 border border-red-900/40 animate-pulse">
        Không tìm thấy tệp
      </span>
    );
  } else {
    if (isActive) {
      if (bgmPlayerState === 'loading') {
        statusBadge = (
          <span className="shrink-0 text-[8px] font-bold uppercase px-1.5 py-0.5 rounded tracking-wide bg-blue-950/40 text-blue-400 border border-blue-900/40 animate-pulse">
            Đang tải...
          </span>
        );
      } else if (bgmPlayerState === 'error') {
        statusBadge = (
          <span className="shrink-0 text-[8px] font-bold uppercase px-1.5 py-0.5 rounded tracking-wide bg-red-950/40 text-red-500 border border-red-900/40">
            Lỗi tải tệp
          </span>
        );
      } else {
        statusBadge = (
          <span className="shrink-0 text-[8px] font-bold uppercase px-1.5 py-0.5 rounded tracking-wide bg-emerald-950/40 text-emerald-400 border border-emerald-900/40">
            Đang phát
          </span>
        );
      }
    } else {
      statusBadge = (
        <span className="shrink-0 text-[8px] font-bold uppercase px-1.5 py-0.5 rounded tracking-wide bg-teal-950/40 text-teal-400 border border-teal-900/40">
          Sẵn sàng
        </span>
      );
    }
  }

  return (
    <div className={`p-4 rounded-xl border transition-all flex flex-col gap-3 relative ${
      isActive 
        ? 'bg-violet-950/15 border-violet-850 shadow-md shadow-violet-950/5' 
        : 'bg-slate-900/35 border-gray-900 hover:bg-slate-900/50'
    }`}>
      {/* Title & Time range header */}
      <div className="flex justify-between items-start gap-2">
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <input
            type="text"
            value={row.title}
            onChange={(e) => updateBgmSuggestionCell(row.id, 'title', e.target.value)}
            className="bg-transparent border-0 hover:bg-slate-950 focus:bg-slate-950 font-bold text-xs text-slate-200 outline-none rounded px-1.5 py-0.5 -ml-1.5 w-full focus:ring-1 focus:ring-violet-600"
            title="Nhấp để sửa tiêu đề đoạn nhạc"
          />
          <input
            type="text"
            value={row.timeRange}
            onChange={(e) => updateBgmSuggestionCell(row.id, 'timeRange', e.target.value)}
            className="bg-transparent border-0 hover:bg-slate-950 focus:bg-slate-950 text-[10px] text-gray-500 font-mono outline-none rounded px-1.5 py-0.5 -ml-1.5 w-32 focus:ring-1 focus:ring-violet-600"
            title="Nhấp để sửa khoảng thời gian (MM:SS - MM:SS)"
          />
        </div>
        
        {statusBadge}
      </div>

      {/* Narrative Rationale */}
      <p className="text-[10px] text-gray-400 leading-relaxed italic bg-slate-950/20 px-2.5 py-1.5 rounded-lg border border-slate-900/40">
        {row.description}
      </p>

      {/* Selectors grid */}
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        {/* Genre Selector */}
        <div className="flex flex-col gap-1">
          <span className="text-gray-500 font-medium uppercase tracking-wider text-[8px]">Thể loại</span>
          <div className="flex gap-1">
            <input
              type="text"
              value={row.genre}
              onChange={(e) => updateBgmSuggestionCell(row.id, 'genre', e.target.value)}
              className="bg-slate-950 border border-gray-850 rounded px-1.5 py-1 text-slate-300 w-full outline-none focus:border-violet-600 text-[10px]"
            />
            <select
              value={['Cinematic', 'Lo-Fi', 'Anime OST', 'Orchestral', 'Epic Drama', 'Ambient', 'Acoustic'].includes(row.genre) ? row.genre : ''}
              onChange={(e) => {
                if (e.target.value) {
                  updateBgmSuggestionCell(row.id, 'genre', e.target.value);
                }
              }}
              className="bg-slate-950 border border-gray-855 rounded px-1 text-slate-400 outline-none text-[10px] max-w-[40px] cursor-pointer"
            >
              <option value="">--</option>
              <option value="Cinematic">Cinematic</option>
              <option value="Lo-Fi">Lo-Fi</option>
              <option value="Anime OST">Anime OST</option>
              <option value="Orchestral">Orchestral</option>
              <option value="Epic Drama">Epic Drama</option>
              <option value="Ambient">Ambient</option>
              <option value="Acoustic">Acoustic</option>
            </select>
          </div>
        </div>

        {/* Instrument Selector */}
        <div className="flex flex-col gap-1">
          <span className="text-gray-500 font-medium uppercase tracking-wider text-[8px]">Nhạc cụ</span>
          <div className="flex gap-1">
            <input
              type="text"
              value={row.instrument}
              onChange={(e) => updateBgmSuggestionCell(row.id, 'instrument', e.target.value)}
              className="bg-slate-950 border border-gray-855 rounded px-1.5 py-1 text-slate-300 w-full outline-none focus:border-violet-600 text-[10px]"
            />
            <select
              value={['Piano', 'Violin', 'Acoustic Guitar', 'Electric Guitar', 'Synth', 'Flute', 'Cello', 'Orchestra Strings'].includes(row.instrument) ? row.instrument : ''}
              onChange={(e) => {
                if (e.target.value) {
                  updateBgmSuggestionCell(row.id, 'instrument', e.target.value);
                }
              }}
              className="bg-slate-950 border border-gray-855 rounded px-1 text-slate-400 outline-none text-[10px] max-w-[40px] cursor-pointer"
            >
              <option value="">--</option>
              <option value="Piano">Piano</option>
              <option value="Violin">Violin</option>
              <option value="Acoustic Guitar">Acoustic Guitar</option>
              <option value="Electric Guitar">Electric Guitar</option>
              <option value="Synth">Synth</option>
              <option value="Flute">Flute</option>
              <option value="Cello">Cello</option>
              <option value="Orchestra Strings">Orchestra Strings</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1 text-[10px]">
        {/* Tone Selector */}
        <span className="text-gray-500 font-medium uppercase tracking-wider text-[8px]">Tâm trạng / Tông nhạc</span>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={row.tone}
            onChange={(e) => updateBgmSuggestionCell(row.id, 'tone', e.target.value)}
            className="bg-slate-950 border border-gray-855 rounded px-2 py-1.5 text-slate-350 flex-1 outline-none focus:border-violet-600 text-[10px]"
          />
          <select
            value={['Melancholic', 'Suspenseful', 'Epic/Heroic', 'Peaceful', 'Romantic', 'Dark/Tense', 'Happy/Upbeat'].includes(row.tone) ? row.tone : ''}
            onChange={(e) => {
              if (e.target.value) {
                updateBgmSuggestionCell(row.id, 'tone', e.target.value);
              }
            }}
            className="bg-slate-950 border border-gray-855 rounded px-2 text-slate-400 outline-none text-[10px] cursor-pointer"
          >
            <option value="">-- Chọn tông chính --</option>
            <option value="Melancholic">Melancholic (U sầu)</option>
            <option value="Suspenseful">Suspenseful (Hồi hộp)</option>
            <option value="Epic/Heroic">Epic/Heroic (Hào hùng)</option>
            <option value="Peaceful">Peaceful (Bình yên)</option>
            <option value="Romantic">Romantic (Lãng mạn)</option>
            <option value="Dark/Tense">Dark/Tense (Căng thẳng)</option>
            <option value="Happy/Upbeat">Happy/Upbeat (Vui vẻ)</option>
          </select>
        </div>
      </div>

      {/* Local File Mapper Selector */}
      <div className="flex flex-col gap-1 text-[10px]">
        <span className="text-gray-500 font-medium uppercase tracking-wider text-[8px]">Khớp file nhạc trong thư mục bgm/</span>
        <select
          value={row.audioFile || ''}
          onChange={(e) => updateBgmSuggestionCell(row.id, 'audioFile', e.target.value)}
          className="bg-slate-950 border border-gray-855 rounded px-2 py-1.5 text-slate-300 w-full outline-none focus:border-violet-600 text-[10px] cursor-pointer"
        >
          <option value="">-- Chọn file nhạc local (bgm/) --</option>
          {bgmFiles.map((file: any) => (
            <option key={file.name} value={file.name}>
              {file.name} ({Math.floor(file.duration / 60)}m{Math.floor(file.duration % 60)}s)
            </option>
          ))}
        </select>
        {!row.audioFile && (
          <p className="text-[9px] text-slate-500 leading-tight">
            * Hãy copy file nhạc vào thư mục dự án \bgm\, sau đó nhấn Quét lại để chọn.
          </p>
        )}
      </div>

      {/* Suno Prompt Copy Section */}
      <div className="flex flex-col gap-1 bg-slate-950 p-2.5 rounded-lg border border-gray-855 mt-1 relative">
        <div className="flex justify-between items-center shrink-0">
          <span className="text-violet-400 font-bold uppercase tracking-wider text-[8.5px]">Suno AI Prompt</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCopy}
              className="text-gray-400 hover:text-slate-200 p-1 rounded transition hover:bg-slate-900 cursor-pointer"
              title="Copy prompt vào bộ nhớ tạm"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={handleRegenerate}
              disabled={isRegenerating}
              className="text-gray-400 hover:text-slate-200 p-1 rounded transition hover:bg-slate-900 cursor-pointer disabled:opacity-50"
              title="Tạo lại prompt theo các thông số đã chọn"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        <textarea
          value={row.sunoPrompt}
          onChange={(e) => updateBgmSuggestionCell(row.id, 'sunoPrompt', e.target.value)}
          className="bg-transparent border-0 text-[10px] text-gray-300 leading-relaxed font-mono w-full h-12 outline-none resize-none focus:ring-0 select-text p-0 mt-1"
          placeholder="Mô tả nhạc nền bằng tiếng Anh..."
        />
      </div>
    </div>
  );
}

export default function CinemaManager() {
  const {
    currentProject,
    bgmFiles,
    isGeneratingBgmSuggestions,
    generateBgmSuggestions,
    updateBgmSuggestionCell,
    regenerateBgmPrompt,
    scanLocalBgmFiles,
    setCurrentProjectField
  } = useProjectStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  // Sidebar Tab Configuration State
  const [sidebarTab, setSidebarTab] = useState<'playlist' | 'bgm'>('playlist');

  // Trigger BGM scanning when active project or directory changes
  useEffect(() => {
    if (currentProject.id && currentProject.videoSaveDir) {
      scanLocalBgmFiles();
    }
  }, [currentProject.id, currentProject.videoSaveDir, scanLocalBgmFiles]);

  // Subtitle Customization State
  const [fontSize, setFontSize] = useState<number>(24);
  const [fontFamily, setFontFamily] = useState<string>('sans-serif');
  const [textColor, setTextColor] = useState<string>('#ffffff');
  const [outlineColor, setOutlineColor] = useState<string>('#000000');
  const [outlineWidth, setOutlineWidth] = useState<number>(2);
  const [verticalAlign, setVerticalAlign] = useState<'top' | 'center' | 'bottom'>('bottom');
  const [bgOpacity, setBgOpacity] = useState<number>(0.4);
  const [maxLineLength, setMaxLineLength] = useState<number>(38);
  const [maxWordsLimit, setMaxWordsLimit] = useState<number>(7);

  // Player Playback State
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [isVoiceMuted, setIsVoiceMuted] = useState<boolean>(false);
  const [isVideoMuted, setIsVideoMuted] = useState<boolean>(true);
  const [voiceLoadingStatus, setVoiceLoadingStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [bgmPlayerState, setBgmPlayerState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [voiceBlobUrls, setVoiceBlobUrls] = useState<Record<string, string>>({});
  const [preloadProgress, setPreloadProgress] = useState<{ total: number; current: number; status: 'idle' | 'loading' | 'completed' | 'error' }>({ total: 0, current: 0, status: 'idle' });
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [videoLoaded, setVideoLoaded] = useState<boolean>(false);
  const [activePlaybackRate, setActivePlaybackRate] = useState<number>(1.0);
  const [exportProgress, setExportProgress] = useState<{
    status: 'idle' | 'started' | 'processing' | 'completed' | 'failed';
    current: number;
    total: number;
    percent: number;
    message: string;
    filePath?: string;
    fileName?: string;
    logs: string[];
  }>({
    status: 'idle',
    current: 0,
    total: 0,
    percent: 0,
    message: '',
    logs: []
  });

  const [showExportConfig, setShowExportConfig] = useState(false);
  const [videoType, setVideoType] = useState<'mixed' | 'images_only' | 'videos_only'>('mixed');
  const [voiceDir, setVoiceDir] = useState('');
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);
  const [voiceFiles, setVoiceFiles] = useState<{ path: string; duration: number }[]>([]);
  const [subToVoiceMap, setSubToVoiceMap] = useState<Record<number, { path: string; duration: number }>>({});
  const [burnSubtitles, setBurnSubtitles] = useState<boolean>(true);
  const [validationStatus, setValidationStatus] = useState<{
    isValidating: boolean;
    success: boolean | null;
    message: string;
    errors: string[];
  }>({
    isValidating: false,
    success: null,
    message: '',
    errors: []
  });

  const validateAssets = async (typeToValidate = videoType) => {
    if (!currentProject.id || !currentProject.videoSaveDir) return;
    setValidationStatus({ isValidating: true, success: null, message: '', errors: [] });
    try {
      const response = await fetch('/api/video/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          projectId: currentProject.id,
          projectName: currentProject.name,
          sceneMapping: currentProject.sceneMapping,
          imagePrompts: currentProject.imagePrompts,
          srtContent: srtBlocks.map(b => `${b.id}\n${b.startTime} --> ${b.endTime}\n${b.text}`).join('\n\n'),
          videoSaveDir: currentProject.videoSaveDir,
          videoType: typeToValidate,
          bgmVolumeDb: currentProject.bgmVolumeDb ?? -18,
          bgmSuggestions: currentProject.bgmSuggestions || [],
          validateOnly: true
        })
      });
      
      const data = await response.json();
      if (response.ok && data.success) {
        setValidationStatus({
          isValidating: false,
          success: true,
          message: data.message || 'Tất cả dữ liệu đã đầy đủ!',
          errors: []
        });
      } else {
        setValidationStatus({
          isValidating: false,
          success: false,
          message: data.error || 'Thiếu dữ liệu cần thiết.',
          errors: data.errors || []
        });
      }
    } catch (err: any) {
      setValidationStatus({
        isValidating: false,
        success: false,
        message: 'Lỗi kiểm tra dữ liệu: ' + err.message,
        errors: [err.message]
      });
    }
  };

  useEffect(() => {
    if (showExportConfig && currentProject.id && currentProject.videoSaveDir) {
      validateAssets(videoType);
    }
  }, [showExportConfig, videoType, currentProject.id, currentProject.videoSaveDir]);

  // Parse SRT Blocks and split long sentences into sequential subtitles
  const srtBlocks = useMemo(() => {
    if (!currentProject?.srtContent) return [];
    const parsed = parseSRT(currentProject.srtContent).blocks;
    const splitBlocks: SubtitleBlock[] = [];
    for (const block of parsed) {
      splitBlocks.push(...splitLongSubtitleBlock(block, maxWordsLimit));
    }
    return splitBlocks;
  }, [currentProject?.srtContent, maxWordsLimit]);

  const handleSelectVoiceDirectory = () => {
    setIsFolderPickerOpen(true);
  };

  const handleFolderSelectConfirm = async (selectedPath: string) => {
    try {
      const response = await fetch('/api/video/select-directory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: selectedPath })
      });
      if (!response.ok) {
        throw new Error('Failed to configure directory on server');
      }
      const data = await response.json();
      if (data.success && data.path) {
        setVoiceDir(data.path);
      }
    } catch (err: any) {
      console.error('Error selecting directory:', err);
      alert('Không thể cấu hình thư mục: ' + err.message);
    }
  };

  const isExporting = exportProgress.status !== 'idle' && exportProgress.status !== 'completed' && exportProgress.status !== 'failed';

  // Load Subtitle Styles from LocalStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setFontSize(Number(localStorage.getItem('cinema_sub_fontSize') || '24'));
      setFontFamily(localStorage.getItem('cinema_sub_fontFamily') || 'sans-serif');
      setTextColor(localStorage.getItem('cinema_sub_textColor') || '#ffffff');
      setOutlineColor(localStorage.getItem('cinema_sub_outlineColor') || '#000000');
      setOutlineWidth(Number(localStorage.getItem('cinema_sub_outlineWidth') || '2'));
      setVerticalAlign((localStorage.getItem('cinema_sub_verticalAlign') as any) || 'bottom');
      setBgOpacity(Number(localStorage.getItem('cinema_sub_bgOpacity') || '0.4'));
      setMaxLineLength(Number(localStorage.getItem('cinema_sub_maxLineLength') || '38'));
      setMaxWordsLimit(Number(localStorage.getItem('cinema_sub_maxWordsLimit') || '7'));
    }
  }, []);

  // Resume polling on mount if export is running on server
  useEffect(() => {
    if (!currentProject.id) return;
    
    let activeInterval: NodeJS.Timeout | null = null;
    
    const startPolling = () => {
      if (activeInterval) clearInterval(activeInterval);
      activeInterval = setInterval(async () => {
        try {
          const res = await fetch(`/api/video/export?projectId=${currentProject.id}`);
          if (!res.ok) return;
          const data = await res.json();
          
          setExportProgress({
            status: data.status,
            current: data.current || 0,
            total: data.total || 0,
            percent: data.percent || 0,
            message: data.message || '',
            filePath: data.filePath,
            fileName: data.fileName,
            logs: data.logs || []
          });
          
          if (data.status === 'completed' || data.status === 'failed') {
            if (activeInterval) {
              clearInterval(activeInterval);
              activeInterval = null;
            }
          }
        } catch (err) {
          console.error('Error polling export status:', err);
        }
      }, 1500);
    };

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/video/export?projectId=${currentProject.id}`);
        if (!res.ok) return;
        const data = await res.json();
        
        if (data.status === 'started' || data.status === 'processing') {
          setExportProgress({
            status: data.status,
            current: data.current || 0,
            total: data.total || 0,
            percent: data.percent || 0,
            message: data.message || '',
            filePath: data.filePath,
            fileName: data.fileName,
            logs: data.logs || []
          });
          startPolling();
        }
      } catch (err) {
        console.error('Failed to check export status on mount:', err);
      }
    };
    
    checkStatus();
    
    return () => {
      if (activeInterval) clearInterval(activeInterval);
    };
  }, [currentProject.id]);

  // Sync voiceDir with currentProject.videoSaveDir
  useEffect(() => {
    if (currentProject.videoSaveDir) {
      const computedVoiceDir = currentProject.videoSaveDir.endsWith('\\') || currentProject.videoSaveDir.endsWith('/')
        ? currentProject.videoSaveDir + 'voice'
        : currentProject.videoSaveDir + '\\voice';
      setVoiceDir(computedVoiceDir);
    } else {
      setVoiceDir('');
    }
  }, [currentProject.videoSaveDir]);

  const loadVoiceFiles = async (): Promise<{ path: string; duration: number }[]> => {
    if (!currentProject.videoSaveDir) {
      setVoiceFiles([]);
      return [];
    }
    try {
      const voicePath = currentProject.videoSaveDir.endsWith('\\') || currentProject.videoSaveDir.endsWith('/')
        ? currentProject.videoSaveDir + 'voice'
        : currentProject.videoSaveDir + '\\voice';
      
      const url = `/api/video/select-directory?path=${encodeURIComponent(voicePath)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      const data = await res.json();
      
      if (data.success && data.files) {
        const audioExts = ['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.flac'];
        const mp3s = data.files
          .filter((f: any) => {
            const ext = f.name.substring(f.name.lastIndexOf('.')).toLowerCase();
            return audioExts.includes(ext);
          })
          .map((f: any) => ({
            path: f.path,
            duration: f.duration || 5.0
          }));
        const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
        const sorted = mp3s.sort((a: any, b: any) => collator.compare(pathGetFilename(a.path), pathGetFilename(b.path)));
        setVoiceFiles(sorted);
        return sorted;
      } else {
        setVoiceFiles([]);
        return [];
      }
    } catch (err) {
      console.error('Failed to load voice files for preview:', err);
      setVoiceFiles([]);
      return [];
    }
  };

  // Fetch voice files when folder changes
  useEffect(() => {
    loadVoiceFiles();
  }, [currentProject.videoSaveDir]);

  const preloadAllVoiceFiles = async (filesToLoad?: { path: string; duration: number }[]) => {
    const targetFiles = filesToLoad || voiceFiles;
    if (targetFiles.length === 0) return;
    
    setPreloadProgress({ total: targetFiles.length, current: 0, status: 'loading' });
    
    const newBlobUrls: Record<string, string> = { ...voiceBlobUrlsRef.current };
    
    // Revoke and delete blob URLs for files that are no longer in targetFiles
    const voiceFilePaths = new Set(targetFiles.map(f => f.path));
    Object.keys(voiceBlobUrlsRef.current).forEach(path => {
      if (!voiceFilePaths.has(path)) {
        try {
          URL.revokeObjectURL(voiceBlobUrlsRef.current[path]);
          delete newBlobUrls[path];
        } catch (e) {}
      }
    });
    
    let loadedCount = Object.keys(newBlobUrls).filter(p => voiceFilePaths.has(p)).length;
    setPreloadProgress({ total: targetFiles.length, current: loadedCount, status: 'loading' });
    
    for (const file of targetFiles) {
      if (newBlobUrls[file.path]) {
        // Already preloaded
        continue;
      }
      try {
        const audioUrl = `/api/video/serve-file?path=${encodeURIComponent(file.path)}`;
        const res = await fetch(audioUrl);
        if (!res.ok) throw new Error();
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        newBlobUrls[file.path] = blobUrl;
        
        loadedCount++;
        setVoiceBlobUrls({ ...newBlobUrls });
        setPreloadProgress(prev => ({
          ...prev,
          current: loadedCount
        }));
      } catch (err) {
        console.error('Failed to preload voice file:', file.path, err);
      }
    }
    
    setVoiceBlobUrls({ ...newBlobUrls });
    setPreloadProgress(prev => ({
      ...prev,
      status: loadedCount === targetFiles.length ? 'completed' : 'error'
    }));
  };

  const handleLoadAndPreloadAll = async () => {
    const loadedFiles = await loadVoiceFiles();
    if (loadedFiles.length > 0) {
      await preloadAllVoiceFiles(loadedFiles);
    } else {
      alert('Không tìm thấy file âm thanh thuyết minh nào trong thư mục voice để tải!');
    }
  };

  // Auto-preload on voice files load (only when status is idle)
  useEffect(() => {
    if (voiceFiles.length > 0 && preloadProgress.status === 'idle') {
      preloadAllVoiceFiles();
    }
  }, [voiceFiles]);

  const voiceBlobUrlsRef = useRef<Record<string, string>>({});
  useEffect(() => {
    voiceBlobUrlsRef.current = voiceBlobUrls;
  }, [voiceBlobUrls]);

  // Cleanup Blob URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(voiceBlobUrlsRef.current).forEach(url => {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {}
      });
    };
  }, []);

  // Map voice files to subtitles sequentially 1-to-1 using original subtitle blocks
  useEffect(() => {
    if (voiceFiles.length === 0 || !currentProject?.srtContent) {
      setSubToVoiceMap({});
      return;
    }

    const parsed = parseSRT(currentProject.srtContent).blocks;
    const sortedOriginalSubs = [...parsed].sort((a, b) => {
      return parseTimestampToSeconds(a.startTime) - parseTimestampToSeconds(b.startTime);
    });

    const originalSubToVoiceMap: Record<number, { path: string; duration: number }> = {};
    sortedOriginalSubs.forEach((origSub, idx) => {
      if (idx < voiceFiles.length) {
        const file = voiceFiles[idx];
        const sStart = parseTimestampToSeconds(origSub.startTime);
        const sEnd = parseTimestampToSeconds(origSub.endTime);
        originalSubToVoiceMap[origSub.id] = {
          path: file.path,
          duration: Math.max(0.5, sEnd - sStart)
        };
      }
    });

    // Map each split block in srtBlocks to the voice file of its original subtitle block
    const map: Record<number, { path: string; duration: number }> = {};
    srtBlocks.forEach(sub => {
      const origId = sub.id >= 1000 ? Math.floor(sub.id / 1000) : sub.id;
      if (originalSubToVoiceMap[origId]) {
        map[sub.id] = originalSubToVoiceMap[origId];
      }
    });

    setSubToVoiceMap(map);
  }, [voiceFiles, srtBlocks, currentProject?.srtContent]);



  const updateSubStyle = (key: string, val: any, setter: any) => {
    setter(val);
    localStorage.setItem(`cinema_sub_${key}`, String(val));
  };

  const handleExportVideo = async (selectedVideoType: string, selectedVoiceDir: string) => {
    if (isExporting) return;

    const saveDir = currentProject.videoSaveDir;
    if (!saveDir) {
      alert('Vui lòng thiết lập "Thư mục lưu video trên máy tính" trong tab "1. Cấu hình dự án" trước khi xuất phim!');
      return;
    }

    setExportProgress({
      status: 'started',
      current: 0,
      total: 0,
      percent: 0,
      message: 'Đang kết nối tới máy chủ kết xuất...',
      logs: ['[System] Khởi động tiến trình kết xuất...']
    });

    try {
      const response = await fetch('/api/video/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          projectId: currentProject.id,
          projectName: currentProject.name,
          sceneMapping: currentProject.sceneMapping,
          imagePrompts: currentProject.imagePrompts,
          srtContent: srtBlocks.map(b => `${b.id}\n${b.startTime} --> ${b.endTime}\n${b.text}`).join('\n\n'),
          style: {
            fontSize,
            fontFamily,
            textColor,
            outlineColor,
            outlineWidth,
            verticalAlign,
            bgOpacity
          },
          videoSaveDir: saveDir,
          videoType: selectedVideoType,
          voiceDir: selectedVoiceDir,
          bgmVolumeDb: currentProject.bgmVolumeDb ?? -18,
          bgmSuggestions: currentProject.bgmSuggestions || [],
          burnSubtitles: burnSubtitles
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Lỗi máy chủ kết xuất' }));
        throw new Error(errData.error || 'Lỗi kết nối xuất video');
      }

      // Start polling status
      let pollCount = 0;
      const activeInterval = setInterval(async () => {
        try {
          const res = await fetch(`/api/video/export?projectId=${currentProject.id}`);
          if (!res.ok) return;
          const data = await res.json();
          
          setExportProgress({
            status: data.status,
            current: data.current || 0,
            total: data.total || 0,
            percent: data.percent || 0,
            message: data.message || '',
            filePath: data.filePath,
            fileName: data.fileName,
            logs: data.logs || []
          });
          
          if (data.status === 'completed' || data.status === 'failed') {
            clearInterval(activeInterval);
          }
        } catch (err) {
          console.error('Error polling status:', err);
          pollCount++;
          if (pollCount > 10) {
            clearInterval(activeInterval);
          }
        }
      }, 1500);

    } catch (err: any) {
      console.error(err);
      setExportProgress(prev => ({
        ...prev,
        status: 'failed',
        message: err.message,
        logs: [...prev.logs, `LỖI: ${err.message}`]
      }));
    }
  };

  // Compute Scene Timing Information (original timings, no voiceover stretching)
  const scenesInfo = useMemo<SceneTimeInfo[]>(() => {
    const mappings = currentProject?.sceneMapping || [];
    const prompts = currentProject?.imagePrompts || [];
    const list: SceneTimeInfo[] = [];
    let currentOffset = 0;

    for (let i = 0; i < mappings.length; i++) {
      const scene = mappings[i];
      const [startStr, endStr] = (scene.timeRange || '').split('-->').map(x => x.trim());
      const sceneStart = parseTimestampToSeconds(startStr);
      const sceneEnd = parseTimestampToSeconds(endStr);
      const origDuration = Math.max(0.5, sceneEnd - sceneStart);
      const promptRow = prompts.find(p => p.stt === scene.stt);

      list.push({
        index: i,
        stt: scene.stt,
        timeRange: scene.timeRange,
        subtitleRange: scene.subtitleRange,
        sceneStart,
        sceneEnd,
        targetDuration: origDuration,
        playerStartOffset: currentOffset,
        videoUrl: promptRow?.videoUrl,
        imageUrl: promptRow?.imageUrl,
        sceneDescription: scene.sceneDescription,
        mainSituation: scene.mainSituation
      });

      currentOffset += origDuration;
    }

    return list;
  }, [currentProject?.sceneMapping, currentProject?.imagePrompts]);

  const totalDuration = useMemo(() => {
    if (scenesInfo.length === 0) return 0;
    const lastScene = scenesInfo[scenesInfo.length - 1];
    return lastScene.playerStartOffset + lastScene.targetDuration;
  }, [scenesInfo]);

  // Determine Active Scene from current player time
  const activeScene = useMemo<SceneTimeInfo | null>(() => {
    if (scenesInfo.length === 0) return null;
    const found = scenesInfo.find(
      s => currentTime >= s.playerStartOffset && currentTime < s.playerStartOffset + s.targetDuration
    );
    return found || scenesInfo[scenesInfo.length - 1];
  }, [scenesInfo, currentTime]);

  const t_elapsed = useMemo(() => {
    if (!activeScene) return 0;
    return Math.max(0, currentTime - activeScene.playerStartOffset);
  }, [activeScene, currentTime]);

  // Extract Subtitle matching current time (based on original timestamps since audio duration = sub duration)
  const activeSubtitle = useMemo<SubtitleBlock | null>(() => {
    if (!activeScene || srtBlocks.length === 0) return null;
    
    const sceneSubtitles = getSubtitlesForScene(activeScene.subtitleRange, srtBlocks);
    if (sceneSubtitles.length === 0) return null;

    // Find the subtitle that currently matches currentTime
    const found = sceneSubtitles.find(sub => {
      const start = parseTimestampToSeconds(sub.startTime);
      const end = parseTimestampToSeconds(sub.endTime);
      return currentTime >= start && currentTime <= end;
    });

    return found || null;
  }, [activeScene, srtBlocks, currentTime]);

  // Auto-wrap active subtitle text
  const wrappedSubtitleText = useMemo(() => {
    if (!activeSubtitle?.text) return '';
    return wrapSubtitleText(activeSubtitle.text, maxLineLength);
  }, [activeSubtitle?.text, maxLineLength]);

  // Audio Playback Engine
  const audioObjRef = useRef<HTMLAudioElement | null>(null);
  const lastActiveVoicePathRef = useRef<string | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audioObjRef.current = audio;

    const handleLoadStart = () => setVoiceLoadingStatus('loading');
    const handleCanPlay = () => setVoiceLoadingStatus('loaded');
    const handleError = () => setVoiceLoadingStatus('error');

    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('error', handleError);
      audio.pause();
      audioObjRef.current = null;
    };
  }, []);

  // BGM Audio Playback Engine
  const bgmAudioObjRef = useRef<HTMLAudioElement | null>(null);
  const lastActiveBgmPathRef = useRef<string | null>(null);

  useEffect(() => {
    const bgmAudio = new Audio();
    bgmAudio.loop = true;
    bgmAudioObjRef.current = bgmAudio;

    const handleLoadStart = () => setBgmPlayerState('loading');
    const handleWaiting = () => setBgmPlayerState('loading');
    const handleCanPlay = () => setBgmPlayerState('ready');
    const handleCanPlayThrough = () => setBgmPlayerState('ready');
    const handlePlaying = () => setBgmPlayerState('ready');
    const handleSeeked = () => setBgmPlayerState('ready');
    const handleError = () => setBgmPlayerState('error');
    const handleEmptied = () => setBgmPlayerState('idle');
    const handleAbort = () => setBgmPlayerState('idle');

    bgmAudio.addEventListener('loadstart', handleLoadStart);
    bgmAudio.addEventListener('waiting', handleWaiting);
    bgmAudio.addEventListener('canplay', handleCanPlay);
    bgmAudio.addEventListener('canplaythrough', handleCanPlayThrough);
    bgmAudio.addEventListener('playing', handlePlaying);
    bgmAudio.addEventListener('seeked', handleSeeked);
    bgmAudio.addEventListener('error', handleError);
    bgmAudio.addEventListener('emptied', handleEmptied);
    bgmAudio.addEventListener('abort', handleAbort);

    return () => {
      bgmAudio.removeEventListener('loadstart', handleLoadStart);
      bgmAudio.removeEventListener('waiting', handleWaiting);
      bgmAudio.removeEventListener('canplay', handleCanPlay);
      bgmAudio.removeEventListener('canplaythrough', handleCanPlayThrough);
      bgmAudio.removeEventListener('playing', handlePlaying);
      bgmAudio.removeEventListener('seeked', handleSeeked);
      bgmAudio.removeEventListener('error', handleError);
      bgmAudio.removeEventListener('emptied', handleEmptied);
      bgmAudio.removeEventListener('abort', handleAbort);
      bgmAudio.pause();
      bgmAudioObjRef.current = null;
    };
  }, []);

  // Sync BGM volume (convert dB to linear)
  const bgmVolumeDb = currentProject.bgmVolumeDb ?? -18;
  useEffect(() => {
    const bgmAudio = bgmAudioObjRef.current;
    if (!bgmAudio) return;
    const linearVol = Math.pow(10, bgmVolumeDb / 20);
    bgmAudio.volume = Math.max(0, Math.min(1, linearVol));
  }, [bgmVolumeDb]);

  // Helper to parse BGM timeRanges (e.g. "00:00 - 04:00")
  const bgmSegmentsParsed = useMemo(() => {
    const suggestions = currentProject.bgmSuggestions || [];
    return suggestions.map((bgm) => {
      const parts = (bgm.timeRange || '').split('-').map((p) => p.trim());
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
      return {
        ...bgm,
        start,
        end
      };
    });
  }, [currentProject.bgmSuggestions]);

  // Find the active BGM segment based on currentTime
  const activeBgmSegment = useMemo(() => {
    return bgmSegmentsParsed.find(
      (bgm) => currentTime >= bgm.start && currentTime < bgm.end
    ) || null;
  }, [bgmSegmentsParsed, currentTime]);

  // Sync BGM playback
  useEffect(() => {
    const bgmAudio = bgmAudioObjRef.current;
    if (!bgmAudio) return;

    if (!isPlaying || !activeBgmSegment || !activeBgmSegment.audioFile) {
      bgmAudio.pause();
      if (!activeBgmSegment || !activeBgmSegment.audioFile) {
        lastActiveBgmPathRef.current = null;
      }
      return;
    }

    const bgmFileName = activeBgmSegment.audioFile;
    const projectSaveDir = currentProject.videoSaveDir || '';
    const sep = projectSaveDir.includes('/') ? '/' : '\\';
    const bgmFilePath = `${projectSaveDir.replace(/[\\/]+$/, '')}${sep}bgm${sep}${bgmFileName}`;
    const bgmAudioUrl = `/api/video/serve-file?path=${encodeURIComponent(bgmFilePath)}`;

    const elapsed = currentTime - activeBgmSegment.start;

    if (lastActiveBgmPathRef.current !== bgmFilePath) {
      lastActiveBgmPathRef.current = bgmFilePath;
      bgmAudio.src = bgmAudioUrl;
      bgmAudio.loop = true;
      bgmAudio.load();

      const playBgm = () => {
        if (bgmAudio.duration) {
          const targetTime = elapsed % bgmAudio.duration;
          bgmAudio.currentTime = targetTime;
        }
        bgmAudio.play().catch((err) => {
          if (err.name !== 'AbortError') console.log('BGM play error:', err);
        });
      };

      if (bgmAudio.readyState >= 1) { // HAVE_METADATA
        playBgm();
      } else {
        bgmAudio.onloadedmetadata = playBgm;
      }
    } else {
      if (bgmAudio.paused && isPlaying) {
        bgmAudio.play().catch((err) => {
          if (err.name !== 'AbortError') console.log('BGM play error:', err);
        });
      }

      if (bgmAudio.duration) {
        const targetTime = elapsed % bgmAudio.duration;
        const drift = Math.abs(bgmAudio.currentTime - targetTime);
        if (drift > 0.5 && !bgmAudio.seeking && bgmAudio.readyState >= 2 && !bgmAudio.paused) {
          bgmAudio.currentTime = targetTime;
        }
      }
    }
  }, [isPlaying, activeBgmSegment, currentProject.videoSaveDir, currentTime]);

  // Sync mute and rate
  useEffect(() => {
    const audio = audioObjRef.current;
    if (!audio) return;
    audio.muted = isVoiceMuted;
    audio.playbackRate = 1.0; // Audio must NEVER be stretched or speed-adjusted
  }, [isVoiceMuted]);

  // Sync playback (preventing audio cut or overlaps)
  useEffect(() => {
    const audio = audioObjRef.current;
    if (!audio) return;

    if (!isPlaying || !activeSubtitle || !subToVoiceMap[activeSubtitle.id]) {
      audio.pause();
      if (!activeSubtitle) {
        lastActiveVoicePathRef.current = null;
      }
      return;
    }

    const subId = activeSubtitle.id;
    const voicePath = subToVoiceMap[subId].path;
    const cachedUrl = voiceBlobUrls[voicePath];
    const audioUrl = cachedUrl || `/api/video/serve-file?path=${encodeURIComponent(voicePath)}`;

    // Calculate elapsed time within the original subtitle block (using original timeline)
    const origId = activeSubtitle.id >= 1000 ? Math.floor(activeSubtitle.id / 1000) : activeSubtitle.id;
    const firstPart = srtBlocks.find(b => {
      const bOrigId = b.id >= 1000 ? Math.floor(b.id / 1000) : b.id;
      return bOrigId === origId;
    });
    const origBlockStart = firstPart ? parseTimestampToSeconds(firstPart.startTime) : 0;
    const elapsed = Math.max(0, currentTime - origBlockStart);

    if (lastActiveVoicePathRef.current !== voicePath) {
      lastActiveVoicePathRef.current = voicePath;
      audio.src = audioUrl;
      audio.load();

      const playAudio = () => {
        if (elapsed > 0.1) {
          audio.currentTime = elapsed;
        }
        audio.play().catch(err => {
          if (err.name !== 'AbortError') console.log('Audio play error:', err);
        });
      };

      if (audio.readyState >= 1) { // HAVE_METADATA
        playAudio();
      } else {
        audio.onloadedmetadata = playAudio;
      }
    } else {
      if (audio.paused && isPlaying && !audio.ended) {
        audio.play().catch(err => {
          if (err.name !== 'AbortError') console.log('Audio play error:', err);
        });
      }
      
      const drift = Math.abs(audio.currentTime - elapsed);
      if (drift > 0.5 && !audio.seeking && audio.readyState >= 2 && !audio.paused) {
        audio.currentTime = elapsed;
      }
    }
  }, [isPlaying, activeSubtitle, subToVoiceMap, activeScene, currentTime, voiceBlobUrls]);

  // Handle Video Metadata Loaded & Speed Adjustments
  const handleMetadataLoaded = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    if (!activeScene) return;
    const video = e.currentTarget;
    setVideoLoaded(true);

    let rate = 1.0;
    if (activeScene.targetDuration >= 8 && video.duration) {
      rate = video.duration / activeScene.targetDuration;
    }

    // Standard video playback rates clamp between 0.1 and 16
    const safeRate = Math.max(0.1, Math.min(16, rate));
    video.playbackRate = safeRate;
    setActivePlaybackRate(safeRate);

    // Jump to the exact elapsed video time matching our timeline scrubbing
    video.currentTime = t_elapsed * safeRate;

    if (isPlaying) {
      video.play().catch(err => {
        if (err.name !== 'AbortError') console.log('Video play catch:', err);
      });
    }
  };

  // Synchronize play state
  useEffect(() => {
    if (!videoRef.current || !videoLoaded) return;
    if (isPlaying) {
      videoRef.current.play().catch(err => {
        if (err.name !== 'AbortError') console.log('Video play sync error:', err);
      });
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying, activeScene?.stt, videoLoaded]);

  // Reset videoLoaded state when scene changes to ensure the clock wait mechanism works for every scene video
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      if (video.readyState >= 1) {
        setVideoLoaded(true);
      } else {
        setVideoLoaded(false);
      }
    } else {
      setVideoLoaded(false);
    }
  }, [activeScene?.stt]);

  // Master Timer for Static Images (Ken Burns fallbacks) and extended video scenes
  useEffect(() => {
    if (!isPlaying || isScrubbing) return;

    let lastTime = performance.now();
    let frameId: number;

    const tick = () => {
      const now = performance.now();
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      // Check if video is active and driving the clock
      const video = videoRef.current;
      const isVideoStillLoading = activeScene?.videoUrl && !videoLoaded;
      const isVideoPlaying = activeScene?.videoUrl && video && !video.paused && !video.ended && (video.currentTime < video.duration - 0.1);
      const isVideoDriving = isVideoStillLoading || isVideoPlaying;

      if (!isVideoDriving) {
        setCurrentTime(prev => {
          const nextVal = prev + delta;
          if (activeScene && nextVal >= activeScene.playerStartOffset + activeScene.targetDuration) {
            // Trigger next scene transition
            const nextIdx = activeScene.index + 1;
            if (nextIdx < scenesInfo.length) {
              return scenesInfo[nextIdx].playerStartOffset;
            } else {
              // End of storyboard play
              setIsPlaying(false);
              return totalDuration;
            }
          }
          return nextVal;
        });
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, isScrubbing, activeScene?.stt, activeScene?.videoUrl, activeScene?.targetDuration, videoLoaded, scenesInfo, totalDuration]);

  // Video Time Update Callback
  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    if (isScrubbing || !isPlaying || !activeScene) return;
    const video = e.currentTarget;
    if (!video.duration) return;

    let rate = 1.0;
    if (activeScene.targetDuration >= 8 && video.duration) {
      rate = video.duration / activeScene.targetDuration;
    }

    const elapsed = video.currentTime / rate;

    // Check if we hit the scene boundary
    if (elapsed >= activeScene.targetDuration) {
      const nextIdx = activeScene.index + 1;
      if (nextIdx < scenesInfo.length) {
        // Transition immediately to next scene offset
        setCurrentTime(scenesInfo[nextIdx].playerStartOffset);
      } else {
        setIsPlaying(false);
        setCurrentTime(totalDuration);
      }
    } else {
      setCurrentTime(activeScene.playerStartOffset + elapsed);
    }
  };

  // Video End Callback Fallback
  const handleVideoEnded = () => {
    if (isScrubbing || !isPlaying || !activeScene) return;
    const elapsed = currentTime - activeScene.playerStartOffset;
    // Only transition if we have reached or are very close to the target duration
    if (elapsed >= activeScene.targetDuration - 0.1) {
      const nextIdx = activeScene.index + 1;
      if (nextIdx < scenesInfo.length) {
        setCurrentTime(scenesInfo[nextIdx].playerStartOffset);
      } else {
        setIsPlaying(false);
        setCurrentTime(totalDuration);
      }
    }
  };

  // Playback Navigation Commands
  const togglePlay = () => {
    // Gesture unlock audio element
    if (audioObjRef.current) {
      audioObjRef.current.play().then(() => {
        if (isPlaying) {
          audioObjRef.current?.pause();
        }
      }).catch(() => {});
    }

    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (currentTime >= totalDuration - 0.1) {
        setCurrentTime(0);
      }
      loadVoiceFiles();
      setIsPlaying(true);
    }
  };

  const handlePrevScene = () => {
    if (!activeScene) return;
    const prevIdx = activeScene.index - 1;
    if (prevIdx >= 0) {
      setCurrentTime(scenesInfo[prevIdx].playerStartOffset);
    } else {
      setCurrentTime(0);
    }
  };

  const handleNextScene = () => {
    if (!activeScene) return;
    const nextIdx = activeScene.index + 1;
    if (nextIdx < scenesInfo.length) {
      setCurrentTime(scenesInfo[nextIdx].playerStartOffset);
    }
  };

  const selectScene = (idx: number) => {
    // Gesture unlock audio element
    if (audioObjRef.current) {
      audioObjRef.current.play().then(() => {
        if (!isPlaying) {
          audioObjRef.current?.pause();
        }
      }).catch(() => {});
    }

    if (idx >= 0 && idx < scenesInfo.length) {
      setCurrentTime(scenesInfo[idx].playerStartOffset);
      if (!isPlaying) {
        setIsPlaying(true);
      }
    }
  };

  // Timeline scrubbing handlers
  const handleTimelineChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);

    // Find new scene mapping
    const targetScene = scenesInfo.find(
      s => newTime >= s.playerStartOffset && newTime < s.playerStartOffset + s.targetDuration
    ) || scenesInfo[scenesInfo.length - 1];

    if (targetScene && targetScene.videoUrl && videoRef.current && targetScene.stt === activeScene?.stt) {
      let rate = 1.0;
      if (targetScene.targetDuration >= 8 && videoRef.current.duration) {
        rate = videoRef.current.duration / targetScene.targetDuration;
      }
      videoRef.current.currentTime = (newTime - targetScene.playerStartOffset) * rate;
    }
  };

  const handleSeekTo = (newTime: number) => {
    setCurrentTime(newTime);

    // Find new scene mapping
    const targetScene = scenesInfo.find(
      s => newTime >= s.playerStartOffset && newTime < s.playerStartOffset + s.targetDuration
    ) || scenesInfo[scenesInfo.length - 1];

    if (targetScene && targetScene.videoUrl && videoRef.current && targetScene.stt === activeScene?.stt) {
      let rate = 1.0;
      if (targetScene.targetDuration >= 8 && videoRef.current.duration) {
        rate = videoRef.current.duration / targetScene.targetDuration;
      }
      videoRef.current.currentTime = (newTime - targetScene.playerStartOffset) * rate;
    }
  };

  // Fullscreen Mode
  const toggleFullscreen = () => {
    if (!playerContainerRef.current) return;
    if (!document.fullscreenElement) {
      playerContainerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(err => {
        console.error('Fullscreen request error:', err);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      });
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Subtitle custom style object (scaled proportionally via container query width units 'cqw')
  const outlineCqw = outlineWidth / 8;
  const subtitleStyle: React.CSSProperties = {
    fontSize: `${fontSize / 8}cqw`,
    fontFamily: fontFamily,
    color: textColor,
    textShadow: outlineWidth > 0 ? `
      -${outlineCqw}cqw -${outlineCqw}cqw 0 ${outlineColor},  
       ${outlineCqw}cqw -${outlineCqw}cqw 0 ${outlineColor},
      -${outlineCqw}cqw  ${outlineCqw}cqw 0 ${outlineColor},
       ${outlineCqw}cqw  ${outlineCqw}cqw 0 ${outlineColor},
       0px 0.25cqw 0.5cqw rgba(0,0,0,0.8)
    ` : 'none',
    backgroundColor: `rgba(0, 0, 0, ${bgOpacity})`,
    lineHeight: '1.4',
    padding: '1.2cqw 2cqw',
    borderRadius: '1cqw'
  };

  // Fallback for empty/unconfigured projects
  if (scenesInfo.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] glass-panel rounded-2xl border border-gray-800 p-8 text-center">
        <Film className="w-16 h-16 text-gray-600 mb-4 animate-pulse" />
        <h3 className="text-lg font-bold text-slate-300 mb-2">Chưa có dữ liệu trình chiếu</h3>
        <p className="text-sm text-gray-500 max-w-md">
          Vui lòng hoàn thành cấu hình dự án ở Tab 1 và thực hiện Scene Mapping ở Tab 2 để tạo danh sách phân cảnh trước khi truy cập Rạp phim.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col xl:flex-row gap-6 h-full overflow-hidden">
      
      {/* LEFT: Cinema Projection Screen */}
      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
        
        {/* Header Title & Export Button */}
        <div className="flex items-center justify-between gap-4 glass-panel px-6 py-3.5 rounded-2xl border border-gray-800/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-violet-950/80 p-2 rounded-xl border border-violet-850">
              <Tv className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-200">Trình Chiếu & Kết Xuất Phim</h2>
              <p className="text-[10px] text-gray-500">Xem thử và xuất video tổng hợp từ dự án storyboard</p>
            </div>
          </div>

          {/* Preload Voice progress / button */}
          {currentProject.videoSaveDir && (
            <div className="flex items-center gap-2 bg-slate-950/60 border border-slate-900 px-3 py-1.5 rounded-xl ml-auto">
              <span className="text-[10px] text-slate-400 font-sans font-medium">Thuyết minh:</span>
              {preloadProgress.status === 'loading' ? (
                <div className="flex items-center gap-2">
                  <span className="animate-spin rounded-full h-3 w-3 border-2 border-t-transparent border-violet-400"></span>
                  <span className="text-[10px] font-mono text-violet-400 font-bold">
                    {preloadProgress.current}/{preloadProgress.total} ({preloadProgress.total > 0 ? Math.round((preloadProgress.current / preloadProgress.total) * 100) : 0}%)
                  </span>
                </div>
              ) : preloadProgress.status === 'completed' ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-950">
                    ĐÃ TẢI XONG ({preloadProgress.total}/{preloadProgress.total})
                  </span>
                  <button
                    onClick={handleLoadAndPreloadAll}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[9px] font-medium transition cursor-pointer"
                    title="Tải lại toàn bộ âm thanh"
                  >
                    Tải lại
                  </button>
                </div>
              ) : preloadProgress.status === 'error' ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-rose-400 font-bold bg-rose-950/30 px-2 py-0.5 rounded border border-rose-950">
                    LỖI TẢI ({preloadProgress.current}/{preloadProgress.total})
                  </span>
                  <button
                    onClick={handleLoadAndPreloadAll}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[9px] font-medium transition cursor-pointer"
                    title="Thử tải lại toàn bộ"
                  >
                    Thử lại
                  </button>
                </div>
              ) : voiceFiles.length === 0 ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-yellow-500 font-bold bg-yellow-950/30 px-2 py-0.5 rounded border border-yellow-950">
                    CHƯA TẢI
                  </span>
                  <button
                    onClick={handleLoadAndPreloadAll}
                    className="px-2.5 py-1 rounded-lg bg-violet-650 hover:bg-violet-550 text-white text-[10px] font-bold uppercase tracking-wider cursor-pointer active:scale-95 transition"
                  >
                    Tải toàn bộ
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 font-mono">
                    {voiceFiles.length} file
                  </span>
                  <button
                    onClick={handleLoadAndPreloadAll}
                    className="px-2.5 py-1 rounded-lg bg-violet-650 hover:bg-violet-550 text-white text-[10px] font-bold uppercase tracking-wider cursor-pointer active:scale-95 transition"
                  >
                    Tải toàn bộ
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => setShowExportConfig(true)}
            disabled={isExporting}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition select-none cursor-pointer shadow-lg active:scale-95 ${
              isExporting
                ? 'bg-slate-900 border border-gray-800 text-gray-400'
                : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white shadow-violet-950/20'
            }`}
          >
            {isExporting ? (
              <>
                <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-t-transparent border-gray-400"></span>
                Đang kết xuất...
              </>
            ) : (
              <>
                <Film className="w-4 h-4" />
                Xuất Phim Tổng Hợp (.mp4)
              </>
            )}
          </button>
        </div>
        
        {/* Cinematic Viewport Container */}
        <div 
          ref={playerContainerRef}
          style={{ containerType: 'inline-size' }}
          className={`relative aspect-video bg-black rounded-2xl overflow-hidden border border-gray-900 shadow-2xl flex items-center justify-center select-none group ${
            isFullscreen ? 'rounded-none border-0 w-screen h-screen' : ''
          }`}
        >
          {activeScene ? (
            activeScene.videoUrl ? (
              // Video Player
              <video
                key={activeScene.stt}
                ref={videoRef}
                src={activeScene.videoUrl}
                onLoadedMetadata={handleMetadataLoaded}
                onTimeUpdate={handleTimeUpdate}
                onEnded={handleVideoEnded}
                className="w-full h-full object-contain"
                muted={isVideoMuted}
                playsInline
              />
            ) : activeScene.imageUrl ? (
              // Static Image Fallback with Ken Burns zoom effect
              <div className="relative w-full h-full overflow-hidden flex items-center justify-center">
                <img
                  src={activeScene.imageUrl}
                  alt={`Scene ${activeScene.stt}`}
                  className={`w-full h-full object-contain ${
                    isPlaying ? 'animate-ken-burns' : ''
                  }`}
                />
                <div className="absolute top-4 left-4 bg-violet-950/80 backdrop-blur border border-violet-800/40 text-[10px] px-2.5 py-1 rounded-full text-violet-300 font-bold flex items-center gap-1.5 shadow">
                  <Sparkles className="w-3.5 h-3.5" />
                  Ảnh Tĩnh Fallback
                </div>
              </div>
            ) : (
              // Missing Assets State
              <div className="text-center p-6 text-gray-500 flex flex-col items-center gap-3">
                <Film className="w-12 h-12 text-gray-700 animate-bounce" />
                <div>
                  <p className="text-sm font-bold text-slate-400">Phân cảnh #{activeScene.stt} chưa được tạo ảnh hoặc video</p>
                  <p className="text-xs text-gray-600 mt-1">Trở lại Tab 5 & 6 để thiết kế và vẽ phân cảnh</p>
                </div>
              </div>
            )
          ) : null}

          {/* Subtitle Overlay Overlay */}
          <div className="absolute inset-0 pointer-events-none flex flex-col p-6 z-10">
            <div className={`w-full flex justify-center ${
              verticalAlign === 'top' 
                ? 'mt-4' 
                : verticalAlign === 'center' 
                ? 'my-auto' 
                : 'mb-4 mt-auto'
            }`}>
              {wrappedSubtitleText && (
                <div
                  style={subtitleStyle}
                  className="text-center font-bold tracking-wide max-w-[85%] whitespace-pre-wrap select-none shadow-2xl border border-white/5 backdrop-blur-[2px] transition-all"
                >
                  {wrappedSubtitleText}
                </div>
              )}
            </div>
          </div>

          {/* Projection Indicator (Top Right) */}
          {activeScene && (
            <div className="absolute top-4 right-4 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-gray-800/80 text-[10px] text-slate-300 font-mono font-medium flex items-center gap-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              SCENE {activeScene.index + 1}/{scenesInfo.length} (STT {activeScene.stt})
              {activeScene.videoUrl && (
                <span className="text-gray-500">
                  | Speed: {activePlaybackRate.toFixed(2)}x
                </span>
              )}
            </div>
          )}
        </div>

        {/* Media Player Controls Console */}
        <div className="glass-panel rounded-2xl border border-gray-800/50 p-4 flex flex-col gap-3">
          
          {/* Seekbar and Scene Indicators */}
          <div className="relative flex flex-col gap-1.5">
            
            {/* Split Grid Visual Timeline (Very premium detail) */}
            <div className="flex w-full h-1.5 rounded-full overflow-hidden bg-slate-900 border border-slate-950 select-none">
              {scenesInfo.map((scene, idx) => {
                const widthPercent = (scene.targetDuration / totalDuration) * 100;
                const isActive = activeScene?.stt === scene.stt;
                const hasVideo = !!scene.videoUrl;
                const hasImage = !!scene.imageUrl;

                return (
                  <div
                    key={scene.stt}
                    style={{ width: `${widthPercent}%` }}
                    onClick={() => selectScene(idx)}
                    className={`h-full cursor-pointer border-r border-slate-950/40 last:border-r-0 transition-all ${
                      isActive 
                        ? 'bg-violet-500 shadow-inner' 
                        : hasVideo 
                        ? 'bg-emerald-700/60 hover:bg-emerald-600'
                        : hasImage 
                        ? 'bg-blue-800/50 hover:bg-blue-700/70'
                        : 'bg-gray-800 hover:bg-gray-700'
                    }`}
                    title={`Phân cảnh ${scene.stt} (${scene.targetDuration.toFixed(1)}s)`}
                  />
                );
              })}
            </div>

            {/* BGM Visual Timeline Track */}
            {bgmSegmentsParsed.length > 0 && (
              <div className="flex w-full h-3 rounded-md overflow-hidden bg-slate-950/40 border border-slate-900/40 select-none">
                {bgmSegmentsParsed.map((bgm, idx) => {
                  const segmentDuration = bgm.end - bgm.start;
                  const widthPercent = (segmentDuration / (totalDuration || 1)) * 100;
                  const isActive = activeBgmSegment?.id === bgm.id;
                  
                  const fileExists = bgm.audioFile && bgmFiles.some((f: any) => f.name === bgm.audioFile);
                  let statusBg = 'bg-slate-900 text-slate-500';
                  let statusText = 'Thiếu tệp';
                  
                  if (!bgm.audioFile) {
                    statusBg = 'bg-amber-950/20 text-amber-500/80 hover:bg-amber-950/40 border-r border-slate-950/30';
                    statusText = 'Thiếu tệp';
                  } else if (!fileExists) {
                    statusBg = 'bg-red-950/25 text-red-450 hover:bg-red-950/40 border-r border-slate-950/30';
                    statusText = 'Không tìm thấy tệp';
                  } else {
                    if (isActive) {
                      if (bgmPlayerState === 'loading') {
                        statusBg = 'bg-blue-900/50 text-blue-300 animate-pulse border-r border-slate-950/30';
                        statusText = 'Đang tải...';
                      } else if (bgmPlayerState === 'error') {
                        statusBg = 'bg-red-900/50 text-red-300 border-r border-slate-950/30';
                        statusText = 'Lỗi tải tệp';
                      } else {
                        statusBg = 'bg-violet-750 text-violet-100 font-bold border border-violet-600/50 shadow-inner';
                        statusText = 'Đang phát';
                      }
                    } else {
                      statusBg = 'bg-teal-950/20 text-teal-400 hover:bg-teal-950/35 border-r border-slate-950/30';
                      statusText = 'Sẵn sàng';
                    }
                  }

                  return (
                    <div
                      key={bgm.id}
                      style={{ width: `${widthPercent}%` }}
                      className={`h-full cursor-pointer transition-all flex items-center justify-center text-[9px] font-mono font-semibold overflow-hidden px-1 ${statusBg}`}
                      onClick={() => handleSeekTo(bgm.start)}
                      title={`Nhạc nền: ${bgm.title || 'Đoạn BGM'} (${formatTime(bgm.start)} - ${formatTime(bgm.end)}) [${statusText}] - ${bgm.audioFile || 'Chưa gán file'}`}
                    >
                      <span className="truncate max-w-full">
                        {bgm.title || `BGM ${idx + 1}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Standard Seek Head Slider Overlay */}
            <input
              type="range"
              min={0}
              max={totalDuration || 1}
              step={0.05}
              value={currentTime}
              onMouseDown={() => setIsScrubbing(true)}
              onMouseUp={() => setIsScrubbing(false)}
              onChange={handleTimelineChange}
              className="w-full accent-violet-500 h-1 bg-transparent cursor-pointer rounded-lg appearance-none"
            />
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between gap-4">
            
            {/* Playback Timing Stats */}
            <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
              <span className="bg-slate-900 border border-slate-800 px-2 py-1 rounded text-slate-200">
                {formatTime(currentTime)}
              </span>
              <span>/</span>
              <span>{formatTime(totalDuration)}</span>
            </div>

            {/* Core Play controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevScene}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-900 border border-transparent hover:border-gray-800 transition cursor-pointer"
                title="Quay lại phân cảnh trước"
              >
                <SkipBack className="w-5 h-5" />
              </button>

              <button
                onClick={togglePlay}
                className={`p-3.5 rounded-full transition cursor-pointer shadow-lg transform active:scale-95 ${
                  isPlaying 
                    ? 'bg-slate-800 text-violet-400 border border-violet-900 hover:bg-slate-900' 
                    : 'bg-violet-600 text-white hover:bg-violet-500 hover:shadow-violet-950/20'
                }`}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-violet-400" /> : <Play className="w-5 h-5 fill-white" />}
              </button>

              <button
                onClick={handleNextScene}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-900 border border-transparent hover:border-gray-800 transition cursor-pointer"
                title="Bỏ qua đến phân cảnh sau"
              >
                <SkipForward className="w-5 h-5" />
              </button>
            </div>

            {/* Utility Options (Mute Voice, Mute Video, Fullscreen) */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-slate-950/60 p-1 rounded-xl border border-gray-900">
                {/* Voice Mute Button */}
                <button
                  onClick={() => setIsVoiceMuted(!isVoiceMuted)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border transition text-[10px] font-bold uppercase tracking-wider cursor-pointer ${
                    isVoiceMuted 
                      ? 'bg-red-950/40 text-red-400 border-red-950 hover:bg-red-950/60' 
                      : 'bg-violet-950/40 text-violet-400 border-violet-900 hover:bg-violet-950/60'
                  }`}
                  title={isVoiceMuted ? 'Bật âm thanh thuyết minh (Voice)' : 'Tắt âm thanh thuyết minh (Voice)'}
                >
                  {isVoiceMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 animate-pulse" />}
                  <span>Voice</span>
                </button>

                {/* Video Mute Button */}
                <button
                  onClick={() => setIsVideoMuted(!isVideoMuted)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border transition text-[10px] font-bold uppercase tracking-wider cursor-pointer ${
                    isVideoMuted 
                      ? 'bg-red-950/40 text-red-400 border-red-950 hover:bg-red-950/60' 
                      : 'bg-emerald-950/40 text-emerald-400 border-emerald-900 hover:bg-emerald-950/60'
                  }`}
                  title={isVideoMuted ? 'Bật âm thanh video gốc' : 'Tắt âm thanh video gốc'}
                >
                  {isVideoMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  <span>Video</span>
                </button>
              </div>

              <button
                onClick={toggleFullscreen}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-900 border border-transparent hover:border-gray-800 transition cursor-pointer"
                title="Xem toàn màn hình"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>

          </div>

        </div>

        {/* Current Active Scene Storyboard Card info */}
        {activeScene && (
          <div className="glass-panel rounded-2xl border border-gray-800/50 p-5 flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs bg-violet-900/60 text-violet-300 font-bold px-2 py-0.5 rounded border border-violet-850">
                  PHÂN CẢNH {activeScene.stt}
                </span>
                <span className="text-xs text-gray-500 font-mono">
                  {activeScene.timeRange}
                </span>
              </div>
              
              {/* Audio file info */}
              {activeSubtitle && subToVoiceMap[activeSubtitle.id] && (
                <div className="text-[10px] text-violet-400 font-mono bg-violet-950/40 border border-violet-900/40 px-2.5 py-0.5 rounded-lg flex items-center gap-1.5 max-w-[60%] truncate" title={pathGetFilename(subToVoiceMap[activeSubtitle.id].path)}>
                  <Volume2 className="w-3.5 h-3.5 text-violet-450 shrink-0" />
                  <span className="text-[9px] text-violet-500 font-bold mr-0.5">
                    {voiceBlobUrls[subToVoiceMap[activeSubtitle.id].path] 
                      ? '[BỘ NHỚ]' 
                      : voiceLoadingStatus === 'loading' 
                      ? '[ĐANG TẢI...]' 
                      : voiceLoadingStatus === 'error' 
                      ? '[LỖI TẢI]' 
                      : '[ĐÃ TẢI]'}
                  </span>
                  <span className="truncate">{pathGetFilename(subToVoiceMap[activeSubtitle.id].path)}</span>
                </div>
              )}
            </div>
            <h4 className="text-sm font-semibold text-slate-200 mt-1">
              Tình huống: {activeScene.mainSituation}
            </h4>
            {activeSubtitle && (
              <p className="text-xs text-slate-350 bg-slate-950/40 border border-slate-900 p-2.5 rounded-xl font-medium leading-relaxed">
                <span className="text-[10px] font-bold text-violet-400 uppercase tracking-wider block mb-1">Lời thoại hiện tại</span>
                "{activeSubtitle.text}"
              </p>
            )}
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed bg-slate-900/30 p-2.5 rounded-lg border border-slate-900">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Mô tả đạo diễn hình ảnh</span>
              {activeScene.sceneDescription}
            </p>
          </div>
        )}

      </div>

      {/* RIGHT: Subtitle Controls & Scene Selection List */}
      <div className="w-full xl:w-[440px] shrink-0 flex flex-col gap-6 overflow-hidden max-h-[78vh] xl:max-h-none">
        
        {/* Right Sidebar Tab Selector */}
        <div className="flex bg-slate-950 p-1 border border-gray-900 rounded-xl shrink-0">
          <button
            onClick={() => setSidebarTab('playlist')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all select-none cursor-pointer ${
              sidebarTab === 'playlist'
                ? 'bg-violet-650 text-white shadow'
                : 'text-gray-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            Playlist & Sub
          </button>
          <button
            onClick={() => setSidebarTab('bgm')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all select-none cursor-pointer ${
              sidebarTab === 'bgm'
                ? 'bg-violet-650 text-white shadow'
                : 'text-gray-400 hover:text-slate-200'
            }`}
          >
            <Music className="w-4 h-4" />
            Nhạc nền BGM
          </button>
        </div>

        {sidebarTab === 'playlist' && (
          <>
        
        {/* Subtitle Configuration Console */}
        <div className="glass-panel rounded-2xl border border-gray-800/50 p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2 border-b border-gray-900 pb-3">
            <Sliders className="w-4.5 h-4.5 text-violet-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Cấu hình Subtitle</h3>
          </div>

          <div className="flex flex-col gap-3.5 text-xs">
            
            {/* Font Family */}
            <div className="flex flex-col gap-1">
              <label className="text-gray-400 font-medium flex items-center gap-1.5">
                <Type className="w-3.5 h-3.5" />
                Kiểu chữ (Font Family)
              </label>
              <select
                value={fontFamily}
                onChange={(e) => updateSubStyle('fontFamily', e.target.value, setFontFamily)}
                className="bg-slate-950 border border-gray-800 rounded px-2.5 py-1.5 text-slate-300 outline-none focus:border-violet-600 transition"
              >
                <option value="sans-serif">Sans-Serif (Mặc định)</option>
                <option value="serif">Serif (Cổ điển)</option>
                <option value="monospace">Monospace (Lập trình)</option>
                <option value="'Outfit', sans-serif">Outfit (Tròn hiện đại)</option>
                <option value="'Inter', sans-serif">Inter (Thanh lịch)</option>
                <option value="cursive">Cursive (Bản thảo)</option>
              </select>
            </div>

            {/* Font Size */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-gray-400">
                <span className="font-medium">Kích thước (Font Size)</span>
                <span className="font-mono text-violet-400 font-semibold">{fontSize}px</span>
              </div>
              <input
                type="range"
                min={14}
                max={48}
                value={fontSize}
                onChange={(e) => updateSubStyle('fontSize', parseInt(e.target.value, 10), setFontSize)}
                className="w-full accent-violet-500 h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Colors picker grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-gray-400 font-medium">Màu chữ</label>
                <div className="flex items-center gap-1.5 bg-slate-950 border border-gray-800 rounded px-2 py-1">
                  <input
                    type="color"
                    value={textColor}
                    onChange={(e) => updateSubStyle('textColor', e.target.value, setTextColor)}
                    className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                  />
                  <span className="font-mono text-[10px] text-gray-500">{textColor}</span>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-gray-400 font-medium">Màu viền (Outline)</label>
                <div className="flex items-center gap-1.5 bg-slate-950 border border-gray-800 rounded px-2 py-1">
                  <input
                    type="color"
                    value={outlineColor}
                    onChange={(e) => updateSubStyle('outlineColor', e.target.value, setOutlineColor)}
                    className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                  />
                  <span className="font-mono text-[10px] text-gray-500">{outlineColor}</span>
                </div>
              </div>
            </div>

            {/* Outline Width */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-gray-400">
                <span className="font-medium">Độ dày viền (Stroke)</span>
                <span className="font-mono text-violet-400 font-semibold">{outlineWidth}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={6}
                value={outlineWidth}
                onChange={(e) => updateSubStyle('outlineWidth', parseInt(e.target.value, 10), setOutlineWidth)}
                className="w-full accent-violet-500 h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Background opacity box */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-gray-400">
                <span className="font-medium">Độ mờ hộp nền</span>
                <span className="font-mono text-violet-400 font-semibold">{Math.round(bgOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={bgOpacity * 100}
                onChange={(e) => updateSubStyle('bgOpacity', parseFloat(e.target.value) / 100, setBgOpacity)}
                className="w-full accent-violet-500 h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Max Line Length */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-gray-400">
                <span className="font-medium">Độ dài dòng tối đa</span>
                <span className="font-mono text-violet-400 font-semibold">{maxLineLength} ký tự</span>
              </div>
              <input
                type="range"
                min={20}
                max={60}
                value={maxLineLength}
                onChange={(e) => updateSubStyle('maxLineLength', parseInt(e.target.value, 10), setMaxLineLength)}
                className="w-full accent-violet-500 h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Max Words Per Subtitle */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-gray-400">
                <span className="font-medium">Từ tối đa / Sub (Tách câu)</span>
                <span className="font-mono text-violet-400 font-semibold">{maxWordsLimit} từ</span>
              </div>
              <input
                type="range"
                min={4}
                max={15}
                value={maxWordsLimit}
                onChange={(e) => updateSubStyle('maxWordsLimit', parseInt(e.target.value, 10), setMaxWordsLimit)}
                className="w-full accent-violet-500 h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Vertical Alignment */}
            <div className="flex flex-col gap-1">
              <label className="text-gray-400 font-medium flex items-center gap-1.5">
                <AlignJustify className="w-3.5 h-3.5" />
                Vị trí hiển thị (Alignment)
              </label>
              <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 border border-gray-900 rounded">
                {(['top', 'center', 'bottom'] as const).map((pos) => (
                  <button
                    key={pos}
                    onClick={() => updateSubStyle('verticalAlign', pos, setVerticalAlign)}
                    className={`py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition cursor-pointer ${
                      verticalAlign === pos 
                        ? 'bg-violet-600 text-white shadow' 
                        : 'text-gray-500 hover:text-slate-300 hover:bg-slate-900/40'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* Scene Playlist Panel */}
        <div className="flex-1 glass-panel rounded-2xl border border-gray-800/50 p-5 flex flex-col gap-3 overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-900 pb-3 shrink-0">
            <div className="flex items-center gap-2">
              <Tv className="w-4.5 h-4.5 text-violet-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Danh sách phân cảnh</h3>
            </div>
            <span className="text-[10px] bg-slate-900 text-slate-400 px-2 py-0.5 rounded-full border border-gray-800 font-mono font-medium">
              {scenesInfo.length} CẢNH
            </span>
          </div>

          {/* List Scroll */}
          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2">
            {scenesInfo.map((scene, idx) => {
              const isActive = activeScene?.stt === scene.stt;
              const hasVideo = !!scene.videoUrl;
              const hasImage = !!scene.imageUrl;

              return (
                <div
                  key={scene.stt}
                  onClick={() => selectScene(idx)}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer flex gap-3 items-center group relative ${
                    isActive 
                      ? 'bg-violet-950/20 border-violet-750/80 shadow-md shadow-violet-950/5' 
                      : 'bg-slate-900/30 border-gray-900 hover:bg-slate-900/60 hover:border-gray-800'
                  }`}
                >
                  {/* Thumbnail / Status icon */}
                  <div className="w-10 h-10 rounded-lg bg-slate-950 flex items-center justify-center shrink-0 border border-gray-850 overflow-hidden relative">
                    {hasImage ? (
                      <img 
                        src={scene.imageUrl} 
                        alt="" 
                        className="w-full h-full object-cover group-hover:scale-110 transition duration-300"
                      />
                    ) : (
                      <Film className="w-4.5 h-4.5 text-gray-700" />
                    )}
                    
                    {/* Media Type badge */}
                    {hasVideo && (
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                        <Play className="w-3.5 h-3.5 text-white fill-white" />
                      </div>
                    )}
                  </div>

                  {/* Metadata info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-[10px] font-bold tracking-wider ${isActive ? 'text-violet-400' : 'text-slate-400'}`}>
                        CẢNH {idx + 1}
                      </span>
                      <span className="text-[9px] text-gray-500 font-mono">
                        {scene.targetDuration.toFixed(1)}s
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 truncate mt-0.5">
                      {scene.mainSituation || 'Chưa cấu hình mô tả...'}
                    </p>
                  </div>

                  {/* Hover indicator */}
                  <div className={`shrink-0 transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    <ChevronRight className={`w-4 h-4 ${isActive ? 'text-violet-400' : 'text-gray-650'}`} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        </>
        )}

        {sidebarTab === 'bgm' && (
          <div className="flex-1 flex flex-col gap-6 overflow-hidden">
            {/* BGM Header & Volume */}
            <div className="glass-panel rounded-2xl border border-gray-800/50 p-5 flex flex-col gap-4 shrink-0">
              <div className="flex items-center justify-between border-b border-gray-900 pb-3">
                <div className="flex items-center gap-2">
                  <Music className="w-4.5 h-4.5 text-violet-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Nhạc nền BGM</h3>
                </div>
                {currentProject.bgmSuggestions && currentProject.bgmSuggestions.length > 0 && (
                  <button
                    onClick={generateBgmSuggestions}
                    disabled={isGeneratingBgmSuggestions}
                    className="text-[10px] text-violet-400 hover:text-violet-300 font-bold uppercase flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isGeneratingBgmSuggestions ? 'animate-spin' : ''}`} />
                    AI gợi ý lại
                  </button>
                )}
              </div>

              {/* BGM Volume dB Slider */}
              <div className="flex flex-col gap-2 bg-slate-950/40 p-3 rounded-xl border border-gray-900/60">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400 font-medium">Âm lượng BGM</span>
                  <span className="font-mono text-violet-400 font-bold">
                    {bgmVolumeDb <= -40 ? 'Tắt tiếng' : `${bgmVolumeDb} dB`}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={-40}
                    max={0}
                    step={1}
                    value={bgmVolumeDb}
                    onChange={(e) => setCurrentProjectField('bgmVolumeDb', parseInt(e.target.value, 10))}
                    className="flex-1 accent-violet-500 h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-[10px] text-gray-500 font-mono">0dB</span>
                </div>
              </div>
            </div>

            {/* suggestions list */}
            {(!currentProject.bgmSuggestions || currentProject.bgmSuggestions.length === 0) ? (
              <div className="flex-1 glass-panel rounded-2xl border border-gray-800/50 p-6 flex flex-col items-center justify-center text-center gap-4">
                <div className="p-4 rounded-full bg-slate-950 border border-gray-900 shadow-inner">
                  <Music className="w-10 h-10 text-gray-700" />
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase text-slate-350 tracking-wider">Chưa có gợi ý nhạc nền</h4>
                  <p className="text-[10px] text-gray-550 mt-1.5 leading-relaxed max-w-xs">
                    Hãy nhấn nút phía dưới để AI phân tích kịch bản hình ảnh và tự động chia timeline thành các khúc nhạc phù hợp với mạch truyện.
                  </p>
                </div>
                <button
                  onClick={generateBgmSuggestions}
                  disabled={isGeneratingBgmSuggestions}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-650 hover:bg-violet-555 disabled:bg-slate-900 disabled:text-gray-500 text-xs font-bold text-white transition active:scale-95 cursor-pointer shadow-lg shadow-violet-950/20"
                >
                  {isGeneratingBgmSuggestions ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Đang phân tích kịch bản...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      AI gợi ý nhạc nền
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="flex-1 glass-panel rounded-2xl border border-gray-800/50 p-5 flex flex-col gap-3 overflow-hidden">
                <div className="flex items-center justify-between border-b border-gray-900 pb-2.5 shrink-0 text-[10px]">
                  <span className="text-gray-400 font-mono">
                    Thư mục bgm/: <strong className="text-violet-400">{bgmFiles.length} file</strong>
                  </span>
                  <button
                    onClick={scanLocalBgmFiles}
                    className="text-gray-500 hover:text-slate-300 flex items-center gap-1 font-semibold uppercase cursor-pointer"
                  >
                    <RefreshCw className="w-2.5 h-2.5" /> Quét lại
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-4">
                  {currentProject.bgmSuggestions.map((row, idx) => {
                    const isActive = activeBgmSegment?.id === row.id;
                    return (
                      <BgmSegmentCard
                        key={row.id}
                        row={row}
                        idx={idx}
                        isActive={isActive}
                        bgmFiles={bgmFiles}
                        updateBgmSuggestionCell={updateBgmSuggestionCell}
                        regenerateBgmPrompt={regenerateBgmPrompt}
                        bgmPlayerState={bgmPlayerState}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Export Configuration Modal */}
      {showExportConfig && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 border border-slate-850 rounded-2xl p-6 shadow-2xl space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-100 uppercase tracking-wider">Cấu hình Xuất Phim Chuyên Nghiệp</h3>
              <p className="text-xs text-gray-500 mt-1">Cấu hình định dạng ghép nối hình ảnh, video và thuyết minh.</p>
            </div>

            {/* Video Type Input */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Kiểu video xuất ra</label>
              <select
                value={videoType}
                onChange={(e) => setVideoType(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 px-3.5 py-2.5 focus:outline-none focus:border-violet-500 cursor-pointer"
              >
                <option value="mixed">Vừa ảnh vừa video (Ưu tiên video, tự động xen ảnh nếu thiếu)</option>
                <option value="images_only">Chỉ dùng hình ảnh (Video toàn ảnh)</option>
                <option value="videos_only">Chỉ dùng video (Video toàn video)</option>
              </select>
            </div>

            {/* Subtitle Checkbox */}
            <div className="flex items-center gap-3 bg-slate-950/40 p-3.5 rounded-xl border border-slate-900/60">
              <input
                type="checkbox"
                id="burnSubtitlesCheckbox"
                checked={burnSubtitles}
                onChange={(e) => setBurnSubtitles(e.target.checked)}
                className="w-4 h-4 accent-violet-600 rounded bg-slate-950 border border-slate-850 cursor-pointer"
              />
              <label htmlFor="burnSubtitlesCheckbox" className="text-xs font-bold text-slate-350 cursor-pointer select-none">
                Ghép cứng phụ đề (Burn subtitles vào video)
              </label>
            </div>

            {/* Voice Directory Input */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider font-sans">Thư mục âm thanh thuyết minh (MP3 Voice)</label>
              <input
                type="text"
                readOnly
                value={voiceDir || 'Vui lòng thiết lập "Thư mục lưu video trên máy tính" trong tab Cấu hình dự án trước!'}
                className="w-full bg-slate-950/50 border border-slate-900 rounded-lg text-xs text-slate-400 px-3.5 py-2.5 focus:outline-none font-mono"
              />
              <p className="text-[10px] text-slate-500 italic leading-relaxed font-sans">
                * Thư mục âm thanh thuyết minh được tự động cấu hình tại đường dẫn con <code className="bg-slate-950 px-1 py-0.5 rounded font-mono text-[9px] text-violet-400">\\voice</code> của dự án. Hệ thống sẽ tự động ghép nối 1-1 các tệp tin âm thanh theo thứ tự tương ứng.
              </p>
            </div>

            {/* Validation Panel */}
            <div className="space-y-2 border-t border-slate-800/80 pt-3">
              <div className="flex justify-between items-center">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Kiểm tra tài nguyên</label>
                <button
                  type="button"
                  onClick={() => validateAssets(videoType)}
                  disabled={validationStatus.isValidating}
                  className="text-[10px] text-violet-400 hover:text-violet-300 font-bold uppercase transition disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${validationStatus.isValidating ? 'animate-spin' : ''}`} />
                  Quét lại
                </button>
              </div>

              {validationStatus.isValidating ? (
                <div className="flex items-center gap-2 p-3 bg-slate-950/40 border border-slate-900 rounded-xl">
                  <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-t-transparent border-violet-400"></span>
                  <span className="text-xs text-slate-400">Đang quét thư mục & kiểm tra file trên máy tính...</span>
                </div>
              ) : validationStatus.success === true ? (
                <div className="p-3 bg-emerald-950/30 border border-emerald-900/40 rounded-xl flex items-center gap-2">
                  <span className="text-emerald-400 text-xs font-bold font-sans">✓ Sẵn sàng: đầy đủ voice, bgm và hình ảnh/video!</span>
                </div>
              ) : validationStatus.success === false ? (
                <div className="p-3 bg-red-950/30 border border-red-900/45 rounded-xl space-y-1.5 max-h-36 overflow-y-auto">
                  <span className="text-red-405 text-xs font-bold block mb-1">✗ Thiếu dữ liệu (Chưa sẵn sàng):</span>
                  {validationStatus.errors.map((err, i) => (
                    <div key={i} className="text-[10px] text-slate-300 font-sans leading-normal whitespace-pre-line border-b border-red-900/10 pb-1.5 last:border-0 last:pb-0">
                      {err}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 bg-slate-950/40 border border-slate-900 rounded-xl text-xs text-slate-500">
                  Đang tải trạng thái...
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowExportConfig(false)}
                className="bg-transparent hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-bold px-4 py-2 rounded-xl transition cursor-pointer border border-transparent hover:border-slate-700"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={validationStatus.success !== true || isExporting}
                onClick={() => {
                  setShowExportConfig(false);
                  handleExportVideo(videoType, voiceDir);
                }}
                className={`text-xs font-bold px-5 py-2 rounded-xl shadow-lg transition select-none flex items-center gap-1.5 ${
                  validationStatus.success === true && !isExporting
                    ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white cursor-pointer active:scale-95'
                    : 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                Generate Video Pro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Cinematic Overlay Modal for Video Export */}
      {exportProgress.status !== 'idle' && (
        <div className="fixed inset-0 z-[9999] bg-[#030712]/96 backdrop-blur-2xl flex items-center justify-center p-6 select-none transition-all duration-500">
          <div className="max-w-lg w-full glass-panel border border-gray-800/80 rounded-3xl p-8 flex flex-col items-center shadow-2xl relative overflow-hidden animate-in fade-in zoom-in duration-300">
            
            {/* Ambient Lighting Accents */}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-fuchsia-600/10 rounded-full blur-3xl pointer-events-none" />
            
            {/* Status Icons */}
            {exportProgress.status === 'completed' ? (
              <div className="w-20 h-20 bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-emerald-950/20">
                <svg className="w-10 h-10 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ) : exportProgress.status === 'failed' ? (
              <div className="w-20 h-20 bg-red-950/60 border border-red-500/30 text-red-400 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-red-950/20">
                <svg className="w-10 h-10 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            ) : (
              <div className="relative w-24 h-24 flex items-center justify-center mb-6">
                <div className="absolute inset-0 rounded-full border-4 border-violet-500/20" />
                <div className="absolute inset-0 rounded-full border-4 border-t-violet-500 border-r-fuchsia-500 border-b-transparent border-l-transparent animate-spin" />
                <Film className="w-9 h-9 text-violet-400 animate-pulse" />
              </div>
            )}

            {/* Header Text */}
            <h3 className="text-base font-bold text-slate-100 tracking-wider text-center uppercase">
              {exportProgress.status === 'completed' 
                ? 'Kết Xuất Phim Thành Công!' 
                : exportProgress.status === 'failed' 
                ? 'Biên Dịch Thất Bại' 
                : 'Đang Biên Dịch Video'}
            </h3>
            
            <p className={`text-xs text-center mt-2 px-4 leading-relaxed font-medium whitespace-pre-wrap ${
              exportProgress.status === 'failed' 
                ? 'text-red-400 bg-red-950/20 border border-red-950/60 p-3 rounded-lg text-left font-mono font-medium' 
                : 'text-slate-400'
            }`}>
              {exportProgress.message}
            </p>

            {/* Render Progress Bar */}
            {exportProgress.status !== 'completed' && exportProgress.status !== 'failed' && (
              <div className="w-full mt-6 flex flex-col gap-2">
                <div className="w-full h-2.5 bg-slate-950 border border-slate-900 rounded-full overflow-hidden relative">
                  <div 
                    style={{ width: `${exportProgress.percent}%` }}
                    className="h-full bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-full transition-all duration-300 relative"
                  >
                    <div className="absolute inset-0 bg-white/10 animate-pulse" />
                  </div>
                </div>
                <div className="flex justify-between text-[10px] font-mono text-gray-500 mt-1 px-1">
                  <span>Tiến trình hoàn thiện</span>
                  <span className="text-violet-400 font-bold">{exportProgress.percent}%</span>
                </div>
              </div>
            )}

            {/* Console Log Terminal */}
            <div className="w-full mt-5 bg-slate-950/90 border border-slate-900 rounded-xl p-3.5 h-36 flex flex-col gap-1 overflow-y-auto text-[10px] font-mono text-slate-500 scroll-smooth">
              <div className="text-violet-400/80 border-b border-slate-900 pb-1.5 mb-1.5 uppercase font-bold tracking-wider flex justify-between shrink-0">
                <span>Nhật ký render (Console Logs)</span>
                <span className="animate-pulse flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500"></span>
                  LIVE
                </span>
              </div>
              <div className="flex-1 flex flex-col gap-0.5">
                {exportProgress.logs.map((log, idx) => (
                  <div key={idx} className="whitespace-pre-wrap break-all leading-normal text-slate-400 font-mono">
                    <span className="text-gray-700 mr-2">[{idx+1}]</span>
                    {log}
                  </div>
                ))}
                {exportProgress.logs.length === 0 && (
                  <div className="text-gray-700 italic">Đang chờ tín hiệu luồng...</div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            {exportProgress.status === 'completed' && (
              <div className="w-full mt-6 flex flex-col gap-3">
                <div className="bg-slate-950/60 border border-slate-900 rounded-2xl p-4 text-[10px] font-mono text-slate-400 select-all break-all leading-normal">
                  <span className="text-[9px] uppercase font-bold text-violet-400 block mb-1">Đường dẫn tệp video</span>
                  {exportProgress.filePath}
                </div>
                
                <button
                  onClick={() => setExportProgress(prev => ({ ...prev, status: 'idle' }))}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-slate-200 border border-gray-800 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer select-none active:scale-95 text-center"
                >
                  Đóng
                </button>
              </div>
            )}

            {exportProgress.status === 'failed' && (
              <div className="w-full mt-6">
                <button
                  onClick={() => setExportProgress(prev => ({ ...prev, status: 'idle' }))}
                  className="w-full bg-red-950/40 text-red-400 border border-red-950 hover:bg-red-950/60 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer select-none active:scale-95 text-center"
                >
                  Quay lại sửa lỗi
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      <FolderPickerModal
        isOpen={isFolderPickerOpen}
        onClose={() => setIsFolderPickerOpen(false)}
        onSelect={handleFolderSelectConfirm}
        initialPath={voiceDir}
        title="Chọn thư mục âm thanh thuyết minh (MP3)"
      />

    </div>
  );
}
