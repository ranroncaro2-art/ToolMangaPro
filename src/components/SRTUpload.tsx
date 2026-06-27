import React, { useRef, useState, useEffect } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import FolderPickerModal from './FolderPickerModal';
import { Upload, FileText, Clock, Sparkles, CheckCircle2, AlertTriangle, Play, Palette, Settings, Plus, Trash2, Save, Download, FolderOpen, RefreshCw, Volume2, Search, Check, X, Headphones, Sliders } from 'lucide-react';
import { parseSRT, matchScriptWithSrt } from '../lib/srtParser';
import { getSpeakerCategory } from '../lib/voiceHelper';

export default function SRTUpload({ onNextTab }: { onNextTab: () => void }) {
  const {
    currentProject,
    setSrtContent,
    apiConfig,
    generateSceneMapping,
    isGeneratingSceneMapping,
    generateAllMappingAndPrompts,
    isGeneratingImagePrompts,
    generateCombo2,
    generateFullCombo,
    isGeneratingAssets,
    isGeneratingCombo1,
    isGeneratingCombo2,
    isGeneratingFullCombo,
    cancelSceneMapping,
    cancelImagePrompts,
    cancelCombo1,
    cancelCombo2,
    cancelFullCombo,
    targetDuration,
    setTargetDuration,
    styles = [],
    setSelectedStyleId,
    addStyle,
    updateStyle,
    deleteStyle,
    setCurrentProjectField,
    isGeneratingVoice,
    voiceProgress,
    setIsGeneratingVoice,
    setVoiceProgress
  } = useProjectStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scriptFileInputRef = useRef<HTMLInputElement>(null);
  const voiceConfigInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);
  const [scriptText, setScriptText] = useState('');

  // Mode 2 local states
  const [workflowMode, setWorkflowMode] = useState<'mode1' | 'mode2'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('workflow_mode') as 'mode1' | 'mode2') || 'mode1';
    }
    return 'mode1';
  });

  const [engineUrl, setEngineUrl] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('voice_engine_url') || 'http://127.0.0.1:50021';
    }
    return 'http://127.0.0.1:50021';
  });

  const [aivisUrl, setAivisUrl] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('aivis_engine_url') || 'http://127.0.0.1:10101';
    }
    return 'http://127.0.0.1:10101';
  });

  const [voicevoxUrl, setVoicevoxUrl] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('voice_vox_engine_url') || 'http://127.0.0.1:50021';
    }
    return 'http://127.0.0.1:50021';
  });

  const [aivisStatus, setAivisStatus] = useState<'checking' | 'active' | 'inactive'>('checking');
  const [voicevoxStatus, setVoicevoxStatus] = useState<'checking' | 'active' | 'inactive'>('checking');
  const [aivisSpeakers, setAivisSpeakers] = useState<any[]>([]);
  const [voicevoxSpeakers, setVoicevoxSpeakers] = useState<any[]>([]);
  const [activeEngineTab, setActiveEngineTab] = useState<'aivis' | 'voicevox'>('aivis');
  const [isScanning, setIsScanning] = useState(false);

  const [speakers, setSpeakers] = useState<any[]>([]);
  const [speakerId, setSpeakerId] = useState<number | string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('voice_speaker_id');
      if (saved) {
        return saved.includes('|') ? saved : Number(saved);
      }
      return 0;
    }
    return 0;
  });

  const [speedScale, setSpeedScale] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return Number(localStorage.getItem('voice_speed_scale') || 1.0);
    }
    return 1.0;
  });

  const [pitchScale, setPitchScale] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return Number(localStorage.getItem('voice_pitch_scale') || 0.0);
    }
    return 0.0;
  });

  const [intonationScale, setIntonationScale] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return Number(localStorage.getItem('voice_intonation_scale') || 1.0);
    }
    return 1.0;
  });

  const [volumeScale, setVolumeScale] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return Number(localStorage.getItem('voice_volume_scale') || 1.0);
    }
    return 1.0;
  });

  const [gapSeconds, setGapSeconds] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return Number(localStorage.getItem('voice_gap_seconds') || 0.2);
    }
    return 0.2;
  });

  const [isFetchingSpeakers, setIsFetchingSpeakers] = useState(false);
  const [speakersError, setSpeakersError] = useState('');

  const [scriptMode, setScriptMode] = useState<'single' | 'multi'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('voice_script_mode') as 'single' | 'multi') || 'single';
    }
    return 'single';
  });

  const [detectedCharacters, setDetectedCharacters] = useState<string[]>([]);
  const [charVoiceMap, setCharVoiceMap] = useState<Record<string, number | string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('voice_char_voice_map');
        return saved ? JSON.parse(saved) : {};
      } catch (_) {
        return {};
      }
    }
    return {};
  });

  const [characterDetailsText, setCharacterDetailsText] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('voice_char_details_text') || '';
    }
    return '';
  });
  const [isAssigningVoices, setIsAssigningVoices] = useState(false);
  const [playingSampleId, setPlayingSampleId] = useState<number | string | null>(null);
  const [sampleAudio, setSampleAudio] = useState<HTMLAudioElement | null>(null);

  // Voice Catalog Modal states
  const [showVoiceCatalogModal, setShowVoiceCatalogModal] = useState<boolean>(false);
  const [voiceCatalogTarget, setVoiceCatalogTarget] = useState<{ type: 'main' } | { type: 'char'; charName: string } | null>(null);
  const [searchVoiceQuery, setSearchVoiceQuery] = useState<string>('');
  const [activeCatalogTab, setActiveCatalogTab] = useState<string>('All');

  const playSpeakerSample = async (id: number | string) => {
    if (sampleAudio) {
      sampleAudio.pause();
      setSampleAudio(null);
      if (playingSampleId === id) {
        setPlayingSampleId(null);
        return;
      }
    }

    setPlayingSampleId(id);

    // Parse target engine URL and actual speaker ID if encoded
    let targetId = id;
    let targetEngineUrl = engineUrl;
    if (typeof id === 'string' && id.includes('|')) {
      const parts = id.split('|');
      targetEngineUrl = parts[0];
      targetId = parts[1];
    }

    const audioUrl = `/api/video/voice/sample?speakerId=${encodeURIComponent(targetId)}&engineUrl=${encodeURIComponent(targetEngineUrl)}`;
    const audio = new Audio(audioUrl);
    
    audio.onended = () => {
      setPlayingSampleId(null);
      setSampleAudio(null);
    };

    audio.onerror = (e) => {
      console.error('Audio play error:', e);
      alert('Không thể phát thử giọng đọc này. Hãy chắc chắn local engine đang chạy.');
      setPlayingSampleId(null);
      setSampleAudio(null);
    };

    try {
      await audio.play();
      setSampleAudio(audio);
    } catch (err: any) {
      console.error(err);
      setPlayingSampleId(null);
      setSampleAudio(null);
    }
  };

  const handleExtractCharacters = () => {
    if (!scriptText.trim()) {
      alert('Vui lòng nhập kịch bản trước khi lọc nhân vật!');
      return;
    }
    
    const lines = scriptText.split('\n');
    const charsSet = new Set<string>();
    const speakerRegex = /^([^:：()（）「」\n\r]+)\s*[:：]/;
    let hasNarrator = false;
    
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const match = trimmed.match(speakerRegex);
      if (match) {
        const name = match[1].trim();
        if (name && name.length > 0 && name.length <= 25) {
          charsSet.add(name);
        }
      } else {
        hasNarrator = true;
      }
    });

    const uniqueChars = Array.from(charsSet).slice(0, 20); // Max 20 characters
    if (hasNarrator) {
      uniqueChars.unshift('Narrator');
    }
    setDetectedCharacters(uniqueChars);

    const updatedMap = { ...charVoiceMap };
    uniqueChars.forEach(char => {
      if (updatedMap[char] === undefined) {
        updatedMap[char] = speakerId;
      }
    });
    setCharVoiceMap(updatedMap);
    localStorage.setItem('voice_char_voice_map', JSON.stringify(updatedMap));
    
    alert(`Đã tìm thấy ${uniqueChars.length} nhân vật trong kịch bản!${hasNarrator ? ' (Bao gồm người dẫn chuyện - Narrator)' : ''}`);
  };

  const handleAiAssignVoices = async () => {
    const keyToUse = apiConfig.apiKeyFree || apiConfig.apiKey;
    if (!keyToUse) {
      alert('Vui lòng nhập API Key (hoặc API Key Free) trong phần cấu hình chung góc trên bên phải trước!');
      return;
    }
    if (detectedCharacters.length === 0) {
      alert('Vui lòng lọc nhân vật trong kịch bản trước!');
      return;
    }
    if (!characterDetailsText.trim()) {
      alert('Vui lòng nhập/dán danh sách mô tả chi tiết nhân vật trước!');
      return;
    }

    setIsAssigningVoices(true);
    try {
      const voiceOptions: any[] = [];

      // Collect Aivis speakers if active
      if (aivisStatus === 'active' && aivisSpeakers.length > 0) {
        aivisSpeakers.forEach((s: any) => {
          (s.styles || []).forEach((st: any) => {
            const cat = getSpeakerCategory(s.name);
            voiceOptions.push({
              id: `${aivisUrl}|${st.id}`,
              speakerName: `[Aivis] ${s.name}`,
              styleName: st.name,
              characteristics: cat.desc,
              group: cat.group
            });
          });
        });
      }

      // Collect Voicevox speakers if active
      if (voicevoxStatus === 'active' && voicevoxSpeakers.length > 0) {
        voicevoxSpeakers.forEach((s: any) => {
          (s.styles || []).forEach((st: any) => {
            const cat = getSpeakerCategory(s.name);
            voiceOptions.push({
              id: `${voicevoxUrl}|${st.id}`,
              speakerName: `[Voicevox] ${s.name}`,
              styleName: st.name,
              characteristics: cat.desc,
              group: cat.group
            });
          });
        });
      }

      if (voiceOptions.length === 0) {
        throw new Error('Không có local engine nào đang hoạt động. Vui lòng bật Aivis Speech hoặc Voicevox và quét lại!');
      }

      const prompt = `
Bạn là một chuyên gia hỗ trợ gán giọng đọc AI cho kịch bản truyện tranh/phim.
Nhiệm vụ của bạn là gán giọng đọc phù hợp cho danh sách các nhân vật được phát hiện trong kịch bản.

1. Danh sách nhân vật phát hiện được trong kịch bản (cần được gán giọng):
${JSON.stringify(detectedCharacters)}

2. Thông tin mô tả chi tiết về nhân vật (để tham khảo giới tính, độ tuổi, vai trò, tính cách):
${characterDetailsText}

3. Danh sách giọng đọc AI sẵn có (mỗi giọng đọc có ID dạng "[URL]|[ID]" và đặc điểm):
${JSON.stringify(voiceOptions)}

Quy tắc gán giọng:
- Người dẫn chuyện (Narrator) hoặc các câu tự sự không có nhân vật nói thì thường dùng giọng Nam Trung niên/Trưởng thành ấm áp, điềm đạm (ví dụ: nhóm male_adult) hoặc giọng Nữ Trung niên (ví dụ: nhóm female_adult).
- Phân tích giới tính, độ tuổi (thiếu niên, thanh niên, trung niên, người già), tính cách (lạnh lùng, dịu dàng, phản diện, v.v.) của nhân vật dựa vào thông tin mô tả chi tiết để chọn nhóm giọng tương ứng.
- Nếu tên nhân vật phát hiện trong kịch bản là vai chính thì phải gán giọng tương ứng của vai chính đó.
- Các nhân vật phụ hoặc quần chúng có thể gán trùng giọng với nhau để tiết kiệm.
- Hãy cố gắng chọn các giọng đọc khác nhau cho các nhân vật chính đối thoại với nhau để phân biệt rõ vai.

Hãy trả về kết quả duy nhất dưới dạng JSON key-value, trong đó Key là tên nhân vật được phát hiện trong kịch bản, và Value là ID của giọng đọc (kiểu chuỗi, chính xác là giá trị "id" trong danh sách giọng sẵn có ở trên). Không viết thêm bất kỳ dòng giải thích nào khác ngoài JSON.
Ví dụ:
{
  "Narrator": "http://127.0.0.1:10101|2",
  "俺": "http://127.0.0.1:50021|5",
  "アオイ": "http://127.0.0.1:10101|7"
}
`;

      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: 'gemini',
          apiKey: keyToUse,
          modelName: 'gemini-2.5-flash',
          prompt: prompt,
          responseFormat: 'json'
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      let mapping: Record<string, any> = {};
      try {
        mapping = typeof data.text === 'string' ? JSON.parse(data.text) : data.text;
      } catch (e) {
        const jsonMatch = data.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          mapping = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('AI không trả về đúng định dạng JSON ánh xạ.');
        }
      }

      const updatedMap = { ...charVoiceMap };
      Object.keys(mapping).forEach(char => {
        const val = mapping[char];
        if (val !== undefined && val !== null) {
          updatedMap[char] = typeof val === 'number' ? String(val) : val;
        }
      });
      setCharVoiceMap(updatedMap);
      localStorage.setItem('voice_char_voice_map', JSON.stringify(updatedMap));

      alert('AI đã tự động gán giọng cho các nhân vật thành công!');
    } catch (err: any) {
      console.error(err);
      alert(`Lỗi khi AI tự động gán giọng: ${err.message}`);
    } finally {
      setIsAssigningVoices(false);
    }
  };

  const getCharacterSpeakerLabel = (char: string) => {
    const currentVal = charVoiceMap[char] !== undefined ? charVoiceMap[char] : speakerId;
    let targetId = currentVal;
    let targetUrl = '';
    if (typeof targetId === 'string' && targetId.includes('|')) {
      const parts = targetId.split('|');
      targetUrl = parts[0];
      targetId = Number(parts[1]);
    } else {
      targetId = Number(targetId);
    }

    const findSpeaker = (list: any[]) => {
      for (const s of list) {
        const matchStyle = s.styles?.find((st: any) => st.id === targetId);
        if (matchStyle) return { speaker: s, style: matchStyle };
      }
      return null;
    };

    const aivisMatch = findSpeaker(aivisSpeakers);
    if (aivisMatch) {
      return `${aivisMatch.speaker.name} (${aivisMatch.style.name})`;
    }

    const voicevoxMatch = findSpeaker(voicevoxSpeakers);
    if (voicevoxMatch) {
      return `${voicevoxMatch.speaker.name} (${voicevoxMatch.style.name})`;
    }

    return "Bấm chọn giọng...";
  };

  const scanBothEngines = async () => {
    setIsScanning(true);
    setIsFetchingSpeakers(true);
    setSpeakersError('');
    
    // 1. Scan Aivis Speech
    let aivisSuccess = false;
    let tempAivisSpeakers: any[] = [];
    try {
      const res = await fetch(`/api/video/voice/speakers?engineUrl=${encodeURIComponent(aivisUrl)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.speakers) {
          setAivisSpeakers(data.speakers);
          setAivisStatus('active');
          tempAivisSpeakers = data.speakers;
          aivisSuccess = true;
        } else {
          setAivisStatus('inactive');
          setAivisSpeakers([]);
        }
      } else {
        setAivisStatus('inactive');
        setAivisSpeakers([]);
      }
    } catch (err) {
      setAivisStatus('inactive');
      setAivisSpeakers([]);
    }

    // 2. Scan Voicevox
    let voicevoxSuccess = false;
    let tempVoicevoxSpeakers: any[] = [];
    try {
      const res = await fetch(`/api/video/voice/speakers?engineUrl=${encodeURIComponent(voicevoxUrl)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.speakers) {
          setVoicevoxSpeakers(data.speakers);
          setVoicevoxStatus('active');
          tempVoicevoxSpeakers = data.speakers;
          voicevoxSuccess = true;
        } else {
          setVoicevoxStatus('inactive');
          setVoicevoxSpeakers([]);
        }
      } else {
        setVoicevoxStatus('inactive');
        setVoicevoxSpeakers([]);
      }
    } catch (err) {
      setVoicevoxStatus('inactive');
      setVoicevoxSpeakers([]);
    }

    // Combine for compatibility
    const combined = [...tempAivisSpeakers, ...tempVoicevoxSpeakers];
    setSpeakers(combined);

    // If speakerId is not set or not valid, set a default
    if (combined.length > 0) {
      let isValid = false;
      const parsedId = typeof speakerId === 'string' && speakerId.includes('|') 
        ? Number(speakerId.split('|')[1]) 
        : Number(speakerId);

      const parsedUrl = typeof speakerId === 'string' && speakerId.includes('|') 
        ? speakerId.split('|')[0] 
        : '';

      if (parsedUrl) {
        const targetList = parsedUrl.includes('10101') || parsedUrl === aivisUrl ? tempAivisSpeakers : tempVoicevoxSpeakers;
        isValid = targetList.some((s: any) => (s.styles || []).some((st: any) => st.id === parsedId));
      } else {
        isValid = combined.some((s: any) => (s.styles || []).some((st: any) => st.id === parsedId));
      }

      if (!isValid) {
        if (aivisSuccess && tempAivisSpeakers.length > 0) {
          const firstStyle = tempAivisSpeakers[0].styles?.[0]?.id;
          if (firstStyle !== undefined) {
            const enc = `${aivisUrl}|${firstStyle}`;
            setSpeakerId(enc);
            localStorage.setItem('voice_speaker_id', enc);
          }
        } else if (voicevoxSuccess && tempVoicevoxSpeakers.length > 0) {
          const firstStyle = tempVoicevoxSpeakers[0].styles?.[0]?.id;
          if (firstStyle !== undefined) {
            const enc = `${voicevoxUrl}|${firstStyle}`;
            setSpeakerId(enc);
            localStorage.setItem('voice_speaker_id', enc);
          }
        }
      }
    }

    if (!aivisSuccess && !voicevoxSuccess) {
      setSpeakersError('Không thể kết nối đến cả Aivis Speech và Voicevox. Vui lòng kiểm tra lại trạng thái các local engine.');
    }
    
    setIsScanning(false);
    setIsFetchingSpeakers(false);
  };

  useEffect(() => {
    if (workflowMode === 'mode2') {
      scanBothEngines();
    }
  }, [workflowMode]);

  const handleExportVoiceConfig = () => {
    const config = {
      charVoiceMap,
      characterDetailsText,
      scriptMode,
      speakerId,
      speedScale,
      pitchScale,
      intonationScale,
      volumeScale,
      gapSeconds,
      targetDuration,
      detectedCharacters
    };
    
    const file = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const element = document.createElement("a");
    element.href = URL.createObjectURL(file);
    element.download = `${currentProject.name || 'script'}_voice_config.json`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleImportVoiceConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const config = JSON.parse(evt.target?.result as string);
          
          if (config.charVoiceMap !== undefined) {
            setCharVoiceMap(config.charVoiceMap);
            localStorage.setItem('voice_char_voice_map', JSON.stringify(config.charVoiceMap));
          }
          if (config.characterDetailsText !== undefined) {
            setCharacterDetailsText(config.characterDetailsText);
            localStorage.setItem('voice_char_details_text', config.characterDetailsText);
          }
          if (config.scriptMode !== undefined) {
            setScriptMode(config.scriptMode);
            localStorage.setItem('voice_script_mode', config.scriptMode);
          }
          if (config.speakerId !== undefined) {
            setSpeakerId(Number(config.speakerId));
            localStorage.setItem('voice_speaker_id', String(config.speakerId));
          }
          if (config.speedScale !== undefined) {
            setSpeedScale(Number(config.speedScale));
            localStorage.setItem('voice_speed_scale', String(config.speedScale));
          }
          if (config.pitchScale !== undefined) {
            setPitchScale(Number(config.pitchScale));
            localStorage.setItem('voice_pitch_scale', String(config.pitchScale));
          }
          if (config.intonationScale !== undefined) {
            setIntonationScale(Number(config.intonationScale));
            localStorage.setItem('voice_intonation_scale', String(config.intonationScale));
          }
          if (config.volumeScale !== undefined) {
            setVolumeScale(Number(config.volumeScale));
            localStorage.setItem('voice_volume_scale', String(config.volumeScale));
          }
          if (config.gapSeconds !== undefined) {
            setGapSeconds(Number(config.gapSeconds));
            localStorage.setItem('voice_gap_seconds', String(config.gapSeconds));
          }
          if (config.targetDuration !== undefined) {
            setTargetDuration(Number(config.targetDuration));
          }
          if (config.detectedCharacters !== undefined) {
            setDetectedCharacters(config.detectedCharacters);
          } else if (config.charVoiceMap) {
            setDetectedCharacters(Object.keys(config.charVoiceMap));
          }
          
          alert('Nhập cấu hình giọng nói thành công!');
        } catch (err) {
          console.error(err);
          alert('Tệp cấu hình không hợp lệ hoặc bị lỗi!');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    }
  };

  const handleGenerateVoiceAndSrt = async () => {
    if (!scriptText.trim()) {
      alert('Vui lòng nhập hoặc dán kịch bản kịch bản trước!');
      return;
    }
    if (!currentProject.videoSaveDir) {
      alert('Vui lòng cấu hình thư mục lưu video trên máy tính ở phần bên dưới trước để làm đường dẫn lưu tệp Voice!');
      return;
    }

    if (currentProject.sceneMapping && currentProject.sceneMapping.length > 0) {
      const confirmReset = confirm(
        'Cảnh báo: Sinh phụ đề và voice mới từ kịch bản sẽ đặt lại dữ liệu phân cảnh (Scene Mapping) và các prompt hiện tại. Bạn có muốn tiếp tục?'
      );
      if (!confirmReset) return;
    }

    setIsGeneratingVoice(true);
    setVoiceProgress(null);
    setErrorMsg('');

    try {
      const saveDir = currentProject.videoSaveDir;
      const voicePath = saveDir.endsWith('\\\\') || saveDir.endsWith('/')
        ? saveDir + 'voice'
        : saveDir + '\\\\voice';

      const response = await fetch('/api/video/voice/generate-script', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          scriptText,
          engineUrl,
          voiceDir: voicePath,
          speakerId,
          speedScale,
          pitchScale,
          intonationScale,
          volumeScale,
          gapSeconds,
          scriptMode,
          charVoiceMap
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Lỗi không xác định khi sinh Voice.' }));
        throw new Error(errorData.error || 'Lỗi không xác định khi sinh Voice.');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('ReadableStream không được hỗ trợ.');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let finalData: any = null;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const parsed = JSON.parse(trimmed);
              if (parsed.type === 'progress') {
                setVoiceProgress({
                  current: parsed.current,
                  total: parsed.total,
                  percent: parsed.percent
                });
              } else if (parsed.type === 'done') {
                finalData = parsed;
              } else if (parsed.type === 'error') {
                throw new Error(parsed.error);
              }
            } catch (e: any) {
              if (e.message.startsWith('Lỗi trong quá trình sinh giọng nói') || e.message.startsWith('Lỗi:')) {
                throw e;
              }
              console.error('Failed to parse NDJSON line:', trimmed, e);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      if (finalData && finalData.success && finalData.srtContent) {
        setSrtContent(finalData.srtContent, currentProject.name);
        setCurrentProjectField('scriptContent', scriptText);
        alert(`Sinh thành công phụ đề và ${finalData.fileCount} file giọng nói trong thư mục voice!`);
      } else {
        throw new Error('Sinh giọng nói thất bại hoặc không nhận được kết quả hoàn tất.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Lỗi không xác định.');
    } finally {
      setIsGeneratingVoice(false);
      setVoiceProgress(null);
    }
  };

  const handleGenerateFullCombo = async (resume: boolean = false) => {
    if (workflowMode === 'mode1' && !currentProject.srtContent) {
      alert('Vui lòng tải tệp phụ đề SRT lên trước!');
      return;
    }
    if (workflowMode === 'mode2' && !scriptText.trim()) {
      alert('Vui lòng nhập kịch bản trước!');
      return;
    }
    setErrorMsg('');
    try {
      if (workflowMode === 'mode2') {
        await generateFullCombo(resume, {
          scriptText,
          engineUrl,
          speakerId,
          speedScale,
          pitchScale,
          intonationScale,
          volumeScale,
          gapSeconds,
          scriptMode,
          charVoiceMap
        });
      } else {
        await generateFullCombo(resume);
      }
      onNextTab(); // Go to Scene Mapping Grid tab
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  useEffect(() => {
    if (currentProject.scriptContent !== undefined) {
      setScriptText(currentProject.scriptContent || '');
    }
  }, [currentProject.scriptContent]);


  const handleScriptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (evt) => {
        const content = evt.target?.result as string;
        setScriptText(content);
        setCurrentProjectField('scriptContent', content);
      };
      reader.readAsText(file);
    }
  };

  const handleMergeScriptSrt = () => {
    if (!currentProject.srtContent) {
      alert('Vui lòng tải tệp phụ đề SRT trước!');
      return;
    }
    if (!scriptText.trim()) {
      alert('Vui lòng nhập kịch bản phim!');
      return;
    }

    if (currentProject.sceneMapping && currentProject.sceneMapping.length > 0) {
      const confirmReset = confirm(
        'Cảnh báo: Tạo SRT mới từ kịch bản sẽ đặt lại dữ liệu phân cảnh (Scene Mapping) và các prompt hiện tại. Bạn có muốn tiếp tục?'
      );
      if (!confirmReset) return;
    }

    try {
      const mergedSrt = matchScriptWithSrt(scriptText, currentProject.srtContent);
      setSrtContent(mergedSrt, currentProject.name);
      setCurrentProjectField('scriptContent', scriptText);

      // Download merged SRT
      const element = document.createElement("a");
      const file = new Blob([mergedSrt], { type: 'text/plain;charset=utf-8' });
      element.href = URL.createObjectURL(file);
      element.download = `${currentProject.name}_full.srt`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);

      alert('Đã tạo và đồng bộ SRT full thành công! Tệp phụ đề đã được tải về máy của bạn.');
    } catch (err: any) {
      alert('Lỗi khi ghép kịch bản: ' + err.message);
    }
  };

  // Drawing style management states
  const [showStyleManager, setShowStyleManager] = useState(false);
  const [editingStyle, setEditingStyle] = useState<any>(null);
  const [isNewStyle, setIsNewStyle] = useState(false);
  const [styleForm, setStyleForm] = useState({
    name: '',
    characterSuffix: '',
    backgroundSuffix: '',
    sceneSuffix: ''
  });

  const currentStyle = styles.find(s => s.id === (currentProject.selectedStyleId || 'manga_color')) || styles[0] || {
    characterSuffix: '',
    backgroundSuffix: '',
    sceneSuffix: ''
  };

  const hasApiKey = !!apiConfig?.apiKey;
  const isAnyGenerating = !!(
    isGeneratingCombo1 ||
    isGeneratingCombo2 ||
    isGeneratingFullCombo ||
    isGeneratingSceneMapping ||
    isGeneratingImagePrompts ||
    isGeneratingAssets ||
    isGeneratingVoice
  );

  useEffect(() => {
    if (currentStyle && !editingStyle) {
      setEditingStyle(currentStyle);
      setStyleForm({
        name: currentStyle.name,
        characterSuffix: currentStyle.characterSuffix,
        backgroundSuffix: currentStyle.backgroundSuffix,
        sceneSuffix: currentStyle.sceneSuffix
      });
    }
  }, [currentStyle]);

  const handleSelectStyleToEdit = (style: any) => {
    setIsNewStyle(false);
    setEditingStyle(style);
    setStyleForm({
      name: style.name,
      characterSuffix: style.characterSuffix,
      backgroundSuffix: style.backgroundSuffix,
      sceneSuffix: style.sceneSuffix
    });
  };

  const handleNewStyleInit = () => {
    setIsNewStyle(true);
    setEditingStyle(null);
    setStyleForm({
      name: '',
      characterSuffix: '',
      backgroundSuffix: '',
      sceneSuffix: ''
    });
  };

  const handleSaveStyle = () => {
    if (!styleForm.name.trim()) {
      alert('Vui lòng nhập tên style!');
      return;
    }
    if (isNewStyle) {
      addStyle(styleForm);
      setIsNewStyle(false);
      alert('Đã thêm style vẽ ảnh mới thành công!');
    } else if (editingStyle?.isCustom) {
      updateStyle(editingStyle.id, styleForm);
      alert('Đã cập nhật style vẽ ảnh thành công!');
    }
  };

  const handleDeleteStyle = () => {
    if (!editingStyle || !editingStyle.isCustom) return;
    if (confirm(`Bạn có chắc chắn muốn xóa style "${editingStyle.name}" không?`)) {
      deleteStyle(editingStyle.id);
      setEditingStyle(null);
      setIsNewStyle(true);
      setStyleForm({
        name: '',
        characterSuffix: '',
        backgroundSuffix: '',
        sceneSuffix: ''
      });
      alert('Đã xóa style thành công!');
    }
  };

  const handleSelectDirectory = () => {
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
        setCurrentProjectField('videoSaveDir', data.path);
      }
    } catch (err: any) {
      console.error('Error selecting directory:', err);
      alert('Không thể cấu hình thư mục: ' + err.message);
    }
  };

  const processFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.srt')) {
      setErrorMsg('Only .srt subtitle files are supported.');
      return;
    }
    setErrorMsg('');

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setSrtContent(content, file.name.replace(/\.srt$/i, ''));
    };
    reader.onerror = () => {
      setErrorMsg('Failed to read file.');
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleGenerateCombo1 = async (resume: boolean = false) => {
    if (!currentProject.srtContent) return;
    setErrorMsg('');
    try {
      await generateAllMappingAndPrompts(resume);
      onNextTab(); // Go to Scene Mapping Grid tab
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleGenerateCombo2 = async (resume: boolean = false) => {
    if (!currentProject.srtContent) return;
    setErrorMsg('');
    try {
      await generateCombo2(resume);
      onNextTab(); // Go to Scene Mapping Grid tab
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };


  // Generate subtitle blocks array locally for preview
  const previewBlocks = currentProject.srtContent
    ? parseSRT(currentProject.srtContent).blocks.slice(0, 30) // Preview first 30 lines
    : [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-gray-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-200 font-sans">Cấu hình dự án</h2>
          <p className="text-xs text-gray-500 mt-1">
            Thiết lập cấu hình dự án, tải phụ đề SRT và thực hiện các tác vụ tạo phân cảnh, vẽ ảnh.
          </p>
        </div>
      </div>

      {/* 3 Main Action Card Buttons at the Very Top */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Combo 1 (Tạo Prompt) */}
        <div
          className="relative group overflow-hidden bg-slate-900/35 border border-slate-900 p-5 rounded-xl shadow-lg transition-all duration-300 text-left select-none flex flex-col justify-between min-h-[145px]"
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] font-bold text-violet-400 font-mono tracking-wider bg-violet-950/50 px-2 py-0.5 rounded border border-violet-900/40">COMBO 1</span>
            <Sparkles className="w-5 h-5 text-violet-400 group-hover:scale-110 transition duration-300" />
          </div>
          <div className="mt-3 mb-4">
            <h4 className="font-bold text-slate-200 text-sm tracking-wide">Combo 1: Tạo Prompt</h4>
            <p className="text-[10px] text-gray-400 mt-1 leading-normal font-medium">
              Lập sơ đồ phân cảnh và tạo các prompt mô tả vẽ ảnh (Mapping & Prompts)
            </p>
          </div>
          <div className="flex gap-2">
            {isGeneratingCombo1 ? (
              <button
                onClick={cancelCombo1}
                className="flex-1 bg-rose-650 hover:bg-rose-555 text-white text-[10px] font-bold py-1.5 px-3 rounded-lg border border-rose-600/40 cursor-pointer transition duration-200 text-center font-bold"
              >
                Dừng lại
              </button>
            ) : (
              <>
                <button
                  onClick={() => handleGenerateCombo1(false)}
                  disabled={isAnyGenerating || !hasApiKey || !currentProject.srtContent}
                  className="flex-1 bg-violet-650 hover:bg-violet-555 disabled:bg-slate-950/20 disabled:text-gray-650 disabled:border-transparent text-white text-[10px] font-bold py-1.5 px-3 rounded-lg border border-violet-600/40 cursor-pointer disabled:cursor-not-allowed transition duration-200 text-center"
                >
                  {currentProject.sceneMapping && currentProject.sceneMapping.length > 0 ? 'Tạo mới' : 'Chạy'}
                </button>
                {currentProject.sceneMapping && currentProject.sceneMapping.length > 0 && (
                  <button
                    onClick={() => handleGenerateCombo1(true)}
                    disabled={isAnyGenerating || !hasApiKey || !currentProject.srtContent}
                    className="flex-1 bg-slate-950 hover:bg-slate-900 border border-slate-850 hover:border-slate-700 text-violet-400 hover:text-violet-300 text-[10px] font-bold py-1.5 px-3 rounded-lg cursor-pointer disabled:cursor-not-allowed transition duration-200 text-center flex items-center justify-center gap-1"
                    title="Tiếp tục chạy combo cho các phần chưa hoàn thành"
                  >
                    <Play className="w-2.5 h-2.5 fill-current" />
                    Tạo tiếp
                  </button>
                )}
              </>
            )}
          </div>
          {isGeneratingCombo1 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-violet-600 animate-pulse"></div>
          )}
        </div>

        {/* Card 2: Combo 2 (Prompt & Ảnh tham chiếu) */}
        <div
          className="relative group overflow-hidden bg-slate-900/35 border border-slate-900 p-5 rounded-xl shadow-lg transition-all duration-300 text-left select-none flex flex-col justify-between min-h-[145px]"
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] font-bold text-fuchsia-400 font-mono tracking-wider bg-fuchsia-950/50 px-2 py-0.5 rounded border border-fuchsia-900/40">COMBO 2</span>
            <Sparkles className="w-5 h-5 text-fuchsia-400 group-hover:scale-110 transition duration-300" />
          </div>
          <div className="mt-3 mb-4">
            <h4 className="font-bold text-slate-200 text-sm tracking-wide">Combo 2: Prompt + Ảnh tham chiếu</h4>
            <p className="text-[10px] text-gray-400 mt-1 leading-normal font-medium">
              Tạo lập bối cảnh phim, sinh prompt mô tả và vẽ ảnh tham chiếu (Assets)
            </p>
          </div>
          <div className="flex gap-2">
            {isGeneratingCombo2 ? (
              <button
                onClick={cancelCombo2}
                className="flex-1 bg-rose-650 hover:bg-rose-555 text-white text-[10px] font-bold py-1.5 px-3 rounded-lg border border-rose-600/40 cursor-pointer transition duration-200 text-center font-bold"
              >
                Dừng lại
              </button>
            ) : (
              <>
                <button
                  onClick={() => handleGenerateCombo2(false)}
                  disabled={isAnyGenerating || !hasApiKey || !currentProject.srtContent}
                  className="flex-1 bg-fuchsia-650 hover:bg-fuchsia-555 disabled:bg-slate-950/20 disabled:text-gray-650 disabled:border-transparent text-white text-[10px] font-bold py-1.5 px-3 rounded-lg border border-fuchsia-600/40 cursor-pointer disabled:cursor-not-allowed transition duration-200 text-center"
                >
                  {currentProject.sceneMapping && currentProject.sceneMapping.length > 0 ? 'Tạo mới' : 'Chạy'}
                </button>
                {currentProject.sceneMapping && currentProject.sceneMapping.length > 0 && (
                  <button
                    onClick={() => handleGenerateCombo2(true)}
                    disabled={isAnyGenerating || !hasApiKey || !currentProject.srtContent}
                    className="flex-1 bg-slate-950 hover:bg-slate-900 border border-slate-850 hover:border-slate-700 text-fuchsia-400 hover:text-fuchsia-300 text-[10px] font-bold py-1.5 px-3 rounded-lg cursor-pointer disabled:cursor-not-allowed transition duration-200 text-center flex items-center justify-center gap-1"
                    title="Tiếp tục chạy combo cho các phần chưa hoàn thành"
                  >
                    <Play className="w-2.5 h-2.5 fill-current" />
                    Tạo tiếp
                  </button>
                )}
              </>
            )}
          </div>
          {isGeneratingCombo2 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-fuchsia-650 animate-pulse"></div>
          )}
        </div>

        {/* Card 3: Combo 3 (Tự động toàn bộ) */}
        <div
          className="relative group overflow-hidden bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:from-slate-900 disabled:to-slate-950 p-5 rounded-xl shadow-xl transition-all duration-300 text-left select-none flex flex-col justify-between min-h-[145px]"
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] font-bold text-white font-mono tracking-wider bg-white/10 px-2 py-0.5 rounded border border-white/10">COMBO 3 (FULL)</span>
            <Sparkles className="w-5 h-5 text-white group-hover:scale-110 transition duration-300" />
          </div>
          <div className="mt-3 mb-4">
            <h4 className="font-bold text-white text-sm tracking-wide">Combo 3: Tự động toàn bộ</h4>
            <p className="text-[10px] text-white/80 mt-1 leading-normal font-medium">
              {workflowMode === 'mode2'
                ? 'Chạy tự động: Sinh Voice/SRT ➔ Phân cảnh ➔ Prompt ➔ Ảnh tham chiếu ➔ Ảnh Shots ➔ Video ➔ Xuất video .mp4'
                : 'Chạy tự động: Phân cảnh ➔ Prompt ➔ Ảnh tham chiếu ➔ Ảnh Shots ➔ Video ➔ Xuất video .mp4'}
            </p>
          </div>
          <div className="flex gap-2">
            {isGeneratingFullCombo ? (
              <button
                onClick={cancelFullCombo}
                className="flex-1 bg-rose-650 hover:bg-rose-555 text-white text-[10px] font-bold py-1.5 px-3 rounded-lg border border-rose-600/40 cursor-pointer transition duration-200 text-center font-bold"
              >
                Dừng lại
              </button>
            ) : (
              <>
                <button
                  onClick={() => handleGenerateFullCombo(false)}
                  disabled={isAnyGenerating || !hasApiKey || (workflowMode === 'mode1' ? !currentProject.srtContent : !scriptText.trim())}
                  className="flex-1 bg-white/10 hover:bg-white/20 disabled:bg-slate-950/20 disabled:text-gray-650 disabled:border-transparent text-white text-[10px] font-bold py-1.5 px-3 rounded-lg cursor-pointer disabled:cursor-not-allowed transition duration-200 text-center"
                >
                  {currentProject.sceneMapping && currentProject.sceneMapping.length > 0 ? 'Tạo mới' : 'Chạy'}
                </button>
                {currentProject.sceneMapping && currentProject.sceneMapping.length > 0 && (
                  <button
                    onClick={() => handleGenerateFullCombo(true)}
                    disabled={isAnyGenerating || !hasApiKey || (workflowMode === 'mode1' ? !currentProject.srtContent : !scriptText.trim())}
                    className="flex-1 bg-white/20 hover:bg-white/30 border border-white/10 text-white text-[10px] font-bold py-1.5 px-3 rounded-lg cursor-pointer disabled:cursor-not-allowed transition duration-200 text-center flex items-center justify-center gap-1"
                    title="Tiếp tục chạy combo cho các phần chưa hoàn thành"
                  >
                    <Play className="w-2.5 h-2.5 fill-current" />
                    Tạo tiếp
                  </button>
                )}
              </>
            )}
          </div>
          {isGeneratingFullCombo && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/80 animate-pulse"></div>
          )}
        </div>
      </div>

      {/* Warning/Notification Banners */}
      {errorMsg && (
        <div className="bg-red-950/20 border border-red-900 text-red-400 p-3 rounded-lg text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}
      {!hasApiKey && (
        <div className="bg-amber-950/25 border border-amber-900/40 text-amber-400 text-xs p-3 rounded-lg flex gap-2 leading-relaxed">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500 animate-pulse mt-0.5" />
          <span>Vui lòng nhập <strong>API Key</strong> ở phần Cấu hình chung góc trên bên phải trước khi thực hiện các tác vụ tạo AI.</span>
        </div>
      )}

      {/* Main Grid Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          /* Workflow Mode Selector */
          <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-1 flex gap-2">
            <button
              onClick={() => {
                setWorkflowMode('mode1');
                localStorage.setItem('workflow_mode', 'mode1');
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition select-none cursor-pointer ${
                workflowMode === 'mode1'
                  ? 'bg-violet-650 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
              }`}
            >
              <FileText className="w-4 h-4" />
              Chế độ 1: Phụ đề SRT sẵn có
            </button>
            <button
              onClick={() => {
                setWorkflowMode('mode2');
                localStorage.setItem('workflow_mode', 'mode2');
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition select-none cursor-pointer ${
                workflowMode === 'mode2'
                  ? 'bg-violet-650 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
              }`}
            >
              <Volume2 className="w-4 h-4" />
              Chế độ 2: Sinh Voice & SRT tự động từ kịch bản
            </button>
          </div>

          {workflowMode === 'mode1' ? (
            <>
              {/* Subtitle File Section */}
              <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-950 pb-3">
                  <FileText className="w-5 h-5 text-violet-400" />
                  <h3 className="font-bold text-slate-200 text-sm">File phụ đề (.srt)</h3>
                </div>

                {!currentProject.srtContent ? (
                  /* Drag & drop upload box when not loaded */
                  <div>
                    <div
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center min-h-[140px] ${
                        dragActive
                          ? 'border-violet-500 bg-violet-955/10'
                          : 'border-slate-850 bg-slate-950/10 hover:border-violet-500/50 hover:bg-slate-900/10'
                      }`}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept=".srt"
                        className="hidden"
                      />
                      <Upload className="w-8 h-8 text-violet-400/80 mb-2" />
                      <p className="font-semibold text-slate-300 text-xs">Kéo & thả file phụ đề .srt vào đây</p>
                      <p className="text-[10px] text-gray-400 mt-1">hoặc nhấp để chọn file từ máy tính</p>
                    </div>
                  </div>
                ) : (
                  /* Compact view and duration limit when loaded */
                  <div className="space-y-4 animate-fadeIn">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-emerald-955/10 border border-emerald-900/40 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-950/60 flex items-center justify-center text-emerald-400 shrink-0">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-200 text-xs truncate max-w-[280px]">
                            {currentProject.name}.srt
                          </p>
                          <p className="text-[10px] text-emerald-500/80 mt-0.5">
                            Đã tải và phân tách kịch bản thành công
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileChange}
                          accept=".srt"
                          className="hidden"
                        />
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="bg-slate-900 hover:bg-slate-800 border border-slate-850 hover:border-slate-700 text-[10px] font-semibold text-slate-300 hover:text-slate-100 px-3 py-1.5 rounded-lg transition cursor-pointer select-none"
                        >
                          Thay đổi file
                        </button>
                      </div>
                    </div>

                    {/* Subtitle parameters and duration limit */}
                    <div className="bg-slate-950/40 border border-slate-950 rounded-xl p-4 space-y-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center justify-between">
                          <span>Thời lượng tối đa mỗi phân cảnh</span>
                          <span className="text-violet-400 font-mono font-bold text-xs">{targetDuration}s</span>
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min="5"
                            max="60"
                            step="5"
                            value={targetDuration}
                            onChange={(e) => setTargetDuration(Number(e.target.value))}
                            className="flex-1 accent-violet-600 bg-slate-900 h-1.5 rounded-lg appearance-none cursor-pointer border border-gray-900"
                          />
                          <input
                            type="number"
                            min="5"
                            max="120"
                            value={targetDuration}
                            onChange={(e) => setTargetDuration(Number(e.target.value))}
                            className="w-14 bg-slate-900 border border-gray-900 rounded text-center text-xs font-mono text-slate-200 py-1 focus:outline-none focus:border-violet-500"
                          />
                        </div>
                        <span className="text-[9px] text-gray-400 mt-1 block leading-normal">
                          AI sẽ tự động phân tách các dòng phụ đề để các phân cảnh không vượt quá giới hạn này.
                        </span>
                      </div>

                      {/* Subtitle Stats */}
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-violet-400" />
                            <span className="text-gray-500 text-[10px] uppercase font-semibold">Dòng phụ đề</span>
                          </div>
                          <span className="text-sm font-bold text-slate-200 font-mono">
                            {currentProject.srtMeta.lineCount}
                          </span>
                        </div>

                        <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-fuchsia-400" />
                            <span className="text-gray-500 text-[10px] uppercase font-semibold">Thời lượng</span>
                          </div>
                          <span className="text-sm font-bold text-slate-200 font-mono">
                            {currentProject.srtMeta.duration}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Preview subtitle blocks */}
                    {previewBlocks.length > 0 && (
                      <div className="space-y-2 border-t border-slate-950 pt-3">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          Bản xem trước phân tách phụ đề (30 dòng đầu)
                        </label>
                        <div className="max-h-48 overflow-y-auto border border-slate-950 bg-slate-950/20 rounded-lg p-3 space-y-3 scrollbar-thin">
                          {previewBlocks.map((block: any, idx: number) => {
                            const parsedStartTime = block.startTime.replace(',', '.');
                            const parsedEndTime = block.endTime.replace(',', '.');
                            return (
                              <div key={block.id || idx} className="text-xs flex gap-2 items-start border-b border-slate-900/40 pb-2 last:border-0 last:pb-0">
                                <span className="font-bold text-slate-400 font-mono">#{block.id}</span>
                                <div className="space-y-0.5 flex-1">
                                  <div className="text-[10px] text-gray-500 font-mono">
                                    {parsedStartTime} &rarr; {parsedEndTime}
                                  </div>
                                  <p className="text-slate-300 font-medium leading-relaxed font-sans">{block.text}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Align & Sync Script */}
              <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-950 pb-3">
                    <FileText className="w-5 h-5 text-violet-400" />
                    <h3 className="font-bold text-slate-200 text-sm">Đối chiếu & Đồng bộ Kịch bản</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Column Left: Screenplay text input */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          Kịch bản gốc (Script)
                        </label>
                        {scriptText.trim() && (
                          <span className="text-[10px] font-mono text-slate-500">
                            Số dòng: {scriptText.split(/\r?\n/).filter(Boolean).length}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="file"
                          ref={scriptFileInputRef}
                          onChange={handleScriptFileChange}
                          accept=".txt"
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => scriptFileInputRef.current?.click()}
                          className="bg-slate-900 hover:bg-slate-800 border border-slate-850 hover:border-slate-700 text-[10px] font-semibold text-slate-350 hover:text-slate-100 px-3 py-1.5 rounded-lg transition cursor-pointer select-none flex items-center gap-1.5"
                        >
                          <FolderOpen className="w-3.5 h-3.5 text-violet-400" />
                          Chọn tệp kịch bản (.txt)
                        </button>
                      </div>

                      <textarea
                        value={scriptText}
                        onChange={(e) => {
                          setScriptText(e.target.value);
                          setCurrentProjectField('scriptContent', e.target.value);
                        }}
                        disabled={isAnyGenerating}
                        placeholder="Nhập hoặc dán kịch bản tại đây. Ví dụ:&#10;Kaito: (ngạc nhiên) Chào ngày mới!&#10;Aiko：「Hôm nay trời đẹp thật đấy!」"
                        className="w-full bg-slate-950 border border-gray-900 rounded-xl text-xs text-slate-200 p-4 focus:outline-none focus:border-violet-500 font-mono leading-relaxed h-52 resize-none disabled:opacity-50"
                      />
                      <div className="text-[9px] text-gray-400 font-medium leading-relaxed font-sans">
                        <span>Số dòng trong kịch bản:</span> <span className="font-bold font-mono text-slate-200">{scriptText.split(/\r?\n/).map(l => l.trim()).filter(Boolean).length} dòng</span>.
                        <br />
                        * Hệ thống sẽ tự động ghép nối từng dòng kịch bản này tương ứng vào từng phân cảnh phụ đề SRT bên phải.
                      </div>
                    </div>

                    {/* Column Right: Subtitle mapping preview and actions */}
                    <div className="space-y-3.5 flex flex-col justify-between">
                      <div className="space-y-2.5 flex-1 flex flex-col">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          Bảng đối chiếu & Ghép nối
                        </label>

                        {(() => {
                          const srtBlocksCount = currentProject.srtContent ? parseSRT(currentProject.srtContent).blocks.length : 0;
                          const scriptLinesCount = scriptText.split(/\r?\n/).map(l => l.trim()).filter(Boolean).length;

                          if (srtBlocksCount === 0) {
                            return (
                              <div className="flex-1 border border-slate-950 border-dashed rounded-xl flex items-center justify-center p-6 text-center text-xs text-gray-500 font-medium bg-slate-950/5">
                                Hãy tải tệp phụ đề SRT trước để hiển thị bảng đối chiếu kịch bản.
                              </div>
                            );
                          }

                          if (scriptLinesCount === 0) {
                            return (
                              <div className="flex-1 border border-slate-950 border-dashed rounded-xl flex items-center justify-center p-6 text-center text-xs text-gray-555 font-medium bg-slate-950/5 font-sans">
                                Vui lòng nhập hoặc tải kịch bản vào cột bên trái để bắt đầu đối chiếu.
                              </div>
                            );
                          }

                          if (scriptLinesCount === srtBlocksCount) {
                            return (
                              <div className="flex-1 border border-emerald-950 bg-emerald-950/5 rounded-xl p-4 flex flex-col justify-center gap-1.5 animate-fadeIn">
                                <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold font-sans">
                                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                                  <span>Cấu hình trùng khớp hoàn hảo!</span>
                                </div>
                                <p className="text-[10px] text-emerald-500/80 leading-relaxed font-sans font-medium">
                                  Kịch bản gốc và tệp phụ đề SRT có cùng số lượng dòng (<strong>{scriptLinesCount}</strong> dòng). Sẵn sàng tạo tệp phụ đề đầy đủ chi tiết.
                                </p>
                              </div>
                            );
                          } else {
                            return (
                              <div className="text-[10px] text-rose-400 bg-rose-950/20 border border-rose-900/40 px-3 py-1.5 rounded-lg flex items-start gap-1.5 font-medium leading-normal animate-fadeIn font-sans">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                                <span>Lệch dòng: Kịch bản có <strong>{scriptLinesCount}</strong> dòng, nhưng SRT có <strong>{srtBlocksCount}</strong> phân cảnh. Điều chỉnh kịch bản khớp hoàn toàn để tạo phụ đề.</span>
                              </div>
                            );
                          }
                        })()}
                      </div>

                      <div className="pt-3 border-t border-slate-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex-1">
                          {/* Left aligned info status */}
                        </div>
                        <button
                          type="button"
                          onClick={handleMergeScriptSrt}
                          disabled={
                            !currentProject.srtContent || 
                            !scriptText.trim() || 
                            scriptText.split(/\r?\n/).map(l => l.trim()).filter(Boolean).length !== (currentProject.srtContent ? parseSRT(currentProject.srtContent).blocks.length : 0)
                          }
                          className="bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:from-slate-900 disabled:to-slate-950 disabled:text-gray-650 disabled:opacity-40 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-lg hover:shadow-violet-500/10 transition-all duration-200 cursor-pointer disabled:cursor-not-allowed select-none flex items-center gap-1.5 hover:scale-[1.01] active:scale-[0.98] shrink-0"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          Tạo srt full
                        </button>
                      </div>
                    </div>

                  </div>
                </div>
              
            </>
          ) : (
            /* Mode 2: Screenplay Script -> Voice & SRT Generation */
            <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-slate-950 pb-3">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-5 h-5 text-violet-400" />
                  <h3 className="font-bold text-slate-200 text-sm">Sinh Phụ đề & Giọng đọc tự động từ Kịch bản</h3>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Column Left: screenplay input */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Nội dung Kịch bản (Mỗi dòng là 1 câu thoại)
                    </label>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {scriptText.split(/\r?\n/).filter(Boolean).length} dòng
                    </span>
                  </div>

                  <textarea
                    value={scriptText}
                    onChange={(e) => {
                      setScriptText(e.target.value);
                      setCurrentProjectField('scriptContent', e.target.value);
                    }}
                    disabled={isAnyGenerating}
                    placeholder="Nhập kịch bản tại đây. Mỗi dòng là một câu thoại. Ví dụ:&#10;Kaito: (ngạc nhiên) Chào ngày mới!&#10;Aiko：「Hôm nay trời đẹp thật đấy!」"
                    className="w-full bg-slate-950 border border-gray-900 rounded-xl text-xs text-slate-200 p-4 focus:outline-none focus:border-violet-500 font-sans leading-relaxed resize-none h-80 disabled:opacity-50"
                  />

                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={scriptFileInputRef}
                      onChange={handleScriptFileChange}
                      accept=".txt"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => scriptFileInputRef.current?.click()}
                      disabled={isAnyGenerating}
                      className="bg-slate-900 hover:bg-slate-800 border border-slate-850 hover:border-slate-700 text-[10px] font-semibold text-slate-350 hover:text-slate-100 px-3 py-1.5 rounded-lg transition cursor-pointer select-none flex items-center gap-1.5 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-violet-400" />
                      Chọn tệp kịch bản (.txt)
                    </button>
                    {scriptMode === 'multi' && (
                      <button
                        type="button"
                        onClick={handleExtractCharacters}
                        disabled={isAnyGenerating || speakers.length === 0}
                        className="bg-violet-950 hover:bg-violet-900 border border-violet-850 hover:border-violet-750 text-[10px] font-bold text-violet-300 hover:text-white px-3 py-1.5 rounded-lg transition cursor-pointer select-none flex items-center gap-1 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                        Lọc nhân vật
                      </button>
                    )}
                    {scriptText.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          setScriptText('');
                          setCurrentProjectField('scriptContent', '');
                        }}
                        disabled={isAnyGenerating}
                        className="bg-slate-900 hover:bg-rose-955/40 border border-slate-850 hover:border-rose-900/50 text-[10px] font-semibold text-slate-400 hover:text-rose-400 px-3 py-1.5 rounded-lg transition cursor-pointer select-none ml-auto shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Xóa kịch bản
                      </button>
                    )}
                  </div>
                </div>

                {/* Column Right: Local Engine TTS Settings */}
                <div className="space-y-4 bg-slate-950/30 p-4 rounded-xl border border-slate-950 flex flex-col justify-between">
                  <div className="space-y-4">
                    {/* Engine Status Panel */}
                    <div className="space-y-3 bg-slate-950/40 p-3.5 rounded-xl border border-slate-900 leading-normal">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="font-bold text-slate-400 tracking-wider">KẾT NỐI LOCAL ENGINE (TTS)</span>
                        <button
                          type="button"
                          onClick={() => scanBothEngines()}
                          disabled={isAnyGenerating || isScanning}
                          className="text-violet-400 hover:text-violet-355 font-bold flex items-center gap-1 transition cursor-pointer text-[9px] disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <RefreshCw className={`w-3 h-3 ${isScanning ? 'animate-spin' : ''}`} />
                          QUÉT LẠI
                        </button>
                      </div>

                      {/* Aivis Engine status & edit */}
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-slate-300">Aivis Speech</span>
                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                            aivisStatus === 'active' 
                              ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-900/30' 
                              : 'bg-rose-955/20 text-rose-455 border border-rose-900/20'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${aivisStatus === 'active' ? 'bg-emerald-450' : 'bg-rose-400'}`}></span>
                            {aivisStatus === 'active' ? 'Đang chạy' : 'Chưa kết nối'}
                          </span>
                        </div>
                        <input
                          type="text"
                          value={aivisUrl}
                          onChange={(e) => {
                            setAivisUrl(e.target.value);
                            localStorage.setItem('aivis_engine_url', e.target.value);
                          }}
                          disabled={isAnyGenerating}
                          placeholder="Mặc định: http://127.0.0.1:10101"
                          className="w-full bg-slate-950 border border-gray-900 rounded-lg text-xs text-slate-200 px-3 py-1.5 focus:outline-none focus:border-violet-500 font-mono disabled:opacity-50"
                        />
                      </div>

                      {/* Voicevox Engine status & edit */}
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-slate-300">Voicevox</span>
                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                            voicevoxStatus === 'active' 
                              ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-900/30' 
                              : 'bg-rose-955/20 text-rose-455 border border-rose-900/20'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${voicevoxStatus === 'active' ? 'bg-emerald-450' : 'bg-rose-400'}`}></span>
                            {voicevoxStatus === 'active' ? 'Đang chạy' : 'Chưa kết nối'}
                          </span>
                        </div>
                        <input
                          type="text"
                          value={voicevoxUrl}
                          onChange={(e) => {
                            setVoicevoxUrl(e.target.value);
                            localStorage.setItem('voice_vox_engine_url', e.target.value);
                          }}
                          disabled={isAnyGenerating}
                          placeholder="Mặc định: http://127.0.0.1:50021"
                          className="w-full bg-slate-950 border border-gray-900 rounded-lg text-xs text-slate-200 px-3 py-1.5 focus:outline-none focus:border-violet-500 font-mono disabled:opacity-50"
                        />
                      </div>
                    </div>

                    {/* Speaker selector */}
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Nhân vật đọc (Speaker & Style)
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setVoiceCatalogTarget({ type: 'main' });
                            setShowVoiceCatalogModal(true);
                          }}
                          disabled={isAnyGenerating}
                          className="flex-1 bg-slate-950 hover:bg-slate-900/80 border border-gray-900 hover:border-slate-800 rounded-lg text-xs text-slate-200 px-3 py-2 flex items-center justify-between text-left cursor-pointer transition select-none disabled:opacity-50 disabled:cursor-not-allowed group"
                        >
                          <span className="truncate pr-2 font-sans font-medium">
                            {(() => {
                              let targetId = speakerId;
                              let targetUrl = '';
                              if (typeof speakerId === 'string' && speakerId.includes('|')) {
                                const parts = speakerId.split('|');
                                targetUrl = parts[0];
                                targetId = Number(parts[1]);
                              } else {
                                targetId = Number(speakerId);
                              }

                              const findSpeaker = (list: any[]) => {
                                for (const s of list) {
                                  const matchStyle = s.styles?.find((st: any) => st.id === targetId);
                                  if (matchStyle) return { speaker: s, style: matchStyle };
                                }
                                return null;
                              };

                              const aivisMatch = findSpeaker(aivisSpeakers);
                              if (aivisMatch) {
                                const cat = getSpeakerCategory(aivisMatch.speaker.name);
                                return `[Aivis] 	ext{${aivisMatch.speaker.name}} - 	ext{${aivisMatch.style.name}} (${cat.desc})`;
                              }

                              const voicevoxMatch = findSpeaker(voicevoxSpeakers);
                              if (voicevoxMatch) {
                                const cat = getSpeakerCategory(voicevoxMatch.speaker.name);
                                return `[Voicevox] 	ext{${voicevoxMatch.speaker.name}} - 	ext{${voicevoxMatch.style.name}} (${cat.desc})`;
                              }

                              return "Chưa kết nối / Chưa chọn giọng (Bấm để chọn)...";
                            })()}
                          </span>
                          <Sliders className="w-3.5 h-3.5 text-slate-400 group-hover:text-violet-400 transition shrink-0" />
                        </button>
                        <button
                          type="button"
                          onClick={() => playSpeakerSample(speakerId)}
                          disabled={isAnyGenerating || (!aivisSpeakers.length && !voicevoxSpeakers.length)}
                          className="bg-violet-955/40 hover:bg-violet-900/50 border border-violet-900/50 rounded-lg px-3 py-2 flex items-center justify-center text-violet-400 cursor-pointer transition select-none disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                          title="Nghe thử giọng mẫu"
                        >
                          {playingSampleId === speakerId ? (
                            <span className="inline-block w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin"></span>
                          ) : (
                            <Volume2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Chế độ đọc */}
                    <div className="space-y-1.5 pt-1.5 border-t border-slate-900">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Chế độ đọc (Voice Mode)
                      </label>
                      <select
                        value={scriptMode}
                        onChange={(e) => {
                          const val = e.target.value as 'single' | 'multi';
                          setScriptMode(val);
                          localStorage.setItem('voice_script_mode', val);
                        }}
                        disabled={isAnyGenerating}
                        className="w-full bg-slate-950 border border-gray-900 rounded-lg text-xs text-slate-200 px-3 py-2 focus:outline-none focus:border-violet-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="single">Đơn vai (1 Voice)</option>
                        <option value="multi">Đa vai (Manga-Anime)</option>
                      </select>
                    </div>

                    {/* Audio parameters adjustment */}
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1">
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider flex justify-between">
                          <span>Tốc độ đọc</span>
                          <span className="text-violet-400 font-mono">{speedScale.toFixed(2)}x</span>
                        </label>
                        <input
                          type="range"
                          min="0.5"
                          max="2.0"
                          step="0.05"
                          value={speedScale}
                          disabled={isAnyGenerating}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setSpeedScale(val);
                            localStorage.setItem('voice_speed_scale', String(val));
                          }}
                          className="w-full accent-violet-650 bg-slate-955 h-1 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider flex justify-between">
                          <span>Cao độ (Pitch)</span>
                          <span className="text-violet-400 font-mono">{pitchScale >= 0 ? '+' : ''}{pitchScale.toFixed(2)}</span>
                        </label>
                        <input
                          type="range"
                          min="-0.15"
                          max="0.15"
                          step="0.01"
                          value={pitchScale}
                          disabled={isAnyGenerating}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setPitchScale(val);
                            localStorage.setItem('voice_pitch_scale', String(val));
                          }}
                          className="w-full accent-violet-655 bg-slate-955 h-1 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider flex justify-between">
                          <span>Ngữ điệu</span>
                          <span className="text-violet-400 font-mono">{intonationScale.toFixed(2)}</span>
                        </label>
                        <input
                          type="range"
                          min="0.0"
                          max="2.0"
                          step="0.05"
                          value={intonationScale}
                          disabled={isAnyGenerating}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setIntonationScale(val);
                            localStorage.setItem('voice_intonation_scale', String(val));
                          }}
                          className="w-full accent-violet-650 bg-slate-955 h-1 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider flex justify-between">
                          <span>Âm lượng</span>
                          <span className="text-violet-400 font-mono">{volumeScale.toFixed(2)}</span>
                        </label>
                        <input
                          type="range"
                          min="0.0"
                          max="2.0"
                          step="0.05"
                          value={volumeScale}
                          disabled={isAnyGenerating}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setVolumeScale(val);
                            localStorage.setItem('voice_volume_scale', String(val));
                          }}
                          className="w-full accent-violet-650 bg-slate-955 h-1 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </div>
                    </div>

                    <div className="space-y-1 pt-1.5 border-t border-slate-900">
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider flex justify-between">
                        <span>Khoảng nghỉ giữa các dòng (Subtitle gap)</span>
                        <span className="text-violet-400 font-mono font-bold">{gapSeconds.toFixed(1)}s</span>
                      </label>
                      <input
                        type="range"
                        min="0.0"
                        max="2.0"
                        step="0.1"
                        value={gapSeconds}
                        disabled={isAnyGenerating}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setGapSeconds(val);
                          localStorage.setItem('voice_gap_seconds', String(val));
                        }}
                        className="w-full accent-violet-650 bg-slate-955 h-1 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>

                    <div className="space-y-1 pt-1.5 border-t border-slate-900">
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider flex justify-between">
                        <span>Thời lượng tối đa mỗi phân cảnh</span>
                        <span className="text-violet-400 font-mono font-bold">{targetDuration}s</span>
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="5"
                          max="60"
                          step="5"
                          value={targetDuration}
                          disabled={isAnyGenerating}
                          onChange={(e) => setTargetDuration(Number(e.target.value))}
                          className="flex-1 accent-violet-650 bg-slate-955 h-1 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        <input
                          type="number"
                          min="5"
                          max="120"
                          value={targetDuration}
                          disabled={isAnyGenerating}
                          onChange={(e) => setTargetDuration(Number(e.target.value))}
                          className="w-10 bg-slate-950 border border-gray-900 rounded text-center text-[10px] font-mono text-slate-200 py-0.5 focus:outline-none focus:border-violet-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </div>
                      <span className="text-[8px] text-gray-500 block leading-normal mt-0.5">
                        AI sẽ tự động phân tách phân cảnh để không vượt quá giới hạn này khi chạy auto Full.
                      </span>
                    </div>
                  </div>

                  {/* Cấu hình Giọng đọc (Nhập/Xuất) */}
                  <div className="pt-3.5 border-t border-slate-900/60 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cấu hình Giọng đọc</span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="file"
                        ref={voiceConfigInputRef}
                        onChange={handleImportVoiceConfig}
                        accept=".json"
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => voiceConfigInputRef.current?.click()}
                        disabled={isAnyGenerating}
                        className="flex-1 bg-slate-900 hover:bg-slate-800 border border-slate-850 hover:border-slate-700 text-[10px] font-semibold text-slate-350 hover:text-slate-100 px-2.5 py-1.5 rounded-lg transition cursor-pointer select-none flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Nhập cấu hình giọng đã gán (.json)"
                      >
                        <Upload className="w-3.5 h-3.5 text-violet-400" />
                        Nhập Giọng
                      </button>
                      <button
                        type="button"
                        onClick={handleExportVoiceConfig}
                        disabled={isAnyGenerating}
                        className="flex-1 bg-slate-900 hover:bg-slate-800 border border-slate-850 hover:border-slate-700 text-[10px] font-semibold text-slate-355 hover:text-slate-100 px-2.5 py-1.5 rounded-lg transition cursor-pointer select-none flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Xuất bản cấu hình giọng hiện tại (.json)"
                      >
                        <Download className="w-3.5 h-3.5 text-violet-400" />
                        Xuất Bản Giọng
                      </button>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-900/60 space-y-3">
                    {isGeneratingVoice ? (
                      <div className="space-y-2">
                        <div className="flex justify-between text-[10px] font-bold text-violet-400">
                          <span className="animate-pulse">ĐANG TẠO GIỌNG NÓI & SRT...</span>
                          <span className="font-mono">
                            {voiceProgress ? `${voiceProgress.percent}% (${voiceProgress.current}/${voiceProgress.total})` : 'Đang chuẩn bị...'}
                          </span>
                        </div>
                        <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-violet-600 to-fuchsia-600 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${voiceProgress ? voiceProgress.percent : 0}%` }}
                          ></div>
                        </div>
                        <p className="text-[10px] text-slate-500 italic font-sans leading-normal font-medium">
                          {voiceProgress 
                            ? `Đang sinh file âm thanh ${voiceProgress.current}/${voiceProgress.total}. Vui lòng giữ nguyên màn hình.`
                            : 'Đang gửi kịch bản và chuẩn bị hàng chờ...'}
                        </p>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleGenerateVoiceAndSrt}
                        disabled={isAnyGenerating || !scriptText.trim() || speakers.length === 0 || !currentProject.videoSaveDir}
                        className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:from-slate-900 disabled:to-slate-950 disabled:text-gray-655 disabled:opacity-40 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-lg hover:shadow-violet-500/10 transition-all duration-200 cursor-pointer disabled:cursor-not-allowed select-none flex items-center justify-center gap-1.5 hover:scale-[1.01] active:scale-[0.98]"
                      >
                        <Sparkles className="w-4 h-4" />
                        Sinh Giọng Đọc & Phụ Đề
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Character Voice Mapping Block (Multi-voice mode only) */}
              {scriptMode === 'multi' && detectedCharacters.length > 0 && (
                <div className="pt-4 border-t border-slate-900/60 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                    <div className="flex items-center gap-2">
                      <Volume2 className="w-4 h-4 text-violet-400" />
                      <h4 className="font-bold text-slate-300 text-[10px] uppercase tracking-wider">Cấu hình ánh xạ giọng đọc (Đa Vai)</h4>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                      Phát hiện {detectedCharacters.length} nhân vật
                    </span>
                  </div>

                  {/* AI Auto-Assign Section */}
                  <div className="bg-slate-950/40 border border-slate-900 rounded-xl p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-violet-400 uppercase tracking-wider flex items-center gap-1">
                        <Sparkles className="w-3 h-3 animate-pulse" />
                        AI Tự Động Gán Giọng (Auto-Assign)
                      </span>
                    </div>
                    <textarea
                      placeholder="Dán thông tin chi tiết nhân vật vào đây...&#10;Ví dụ:&#10;Ren (蓮) | 35 tuổi | Nam | Giám đốc lạnh lùng&#10;Aoi (葵) | 28 tuổi | Nữ | Nhân hậu, kiên cường"
                      value={characterDetailsText}
                      onChange={(e) => {
                        setCharacterDetailsText(e.target.value);
                        localStorage.setItem('voice_char_details_text', e.target.value);
                      }}
                      disabled={isAnyGenerating}
                      className="w-full bg-slate-955 border border-gray-900 rounded-lg p-2.5 text-xs text-slate-300 focus:outline-none focus:border-violet-500 min-h-[90px] font-sans resize-y disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={handleAiAssignVoices}
                      disabled={isAnyGenerating || isAssigningVoices || !characterDetailsText.trim()}
                      className="w-full bg-violet-650 hover:bg-violet-555 disabled:bg-slate-955/20 disabled:text-gray-650 text-white text-[10px] font-bold py-1.5 px-3 rounded-lg border border-violet-600/40 cursor-pointer disabled:cursor-not-allowed transition duration-200 text-center flex items-center justify-center gap-1 select-none"
                    >
                      {isAssigningVoices ? (
                        <>
                          <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full mr-1"></span>
                          Đang phân tích và gán giọng...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3 h-3" />
                          AI Phân Tích & Gán Giọng
                        </>
                      )}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto pr-1">
                    {detectedCharacters.map(char => (
                      <div key={char} className="bg-slate-955/40 border border-slate-900 rounded-xl p-2.5 flex items-center justify-between gap-3">
                        <span className="text-xs font-bold text-slate-200 truncate max-w-[120px]" title={char}>
                          {char}
                        </span>
                        <div className="flex gap-1.5 items-center shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setVoiceCatalogTarget({ type: 'char', charName: char });
                              setShowVoiceCatalogModal(true);
                            }}
                            disabled={isAnyGenerating}
                            className="bg-slate-955 hover:bg-slate-900/80 border border-gray-900 hover:border-slate-800 rounded px-2.5 py-1.5 text-[11px] text-slate-200 transition text-left cursor-pointer flex items-center justify-between gap-2 max-w-[170px] truncate disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <span className="truncate pr-1">
                              {getCharacterSpeakerLabel(char)}
                            </span>
                            <Sliders className="w-3 h-3 text-slate-400 shrink-0" />
                          </button>
                          <button
                            type="button"
                            onClick={() => playSpeakerSample(charVoiceMap[char] !== undefined ? charVoiceMap[char] : speakerId)}
                            disabled={isAnyGenerating || (!aivisSpeakers.length && !voicevoxSpeakers.length)}
                            className="bg-violet-955/40 hover:bg-violet-900/50 border border-violet-900/50 rounded p-1.5 flex items-center justify-center text-violet-400 cursor-pointer transition select-none disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                            title="Nghe thử"
                          >
                            {playingSampleId === (charVoiceMap[char] !== undefined ? charVoiceMap[char] : speakerId) ? (
                              <span className="inline-block w-3.5 h-3.5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin"></span>
                            ) : (
                              <Volume2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}                  </div>
                  <p className="text-[9px] text-slate-500 italic">
                    * Các câu thoại không chứa định dạng vai sẽ sử dụng giọng đọc chính (được chọn trong phần nhân vật đọc ở trên).
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Video Auto-Download Configuration */}
          <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-950 pb-3">
                <Download className="w-5 h-5 text-violet-400" />
                <h3 className="font-bold text-slate-200 text-sm">Cấu hình Tải Video tự động</h3>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="autoDownloadVideo"
                    checked={!!currentProject.autoDownloadVideo}
                    onChange={(e) => setCurrentProjectField('autoDownloadVideo', e.target.checked)}
                    className="rounded border-gray-900 text-violet-600 focus:ring-violet-500/20 bg-slate-950 w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="autoDownloadVideo" className="text-xs font-semibold text-slate-300 cursor-pointer select-none">
                    Tự động tải video về PC sau khi tạo thành công
                  </label>
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Thư mục lưu video trên máy tính (Đường dẫn tuyệt đối)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={currentProject.videoSaveDir || ''}
                      onChange={(e) => setCurrentProjectField('videoSaveDir', e.target.value)}
                      placeholder="Ví dụ: D:\MangaStoryboard\videos hoặc C:\Users\Admin\Downloads"
                      className="flex-1 bg-slate-950 border border-gray-900 rounded-lg text-xs text-slate-200 px-3.5 py-2 focus:outline-none focus:border-violet-500 transition font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleSelectDirectory}
                      className="bg-slate-900 hover:bg-slate-800 border border-slate-850 hover:border-slate-700 text-xs font-semibold text-slate-300 hover:text-slate-100 px-4 py-2 rounded-lg transition cursor-pointer select-none flex items-center gap-1.5 shrink-0"
                    >
                      <FolderOpen className="w-4 h-4 text-violet-400" />
                      Chọn thư mục
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 italic leading-relaxed">
                    * Video sẽ tự động được lưu dưới dạng <code className="bg-slate-950 px-1 py-0.5 rounded font-mono text-[9px] text-violet-400">segment_XX.mp4</code> vào thư mục này ngay sau khi quá trình video hoàn tất.
                  </p>
                </div>
              </div>
            </div>
          
        </div>

        {/* Right Column (1/3 width) */}
        <div className="space-y-6">
          {/* Style Selection and Management */}
          <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-950 pb-3">
                <div className="flex items-center gap-2">
                  <Palette className="w-5 h-5 text-violet-400" />
                  <h3 className="font-bold text-slate-200 text-sm">Style vẽ ảnh</h3>
                </div>
                <button
                  onClick={() => setShowStyleManager(!showStyleManager)}
                  className="text-xs text-violet-400 hover:text-violet-300 font-semibold transition flex items-center gap-1 cursor-pointer bg-transparent border-0"
                >
                  <Settings className="w-3.5 h-3.5" />
                  {showStyleManager ? 'Đóng' : 'Quản lý'}
                </button>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                    Chọn phong cách vẽ (Style)
                  </label>
                  <select
                    value={currentProject.selectedStyleId || 'manga_color'}
                    onChange={(e) => setSelectedStyleId(e.target.value)}
                    className="w-full bg-slate-950 border border-gray-900 rounded-lg text-xs text-slate-200 px-3 py-2 focus:outline-none focus:border-violet-500 transition cursor-pointer"
                  >
                    {styles.map((style) => (
                      <option key={style.id} value={style.id}>
                        {style.name} {style.isCustom ? '(Tùy chỉnh)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-900/60 text-[10px] space-y-2 max-h-[140px] overflow-y-auto scrollbar-thin">
                  <div className="text-[10px] text-violet-400 font-semibold uppercase tracking-wider">Mô tả Style hiện tại</div>
                  <div className="space-y-1.5 font-sans leading-relaxed">
                    <div>
                      <span className="font-bold text-gray-500 uppercase mr-1">Nhân vật:</span>
                      <span className="text-slate-300 italic">{currentStyle.characterSuffix}</span>
                    </div>
                    <div>
                      <span className="font-bold text-gray-500 uppercase mr-1">Bối cảnh:</span>
                      <span className="text-slate-300 italic">{currentStyle.backgroundSuffix}</span>
                    </div>
                    <div>
                      <span className="font-bold text-gray-500 uppercase mr-1">Cảnh:</span>
                      <span className="text-slate-300 italic">{currentStyle.sceneSuffix}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Style Manager Interface */}
              {showStyleManager && (
                <div className="mt-4 pt-4 border-t border-slate-950 space-y-4 animate-fadeIn">
                  {/* Style List */}
                  <div className="bg-slate-950 rounded-lg border border-slate-900/80 p-3 flex flex-col h-[180px]">
                    <div className="flex items-center justify-between mb-2 pb-1 border-b border-gray-900">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Danh sách Style</span>
                      <button
                        onClick={handleNewStyleInit}
                        className="flex items-center gap-1 text-[9px] bg-violet-600/20 text-violet-300 border border-violet-800/50 hover:bg-violet-600/30 px-2 py-0.5 rounded transition cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> Thêm mới
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-1 scrollbar-thin">
                      {styles.map((style) => (
                        <div
                          key={style.id}
                          onClick={() => handleSelectStyleToEdit(style)}
                          className={`flex items-center justify-between text-xs p-2 rounded cursor-pointer transition ${
                            (editingStyle?.id === style.id || (!editingStyle && isNewStyle && style.id === 'new'))
                              ? 'bg-violet-950/30 border border-violet-900/60 text-violet-300'
                              : 'hover:bg-slate-900 border border-transparent text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <span className="font-medium truncate">{style.name}</span>
                          <span className="text-[8px] px-1.5 py-0.5 rounded font-mono shrink-0 scale-90 select-none">
                            {style.isCustom ? (
                              <span className="bg-violet-950 text-violet-400 border border-violet-900/40">Custom</span>
                            ) : (
                              <span className="bg-slate-900 text-gray-500 border border-slate-800">System</span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Style Form */}
                  <div className="space-y-3 bg-slate-950/40 border border-slate-900/50 p-3 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                        {isNewStyle ? 'Tạo Style mới' : 'Chi tiết Style'}
                      </span>
                      {!editingStyle?.isCustom && !isNewStyle && (
                        <span className="text-[8px] text-amber-500 bg-amber-950/20 border border-amber-900/40 px-2 py-0.5 rounded font-medium select-none scale-90">
                          Mặc định
                        </span>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Tên Style</label>
                        <input
                          type="text"
                          disabled={!isNewStyle && !editingStyle?.isCustom}
                          value={styleForm.name}
                          onChange={(e) => setStyleForm({ ...styleForm, name: e.target.value })}
                          placeholder="Ví dụ: Manga Color, Black and White..."
                          className="w-full bg-slate-950 border border-gray-900 rounded text-xs text-slate-200 px-3 py-2 focus:outline-none focus:border-violet-500 disabled:opacity-50"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                          Nhân vật Suffix (Character sheet)
                        </label>
                        <textarea
                          disabled={!isNewStyle && !editingStyle?.isCustom}
                          value={styleForm.characterSuffix}
                          onChange={(e) => setStyleForm({ ...styleForm, characterSuffix: e.target.value })}
                          rows={2}
                          placeholder="Phong cách thêm vào prompt của nhân vật..."
                          className="w-full bg-slate-950 border border-gray-900 rounded text-xs text-slate-200 px-3 py-1.5 focus:outline-none focus:border-violet-500 disabled:opacity-50 font-mono text-[10px] leading-normal"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                          Bối cảnh Suffix (Background layout)
                        </label>
                        <textarea
                          disabled={!isNewStyle && !editingStyle?.isCustom}
                          value={styleForm.backgroundSuffix}
                          onChange={(e) => setStyleForm({ ...styleForm, backgroundSuffix: e.target.value })}
                          rows={2}
                          placeholder="Phong cách thêm vào prompt của bối cảnh..."
                          className="w-full bg-slate-950 border border-gray-900 rounded text-xs text-slate-200 px-3 py-1.5 focus:outline-none focus:border-violet-500 disabled:opacity-50 font-mono text-[10px] leading-normal"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                          Storyboard Suffix (Scene description)
                        </label>
                        <textarea
                          disabled={!isNewStyle && !editingStyle?.isCustom}
                          value={styleForm.sceneSuffix}
                          onChange={(e) => setStyleForm({ ...styleForm, sceneSuffix: e.target.value })}
                          rows={3}
                          placeholder="Phong cách vẽ chi tiết cho cảnh phim..."
                          className="w-full bg-slate-950 border border-gray-900 rounded text-xs text-slate-200 px-3 py-1.5 focus:outline-none focus:border-violet-500 disabled:opacity-50 font-mono text-[10px] leading-normal"
                        />
                      </div>
                    </div>

                    {(isNewStyle || editingStyle?.isCustom) && (
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-950">
                        {editingStyle?.isCustom && !isNewStyle && (
                          <button
                            onClick={handleDeleteStyle}
                            className="flex items-center gap-1 bg-red-950/30 hover:bg-red-900/20 border border-red-900 text-red-400 text-[10px] px-2.5 py-1.5 rounded transition font-semibold cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" /> Xóa
                          </button>
                        )}
                        <button
                          onClick={handleSaveStyle}
                          className="flex items-center gap-1 bg-violet-600 hover:bg-violet-500 text-white text-[10px] px-3 py-1.5 rounded transition font-semibold cursor-pointer"
                        >
                          <Save className="w-3 h-3" />
                          {isNewStyle ? 'Tạo mới' : 'Lưu'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          
        </div>
      </div>

            {showVoiceCatalogModal && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-4xl w-full h-[85vh] bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col gap-4 overflow-hidden animate-in fade-in zoom-in duration-200">
            
            {/* Header */}
            <div className="flex justify-between items-center shrink-0 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <Headphones className="w-4 h-4 text-violet-400" />
                  {voiceCatalogTarget?.type === 'main' 
                    ? 'Thư viện giọng đọc chính' 
                    : `Thư viện giọng đọc cho nhân vật: "${voiceCatalogTarget?.type === 'char' ? voiceCatalogTarget.charName : ''}"`
                  }
                </h3>
                <p className="text-[10px] text-gray-500 mt-0.5 font-sans">
                  Duyệt gói giọng, nghe thử và chọn giọng phù hợp.
                </p>
              </div>
              <button
                onClick={() => {
                  if (sampleAudio) {
                    sampleAudio.pause();
                    setSampleAudio(null);
                  }
                  setPlayingSampleId(null);
                  setShowVoiceCatalogModal(false);
                }}
                className="bg-slate-850 hover:bg-slate-850 text-slate-400 hover:text-slate-200 p-1.5 rounded-lg border border-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Engine Tabs */}
            <div className="flex border-b border-slate-800 shrink-0 gap-2 p-0.5 bg-slate-950/40 rounded-lg">
              <button
                type="button"
                onClick={() => setActiveEngineTab('aivis')}
                className={`flex-1 py-2 text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 rounded-md cursor-pointer ${
                  activeEngineTab === 'aivis'
                    ? 'bg-violet-660/20 text-violet-400 border border-violet-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Headphones className="w-3.5 h-3.5" />
                Aivis Speech {aivisStatus === 'active' ? '(🟢 Kết nối)' : '(🔴 Chưa mở)'}
              </button>
              <button
                type="button"
                onClick={() => setActiveEngineTab('voicevox')}
                className={`flex-1 py-2 text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 rounded-md cursor-pointer ${
                  activeEngineTab === 'voicevox'
                    ? 'bg-violet-660/20 text-violet-400 border border-violet-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Headphones className="w-3.5 h-3.5" />
                Voicevox {voicevoxStatus === 'active' ? '(🟢 Kết nối)' : '(🔴 Chưa mở)'}
              </button>
            </div>

            {activeEngineTab === 'aivis' && aivisStatus !== 'active' ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-950/40 rounded-xl border border-slate-855 leading-normal">
                <AlertTriangle className="w-12 h-12 text-rose-500 mb-2 animate-bounce" />
                <h4 className="text-sm font-bold text-slate-200">Engine Aivis Speech chưa hoạt động</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-md leading-relaxed">
                  Hãy chắc chắn rằng bạn đã mở ứng dụng Aivis Speech trên máy tính, bật API Server và cấu hình đúng địa chỉ URL: <strong className="font-mono text-violet-400">{aivisUrl}</strong>
                </p>
                <button
                  type="button"
                  onClick={() => scanBothEngines()}
                  className="mt-4 bg-violet-650 hover:bg-violet-555 text-white text-xs font-bold px-4 py-2 rounded-xl transition cursor-pointer"
                >
                  Thử quét lại
                </button>
              </div>
            ) : activeEngineTab === 'voicevox' && voicevoxStatus !== 'active' ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-950/40 rounded-xl border border-slate-855 leading-normal">
                <AlertTriangle className="w-12 h-12 text-rose-500 mb-2 animate-bounce" />
                <h4 className="text-sm font-bold text-slate-200">Engine Voicevox chưa hoạt động</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-md leading-relaxed">
                  Hãy chắc chắn rằng bạn đã mở ứng dụng Voicevox trên máy tính và cấu hình đúng địa chỉ URL: <strong className="font-mono text-violet-400">{voicevoxUrl}</strong>
                </p>
                <button
                  type="button"
                  onClick={() => scanBothEngines()}
                  className="mt-4 bg-violet-650 hover:bg-violet-555 text-white text-xs font-bold px-4 py-2 rounded-xl transition cursor-pointer"
                >
                  Thử quét lại
                </button>
              </div>
            ) : (
              <>
                {/* Toolbar: Tabs & Search */}
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-between shrink-0">
                  {/* Tabs */}
                  <div className="flex gap-1 bg-slate-950 p-1 rounded-lg border border-slate-855 overflow-x-auto w-full sm:w-auto">
                    {[
                      { key: 'All', label: 'Tất cả' },
                      { key: 'male_young', label: 'Nam Trẻ' },
                      { key: 'male_adult', label: 'Nam Trưởng' },
                      { key: 'female_young', label: 'Nữ Trẻ' },
                      { key: 'female_adult', label: 'Nữ Trưởng' },
                      { key: 'other', label: 'Khác' },
                    ].map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setActiveCatalogTab(t.key)}
                        className={`px-3 py-1 rounded text-[11px] font-bold tracking-wide transition cursor-pointer shrink-0 ${
                          activeCatalogTab === t.key
                            ? 'bg-violet-650 text-white shadow'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* Search input */}
                  <div className="relative w-full sm:w-64 shrink-0">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchVoiceQuery}
                      onChange={(e) => setSearchVoiceQuery(e.target.value)}
                      placeholder="Tìm tên hoặc tính chất giọng..."
                      className="w-full bg-slate-950 border border-slate-850 hover:border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition"
                    />
                  </div>
                </div>

                {/* List/Grid of Voice styles */}
                <div className="flex-1 overflow-y-auto min-h-0 pr-1 select-none">
                  {(() => {
                    const currentSpeakers = activeEngineTab === 'aivis' ? aivisSpeakers : voicevoxSpeakers;
                    const currentUrl = activeEngineTab === 'aivis' ? aivisUrl : voicevoxUrl;

                    const flatStyles = currentSpeakers.flatMap((s: any) => 
                      (s.styles || []).map((st: any) => {
                        const cat = getSpeakerCategory(s.name);
                        return {
                          id: st.id,
                          encodedId: `${currentUrl}|${st.id}`,
                          speakerName: s.name,
                          styleName: st.name,
                          characteristics: cat.desc,
                          group: cat.group,
                          groupKey: cat.group.toLowerCase()
                        };
                      })
                    );

                    const filtered = flatStyles.filter(item => {
                      if (activeCatalogTab !== 'All') {
                        if (activeCatalogTab === 'other') {
                          if (!item.groupKey.includes('other') && !item.groupKey.includes('khác')) {
                            return false;
                          }
                        } else {
                          if (!item.groupKey.includes(activeCatalogTab)) {
                            return false;
                          }
                        }
                      }

                      if (searchVoiceQuery.trim() !== '') {
                        const q = searchVoiceQuery.toLowerCase();
                        return (
                          item.speakerName.toLowerCase().includes(q) ||
                          item.styleName.toLowerCase().includes(q) ||
                          item.characteristics.toLowerCase().includes(q)
                        );
                      }
                      return true;
                    });

                    if (filtered.length === 0) {
                      return (
                        <div className="h-full flex flex-col items-center justify-center text-slate-500 italic text-xs gap-1 py-12">
                          <Headphones className="w-8 h-8 opacity-20 animate-pulse" />
                          <span>Không tìm thấy giọng đọc nào phù hợp.</span>
                        </div>
                      );
                    }

                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {filtered.map((item) => {
                          // Check if currently selected
                          let isSelected = false;
                          if (voiceCatalogTarget?.type === 'main') {
                            isSelected = speakerId === item.encodedId || (typeof speakerId === 'number' && Number(speakerId) === item.id && activeEngineTab === 'voicevox');
                          } else if (voiceCatalogTarget?.type === 'char') {
                            const currentVal = charVoiceMap[voiceCatalogTarget.charName] ?? speakerId;
                            isSelected = currentVal === item.encodedId || (typeof currentVal === 'number' && Number(currentVal) === item.id && activeEngineTab === 'voicevox');
                          }

                          return (
                            <div
                              key={item.encodedId}
                              className={`bg-slate-955/40 border rounded-xl p-3.5 flex flex-col justify-between gap-3 transition hover:border-slate-800 ${
                                isSelected 
                                  ? 'border-violet-650 bg-violet-955/10 shadow-lg shadow-violet-950/5 animate-fadeIn' 
                                  : 'border-slate-850 bg-slate-955/30'
                              }`}
                            >
                              <div>
                                <div className="flex justify-between items-start gap-2">
                                  <span className="text-xs font-bold text-slate-100 leading-tight">
                                    {item.speakerName} ({item.styleName})
                                  </span>
                                  <span className="bg-slate-900 border border-slate-800 text-slate-400 text-[8px] font-mono font-bold px-1.5 py-0.5 rounded">
                                    ID: {item.id}
                                  </span>
                                </div>
                                <p className="text-[10px] text-violet-400 font-bold mt-1 uppercase tracking-wide truncate" title={item.group}>
                                  {item.group.replace(/^\d+\.\s+Nhóm\s+Giọng\s+/, '')}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-2 font-medium leading-relaxed font-sans">
                                  {item.characteristics}
                                </p>
                              </div>

                              <div className="flex justify-between items-center pt-2 border-t border-slate-900/60">
                                <button
                                  type="button"
                                  onClick={() => playSpeakerSample(item.encodedId)}
                                  className={`p-2 rounded-lg border transition cursor-pointer flex items-center justify-center ${
                                    playingSampleId === item.encodedId
                                      ? 'bg-violet-650 border-violet-555 text-white animate-pulse'
                                      : 'bg-slate-900 border-slate-800 text-violet-400 hover:bg-slate-850 hover:text-violet-300'
                                  }`}
                                  title="Nghe thử giọng"
                                >
                                  {playingSampleId === item.encodedId ? (
                                    <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                  ) : (
                                    <Play className="w-3.5 h-3.5 fill-current" />
                                  )}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    if (voiceCatalogTarget?.type === 'main') {
                                      setSpeakerId(item.encodedId);
                                      localStorage.setItem('voice_speaker_id', item.encodedId);
                                    } else if (voiceCatalogTarget?.type === 'char') {
                                      const char = voiceCatalogTarget.charName;
                                      const updatedMap = { ...charVoiceMap, [char]: item.encodedId };
                                      setCharVoiceMap(updatedMap);
                                      localStorage.setItem('voice_char_voice_map', JSON.stringify(updatedMap));
                                    }
                                    if (sampleAudio) {
                                      sampleAudio.pause();
                                      setSampleAudio(null);
                                    }
                                    setPlayingSampleId(null);
                                    setShowVoiceCatalogModal(false);
                                  }}
                                  className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition cursor-pointer active:scale-95 flex items-center gap-1 ${
                                    isSelected
                                      ? 'bg-emerald-950/40 border border-emerald-900 text-emerald-400'
                                      : 'bg-violet-650 hover:bg-violet-555 text-white'
                                  }`}
                                >
                                  {isSelected ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-400" />
                                      Đang chọn
                                    </>
                                  ) : (
                                    'Chọn giọng'
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </>
            )}
            
            {/* Footer */}
            <div className="shrink-0 border-t border-slate-800 pt-3 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (sampleAudio) {
                    sampleAudio.pause();
                    setSampleAudio(null);
                  }
                  setPlayingSampleId(null);
                  setShowVoiceCatalogModal(false);
                }}
                className="bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-bold px-4 py-2 rounded-xl transition cursor-pointer border border-slate-800"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      <FolderPickerModal
        isOpen={isFolderPickerOpen}
        onClose={() => setIsFolderPickerOpen(false)}
        onSelect={handleFolderSelectConfirm}
        initialPath={currentProject.videoSaveDir || ''}
        title="Chọn thư mục lưu video"
      />
    </div>
  );
}
