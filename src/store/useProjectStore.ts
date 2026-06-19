import { create } from 'zustand';
import {
  Project,
  SceneMappingRow,
  ImagePromptRow,
  CharacterReference,
  ExteriorReference,
  PropReference,
  BgmSuggestionRow,
  saveProject,
  getProject,
  deleteProject as dbDeleteProject,
  listProjects,
  saveCharacter,
  deleteCharacter as dbDeleteCharacter,
  listCharacters,
  saveExterior,
  deleteExterior as dbDeleteExterior,
  listExteriors,
  saveProp,
  deleteProp as dbDeleteProp,
  listProps
} from '../lib/db';
import { parseSRT } from '../lib/srtParser';
import { AIProviderFactory } from '../lib/ai/factory';
import { AIConfig } from '../lib/ai/types';

const syncChannel = typeof window !== 'undefined' ? new BroadcastChannel('manga_project_sync') : null;

export function normalizeName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[()]/g, ' ') // replace parentheses with spaces
    .replace(/[-_\s]+/g, '_') // normalize all separators to single underscore
    .trim();
}

export function cleanErrorMessage(rawText: string): string {
  if (!rawText) return 'Unknown error';
  let current = rawText.trim();

  // Recursively parse double/triple-serialized JSON errors
  for (let i = 0; i < 5; i++) {
    try {
      const parsed = JSON.parse(current);
      if (parsed && typeof parsed === 'object') {
        if (parsed.error !== undefined && parsed.error !== null) {
          if (typeof parsed.error === 'string') {
            current = parsed.error.trim();
            continue;
          } else if (typeof parsed.error === 'object' && parsed.error.error) {
            current = String(parsed.error.error);
            break;
          } else {
            current = String(parsed.error);
            break;
          }
        }
        if (parsed.message) {
          current = String(parsed.message);
          break;
        }
        break;
      } else if (typeof parsed === 'string') {
        current = parsed.trim();
        continue;
      }
      break;
    } catch (_) {
      break;
    }
  }

  // Fallback: if it looks like JSON containing "error": "...", extract it with regex
  if (current.includes('"error":')) {
    const match = current.match(/"error"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
    if (match && match[1]) {
      try {
        return JSON.parse(`"${match[1]}"`);
      } catch (_) {
        return match[1];
      }
    }
  }

  return current;
}

export function parseCharactersField(characters: any): string[] {
  if (!characters) return [];
  if (typeof characters === 'string') {
    return characters.split(',').map(c => c.trim()).filter(Boolean);
  }
  if (Array.isArray(characters)) {
    return characters.map(c => {
      if (typeof c === 'string') return c.trim();
      if (c && typeof c === 'object') {
        if ('name' in c) return String(c.name).trim();
        if ('characterId' in c) return String(c.characterId).trim();
      }
      return String(c).trim();
    }).filter(Boolean);
  }
  if (typeof characters === 'object') {
    if (characters.name) return [String(characters.name).trim()];
    if (characters.characterId) return [String(characters.characterId).trim()];
  }
  return [String(characters).trim()].filter(Boolean);
}

export function isCharacterMatch(charIdInRef: string, queryName: string): boolean {
  const refNorm = normalizeName(charIdInRef);
  const queryNorm = normalizeName(queryName);
  
  if (refNorm === queryNorm) return true;
  
  // Parenthetical checks (e.g. Aoi (Home) vs aoi_home)
  const parentheticalMatch = queryName.match(/\s*\((.*?)\)\s*/);
  if (parentheticalMatch) {
    const basePart = queryName.replace(/\s*\(.*?\)\s*/g, '');
    const variantPart = parentheticalMatch[1];
    
    const queryWithVariant = normalizeName(`${basePart}_${variantPart}`);
    if (refNorm === queryWithVariant) return true;
    
    const queryBase = normalizeName(basePart);
    if (refNorm === queryBase) return true;
  }
  
  const queryBaseOnly = normalizeName(queryName.replace(/\s*\(.*?\)\s*/g, ''));
  if (refNorm === queryBaseOnly) return true;

  // 5. Prefix/Sub-location matching fallback (e.g. "train_station_ticket_gate" starts with "train_station")
  if (queryNorm.startsWith(refNorm + '_') || refNorm.startsWith(queryNorm + '_')) return true;

  return false;
}

export function isExteriorMatch(exteriorIdInRef: string, queryName: string): boolean {
  return isCharacterMatch(exteriorIdInRef, queryName);
}

export function isPropMatch(propIdInRef: string, queryName: string): boolean {
  return isCharacterMatch(propIdInRef, queryName);
}

export function findBestPropMatch(
  propsList: PropReference[],
  queryName: string
): PropReference | undefined {
  if (!queryName || !propsList) return undefined;
  const queryNorm = normalizeName(queryName);
  
  // 1. Exact match (e.g. "car" vs "car", or "blue_car" vs "blue_car")
  let match = propsList.find(p => normalizeName(p.propId) === queryNorm);
  if (match) return match;
  
  // 2. Parenthetical variant match (e.g. "Car (Blue)" vs reference "car_blue")
  const parentheticalMatch = queryName.match(/\s*\((.*?)\)\s*/);
  if (parentheticalMatch) {
    const basePart = queryName.replace(/\s*\(.*?\)\s*/g, '');
    const variantPart = parentheticalMatch[1];
    const queryWithVariant = normalizeName(`${basePart}_${variantPart}`);
    match = propsList.find(p => normalizeName(p.propId) === queryWithVariant);
    if (match) return match;
  }
  
  // 3. Base fallback match (e.g. "Car (Blue)" vs reference "car")
  if (parentheticalMatch) {
    const basePart = queryName.replace(/\s*\(.*?\)\s*/g, '');
    const queryBase = normalizeName(basePart);
    match = propsList.find(p => normalizeName(p.propId) === queryBase);
    if (match) return match;
  }
  
  // 4. Reverse base match (e.g. "Car" vs reference "car_blue")
  const queryBaseOnly = normalizeName(queryName.replace(/\s*\(.*?\)\s*/g, ''));
  match = propsList.find(p => {
    const refIdNorm = normalizeName(p.propId);
    const refBase = refIdNorm.split('_')[0];
    return refBase === queryBaseOnly;
  });
  if (match) return match;
  
  // 5. Prefix/Sub-location matching fallback (e.g. "car_electric" vs "car")
  match = propsList.find(p => {
    const refIdNorm = normalizeName(p.propId);
    return queryNorm.startsWith(refIdNorm + '_') || refIdNorm.startsWith(queryNorm + '_');
  });
  if (match) return match;
  
  return undefined;
}

export function findBestCharacterMatch(
  charactersList: CharacterReference[],
  queryName: string
): CharacterReference | undefined {
  if (!queryName || !charactersList) return undefined;
  const queryNorm = normalizeName(queryName);
  
  // 1. Exact match (e.g. "kenji" vs "kenji", or "aoi_home" vs "aoi_home")
  let match = charactersList.find(c => normalizeName(c.characterId) === queryNorm);
  if (match) return match;
  
  // 2. Parenthetical variant match (e.g. "Aoi (Home)" vs reference "aoi_home")
  const parentheticalMatch = queryName.match(/\s*\((.*?)\)\s*/);
  if (parentheticalMatch) {
    const basePart = queryName.replace(/\s*\(.*?\)\s*/g, '');
    const variantPart = parentheticalMatch[1];
    const queryWithVariant = normalizeName(`${basePart}_${variantPart}`);
    match = charactersList.find(c => normalizeName(c.characterId) === queryWithVariant);
    if (match) return match;
  }
  
  // 3. Base fallback match (e.g. "Aoi (Home)" vs reference "aoi")
  if (parentheticalMatch) {
    const basePart = queryName.replace(/\s*\(.*?\)\s*/g, '');
    const queryBase = normalizeName(basePart);
    match = charactersList.find(c => normalizeName(c.characterId) === queryBase);
    if (match) return match;
  }
  
  // 4. Reverse base match (e.g. "Aoi" vs reference "aoi_home")
  const queryBaseOnly = normalizeName(queryName.replace(/\s*\(.*?\)\s*/g, ''));
  match = charactersList.find(c => {
    const refIdNorm = normalizeName(c.characterId);
    const refBase = refIdNorm.split('_')[0];
    return refBase === queryBaseOnly;
  });
  if (match) return match;
  
  // 5. Prefix/Sub-location matching fallback (e.g. "aoi_casual" vs "aoi")
  match = charactersList.find(c => {
    const refIdNorm = normalizeName(c.characterId);
    return queryNorm.startsWith(refIdNorm + '_') || refIdNorm.startsWith(queryNorm + '_');
  });
  if (match) return match;
  
  return undefined;
}

export function findBestExteriorMatch(
  exteriorsList: ExteriorReference[],
  queryName: string
): ExteriorReference | undefined {
  if (!queryName || !exteriorsList) return undefined;
  const queryNorm = normalizeName(queryName);
  
  // 1. Exact match (e.g. "bar_rainy_bird" vs "bar_rainy_bird")
  let match = exteriorsList.find(e => normalizeName(e.exteriorId) === queryNorm);
  if (match) return match;
  
  // 2. Parenthetical variant match (e.g. "Bar (Rainy Bird)" vs reference "bar_rainy_bird")
  const parentheticalMatch = queryName.match(/\s*\((.*?)\)\s*/);
  if (parentheticalMatch) {
    const basePart = queryName.replace(/\s*\(.*?\)\s*/g, '');
    const variantPart = parentheticalMatch[1];
    const queryWithVariant = normalizeName(`${basePart}_${variantPart}`);
    match = exteriorsList.find(e => normalizeName(e.exteriorId) === queryWithVariant);
    if (match) return match;
  }
  
  // 3. Base fallback match (e.g. "Bar (Rainy Bird)" vs reference "bar")
  if (parentheticalMatch) {
    const basePart = queryName.replace(/\s*\(.*?\)\s*/g, '');
    const queryBase = normalizeName(basePart);
    match = exteriorsList.find(e => normalizeName(e.exteriorId) === queryBase);
    if (match) return match;
  }
  
  // 4. Reverse base match (e.g. "Bar" vs reference "bar_rainy_bird")
  const queryBaseOnly = normalizeName(queryName.replace(/\s*\(.*?\)\s*/g, ''));
  match = exteriorsList.find(e => {
    const refIdNorm = normalizeName(e.exteriorId);
    const refBase = refIdNorm.split('_')[0];
    return refBase === queryBaseOnly;
  });
  if (match) return match;
  
  // 5. Prefix/Sub-location matching fallback (e.g. "train_station_ticket_gate" vs "train_station")
  match = exteriorsList.find(e => {
    const refIdNorm = normalizeName(e.exteriorId);
    return queryNorm.startsWith(refIdNorm + '_') || refIdNorm.startsWith(queryNorm + '_');
  });
  if (match) return match;
  
  return undefined;
}

export function getCardTitle(id: string): string {
  if (!id) return '';
  const variants = ['home', 'office', 'casual', 'formal', 'school', 'sleep', 'uniform', 'work'];
  const parts = id.split('_');
  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1].toLowerCase();
    if (variants.includes(lastPart)) {
      const base = parts.slice(0, -1).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
      const variant = lastPart.charAt(0).toUpperCase() + lastPart.slice(1);
      return `${base} (${variant})`;
    }
  }
  return id
    .split(/[-_\s]+/)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
}

export function getDisplayName(id: string): string {
  return getCardTitle(id);
}

export function parseExtractedAssets(assetsData: any) {
  const charactersRaw = assetsData?.characters || [];
  const exteriorsRaw = assetsData?.exteriors || assetsData?.backgrounds || assetsData?.locations || [];
  const propsRaw = assetsData?.props || assetsData?.items || [];

  const extChars = Array.isArray(charactersRaw) ? charactersRaw.map((c: any) => ({
    characterId: String(c.characterId || c.character_id || c.id || c.name || '').trim().toLowerCase(),
    image: '',
    age: String(c.age || ''),
    gender: String(c.gender || ''),
    personality: String(c.personality || ''),
    role: String(c.role || ''),
    prompt: String(c.prompt || c.description || '')
  })).filter((c: any) => !!c.characterId) : [];

  const extExts = Array.isArray(exteriorsRaw) ? exteriorsRaw.map((e: any) => ({
    exteriorId: String(e.exteriorId || e.exterior_id || e.id || e.name || '').trim().toLowerCase(),
    image: '',
    prompt: String(e.prompt || e.description || '')
  })).filter((e: any) => !!e.exteriorId) : [];

  const extProps = Array.isArray(propsRaw) ? propsRaw.map((p: any) => ({
    propId: String(p.propId || p.prop_id || p.id || p.name || '').trim().toLowerCase(),
    image: '',
    prompt: String(p.prompt || p.description || '')
  })).filter((p: any) => !!p.propId) : [];

  return { extChars, extExts, extProps };
}

export function syncProjectReferences<T extends {
  sceneMapping?: SceneMappingRow[];
  imagePrompts?: ImagePromptRow[];
  characters?: CharacterReference[];
  exteriors?: ExteriorReference[];
  props?: PropReference[];
}>(project: T): T {
  if (!project) return project;

  // 1. Scan for characters
  const charNames = new Set<string>();
  const scanCharacters = (field: any) => {
    parseCharactersField(field).forEach(trimmed => {
      charNames.add(trimmed);
    });
  };

  (project.sceneMapping || []).forEach(row => scanCharacters(row.characters));
  (project.imagePrompts || []).forEach(row => scanCharacters(row.characters));

  // 2. Scan for exteriors
  const extNames = new Set<string>();
  (project.imagePrompts || []).forEach(row => {
    const trimmed = (row.exterior || '').trim();
    if (trimmed) {
      extNames.add(trimmed);
    }
  });

  // 3. Scan for props
  const propNames = new Set<string>();
  const scanProps = (field: any) => {
    parseCharactersField(field).forEach(trimmed => {
      propNames.add(trimmed);
    });
  };
  (project.sceneMapping || []).forEach(row => scanProps(row.props));
  (project.imagePrompts || []).forEach(row => scanProps(row.props));

  const updatedCharacters = [...(project.characters || [])];
  const updatedExteriors = [...(project.exteriors || [])];
  const updatedProps = [...(project.props || [])];
  let changed = false;

  // Sync characters
  charNames.forEach(name => {
    const matched = findBestCharacterMatch(updatedCharacters, name);
    if (!matched) {
      const newId = normalizeName(name) || name.toLowerCase();
      if (newId && !updatedCharacters.some(c => c.characterId.toLowerCase() === newId.toLowerCase())) {
        updatedCharacters.push({
          characterId: newId,
          image: '',
          prompt: ''
        });
        changed = true;
      }
    }
  });

  // Sync exteriors
  extNames.forEach(name => {
    const matched = findBestExteriorMatch(updatedExteriors, name);
    if (!matched) {
      const newId = normalizeName(name) || name.toLowerCase();
      if (newId && !updatedExteriors.some(e => e.exteriorId.toLowerCase() === newId.toLowerCase())) {
        updatedExteriors.push({
          exteriorId: newId,
          image: '',
          prompt: ''
        });
        changed = true;
      }
    }
  });

  // Sync props
  propNames.forEach(name => {
    const matched = findBestPropMatch(updatedProps, name);
    if (!matched) {
      const newId = normalizeName(name) || name.toLowerCase();
      if (newId && !updatedProps.some(p => p.propId.toLowerCase() === newId.toLowerCase())) {
        updatedProps.push({
          propId: newId,
          image: '',
          prompt: ''
        });
        changed = true;
      }
    }
  });

  if (changed) {
    return {
      ...project,
      characters: updatedCharacters,
      exteriors: updatedExteriors,
      props: updatedProps
    };
  }

  return project;
}


export interface ImageGenConfig {
  count: number;
  aspectRatio: string;
  model: string;
  concurrency: number;
  delayTime: number;
}

export interface VideoGenConfig {
  count: number;
  aspectRatio: string;
  model: string;
  concurrency: number;
}

export interface DrawingStyle {
  id: string;
  name: string;
  characterSuffix: string;
  backgroundSuffix: string;
  sceneSuffix: string;
  isCustom?: boolean;
}

export const DEFAULT_STYLES: DrawingStyle[] = [
  {
    id: 'manga_color',
    name: 'Manga Color',
    characterSuffix: 'modern colored manga anime style',
    backgroundSuffix: 'modern colored manga anime style',
    sceneSuffix: 'modern colored manga, cinematic anime movie, Japanese drama realism, highly detailed illustration, emotional storytelling composition, movie-quality coloring, beautiful depth of field, anime movie atmosphere, (no text, no subtitle, manga color style)'
  },
  {
    id: 'manga_bw',
    name: 'Manga B&W (Trắng đen)',
    characterSuffix: 'black and white manga style, screentone, ink drawing, hand-drawn manga art',
    backgroundSuffix: 'black and white manga style, detailed line art, screentone, hand-drawn manga background',
    sceneSuffix: 'black and white manga style, screentone, highly detailed ink illustration, dramatic manga shading, emotional storytelling composition, (no text, no subtitle, manga black and white style)'
  },
  {
    id: 'anime_movie',
    name: 'Anime Movie (Điện ảnh)',
    characterSuffix: 'cinematic anime movie style, Makoto Shinkai style, vibrant lighting, highly detailed anime character design',
    backgroundSuffix: 'cinematic anime background, Makoto Shinkai style, beautiful sky, sunset lighting, highly detailed landscape painting',
    sceneSuffix: 'cinematic anime movie style, stunning anime illustration, emotional storytelling composition, movie-quality lighting, beautiful depth of field, anime movie atmosphere, (no text, no subtitle)'
  },
  {
    id: 'chibi_kawaii',
    name: 'Chibi / Kawaii (Dễ thương)',
    characterSuffix: 'chibi character design, super deformed, cute kawaii style, large expressive eyes, small body, simple details',
    backgroundSuffix: 'cute simple anime background, pastel colors, soft lighting, cozy whimsical details',
    sceneSuffix: 'cute chibi anime style, pastel colored, highly charming illustration, cheerful storytelling composition, soft focus, kawaii atmosphere, (no text, no subtitle)'
  },
  {
    id: 'webtoon_korean',
    name: 'Webtoon (Hàn Quốc)',
    characterSuffix: 'Korean webtoon style, semi-realistic anime, smooth digital painting, elegant clothing, handsome/beautiful features',
    backgroundSuffix: 'modern webtoon background, digital painting, atmospheric lighting, clean lines, contemporary interior/exterior design',
    sceneSuffix: 'Korean webtoon style, high-end digital manhwa illustration, dramatic lighting, beautiful depth of field, romantic or intense atmosphere, (no text, no subtitle)'
  },
  {
    id: 'cyberpunk_scifi',
    name: 'Cyberpunk / Sci-Fi (Viễn tưởng)',
    characterSuffix: 'cyberpunk anime character design, futuristic techwear clothing, neon highlights, cybernetic enhancements, high-tech gear',
    backgroundSuffix: 'cyberpunk city street background, neon signs, rainy night, futuristic skyscrapers, high-tech dystopian details',
    sceneSuffix: 'cyberpunk anime style, futuristic sci-fi illustration, dramatic neon lighting, movie-quality coloring, volumetric haze, atmospheric depth, (no text, no subtitle)'
  },
  {
    id: 'watercolor_ghibli',
    name: 'Watercolor / Ghibli (Cổ điển)',
    characterSuffix: 'retro Ghibli anime style, watercolor painting texture, soft hand-drawn lines, classic 90s anime design, warm nostalgic look',
    backgroundSuffix: 'hand-painted Ghibli style background, watercolor wash, lush green nature, beautiful fluffy clouds, nostalgic countryside/town',
    sceneSuffix: 'retro 90s anime movie style, gorgeous hand-painted watercolor illustration, warm nostalgic lighting, emotional storytelling composition, peaceful atmosphere, (no text, no subtitle)'
  },
  {
    id: 'dark_fantasy_gothic',
    name: 'Dark Fantasy / Comic (U tối)',
    characterSuffix: 'dark fantasy anime character design, gothic clothing, dramatic shadow, intricate dark details, mysterious aura',
    backgroundSuffix: 'dark fantasy environment, gothic architecture, eerie ruins, mist-covered forest, dramatic moonlight, ominous atmosphere',
    sceneSuffix: 'dark fantasy anime style, gothic comic illustration, high contrast dramatic shadows, eerie lighting, movie-quality rendering, intense atmosphere, (no text, no subtitle)'
  }
];

export interface BatchJobState {
  projectId: string;
  type: 'shot' | 'video' | 'asset';
  tasks: any[];
  currentIndex: number;
  completed: string[];
  failed: string[];
  isRunning: boolean;
}

interface ProjectState {
  // Configuration
  apiConfig: AIConfig;
  setApiConfig: (config: Partial<AIConfig>) => void;
  imageGenConfig: ImageGenConfig;
  setImageGenConfig: (config: Partial<ImageGenConfig>) => void;
  videoGenConfig: VideoGenConfig;
  setVideoGenConfig: (config: Partial<VideoGenConfig>) => void;
  initializeStore: () => void;
  targetDuration: number;
  setTargetDuration: (duration: number) => void;
  
  // Drawing styles
  styles: DrawingStyle[];
  setSelectedStyleId: (id: string) => void;
  addStyle: (style: Omit<DrawingStyle, 'id' | 'isCustom'>) => void;
  updateStyle: (id: string, style: Partial<DrawingStyle>) => void;
  deleteStyle: (id: string) => void;
  getSelectedStyle: () => DrawingStyle;

  // Prompts Templates
  sceneMappingPrompt: string;
  imagePromptPrompt: string;
  updatePromptTemplate: (type: 'scene' | 'image', value: string) => void;
  resetPromptTemplates: () => void;

  // Active Project State
  currentProject: Omit<Project, 'createdAt' | 'id'> & { id: string | null; name: string };
  setCurrentProjectField: (field: string, value: any) => void;
  setSrtContent: (content: string, name?: string) => void;
  updateSceneMappingCell: (rowIndex: number, colId: string, value: any) => void;
  updateImagePromptCell: (rowIndex: number, colId: string, value: any) => void;
  
  // Row edits
  addSceneRow: (index?: number) => void;
  deleteSceneRow: (stt: number) => void;
  mergeScenes: (sttList: number[]) => void;
  splitScene: (stt: number) => void;

  // Sync / DB Operations
  history: Project[];
  loadHistory: () => Promise<void>;
  createNewProject: (name: string, srtContent?: string) => Promise<string>;
  saveCurrentProject: (name?: string) => Promise<void>;
  loadProject: (id: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  duplicateProject: (id: string) => Promise<void>;
  exportProject: (id: string) => Promise<void>;
  importProject: (projectData: any) => Promise<void>;

  // Character Reference
  characters: CharacterReference[];
  loadCharacters: () => Promise<void>;
  addCharacter: (characterId: string, image: string, mediaId?: string, accountId?: string) => Promise<void>;
  deleteCharacter: (characterId: string) => Promise<void>;
  updateCharacterPrompt: (characterId: string, prompt: string) => Promise<void>;

  // Exterior Reference
  exteriors: ExteriorReference[];
  loadExteriors: () => Promise<void>;
  addExterior: (exteriorId: string, image: string, mediaId?: string, accountId?: string) => Promise<void>;
  deleteExterior: (exteriorId: string) => Promise<void>;
  updateExteriorPrompt: (exteriorId: string, prompt: string) => Promise<void>;

  // Prop Reference
  props: PropReference[];
  loadProps: () => Promise<void>;
  addProp: (propId: string, image: string, mediaId?: string, accountId?: string) => Promise<void>;
  deleteProp: (propId: string) => Promise<void>;
  updatePropPrompt: (propId: string, prompt: string) => Promise<void>;
  uploadImage: (file: File) => Promise<{ success: boolean; media_id: string }>;
  updateAssetInputImage: (
    type: 'character' | 'exterior' | 'prop',
    id: string,
    image: string | null,
    mediaId?: string | null,
    accountId?: string | null
  ) => Promise<void>;

  // AI execution states
  isGeneratingSceneMapping: boolean;
  isGeneratingImagePrompts: boolean;
  isGeneratingAssets: boolean;
  isGeneratingCombo1: boolean;
  isGeneratingCombo2: boolean;
  isGeneratingFullCombo: boolean;
  assetAbortController: AbortController | null;
  cancelAssetGeneration: () => void;
  assetGeneratingIds: string[];
  mappingAbortController: AbortController | null;
  cancelSceneMapping: () => void;
  promptsAbortController: AbortController | null;
  cancelImagePrompts: () => void;
  cancelCombo1: () => void;
  cancelCombo2: () => void;
  cancelFullCombo: () => void;
  batchStatus: string;
  runningProjects: Record<
    string,
    'mapping' | 'prompts' | 'assets' | 'shots' | 'video' | 'export' | 'mapping_queued' | 'prompts_queued'
  >;
  runningCombos: Record<string, 'combo1' | 'combo2' | 'combo3'>;
  updateGeneratingFlags: (projId: string) => void;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    cost: number;
  };
  resetTokenUsage: () => void;
  apiQueue: Array<{ projectId: string; type: 'mapping' | 'prompts'; run: () => Promise<void> }>;
  isProcessingQueue: boolean;
  addToQueue: (projectId: string, type: 'mapping' | 'prompts', run: () => Promise<void>) => void;
  processNextInQueue: () => Promise<void>;

  // Actions
  generateSceneMapping: (resume?: boolean) => Promise<void>;
  generateImagePrompts: (resume?: boolean) => Promise<void>;
  generateAllMappingAndPrompts: (resume?: boolean) => Promise<void>;
  generateCombo2: (resume?: boolean) => Promise<void>;
  generateAllShotImages: () => Promise<void>;
  generateFullCombo: (resume?: boolean) => Promise<void>;
  generateAssetImage: (type: 'character' | 'exterior' | 'prop', id: string, config?: { model?: string; aspect_ratio?: string; count?: number }) => Promise<void>;
  generateAllAssetImages: (selectedIds?: { characters: string[]; exteriors: string[]; props?: string[] }, config?: { model?: string; aspect_ratio?: string; count?: number }) => Promise<void>;

  // BGM Suggestion actions & states
  isGeneratingBgmSuggestions: boolean;
  bgmFiles: Array<{ name: string; path: string; duration: number }>;
  generateBgmSuggestions: () => Promise<void>;
  updateBgmSuggestionCell: (bgmId: string, colId: string, value: any) => Promise<void>;
  regenerateBgmPrompt: (bgmId: string) => Promise<void>;
  scanLocalBgmFiles: () => Promise<void>;

  // System logs & queue
  systemLogs: Array<{ id: string; timestamp: string; type: 'info' | 'success' | 'error'; projectId: string; message: string }>;
  serverQueue: Array<{ id: string; projectId: string; stt: number; assetType: string; assetId: string }>;
  serverActive: Array<{ id: string; projectId: string; stt: number; assetType: string; assetId: string; startTime: string }>;
  fetchServerQueueAndLogs: () => Promise<void>;

  // API/Text Queue
  textLogs: Array<{ id: string; timestamp: string; type: 'info' | 'success' | 'error'; projectId: string; message: string }>;
  textQueue: Array<{ id: string; projectId: string; type: string; label?: string }>;
  textActive: Array<{ id: string; projectId: string; type: string; label?: string; startTime: string }>;
  fetchTextQueueAndLogs: () => Promise<void>;

  // Video Queue
  videoLogs: Array<{ id: string; timestamp: string; type: 'info' | 'success' | 'error'; projectId: string; message: string }>;
  videoQueue: Array<{ id: string; projectId: string; stt: number; assetType: string; assetId: string }>;
  videoActive: Array<{ id: string; projectId: string; stt: number; assetType: string; assetId: string; startTime: string }>;
  fetchVideoQueueAndLogs: () => Promise<void>;

  // Global Queues
  globalTextQueue: Array<{ id: string; projectId: string; type: string; label?: string }>;
  globalTextActive: Array<{ id: string; projectId: string; type: string; label?: string; startTime: string }>;
  globalTextLogs: Array<{ id: string; timestamp: string; type: 'info' | 'success' | 'error'; projectId: string; message: string }>;

  globalServerQueue: Array<{ id: string; projectId: string; stt: number; assetType: string; assetId: string }>;
  globalServerActive: Array<{ id: string; projectId: string; stt: number; assetType: string; assetId: string; startTime: string }>;
  globalSystemLogs: Array<{ id: string; timestamp: string; type: 'info' | 'success' | 'error'; projectId: string; message: string }>;

  globalVideoQueue: Array<{ id: string; projectId: string; stt: number; assetType: string; assetId: string }>;
  globalVideoActive: Array<{ id: string; projectId: string; stt: number; assetType: string; assetId: string; startTime: string }>;
  globalVideoLogs: Array<{ id: string; timestamp: string; type: 'info' | 'success' | 'error'; projectId: string; message: string }>;

  fetchGlobalQueues: () => Promise<void>;

  // Shots drawing
  shotGeneratingIds: string[];
  generateShotImage: (stt: number) => Promise<void>;

  // Videos drawing
  videoGeneratingIds: string[];
  generateVideo: (stt: number) => Promise<void>;

  // Background Batch Job Manager
  batchJobs: Record<string, BatchJobState>;
  startBatchShotGeneration: (sttList: number[]) => Promise<void>;
  startBatchVideoGeneration: (sttList: number[]) => Promise<void>;
  startBatchAssetGeneration: (selectedIds?: { characters: string[]; exteriors: string[]; props?: string[] }, config?: { model?: string; aspect_ratio?: string; count?: number }) => Promise<void>;
  cancelBatchJob: (projectId: string, type: 'shot' | 'video' | 'asset') => void;
  generateShotImageForProject: (projectId: string, stt: number, projData: any) => Promise<void>;
  generateVideoForProject: (projectId: string, stt: number, projData: any) => Promise<void>;
  generateAssetImageForProject: (projectId: string, type: 'character' | 'exterior' | 'prop', id: string, projData: any, config?: any) => Promise<void>;
}

const DEFAULT_SCENE_MAPPING_PROMPT = `# STEP 1 — SCENE MAPPING GENERATOR

Vai trò:
Bạn là Storyboard Scene Planner cho kênh YouTube manga dài tập.

Nhiệm vụ:
Dựa trên file SRT được cung cấp, phân tích nội dung và chia subtitle thành các nhóm cảnh (Scene Units) phục vụ cho việc tạo ảnh storyboard.

Mục tiêu:
Tạo số lượng cảnh ít nhất có thể nhưng vẫn đảm bảo người xem hiểu toàn bộ diễn biến câu chuyện.

NGUYÊN TẮC CỐT LÕI:
1. Scene-Based, Not Subtitle-Based
Đơn vị chia cảnh là: tình huống, cảm xúc, bước ngoặt, hành động chính. KHÔNG chia theo từng câu, từng subtitle, từng lời thoại.
Ví dụ:
- Sai: Sub 1: Tôi bước vào phòng. Sub 2: Trưởng phòng nhìn tôi. Sub 3: Tôi ngồi xuống. (3 ảnh)
- Đúng: Gộp thành 1 cảnh gặp mặt trong văn phòng.

2. Absolute Subtitle Sync
Mọi nội dung trong cảnh phải xuất phát từ subtitle. Không được thêm nhân vật, hành động, địa điểm, cảm xúc không tồn tại. KHÔNG tự ý suy đoán.

3. Cinematic Continuity
Không tạo cảnh mới nếu cùng địa điểm, cuộc hội thoại, trạng thái cảm xúc, hành động chính. Chỉ tạo cảnh mới khi: thay đổi địa điểm, xuất hiện nhân vật mới, thay đổi hành động/cảm xúc chính, xuất hiện twist/cao trào.

4. Retention Optimization
Ưu tiên giữ cảnh dài hơn thay vì chia nhỏ. Mỗi cảnh phải đại diện cho "Một khoảnh khắc cảm xúc hoàn chỉnh", không phải "Một câu thoại".

5. Scene Duration
Một ảnh tối đa 25 giây. Nếu thời lượng vượt quá, hãy chia thành nhiều cảnh nhưng giữ tính liên tục (continuity).

6. Dialogue Rule
Nếu nhiều subtitle chỉ là cuộc trò chuyện liên tục trong cùng bối cảnh -> Gộp thành một cảnh. Không tạo ảnh mới chỉ vì đổi người nói, đổi câu thoại, đổi đại từ nhân xưng.

7. Emotional Priority
Ưu tiên xác định: Cảm xúc chính, hành động chính, quan hệ nhân vật, bối cảnh. Không ưu tiên đồ vật phụ, chi tiết trang trí.

8. Character Name Consistency (THỐNG NHẤT TÊN NHÂN VẬT)
- Tên nhân vật được ghi nhận trong trường "characters" và nội dung trong trường "sceneDescription" hay "mainSituation" phải khớp nhau.
- Ví dụ: Nếu trong mô tả cảnh hoặc tình huống nhắc đến "Kenji" và "Aoi" thì trường "characters" phải ghi nhận chính xác: "Kenji, Aoi" (phân tách bằng dấu phẩy).
- PHÂN TÍCH GỢI Ý TÊN TỪ LỜI THOẠI & NGỮ CẢNH (LAYER 1 - BASE NAME):
  + Nếu trong phụ đề (SRT) xuất hiện lời thoại dạng có tên người nói trước dấu hai chấm và dấu ngoặc (Ví dụ: 桃花：「わかりました」, 田中：「いいよ」), bạn phải hiểu rằng "桃花" và "田中" là tên của nhân vật đang nói.
  + Hãy trích xuất và sử dụng chính xác các tên nhân vật này. Nếu câu chuyện viết bằng tiếng Nhật hoặc bối cảnh Nhật Bản, hãy phiên âm Latin (Romaji) chính xác theo tiếng Nhật (ví dụ: "桃花" -> "momoka", "田中" -> "tanaka"). Tránh việc phiên âm sai sang tiếng Trung (như "taohua") hoặc đặt tên tiếng Anh ngẫu nhiên, hoặc dùng các từ chung chung như "cô gái", "chàng trai" khi đã có tên rõ ràng.

9. Strict Subtitle Ranges (CÁC PHẠM VI PHỤ ĐỀ KHÔNG TRÙNG LẶP)
- Các phạm vi phụ đề phải nối tiếp nhau và KHÔNG ĐƯỢC TRÙNG LẶP. Ví dụ, nếu cảnh trước kết thúc ở phụ đề số 15, thì cảnh sau BẮT BUỘC phải bắt đầu từ phụ đề số 16 (Ví dụ Cảnh 1: '1-15', Cảnh 2: '16-20'). Tuyệt đối không lấy lại số phụ đề đã dùng (không viết Cảnh 2: '15-20' nếu Cảnh 1 là '1-15').

10. Character Variation Rules (TẠO BIẾN THỂ NHÂN VẬT THEO BỐI CẢNH VÀ THỜI GIAN - LAYER 2 - VARIANT)
- Chỉ áp dụng quy tắc này cho các NHÂN VẬT CHÍNH (main characters). Không áp dụng cho nhân vật phụ hoặc quần chúng (extras/background characters).
- Nhận diện bối cảnh, mốc thời gian hoặc tình huống trong truyện để tự động tạo và sử dụng các biến thể nhân vật phù hợp:
  + Kết hợp Tên Gốc (Layer 1) với biến thể: Sau khi xác định tên gốc (ví dụ: "momoka"), nếu có sự thay đổi trang phục (ở nhà, đi làm, chơi thể thao...) hoặc mốc thời gian (hồi tưởng quá khứ, sau 5 năm '5yearslater'...), hãy tạo biến thể tương ứng.
  + Định dạng tên ghép: Đặt tên dạng: [tên_nhân_vật_gốc]_[biến_thể] (tất cả viết thường, ví dụ: 'momoka_home', 'momoka_5yearslater', 'tanaka_office').
- Đăng ký biến thể: Các biến thể này phải được xem như nhân vật mới và khai báo trong danh sách "newCharacters" (nếu chưa có trong danh sách nhân vật đã biết 'knownCharacters'). Trong phần prompt của biến thể mới đó, mô tả rõ trang phục hoặc độ tuổi/mốc thời gian đặc trưng (ví dụ: "Character Sheet of momoka_home, ... wearing casual, comfortable home clothing", "Character Sheet of momoka_5yearslater, ... 5 years later, looking more mature").
- Áp dụng trong cảnh: Trong trường "characters" của mỗi cảnh, điền chính xác ID của biến thể được dùng (ví dụ: "momoka_home" hoặc "momoka_5yearslater" thay vì tên gốc "momoka").

OUTPUT FORMAT:
Phải trả về kết quả dưới dạng một mảng JSON (JSON array), trong đó mỗi phần tử có cấu trúc chính xác như sau:
{
  "stt": number (Số thứ tự cảnh),
  "subtitleRange": "string (Ví dụ: '12-18')",
  "timeRange": "string (Ví dụ: '00:01:15,000 --> 00:01:42,000')",
  "characters": "string (Danh sách nhân vật, ví dụ: 'kenji, mother')",
  "props": "string (Danh sách đạo cụ xuất hiện trong cảnh, ví dụ: 'car, notebook')",
  "mainSituation": "string (Mô tả tình huống chính)",
  "mainEmotion": "string (Cảm xúc chính)",
  "sceneDescription": "string (Mô tả ngắn gọn cảnh dưới góc nhìn đạo diễn hình ảnh)"
}
Trả về DUY NHẤT mảng JSON này. Không có văn bản giải thích ngoài JSON.`;

const DEFAULT_IMAGE_PROMPT_PROMPT = `# STEP 2 — IMAGE PROMPT & MOTION GENERATOR

Vai trò:
Bạn là cinematic storyboard director chuyên tạo image prompts siêu chi tiết cho AI image generation dùng trong Banana AI, Flux, SDXL, GPT Image, anime diffusion models.

Mục tiêu:
Tạo ra prompts storyboard manga cinematic có:
- continuity điện ảnh mạnh
- pose logic rõ ràng
- anatomy ổn định
- emotional storytelling
- visual retention cao cho YouTube

AI phải ưu tiên:
- độ chính xác hình ảnh
- staging điện ảnh
- camera logic
- character consistency
- emotional realism

KHÔNG tạo ảnh kiểu:
- minh họa generic
- anime pose ngẫu nhiên
- action quá mức
- cinematic giả
- bố cục flat
- overacting

NGUYÊN TẮC CỐT LÕI:

1. ABSOLUTE SUBTITLE SYNC
Mỗi subtitle group = 1 emotional unit hoàn chỉnh.
KHÔNG: mô tả vượt trước subtitle, thêm hành động không tồn tại, thêm cảm xúc không được implied, tạo movement không xuất hiện trong thoại.
Hình ảnh chỉ phản ánh: cảm xúc hiện tại, trạng thái hiện tại, áp lực hiện tại, relationship hiện tại.
Giữ emotional timing, silence timing, reaction timing.

2. CINEMATIC CONTINUITY
KHÔNG đổi scene nếu: cùng location, cùng emotional flow, cùng conversation, cùng tension.
Chỉ đổi frame khi: emotion shift, camera intention shift, major action shift, location shift, psychological reveal, dramatic beat, silence beat.

3. SCENE CONSISTENCY & BACKGROUND
Mỗi location phải có: fixed spatial layout, fixed architecture, fixed furniture logic, fixed character positioning logic.
Mọi background: sạch sẽ, realistic, modern Japanese environment, không cũ nát, không luxury quá mức.
QUY TẮC MÔ TẢ BỐI CẢNH:
- TUYỆT ĐỐI KHÔNG mô tả ánh sáng (lighting), hướng sáng hay màu sắc ánh sáng. Chỉ tập trung vào không gian vật lý, kiến trúc và nội thất tĩnh.
- KHÔNG random: sofa direction, cửa sổ vị trí, bàn ghế, khoảng cách nhân vật.
Giữ continuity bố cục tổng thể, không khí, spatial orientation.

4. VISUAL PRIORITY SYSTEM
Mỗi frame phải xác định: primary subject, secondary subject, background subject.
- Primary subject xuất hiện đầu tiên trong mô tả, camera focus ưu tiên primary subject.
- Secondary subject chỉ hỗ trợ cảm xúc.
- Background subject không giành attention.
Xác định rõ ai là emotional center của frame.

5. BODY ORIENTATION RULE
Mỗi nhân vật phải mô tả rõ: body direction, face direction, eye direction, shoulder state, spine posture, arm state, hand state, body weight distribution.
Ví dụ: "Kaito ngồi nghiêng 45 độ về phía bàn ăn, mắt nhìn xuống ly nước, vai hơi trùng xuống, tay phải siết nhẹ cạnh bàn"
KHÔNG mô tả cảm xúc mà thiếu posture vật lý.

6. SCREEN DIRECTION CONTINUITY
Trong cùng conversation: character A giữ cùng screen side, character B giữ side đối diện, eye line consistency phải giữ ổn định.
Ví dụ: Kaito luôn ở bên trái frame, Rika luôn ở bên phải frame. KHÔNG tự đổi trái/phải giữa các frame trừ khi có scene transition, camera crossing hoặc major movement.

7. HAND ACTION PRIORITY
Nếu tay xuất hiện, phải mô tả cụ thể (ví dụ: tay siết chặt mép áo, ngón tay run nhẹ quanh ly cà phê, một tay giữ điện thoại gần ngực, bàn tay đặt im trên bàn). Nếu không cần thấy tay, ghi rõ: "hands partially out of frame" hoặc "hands hidden behind body" để tránh lỗi anatomy.

8. EMOTIONAL MICRO-EXPRESSION
Ưu tiên vi biểu cảm: môi hơi mở, ánh mắt dao động, tránh eye contact, hàm siết nhẹ, lông mày chùng xuống, nuốt khan, hơi thở ngắt quãng, blinking hesitation. KHÔNG chỉ dùng từ đơn giản như sad, angry, shocked. Emotion phải thể hiện qua mắt, miệng, vai, posture, breathing tension.

9. CAMERA DEPTH STAGING
Mỗi frame phải có foreground (ví dụ: vai mờ của Rika), midground (Kaito ngồi bên bàn), và background (cửa sổ căn hộ) để tạo chiều sâu và emotional layering. KHÔNG tạo bố cục flat, empty depth hay floating character staging.

10. SHOT INTENTION
Mỗi frame phải có emotional cinematic intention rõ ràng: emotional pressure, awkward silence, hesitation, loneliness, hidden sadness, psychological distance, tension, emotional isolation, emotional collapse, restrained anger.

11. CAMERA RULE
- Cảnh cảm xúc: close-up, medium close-up.
- Cảnh cô lập: wide shot với negative space.
- Cảnh áp lực: off-center framing, low-angle nhẹ.
- Cảnh đối thoại: over-shoulder, medium shot.
KHÔNG lạm dụng: full body shot, top-down, extreme fisheye, action angle.

12. MOTION RULE
Trong trường "motion" (Character Motion):
- CHỈ dùng các danh từ chung để chỉ đối tượng chuyển động: "người đàn ông", "cô gái", "người phụ nữ", "cậu bé", "ông lão". TUYỆT ĐỐI KHÔNG dùng tên riêng của nhân vật (như Kaito, Rika) trong cột Motion vì AI tạo video từ ảnh (Image-to-Video) không biết tên nhân vật.
- Mô tả chi tiết: body movement, eye movement, emotional movement, environmental movement, camera movement.
- Ưu tiên: subtle movement, emotional movement, cinematic motion, slow camera movement.

13. CHARACTER RULE
Cột Characters phải chứa danh sách nhân vật phân tách bằng dấu phẩy theo format: tennhanvat_trangphuc (ví dụ: kaito_black_coat, rika_school_uniform).

14. EXTERIOR RULE
Cột Exterior dùng snake_case, không dấu, không khoảng trắng, chỉ ghi địa điểm chính, kiến trúc chính (ví dụ: tokyo_apartment_livingroom, family_house_kitchen).

15. NO LIGHTING RULE
TUYỆT ĐỐI KHÔNG mô tả bất kỳ yếu tố nào liên quan đến: ánh sáng (lighting), màu sắc của ánh sáng, nguồn sáng, hướng chiếu sáng, flare / bóng đổ cường độ cao.

OUTPUT FORMAT:
Phải trả về kết quả dưới dạng một mảng JSON (JSON array) để hệ thống tự động render thành bảng cho người dùng. Mỗi phần tử trong mảng phải có cấu trúc chính xác như sau:
{
  "stt": number (Số thứ tự frame),
  "characters": "string (Danh sách nhân vật theo format 'tennhanvat_trangphuc', ví dụ: 'kaito_black_coat,rika_school_uniform')",
  "description": "string (Mô tả chi tiết theo cấu trúc bên dưới, KHÔNG dùng tên nhân vật kèm trang phục như kaito_black_coat, CHỈ dùng tên La-tinh nguyên bản)",
  "exterior": "string (snake_case location ID, ví dụ: 'tokyo_apartment_livingroom')",
  "motion": "string (cinematic motion description, TUYỆT ĐỐI KHÔNG dùng tên riêng nhân vật)"
}

QUY TẮC MÔ TẢ TRONG DESCRIPTION (Image Prompt):
Mô tả phải theo cấu trúc thứ tự nghiêm ngặt sau:
[Bối cảnh vật lý tĩnh và phân loại thời gian: day/night/morning/evening, TUYỆT ĐỐI không có lighting/color] ->
[(Tên La-tinh primary subject + posture + action + expression + position)] ->
[(Tên La-tinh secondary subject nếu có + posture + action + expression + position)] ->
[(background subject nếu có)] ->
[(camera framing + composition + depth)] ->
[(cinematic emotional intention)] ->
(no text, no subtitle, manga color style, no dark)

Ví dụ về Description:
"tokyo apartment living room, night -> Kaito sitting 45 degrees towards the dining table, eyes looking down at the water glass, shoulders slightly drooped, right hand holding the table edge -> Rika standing in the background looking at Kaito with a worried expression -> medium shot, over-shoulder depth framing -> awkward silence and tension -> (no text, no subtitle, manga color style, no dark)"

Negative Prompt chung (hệ thống sẽ tự động gán):
low quality, bad anatomy, extra fingers, extra arms, extra legs, crossed limbs, floating hands, broken fingers, deformed face, misaligned eyes, blurry eyes, awkward pose, merged bodies, duplicate limbs, mutated hands, overacting, crowded composition, text, watermark, logo, oversaturated, horror atmosphere, dark horror, 3d render, western comic style, chibi, superhero pose, extreme action pose, fisheye distortion, uncanny expression, incorrect perspective, warped body, stiff posture, floating objects, messy background, lighting, lens flare.

Trả về DUY NHẤT mảng JSON này. Không có văn bản giải thích ngoài JSON.`;

const getLocalStorage = (key: string, defaultValue: string): string => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(key) || defaultValue;
  }
  return defaultValue;
};

const setLocalStorage = (key: string, value: string) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, value);
  }
};

// Helper to recalculate time ranges of all scenes consecutively without gaps
function recalculateProjectTimeRanges(scenes: SceneMappingRow[], srtContent: string): SceneMappingRow[] {
  if (!srtContent || !scenes || scenes.length === 0) return scenes;
  const parsed = parseSRT(srtContent);
  const blocks = parsed.blocks;
  if (blocks.length === 0) return scenes;

  let prevEndTime = '00:00:00,000';

  return scenes.map((scene) => {
    const range = (scene.subtitleRange || '').trim();
    if (!range) {
      return {
        ...scene,
        timeRange: scene.timeRange || `${prevEndTime} --> ${prevEndTime}`
      };
    }

    const segments = range.split(',');
    let minId = Infinity;
    let maxId = -Infinity;

    for (const seg of segments) {
      const trimmed = seg.trim();
      if (!trimmed) continue;
      const parts = trimmed.split('-').map(x => parseInt(x.trim(), 10));
      if (parts.length === 1 && !isNaN(parts[0])) {
        minId = Math.min(minId, parts[0]);
        maxId = Math.max(maxId, parts[0]);
      } else if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        minId = Math.min(minId, parts[0], parts[1]);
        maxId = Math.max(maxId, parts[0], parts[1]);
      }
    }

    if (minId === Infinity || maxId === -Infinity) {
      return {
        ...scene,
        timeRange: scene.timeRange || `${prevEndTime} --> ${prevEndTime}`
      };
    }

    const endBlock = blocks.find(b => b.id === maxId);
    const endTime = endBlock ? endBlock.endTime : prevEndTime;

    // Use prevEndTime as startTime to guarantee contiguous timeline with no gaps
    const startTime = prevEndTime;
    const computedTimeRange = `${startTime} --> ${endTime}`;

    prevEndTime = endTime;

    return {
      ...scene,
      timeRange: computedTimeRange
    };
  });
}

// Helper to recalculate subtitle ranges of all scenes consecutively without gaps or overlaps
function recalculateSubtitleRanges(scenes: SceneMappingRow[], totalSubtitles?: number): SceneMappingRow[] {
  if (!scenes || scenes.length === 0) return scenes;
  let prevEnd = 0;
  return scenes.map((scene, idx) => {
    let range = (scene.subtitleRange || '').trim();
    if (!range) {
      const start = prevEnd + 1;
      const end = idx === scenes.length - 1 && totalSubtitles && totalSubtitles > 0
        ? Math.max(start, totalSubtitles)
        : start;
      const newRange = start === end ? `${start}` : `${start}-${end}`;
      prevEnd = end;
      return { ...scene, subtitleRange: newRange };
    }

    const parts = range.split('-').map(x => parseInt(x.trim(), 10));
    let currStart = parts[0];
    let currEnd = parts.length > 1 ? parts[1] : parts[0];

    if (isNaN(currStart)) currStart = prevEnd + 1;
    if (isNaN(currEnd)) currEnd = currStart;

    currStart = prevEnd + 1;
    currEnd = Math.max(currStart, currEnd);

    if (idx === scenes.length - 1 && totalSubtitles && totalSubtitles > 0) {
      currEnd = Math.max(currEnd, totalSubtitles);
    }

    const newRange = currStart === currEnd ? `${currStart}` : `${currStart}-${currEnd}`;
    prevEnd = currEnd;

    return {
      ...scene,
      subtitleRange: newRange
    };
  });
}

// Helper function for incremental context-accumulating scene mapping
async function executeSceneMappingIncrementalFlow(
  projId: string,
  srtContent: string,
  targetDuration: number,
  sceneMappingPrompt: string,
  apiConfig: any,
  set: any,
  get: any,
  resume: boolean = false
): Promise<{ scenes: SceneMappingRow[]; characters: any[]; exteriors: any[]; props: any[] }> {
  const { provider, apiKey, modelName } = apiConfig;
  const providerInstance = AIProviderFactory.getProvider(provider);

  const customPrompt = `${sceneMappingPrompt}

[YÊU CẦU ĐẶC BIỆT VỀ THỜI LƯỢNG CẢNH (SCENE DURATION)]:
- Thời lượng tối đa cho mỗi cảnh (Time Range) KHÔNG ĐƯỢC VƯỢT QUÁ ${targetDuration} giây.
- Khoảng cách thời gian bắt đầu và kết thúc của một cảnh (ví dụ: 00:01:15,000 --> 00:01:40,000 là 25 giây) phải nhỏ hơn hoặc bằng ${targetDuration} giây.
- Nếu một đoạn hội thoại hoặc diễn biến câu chuyện trong một bối cảnh kéo dài hơn ${targetDuration} giây, bạn BẮT BUỘC phải chia nhỏ thành nhiều cảnh liên tục có số thứ tự (STT) kế tiếp nhau, sao cho thời lượng của mỗi cảnh nhỏ đều nằm trong khoảng từ 5 giây đến tối đa ${targetDuration} giây. Tuyệt đối không gộp một đoạn subtitle dài quá ${targetDuration} giây vào một cảnh duy nhất.`;

  const parseResult = parseSRT(srtContent);
  const subtitleBlocks = parseResult.blocks;
  const srtChunkSize = 25; // Smaller, robust chunk size
  let allScenes: SceneMappingRow[] = [];
  let finalRecalculatedScenes: SceneMappingRow[] = [];
  let knownCharacters: any[] = [];
  let knownExteriors: any[] = [];
  let knownProps: any[] = [];
  let plotSummary = '';
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;
  let startIndex = 0;

  if (resume) {
    const active = get().currentProject;
    allScenes = active.sceneMapping ? [...active.sceneMapping] : [];
    knownCharacters = active.characters ? [...active.characters] : [];
    knownExteriors = active.exteriors ? [...active.exteriors] : [];
    knownProps = active.props ? [...active.props] : [];
    
    if (allScenes.length > 0) {
      const lastScene = allScenes[allScenes.length - 1];
      if (lastScene && lastScene.subtitleRange) {
        const rangeParts = lastScene.subtitleRange.split('-');
        const lastSubId = parseInt(rangeParts[rangeParts.length - 1].trim(), 10);
        if (!isNaN(lastSubId)) {
          const nextIdx = subtitleBlocks.findIndex(b => b.id > lastSubId);
          if (nextIdx !== -1) {
            startIndex = nextIdx;
          } else {
            // Already fully mapped
            return {
              scenes: allScenes,
              characters: knownCharacters,
              exteriors: knownExteriors,
              props: knownProps
            };
          }
        }
      }
    }
  }

  const totalChunks = Math.ceil(subtitleBlocks.length / srtChunkSize);
  const signal = get().mappingAbortController?.signal;

  for (let i = startIndex; i < subtitleBlocks.length; i += srtChunkSize) {
    if (signal?.aborted) {
      throw new Error('stopped');
    }
    const chunkIndex = Math.floor(i / srtChunkSize) + 1;
    
    // Update batch status in the UI store
    if (get().currentProject.id === projId) {
      set({
        batchStatus: `Mapping Scene Chunk ${chunkIndex} of ${totalChunks} (Subtitles ${i + 1}-${Math.min(i + srtChunkSize, subtitleBlocks.length)})...`
      });
    }

    const chunkBlocks = subtitleBlocks.slice(i, i + srtChunkSize);
    const chunkSrtContent = chunkBlocks.map(b => `${b.id}\n${b.timeRange}\n${b.text}`).join('\n\n');

    const config = { 
      provider, 
      apiKey, 
      modelName,
      projectId: projId,
      type: 'mapping' as const,
      label: `Phần ${chunkIndex}/${totalChunks}`,
      signal
    };

    const response = await providerInstance.generateSceneMappingIncremental(
      chunkSrtContent,
      knownCharacters,
      knownExteriors,
      knownProps,
      plotSummary,
      customPrompt,
      config
    );

    const chunkData = response.data;
    allScenes = [...allScenes, ...chunkData.scenes];

    // Merge & enrich character references
    if (Array.isArray(chunkData.newCharacters)) {
      chunkData.newCharacters.forEach((inc: any) => {
        const charIdNorm = String(inc.characterId || '').trim().toLowerCase();
        if (!charIdNorm) return;
        const idx = knownCharacters.findIndex((c: any) => c.characterId.toLowerCase() === charIdNorm);
        if (idx === -1) {
          knownCharacters.push({
            characterId: charIdNorm,
            image: '',
            age: inc.age || '',
            gender: inc.gender || '',
            personality: inc.personality || '',
            role: inc.role || '',
            prompt: inc.prompt || ''
          });
        } else {
          const ext = knownCharacters[idx];
          knownCharacters[idx] = {
            ...ext,
            age: ext.age || inc.age || '',
            gender: ext.gender || inc.gender || '',
            personality: ext.personality || inc.personality || '',
            role: ext.role || inc.role || '',
            prompt: ext.prompt || inc.prompt || ''
          };
        }
      });
    }

    // Merge & enrich exterior/location references
    if (Array.isArray(chunkData.newExteriors)) {
      chunkData.newExteriors.forEach((inc: any) => {
        const extIdNorm = String(inc.exteriorId || '').trim().toLowerCase();
        if (!extIdNorm) return;
        const idx = knownExteriors.findIndex((e: any) => e.exteriorId.toLowerCase() === extIdNorm);
        if (idx === -1) {
          knownExteriors.push({
            exteriorId: extIdNorm,
            image: '',
            prompt: inc.prompt || ''
          });
        } else {
          const ext = knownExteriors[idx];
          knownExteriors[idx] = {
            ...ext,
            prompt: ext.prompt || inc.prompt || ''
          };
        }
      });
    }

    // Merge & enrich prop references
    if (Array.isArray(chunkData.newProps)) {
      chunkData.newProps.forEach((inc: any) => {
        const propIdNorm = String(inc.propId || '').trim().toLowerCase();
        if (!propIdNorm) return;
        const idx = knownProps.findIndex((p: any) => p.propId.toLowerCase() === propIdNorm);
        if (idx === -1) {
          knownProps.push({
            propId: propIdNorm,
            image: '',
            prompt: inc.prompt || ''
          });
        } else {
          const prop = knownProps[idx];
          knownProps[idx] = {
            ...prop,
            prompt: prop.prompt || inc.prompt || ''
          };
        }
      });
    }

    if (chunkData.plotSummary) {
      plotSummary = chunkData.plotSummary;
    }

    totalInputTokens += response.usage.inputTokens;
    totalOutputTokens += response.usage.outputTokens;
    totalCost += response.usage.cost;

    // Adjust subtitle ranges to ensure they are strictly consecutive and non-overlapping
    const isFinalChunk = (i + srtChunkSize >= subtitleBlocks.length);
    const maxSubId = subtitleBlocks[subtitleBlocks.length - 1]?.id || subtitleBlocks.length;
    const adjustedScenes = recalculateSubtitleRanges(allScenes, isFinalChunk ? maxSubId : undefined);

    // Sequence index mapping rows sequentially
    const intermediateScenes = adjustedScenes.map((scene: any, idx: number) => ({
      ...scene,
      stt: idx + 1
    }));

    // Save intermediate progress to DB
    const active = get().currentProject;
    const savedProj = (await getProject(projId)) || {
      id: projId,
      name: active.name || 'Dự án phụ đề',
      createdAt: new Date().toISOString(),
      provider: active.provider || provider,
      modelName: active.modelName || modelName,
      srtContent: active.srtContent || srtContent,
      srtMeta: active.srtMeta || { lineCount: subtitleBlocks.length, duration: '00:00:00' },
      sceneMapping: [],
      imagePrompts: [],
      characters: [],
      exteriors: [],
      props: [],
      selectedStyleId: active.selectedStyleId || 'manga_color'
    };
    
    savedProj.sceneMapping = recalculateProjectTimeRanges(intermediateScenes, srtContent);
    savedProj.characters = knownCharacters;
    savedProj.exteriors = knownExteriors;
    savedProj.props = knownProps;
    
    const syncedProj = syncProjectReferences(savedProj);
    finalRecalculatedScenes = syncedProj.sceneMapping || [];
    await saveProject(syncedProj);
    syncChannel?.postMessage({ type: 'project_updated', projectId: projId });

    // Update active UI state if still open
    if (get().currentProject.id === projId) {
      set((state: any) => ({
        currentProject: {
          ...state.currentProject,
          sceneMapping: syncedProj.sceneMapping,
          characters: syncedProj.characters || [],
          exteriors: syncedProj.exteriors || [],
          props: syncedProj.props || []
        },
        characters: syncedProj.characters || [],
        exteriors: syncedProj.exteriors || [],
        props: syncedProj.props || [],
        tokenUsage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          cost: totalCost
        }
      }));
    } else {
      // Accumulate tokens globally if running in background
      set((state: any) => ({
        tokenUsage: {
          inputTokens: state.tokenUsage.inputTokens + response.usage.inputTokens,
          outputTokens: state.tokenUsage.outputTokens + response.usage.outputTokens,
          cost: state.tokenUsage.cost + response.usage.cost
        }
      }));
    }

    // Small rate limit delay buffer between chunks
    if (i + srtChunkSize < subtitleBlocks.length) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  return { scenes: finalRecalculatedScenes, characters: knownCharacters, exteriors: knownExteriors, props: knownProps };
}

async function executeImagePromptsContextualFlow(
  projId: string,
  sceneMapping: SceneMappingRow[],
  imagePromptPrompt: string,
  apiConfig: any,
  set: any,
  get: any,
  resume: boolean = false
): Promise<ImagePromptRow[]> {
  const { provider, apiKey, modelName } = apiConfig;
  const providerInstance = AIProviderFactory.getProvider(provider);

  const batchSize = 15; // Safe batch size
  let mergedPrompts: ImagePromptRow[] = [];
  const active = get().currentProject;
  let startIndex = 0;

  if (resume) {
    mergedPrompts = active.imagePrompts ? [...active.imagePrompts] : [];
    if (mergedPrompts.length > 0) {
      const lastPrompt = mergedPrompts[mergedPrompts.length - 1];
      if (lastPrompt && lastPrompt.stt) {
        const nextIdx = sceneMapping.findIndex(s => s.stt > lastPrompt.stt);
        if (nextIdx !== -1) {
          startIndex = nextIdx;
        } else {
          // Already fully generated
          return mergedPrompts;
        }
      }
    }
  }

  const totalBatches = Math.ceil(sceneMapping.length / batchSize);
  const signal = get().promptsAbortController?.signal;

  const finalImagePromptPrompt = `${imagePromptPrompt}
        
[YÊU CẦU ĐẶC BIỆT VỀ PHONG CÁCH VẼ (DRAWING STYLE OVERRIDE)]:
- CỰC KỲ QUAN TRỌNG: Tuyệt đối KHÔNG viết hoặc mô tả bất kỳ từ khóa style vẽ nào (như nét vẽ manga, anime, màu sắc, (no text, no subtitle, manga color style),...) vào trường "description". Chỉ mô tả bối cảnh và diễn biến cơ bản.
- Hãy bỏ qua yêu cầu mô tả phong cách Anime Manga ở mục 6.`;

  for (let i = startIndex; i < sceneMapping.length; i += batchSize) {
    if (signal?.aborted) {
      throw new Error('stopped');
    }
    const batchIndex = Math.floor(i / batchSize) + 1;
    if (get().currentProject.id === projId) {
      set({
        batchStatus: `Generating Prompts: Batch ${batchIndex} of ${totalBatches} (Scenes ${i + 1}-${Math.min(i + batchSize, sceneMapping.length)})...`
      });
    }

    const chunk = sceneMapping.slice(i, i + batchSize);

    // Identify referenced characters & backgrounds in this chunk
    const mentionedCharNames = new Set<string>();
    const mentionedExtIds = new Set<string>();
    const mentionedPropIds = new Set<string>();

    chunk.forEach((scene: SceneMappingRow) => {
      if (scene.characters) {
        parseCharactersField(scene.characters).forEach((c: string) => {
          const trimmed = c.trim().toLowerCase();
          if (trimmed) mentionedCharNames.add(trimmed);
        });
      }
      if (scene.props) {
        parseCharactersField(scene.props).forEach((p: string) => {
          const trimmed = p.trim().toLowerCase();
          if (trimmed) mentionedPropIds.add(trimmed);
        });
      }
      if (scene.sceneDescription) {
        // Fallback scan description for character names
        (active.characters || []).forEach((char: CharacterReference) => {
          if (scene.sceneDescription.toLowerCase().includes(char.characterId.toLowerCase())) {
            mentionedCharNames.add(char.characterId.toLowerCase());
          }
        });
        // Scan description for locations/exteriors
        (active.exteriors || []).forEach((ext: ExteriorReference) => {
          if (scene.sceneDescription.toLowerCase().includes(ext.exteriorId.toLowerCase())) {
            mentionedExtIds.add(ext.exteriorId.toLowerCase());
          }
        });
        // Scan description for props
        (active.props || []).forEach((prop: PropReference) => {
          if (scene.sceneDescription.toLowerCase().includes(prop.propId.toLowerCase())) {
            mentionedPropIds.add(prop.propId.toLowerCase());
          }
        });
      }
    });

    const characterRefs = (active.characters || []).filter((c: CharacterReference) => 
      mentionedCharNames.has(c.characterId.toLowerCase())
    ).map((c: CharacterReference) => ({
      characterId: c.characterId,
      age: c.age,
      gender: c.gender,
      role: c.role,
      prompt: c.prompt
    }));

    const exteriorRefs = (active.exteriors || []).filter((e: ExteriorReference) => 
      mentionedExtIds.has(e.exteriorId.toLowerCase())
    ).map((e: ExteriorReference) => ({
      exteriorId: e.exteriorId,
      prompt: e.prompt
    }));

    const propRefs = (active.props || []).filter((p: PropReference) => 
      mentionedPropIds.has(p.propId.toLowerCase())
    ).map((p: PropReference) => ({
      propId: p.propId,
      prompt: p.prompt
    }));

    const config = { 
      provider, 
      apiKey, 
      modelName,
      projectId: projId,
      type: 'prompts' as const,
      label: `Phần ${batchIndex}/${totalBatches}`,
      signal
    };

    const response = await providerInstance.generateImagePromptsContextual(
      chunk,
      characterRefs,
      exteriorRefs,
      propRefs,
      finalImagePromptPrompt,
      config
    );

    mergedPrompts = [...mergedPrompts, ...response.data];

    // Re-index output prompt sequence numbers
    const sortedPrompts = mergedPrompts.map((prompt: any, idx: number) => ({
      ...prompt,
      stt: idx + 1
    }));

    // Save batch progress
    const savedProj = (await getProject(projId)) || {
      id: projId,
      name: active.name || 'Dự án',
      createdAt: new Date().toISOString(),
      provider: active.provider || provider,
      modelName: active.modelName || modelName,
      srtContent: active.srtContent || '',
      srtMeta: active.srtMeta || { lineCount: 0, duration: '00:00:00' },
      sceneMapping: active.sceneMapping || [],
      imagePrompts: [],
      characters: active.characters || [],
      exteriors: active.exteriors || [],
      props: active.props || [],
      selectedStyleId: active.selectedStyleId || 'manga_color'
    };
    savedProj.imagePrompts = sortedPrompts;

    const syncedProj = syncProjectReferences(savedProj);
    await saveProject(syncedProj);
    syncChannel?.postMessage({ type: 'project_updated', projectId: projId });

    if (get().currentProject.id === projId) {
      set((state: any) => ({
        currentProject: {
          ...state.currentProject,
          imagePrompts: syncedProj.imagePrompts,
          characters: syncedProj.characters || [],
          exteriors: syncedProj.exteriors || [],
          props: syncedProj.props || []
        },
        characters: syncedProj.characters || [],
        exteriors: syncedProj.exteriors || [],
        props: syncedProj.props || [],
        tokenUsage: {
          ...state.tokenUsage,
          inputTokens: state.tokenUsage.inputTokens + response.usage.inputTokens,
          outputTokens: state.tokenUsage.outputTokens + response.usage.outputTokens,
          cost: state.tokenUsage.cost + response.usage.cost
        }
      }));
    } else {
      set((state: any) => ({
        tokenUsage: {
          ...state.tokenUsage,
          inputTokens: state.tokenUsage.inputTokens + response.usage.inputTokens,
          outputTokens: state.tokenUsage.outputTokens + response.usage.outputTokens,
          cost: state.tokenUsage.cost + response.usage.cost
        }
      }));
    }

    if (i + batchSize < sceneMapping.length) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }

  return mergedPrompts;
}

// Mutex to serialize project updates/saves and prevent race conditions when running tasks concurrently
let projectDbPromise: Promise<any> = Promise.resolve();
const runInProjectDbQueue = <T>(fn: () => Promise<T>): Promise<T> => {
  const result = projectDbPromise.then(fn);
  projectDbPromise = result.catch(() => {});
  return result;
};

let lastImageGenRequestTime = 0;
const enforceImageGenDelay = async (delayTimeSeconds: number) => {
  if (delayTimeSeconds <= 0) return;
  const delayMs = delayTimeSeconds * 1000;
  const now = Date.now();
  const targetTime = Math.max(now, lastImageGenRequestTime + delayMs);
  lastImageGenRequestTime = targetTime;
  const waitTime = targetTime - now;
  if (waitTime > 0) {
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
};

export const useProjectStore = create<ProjectState>((set, get) => ({
  // Configuration
  apiConfig: {
    provider: 'gemini',
    apiKey: '',
    modelName: 'gemini-2.5-flash',
    googleApiUrl: 'http://127.0.0.1:5000'
  },
  setApiConfig: (config) => {
    const newConfig = { ...get().apiConfig, ...config };
    set({ apiConfig: newConfig });
    setLocalStorage('ms_provider', newConfig.provider);
    setLocalStorage('ms_apiKey', newConfig.apiKey);
    setLocalStorage('ms_modelName', newConfig.modelName);
    if (newConfig.googleApiUrl !== undefined) {
      setLocalStorage('ms_googleApiUrl', newConfig.googleApiUrl);
    }
  },
  imageGenConfig: {
    count: 1,
    aspectRatio: 'IMAGE_ASPECT_RATIO_LANDSCAPE',
    model: 'GEM_PIX_2',
    concurrency: 1,
    delayTime: 5
  },
  setImageGenConfig: (config) => {
    const newConfig = { ...get().imageGenConfig, ...config };
    set({ imageGenConfig: newConfig });
    setLocalStorage('ms_imageGen_count', String(newConfig.count));
    setLocalStorage('ms_imageGen_aspectRatio', newConfig.aspectRatio);
    setLocalStorage('ms_imageGen_model', newConfig.model);
    setLocalStorage('ms_imageGen_concurrency', String(newConfig.concurrency));
    if (newConfig.delayTime !== undefined) {
      setLocalStorage('ms_imageGen_delayTime', String(newConfig.delayTime));
    }
  },
  videoGenConfig: {
    count: 1,
    aspectRatio: 'VIDEO_ASPECT_RATIO_LANDSCAPE',
    model: 'veo_3_1_r2v_lite_low_priority',
    concurrency: 1
  },
  setVideoGenConfig: (config) => {
    const newConfig = { ...get().videoGenConfig, ...config };
    set({ videoGenConfig: newConfig });
    setLocalStorage('ms_videoGen_count', String(newConfig.count));
    setLocalStorage('ms_videoGen_aspectRatio', newConfig.aspectRatio);
    setLocalStorage('ms_videoGen_model', newConfig.model);
    setLocalStorage('ms_videoGen_concurrency', String(newConfig.concurrency));
  },
  targetDuration: 25,
  setTargetDuration: (duration) => {
    set({ targetDuration: duration });
    setLocalStorage('ms_targetDuration', String(duration));
  },
  initializeStore: () => {
    if (typeof window === 'undefined') return;

    if (syncChannel) {
      syncChannel.onmessage = async (event) => {
        const { type, projectId } = event.data || {};
        if (type === 'project_updated') {
          await get().loadHistory();
          const activeProjId = get().currentProject.id;
          if (activeProjId && activeProjId === projectId) {
            await get().loadProject(projectId);
          }
        } else if (type === 'project_deleted') {
          await get().loadHistory();
          const activeProjId = get().currentProject.id;
          if (activeProjId && activeProjId === projectId) {
            set({
              currentProject: {
                id: null,
                name: 'Untitled Project',
                provider: 'gemini',
                modelName: 'gemini-2.5-flash',
                srtContent: '',
                scriptContent: '',
                srtMeta: { lineCount: 0, duration: '00:00:00' },
                sceneMapping: [],
                imagePrompts: [],
                characters: [],
                exteriors: [],
                props: [],
                selectedStyleId: 'manga_color',
                videoSaveDir: '',
                autoDownloadVideo: false,
                bgmSuggestions: [],
                bgmVolumeDb: -18,
                hookSegments: []
              },
              bgmFiles: []
            });
          }
        }
      };
    }

    const apiKey = localStorage.getItem('ms_apiKey') || '';
    const googleApiUrl = localStorage.getItem('ms_googleApiUrl') || 'http://127.0.0.1:5000';
    
    // Force default to Gemini if no API key is saved (resets old test cache)
    let provider = (localStorage.getItem('ms_provider') || 'gemini') as any;
    let modelName = localStorage.getItem('ms_modelName') || 'gemini-2.5-flash';
    
    if (!apiKey) {
      provider = 'gemini';
      modelName = 'gemini-2.5-flash';
      localStorage.setItem('ms_provider', 'gemini');
      localStorage.setItem('ms_modelName', 'gemini-2.5-flash');
    }

    let scenePrompt = localStorage.getItem('ms_scenePrompt') || DEFAULT_SCENE_MAPPING_PROMPT;
    const rawScenePrompt = localStorage.getItem('ms_scenePrompt');
    if (rawScenePrompt && rawScenePrompt.includes('8. Character Name Consistency') && !rawScenePrompt.includes('桃花：「わかりました」')) {
      const oldRule8 = `8. Character Name Consistency (THỐNG NHẤT TÊN NHÂN VẬT)
- Tên nhân vật được ghi nhận trong trường "characters" và nội dung trong trường "sceneDescription" hay "mainSituation" phải khớp nhau.
- Ví dụ: Nếu trong mô tả cảnh hoặc tình huống nhắc đến "Kenji" và "Aoi" thì trường "characters" phải ghi nhận chính xác: "Kenji, Aoi" (phân tách bằng dấu phẩy).`;
      
      const newRule8 = `8. Character Name Consistency (THỐNG NHẤT TÊN NHÂN VẬT)
- Tên nhân vật được ghi nhận trong trường "characters" và nội dung trong trường "sceneDescription" hay "mainSituation" phải khớp nhau.
- Ví dụ: Nếu trong mô tả cảnh hoặc tình huống nhắc đến "Kenji" và "Aoi" thì trường "characters" phải ghi nhận chính xác: "Kenji, Aoi" (phân tách bằng dấu phẩy).
- PHÂN TÍCH GỢI Ý TÊN TỪ LỜI THOẠI & NGỮ CẢNH (LAYER 1 - BASE NAME):
  + Nếu trong phụ đề (SRT) xuất hiện lời thoại dạng có tên người nói trước dấu hai chấm và dấu ngoặc (Ví dụ: 桃花：「わかりました」, 田中：「いいよ」), bạn phải hiểu rằng "桃花" và "田中" là tên của nhân vật đang nói.
  + Hãy trích xuất và sử dụng chính xác các tên nhân vật này. Nếu câu chuyện viết bằng tiếng Nhật hoặc bối cảnh Nhật Bản, hãy phiên âm Latin (Romaji) chính xác theo tiếng Nhật (ví dụ: "桃花" -> "momoka", "田中" -> "tanaka"). Tránh việc phiên âm sai sang tiếng Trung (như "taohua") hoặc đặt tên tiếng Anh ngẫu nhiên, hoặc dùng các từ chung chung như "cô gái", "chàng trai" khi đã có tên rõ ràng.`;

      const oldRule10 = `10. Character Variation Rules (TẠO BIẾN THỂ NHÂN VẬT THEO BỐI CẢNH VÀ THỜI GIAN)
- Chỉ áp dụng quy tắc này cho các NHÂN VẬT CHÍNH (main characters). Không áp dụng cho nhân vật phụ hoặc quần chúng (extras/background characters).
- Nhận diện bối cảnh, mốc thời gian hoặc tình huống trong truyện để tự động tạo và sử dụng các biến thể nhân vật phù hợp:
  + Biến thể theo thời gian/tuổi tác: Nếu câu chuyện kể về quá khứ, hồi tưởng, phiên bản thời trẻ (flashback/younger version), hãy tạo biến thể trẻ tuổi. Đặt tên dạng: [tên_nhân_vật_gốc]_[biến_thể] (tất cả viết thường, ví dụ: 'kudo_young').
  + Biến thể theo địa điểm/hoạt động: Nếu nhân vật chính thay đổi trang phục cho phù hợp với môi trường (ở nhà, đi làm, chơi thể thao, dự tiệc...), hãy tạo biến thể tương ứng. Đặt tên dạng: [tên_nhân_vật_gốc]_[biến_thể] (tất cả viết thường, ví dụ: 'kudo_home', 'kudo_office', 'kudo_sport', 'kudo_party').
- Đăng ký biến thể: Các biến thể này phải được xem như nhân vật mới và khai báo trong danh sách "newCharacters" (nếu chưa có trong danh sách nhân vật đã biết 'knownCharacters'). Trong phần prompt của biến thể mới đó, mô tả rõ trang phục hoặc độ tuổi đặc trưng (ví dụ: "Character Sheet of kudo_home, ... wearing casual, comfortable home clothing", "Character Sheet of kudo_young, ... as a younger version").
- Áp dụng trong cảnh: Trong trường "characters" của mỗi cảnh, điền chính xác ID của biến thể được dùng (ví dụ: "kudo_home" hoặc "kudo_young" thay vì tên gốc "kudo").`;

      const newRule10 = `10. Character Variation Rules (TẠO BIẾN THỂ NHÂN VẬT THEO BỐI CẢNH VÀ THỜI GIAN - LAYER 2 - VARIANT)
- Chỉ áp dụng quy tắc này cho các NHÂN VẬT CHÍNH (main characters). Không áp dụng cho nhân vật phụ hoặc quần chúng (extras/background characters).
- Nhận diện bối cảnh, mốc thời gian hoặc tình huống trong truyện để tự động tạo và sử dụng các biến thể nhân vật phù hợp:
  + Kết hợp Tên Gốc (Layer 1) với biến thể: Sau khi xác định tên gốc (ví dụ: "momoka"), nếu có sự thay đổi trang phục (ở nhà, đi làm, chơi thể thao...) hoặc mốc thời gian (hồi tưởng quá khứ, sau 5 năm '5yearslater'...), hãy tạo biến thể tương ứng.
  + Định dạng tên ghép: Đặt tên dạng: [tên_nhân_vật_gốc]_[biến_thể] (tất cả viết thường, ví dụ: 'momoka_home', 'momoka_5yearslater', 'tanaka_office').
- Đăng ký biến thể: Các biến thể này phải được xem như nhân vật mới và khai báo trong danh sách "newCharacters" (nếu chưa có trong danh sách nhân vật đã biết 'knownCharacters'). Trong phần prompt của biến thể mới đó, mô tả rõ trang phục hoặc độ tuổi/mốc thời gian đặc trưng (ví dụ: "Character Sheet of momoka_home, ... wearing casual, comfortable home clothing", "Character Sheet of momoka_5yearslater, ... 5 years later, looking more mature").
- Áp dụng trong cảnh: Trong trường "characters" của mỗi cảnh, điền chính xác ID của biến thể được dùng (ví dụ: "momoka_home" hoặc "momoka_5yearslater" thay vì tên gốc "momoka").`;

      let migrated = rawScenePrompt;
      if (migrated.includes(oldRule8)) {
        migrated = migrated.replace(oldRule8, newRule8);
      }
      if (migrated.includes(oldRule10)) {
        migrated = migrated.replace(oldRule10, newRule10);
      }
      localStorage.setItem('ms_scenePrompt', migrated);
      scenePrompt = migrated;
    }
    const imagePrompt = localStorage.getItem('ms_imagePrompt') || DEFAULT_IMAGE_PROMPT_PROMPT;
    const targetDuration = Number(localStorage.getItem('ms_targetDuration') || '25');
    
    const imageCount = Number(localStorage.getItem('ms_imageGen_count') || '1');
    const imageAspectRatio = localStorage.getItem('ms_imageGen_aspectRatio') || 'IMAGE_ASPECT_RATIO_LANDSCAPE';
    const imageModel = localStorage.getItem('ms_imageGen_model') || 'GEM_PIX_2';
    const imageConcurrency = Number(localStorage.getItem('ms_imageGen_concurrency') || '1');
    const imageDelayTime = Number(localStorage.getItem('ms_imageGen_delayTime') || '5');

    const videoCount = Number(localStorage.getItem('ms_videoGen_count') || '1');
    const videoAspectRatio = localStorage.getItem('ms_videoGen_aspectRatio') || 'VIDEO_ASPECT_RATIO_LANDSCAPE';
    const videoModel = localStorage.getItem('ms_videoGen_model') || 'veo_3_1_r2v_lite_low_priority';
    const videoConcurrency = Number(localStorage.getItem('ms_videoGen_concurrency') || '1');

    const savedStyles = localStorage.getItem('ms_drawingStyles');
    let stylesList = DEFAULT_STYLES;
    if (savedStyles) {
      try {
        stylesList = JSON.parse(savedStyles);
      } catch (err) {
        console.error("Failed to parse drawing styles:", err);
      }
    }

    set({
      apiConfig: { provider, apiKey, modelName, googleApiUrl },
      imageGenConfig: {
        count: imageCount,
        aspectRatio: imageAspectRatio,
        model: imageModel,
        concurrency: imageConcurrency,
        delayTime: imageDelayTime
      },
      videoGenConfig: {
        count: videoCount,
        aspectRatio: videoAspectRatio,
        model: videoModel,
        concurrency: videoConcurrency
      },
      sceneMappingPrompt: scenePrompt,
      imagePromptPrompt: imagePrompt,
      targetDuration,
      styles: stylesList,
      systemLogs: [],
      serverQueue: [],
      serverActive: [],
      textLogs: [],
      textQueue: [],
      textActive: [],
      videoLogs: [],
      videoQueue: [],
      videoActive: [],
      globalTextQueue: [],
      globalTextActive: [],
      globalTextLogs: [],
      globalServerQueue: [],
      globalServerActive: [],
      globalSystemLogs: [],
      globalVideoQueue: [],
      globalVideoActive: [],
      globalVideoLogs: [],
      shotGeneratingIds: [],
      videoGeneratingIds: []
    });
  },

  // Prompts Templates
  sceneMappingPrompt: DEFAULT_SCENE_MAPPING_PROMPT,
  imagePromptPrompt: DEFAULT_IMAGE_PROMPT_PROMPT,
  updatePromptTemplate: (type, value) => {
    if (type === 'scene') {
      set({ sceneMappingPrompt: value });
      setLocalStorage('ms_scenePrompt', value);
    } else {
      set({ imagePromptPrompt: value });
      setLocalStorage('ms_imagePrompt', value);
    }
  },
  resetPromptTemplates: () => {
    set({
      sceneMappingPrompt: DEFAULT_SCENE_MAPPING_PROMPT,
      imagePromptPrompt: DEFAULT_IMAGE_PROMPT_PROMPT
    });
    setLocalStorage('ms_scenePrompt', DEFAULT_SCENE_MAPPING_PROMPT);
    setLocalStorage('ms_imagePrompt', DEFAULT_IMAGE_PROMPT_PROMPT);
  },

  // Drawing styles
  styles: DEFAULT_STYLES,
  setSelectedStyleId: (id) => {
    set((state) => ({
      currentProject: { ...state.currentProject, selectedStyleId: id }
    }));
    if (get().currentProject.id) {
      get().saveCurrentProject().catch(err => console.error("Failed to auto-save project style selection:", err));
    }
  },
  addStyle: (style) => {
    const id = `style_${Date.now()}`;
    const newStyle: DrawingStyle = {
      ...style,
      id,
      isCustom: true
    };
    const updatedStyles = [...get().styles, newStyle];
    set({ styles: updatedStyles });
    setLocalStorage('ms_drawingStyles', JSON.stringify(updatedStyles));
  },
  updateStyle: (id, updatedFields) => {
    const updatedStyles = get().styles.map((s) => {
      if (s.id === id && s.isCustom) {
        return { ...s, ...updatedFields };
      }
      return s;
    });
    set({ styles: updatedStyles });
    setLocalStorage('ms_drawingStyles', JSON.stringify(updatedStyles));
  },
  deleteStyle: (id) => {
    const styleToDelete = get().styles.find(s => s.id === id);
    if (!styleToDelete || !styleToDelete.isCustom) return;

    const updatedStyles = get().styles.filter((s) => s.id !== id);
    const activeSelectedStyleId = get().currentProject.selectedStyleId;
    const fallbackId = activeSelectedStyleId === id ? 'manga_color' : activeSelectedStyleId;

    set((state) => ({
      styles: updatedStyles,
      currentProject: { ...state.currentProject, selectedStyleId: fallbackId }
    }));
    
    setLocalStorage('ms_drawingStyles', JSON.stringify(updatedStyles));

    if (get().currentProject.id) {
      get().saveCurrentProject().catch(err => console.error("Failed to auto-save project style selection on delete:", err));
    }
  },
  getSelectedStyle: () => {
    const selectedId = get().currentProject.selectedStyleId || 'manga_color';
    return get().styles.find((s) => s.id === selectedId) || get().styles[0] || DEFAULT_STYLES[0];
  },

  systemLogs: [],
  serverQueue: [],
  serverActive: [],
  fetchServerQueueAndLogs: async () => {
    const active = get().currentProject;
    if (!active || !active.id) return;
    try {
      const res = await fetch(`/api/image/generate?projectId=${active.id}`);
      if (res.ok) {
        const data = await res.json();
        set({
          systemLogs: data.logs || [],
          serverQueue: data.queue || [],
          serverActive: data.active || []
        });
      }
    } catch (err) {
      console.error("Failed to fetch server queue and logs:", err);
    }
  },

  textLogs: [],
  textQueue: [],
  textActive: [],
  fetchTextQueueAndLogs: async () => {
    const active = get().currentProject;
    if (!active || !active.id) return;
    try {
      const res = await fetch(`/api/ai/generate?projectId=${active.id}`);
      if (res.ok) {
        const data = await res.json();
        set({
          textLogs: data.logs || [],
          textQueue: data.queue || [],
          textActive: data.active || []
        });
      }
    } catch (err) {
      console.error("Failed to fetch text queue and logs:", err);
    }
  },

  videoLogs: [],
  videoQueue: [],
  videoActive: [],
  fetchVideoQueueAndLogs: async () => {
    const active = get().currentProject;
    if (!active || !active.id) return;
    try {
      const res = await fetch(`/api/video/generate?projectId=${active.id}`);
      if (res.ok) {
        const data = await res.json();
        set({
          videoLogs: data.logs || [],
          videoQueue: data.queue || [],
          videoActive: data.active || []
        });
      }
    } catch (err) {
      console.error("Failed to fetch video queue and logs:", err);
    }
  },

  globalTextQueue: [],
  globalTextActive: [],
  globalTextLogs: [],
  globalServerQueue: [],
  globalServerActive: [],
  globalSystemLogs: [],
  globalVideoQueue: [],
  globalVideoActive: [],
  globalVideoLogs: [],
  fetchGlobalQueues: async () => {
    try {
      const [resText, resImg, resVid] = await Promise.all([
        fetch('/api/ai/generate'),
        fetch('/api/image/generate'),
        fetch('/api/video/generate')
      ]);

      const updates: any = {};

      if (resText.ok) {
        const data = await resText.json();
        updates.globalTextQueue = data.queue || [];
        updates.globalTextActive = data.active || [];
        updates.globalTextLogs = data.logs || [];
      }
      if (resImg.ok) {
        const data = await resImg.json();
        updates.globalServerQueue = data.queue || [];
        updates.globalServerActive = data.active || [];
        updates.globalSystemLogs = data.logs || [];
      }
      if (resVid.ok) {
        const data = await resVid.json();
        updates.globalVideoQueue = data.queue || [];
        updates.globalVideoActive = data.active || [];
        updates.globalVideoLogs = data.logs || [];
      }

      set(updates);
    } catch (err) {
      console.error("Failed to fetch global queues and logs:", err);
    }
  },

  // Shots drawing
  shotGeneratingIds: [],
  videoGeneratingIds: [],
  batchJobs: {},
  generateShotImage: async (stt) => {
    const active = get().currentProject;
    if (!active.id) throw new Error('Please open or save a project first.');

    set((state) => ({
      shotGeneratingIds: [...state.shotGeneratingIds, `${active.id}_${stt}`]
    }));

    try {
      const row = active.imagePrompts.find((p) => p.stt === stt);
      if (!row) throw new Error('Shot segment not found.');

      // Match character reference images, exterior background, and props
      const charNames = parseCharactersField(row.characters);

      // Validate characters references
      const missingCharImages = charNames.filter((name) => {
        const char = findBestCharacterMatch(active.characters || [], name);
        return !char || !char.image;
      });

      if (missingCharImages.length > 0) {
        throw new Error(`Chưa có ảnh tham chiếu cho nhân vật: ${missingCharImages.join(', ')}. Vui lòng tạo ảnh tham chiếu ở tab "Asset References" trước.`);
      }

      const matchedChars = charNames
        .map((name) => findBestCharacterMatch(active.characters || [], name))
        .filter((c): c is CharacterReference => !!c);

      const propNames = parseCharactersField(row.props || '');

      // Validate props references
      const missingPropImages = propNames.filter((name) => {
        const prop = findBestPropMatch(active.props || [], name);
        return !prop || !prop.image;
      });

      if (missingPropImages.length > 0) {
        throw new Error(`Chưa có ảnh tham chiếu cho đạo cụ: ${missingPropImages.join(', ')}. Vui lòng tạo ảnh tham chiếu ở tab "Asset References" trước.`);
      }

      const matchedProps = propNames
        .map((name) => findBestPropMatch(active.props || [], name))
        .filter((p): p is PropReference => !!p);

      const extName = (row.exterior || '').trim();
      
      // Validate exterior background reference
      if (extName) {
        const ext = findBestExteriorMatch(active.exteriors || [], extName);
        if (!ext || !ext.image) {
          throw new Error(`Chưa có ảnh tham chiếu cho bối cảnh: "${extName}". Vui lòng tạo ảnh tham chiếu ở tab "Asset References" trước.`);
        }
      }

      const matchedExt = extName
        ? findBestExteriorMatch(active.exteriors || [], extName)
        : undefined;

      const mediaIds: string[] = [];
      let accountId = '';

      matchedChars.forEach((c) => {
        if (c.mediaId) mediaIds.push(c.mediaId);
        if (c.accountId && !accountId) accountId = c.accountId;
      });

      matchedProps.forEach((p) => {
        if (p.mediaId) mediaIds.push(p.mediaId);
        if (p.accountId && !accountId) accountId = p.accountId;
      });

      if (matchedExt && matchedExt.mediaId) {
        mediaIds.push(matchedExt.mediaId);
        if (matchedExt.accountId && !accountId) accountId = matchedExt.accountId;
      }

      const activeStyle = get().getSelectedStyle();
      const rawPrompt = row.description || '';
      // Clean up style suffixes from row.description if any exist, then append the activeStyle.sceneSuffix
      let finalPrompt = rawPrompt.trim();
      // Remove common style keywords if present to keep it clean before appending
      const cleanKeywords = [
        'modern colored manga', 'cinematic anime movie', 'Japanese drama realism', 
        'highly detailed illustration', 'emotional storytelling composition', 
        'movie-quality coloring', 'beautiful depth of field', 'anime movie atmosphere', 
        'manga color style', 'black and white manga style', 'screentone', 'ink drawing',
        'chibi character design', 'cute kawaii style', 'Korean webtoon style', 'manhwa illustration',
        'cyberpunk anime style', 'futuristic techwear', 'neon highlights'
      ];
      
      // We append style suffix during generation
      if (activeStyle.sceneSuffix && !finalPrompt.toLowerCase().includes(activeStyle.sceneSuffix.toLowerCase())) {
        // Remove trailing periods and spaces
        if (finalPrompt.endsWith('.')) {
          finalPrompt = finalPrompt.slice(0, -1).trim();
        }
        finalPrompt = `${finalPrompt}, ${activeStyle.sceneSuffix}`;
      }

      const payload: any = {
        projectId: active.id,
        stt: row.stt,
        concurrency: get().imageGenConfig.concurrency,
        prompt: finalPrompt,
        count: get().imageGenConfig.count,
        aspect_ratio: get().imageGenConfig.aspectRatio,
        model: get().imageGenConfig.model,
        for_video: true,
        assetType: 'shot',
        assetId: `shot_${active.id}_${row.stt}`,
        googleApiUrl: get().apiConfig.googleApiUrl || ''
      };

      if (mediaIds.length > 0) {
        payload.media_ids = mediaIds;
      }
      if (accountId) {
        payload.account_id = accountId;
      }

      const delayTime = get().imageGenConfig.delayTime || 5;
      await enforceImageGenDelay(delayTime);

      const response = await fetch('/api/image/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(cleanErrorMessage(errText) || 'Failed to generate shot image');
      }

      const resData = await response.json();
      if (!resData.success || !resData.images || resData.images.length === 0) {
        throw new Error('Image generation API returned unsuccessful status');
      }

      const imgData = resData.images[0];
      const imageUrl = imgData.url;
      const mediaId = imgData.media_id;
      const resAccountId = resData.account_id;

      // Auto download shot image to PC images folder if configured
      if (active.videoSaveDir) {
        try {
          const sep = active.videoSaveDir.includes('/') ? '/' : '\\';
          const cleanBase = active.videoSaveDir.replace(/[\\/]+$/, '');
          const imagesSaveDir = `${cleanBase}${sep}images`;
          await fetch('/api/video/download', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              url: imageUrl,
              saveDir: imagesSaveDir,
              fileName: `shot_${String(stt).padStart(2, '0')}.png`
            })
          });
        } catch (downloadErr) {
          console.error('Error auto-downloading image:', downloadErr);
        }
      }

      // Update store state
      set((state) => {
        const latestPrompts = state.currentProject.imagePrompts.map((p) => {
          if (p.stt === stt) {
            return {
              ...p,
              imageUrl,
              mediaId,
              accountId: resAccountId
            };
          }
          return p;
        });
        return {
          currentProject: {
            ...state.currentProject,
            imagePrompts: latestPrompts
          }
        };
      });

      // Persist changes to DB
      await get().saveCurrentProject();

    } finally {
      set((state) => ({
        shotGeneratingIds: state.shotGeneratingIds.filter((id) => id !== `${active.id}_${stt}`)
      }));
    }
  },
  generateVideo: async (stt) => {
    const active = get().currentProject;
    if (!active.id) throw new Error('Please open or save a project first.');

    const key = `${active.id}_${stt}`;
    set((state) => ({
      videoGeneratingIds: [...state.videoGeneratingIds, key]
    }));

    try {
      const row = active.imagePrompts.find((p) => p.stt === stt);
      if (!row) throw new Error('Shot segment not found.');

      if (!row.imageUrl) {
        throw new Error('Chưa có ảnh phân cảnh. Vui lòng vẽ ảnh phân cảnh trước khi tạo video!');
      }

      const refMediaId = row.mediaId || '';
      const refAccountId = row.accountId || '';

      const payload: any = {
        projectId: active.id,
        stt: row.stt,
        prompt: row.motion || 'cinematic motion, slow pan',
        concurrency: get().videoGenConfig.concurrency || 1,
        aspect_ratio: get().videoGenConfig.aspectRatio || 'VIDEO_ASPECT_RATIO_LANDSCAPE',
        model: refMediaId ? 'veo_3_1_r2v_lite_low_priority' : (get().videoGenConfig.model || 'veo_3_1_r2v_lite_low_priority'),
        duration: '4 Giây',
        count: get().videoGenConfig.count || 1,
        assetType: 'video',
        assetId: `video_${active.id}_${row.stt}`,
        googleApiUrl: get().apiConfig.googleApiUrl || ''
      };

      if (refMediaId) {
        payload.media_ids = [refMediaId];
      }
      if (refAccountId) {
        payload.account_id = refAccountId;
      }

      const response = await fetch('/api/video/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(cleanErrorMessage(errText) || 'Failed to generate video');
      }

      const resData = await response.json();
      let videoUrl = '';
      if (resData.success && resData.videos && resData.videos.length > 0) {
        videoUrl = resData.videos[0].url;
      } else if (resData.success && resData.url) {
        videoUrl = resData.url;
      } else if (resData.url) {
        videoUrl = resData.url;
      }

      if (!videoUrl) {
        throw new Error('API response not success or no video URL returned');
      }

      set((state) => {
        const latestPrompts = state.currentProject.imagePrompts.map((p) => {
          if (p.stt === stt) {
            return {
              ...p,
              videoUrl
            };
          }
          return p;
        });
        return {
          currentProject: {
            ...state.currentProject,
            imagePrompts: latestPrompts
          }
        };
      });

      await get().saveCurrentProject();

      // Auto download video to PC if configured
      if (active.autoDownloadVideo && active.videoSaveDir) {
        try {
          const sep = active.videoSaveDir.includes('/') ? '/' : '\\';
          const cleanBase = active.videoSaveDir.replace(/[\\/]+$/, '');
          const videosSaveDir = `${cleanBase}${sep}videos`;
          const downloadResponse = await fetch('/api/video/download', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              url: videoUrl,
              saveDir: videosSaveDir,
              fileName: `segment_${String(stt).padStart(2, '0')}.mp4`
            })
          });
          if (!downloadResponse.ok) {
            console.error('Failed to auto-download video:', await downloadResponse.text());
          }
        } catch (downloadErr) {
          console.error('Error auto-downloading video:', downloadErr);
        }
      }
    } finally {
      set((state) => ({
        videoGeneratingIds: state.videoGeneratingIds.filter((id) => id !== key)
      }));
    }
  },

  // BGM root states
  isGeneratingBgmSuggestions: false,
  bgmFiles: [],

  // Active Project State
  currentProject: {
    id: null as string | null,
    name: 'Untitled Project',
    provider: 'gemini',
    modelName: 'gemini-2.5-flash',
    srtContent: '',
    scriptContent: '',
    srtMeta: { lineCount: 0, duration: '00:00:00' },
    sceneMapping: [],
    imagePrompts: [],
    characters: [] as CharacterReference[],
    exteriors: [] as ExteriorReference[],
    props: [] as PropReference[],
    selectedStyleId: 'manga_color',
    videoSaveDir: '',
    autoDownloadVideo: false,
    bgmSuggestions: [] as BgmSuggestionRow[],
    bgmVolumeDb: -18,
    hookSegments: [] as number[]
  },
  setCurrentProjectField: (field, value) => {
    set((state) => ({
      currentProject: { ...state.currentProject, [field]: value }
    }));
    if (get().currentProject.id) {
      get().saveCurrentProject().catch((err) => console.error(`Failed to auto-save field ${field}:`, err));
    }
  },
  setSrtContent: (content, name = 'New Project') => {
    if (!content) {
      set((state) => ({
        currentProject: {
          id: null,
          name: 'Untitled Project',
          provider: state.apiConfig.provider,
          modelName: state.apiConfig.modelName,
          srtContent: '',
          scriptContent: '',
          srtMeta: { lineCount: 0, duration: '00:00:00' },
          sceneMapping: [],
          imagePrompts: [],
          characters: [],
          exteriors: [],
          props: [],
          videoSaveDir: '',
          autoDownloadVideo: false,
          bgmSuggestions: [],
          bgmVolumeDb: -18,
          hookSegments: []
        },
        bgmFiles: []
      }));
      return;
    }

    const parseResult = parseSRT(content);
    const currentId = get().currentProject.id;
    const projId = currentId || `proj_${Date.now()}`;
    const projName = currentId ? get().currentProject.name : name;
    
    set((state) => ({
      currentProject: {
        ...state.currentProject,
        id: projId,
        name: projName,
        srtContent: content,
        srtMeta: {
          lineCount: parseResult.lineCount,
          duration: parseResult.duration
        },
        sceneMapping: [],
        imagePrompts: [],
        bgmSuggestions: [],
        bgmVolumeDb: -18,
        hookSegments: []
      },
      bgmFiles: []
    }));

    // Auto-save immediately to IndexedDB in the background so it's not lost when switching tabs
    get().saveCurrentProject(projName).catch(err => console.error('Auto-save failed:', err));
  },
  updateSceneMappingCell: (rowIndex, colId, value) => {
    set((state) => {
      let mapping = [...state.currentProject.sceneMapping];
      if (mapping[rowIndex]) {
        mapping[rowIndex] = { ...mapping[rowIndex], [colId]: value };
      }
      if (colId === 'subtitleRange') {
        const srtContent = state.currentProject.srtContent || '';
        const totalSubtitles = parseSRT(srtContent).blocks.length;
        const adjusted = recalculateSubtitleRanges(mapping, totalSubtitles);
        mapping = recalculateProjectTimeRanges(adjusted, srtContent);
      }
      return {
        currentProject: { ...state.currentProject, sceneMapping: mapping }
      };
    });
    // Auto save if project is loaded
    if (get().currentProject.id) {
      get().saveCurrentProject();
    }
  },
  updateImagePromptCell: (rowIndex, colId, value) => {
    set((state) => {
      const prompts = [...state.currentProject.imagePrompts];
      if (prompts[rowIndex]) {
        prompts[rowIndex] = { ...prompts[rowIndex], [colId]: value };
      }
      return {
        currentProject: { ...state.currentProject, imagePrompts: prompts }
      };
    });
    // Auto save if project is loaded
    if (get().currentProject.id) {
      get().saveCurrentProject();
    }
  },

  // Row edits
  addSceneRow: (index) => {
    set((state) => {
      const mapping = [...state.currentProject.sceneMapping];
      const insertIndex = index !== undefined ? index : mapping.length;
      
      const newRow: SceneMappingRow = {
        stt: mapping.length + 1,
        subtitleRange: '',
        timeRange: '',
        characters: '',
        mainSituation: '',
        mainEmotion: '',
        sceneDescription: ''
      };

      mapping.splice(insertIndex, 0, newRow);

      // Re-index stt values
      const updatedMapping = mapping.map((row, idx) => ({
        ...row,
        stt: idx + 1
      }));

      return {
        currentProject: { ...state.currentProject, sceneMapping: updatedMapping }
      };
    });
    if (get().currentProject.id) get().saveCurrentProject();
  },

  deleteSceneRow: (stt) => {
    set((state) => {
      const mapping = state.currentProject.sceneMapping.filter((row) => row.stt !== stt);
      const reindexed = mapping.map((row, idx) => ({
        ...row,
        stt: idx + 1
      }));
      const srtContent = state.currentProject.srtContent || '';
      const totalSubtitles = parseSRT(srtContent).blocks.length;
      const adjustedRanges = recalculateSubtitleRanges(reindexed, totalSubtitles);
      const updatedMapping = recalculateProjectTimeRanges(adjustedRanges, srtContent);

      // Also filter image prompts if they exist
      const prompts = state.currentProject.imagePrompts.filter((row) => row.stt !== stt);
      const updatedPrompts = prompts.map((row, idx) => ({
        ...row,
        stt: idx + 1
      }));

      return {
        currentProject: {
          ...state.currentProject,
          sceneMapping: updatedMapping,
          imagePrompts: updatedPrompts
        }
      };
    });
    if (get().currentProject.id) get().saveCurrentProject();
  },

  mergeScenes: (sttList) => {
    if (sttList.length < 2) return;
    set((state) => {
      const mapping = [...state.currentProject.sceneMapping];
      // Sort requested stts
      const sortedStts = [...sttList].sort((a, b) => a - b);
      const targetStt = sortedStts[0];
      
      // Find the rows
      const targetRowIndex = mapping.findIndex(r => r.stt === targetStt);
      if (targetRowIndex === -1) return {};

      const rowsToMerge = mapping.filter(r => sortedStts.includes(r.stt));
      
      // Merge values
      const mergedSubtitleRange = rowsToMerge.map(r => r.subtitleRange).filter(Boolean).join(', ');
      
      // Merge timeRange
      const startTimes = rowsToMerge.map(r => r.timeRange.split('-->')[0]?.trim()).filter(Boolean);
      const endTimes = rowsToMerge.map(r => r.timeRange.split('-->')[1]?.trim()).filter(Boolean);
      const mergedTimeRange = startTimes.length > 0 && endTimes.length > 0
        ? `${startTimes[0]} --> ${endTimes[endTimes.length - 1]}`
        : '';
        
      const mergedCharacters = Array.from(new Set(
        rowsToMerge.flatMap(r => parseCharactersField(r.characters))
      )).join(', ');
      
      const mergedSituation = rowsToMerge.map(r => r.mainSituation).filter(Boolean).join(' | ');
      const mergedEmotion = rowsToMerge.map(r => r.mainEmotion).filter(Boolean).join(' / ');
      const mergedDescription = rowsToMerge.map(r => r.sceneDescription).filter(Boolean).join('\n');

      // Update target row
      mapping[targetRowIndex] = {
        ...mapping[targetRowIndex],
        subtitleRange: mergedSubtitleRange,
        timeRange: mergedTimeRange,
        characters: mergedCharacters,
        mainSituation: mergedSituation,
        mainEmotion: mergedEmotion,
        sceneDescription: mergedDescription
      };

      // Remove other merged rows
      const finalMapping = mapping.filter(r => r.stt === targetStt || !sortedStts.includes(r.stt));
      
      // Re-index and recalculate time ranges
      const updatedMapping = recalculateProjectTimeRanges(
        finalMapping.map((row, idx) => ({
          ...row,
          stt: idx + 1
        })),
        state.currentProject.srtContent || ''
      );

      // Merge corresponding image prompts if they exist
      let updatedPrompts = [...state.currentProject.imagePrompts];
      if (updatedPrompts.length > 0) {
        const promptsToMerge = updatedPrompts.filter(p => sortedStts.includes(p.stt));
        const targetPromptIndex = updatedPrompts.findIndex(p => p.stt === targetStt);
        if (targetPromptIndex !== -1 && promptsToMerge.length > 0) {
          updatedPrompts[targetPromptIndex] = {
            ...updatedPrompts[targetPromptIndex],
            characters: mergedCharacters,
            description: promptsToMerge.map(p => p.description).filter(Boolean).join('\n'),
            exterior: promptsToMerge.map(p => p.exterior).filter(Boolean).join(' / '),
            motion: promptsToMerge.map(p => p.motion).filter(Boolean).join(' | ')
          };
        }
        const finalPrompts = updatedPrompts.filter(p => p.stt === targetStt || !sortedStts.includes(p.stt));
        updatedPrompts = finalPrompts.map((p, idx) => ({ ...p, stt: idx + 1 }));
      }

      return {
        currentProject: {
          ...state.currentProject,
          sceneMapping: updatedMapping,
          imagePrompts: updatedPrompts
        }
      };
    });
    if (get().currentProject.id) get().saveCurrentProject();
  },

  splitScene: (stt) => {
    set((state) => {
      const mapping = [...state.currentProject.sceneMapping];
      const targetIndex = mapping.findIndex(r => r.stt === stt);
      if (targetIndex === -1) return {};

      const targetRow = mapping[targetIndex];
      // Create a split row with half of subtitle/time values (placeholder split)
      const newRow: SceneMappingRow = {
        stt: stt + 1,
        subtitleRange: targetRow.subtitleRange ? `Split from ${targetRow.subtitleRange}` : '',
        timeRange: targetRow.timeRange,
        characters: targetRow.characters,
        mainSituation: '[SPLIT] ' + targetRow.mainSituation,
        mainEmotion: targetRow.mainEmotion,
        sceneDescription: '[SPLIT] ' + targetRow.sceneDescription
      };

      mapping.splice(targetIndex + 1, 0, newRow);

      // Re-index
      const updatedMapping = mapping.map((row, idx) => ({
        ...row,
        stt: idx + 1
      }));

      // Handle split in image prompts as well
      let updatedPrompts = [...state.currentProject.imagePrompts];
      if (updatedPrompts.length > 0) {
        const targetPromptIndex = updatedPrompts.findIndex(p => p.stt === stt);
        if (targetPromptIndex !== -1) {
          const targetPrompt = updatedPrompts[targetPromptIndex];
          const newPrompt: ImagePromptRow = {
            stt: stt + 1,
            characters: targetPrompt.characters,
            description: '[SPLIT] ' + targetPrompt.description,
            exterior: targetPrompt.exterior,
            motion: targetPrompt.motion
          };
          updatedPrompts.splice(targetPromptIndex + 1, 0, newPrompt);
        }
        updatedPrompts = updatedPrompts.map((p, idx) => ({ ...p, stt: idx + 1 }));
      }

      return {
        currentProject: {
          ...state.currentProject,
          sceneMapping: updatedMapping,
          imagePrompts: updatedPrompts
        }
      };
    });
    if (get().currentProject.id) get().saveCurrentProject();
  },

  // Sync / DB Operations
  history: [],
  loadHistory: async () => {
    const list = await listProjects();
    set({ history: list });
  },
  createNewProject: async (name, srtContent) => {
    const projId = `proj_${Date.now()}`;
    let srtMeta = { lineCount: 0, duration: '00:00:00' };
    if (srtContent) {
      const parseResult = parseSRT(srtContent);
      srtMeta = {
        lineCount: parseResult.lineCount,
        duration: parseResult.duration
      };
    }
    const newProj: Project = {
      id: projId,
      name,
      createdAt: new Date().toISOString(),
      provider: get().apiConfig.provider,
      modelName: get().apiConfig.modelName,
      srtContent: srtContent || '',
      scriptContent: '',
      srtMeta,
      sceneMapping: [],
      imagePrompts: [],
      characters: [],
      exteriors: [],
      props: [],
      selectedStyleId: 'manga_color',
      bgmSuggestions: [],
      bgmVolumeDb: -18,
      hookSegments: []
    };

    await saveProject(newProj);

    set({
      currentProject: {
        id: projId,
        name,
        provider: get().apiConfig.provider,
        modelName: get().apiConfig.modelName,
        srtContent: srtContent || '',
        scriptContent: '',
        srtMeta,
        sceneMapping: [],
        imagePrompts: [],
        characters: [],
        exteriors: [],
        props: [],
        selectedStyleId: 'manga_color',
        bgmSuggestions: [],
        bgmVolumeDb: -18,
        hookSegments: []
      },
      characters: [],
      exteriors: [],
      props: []
    });

    await get().loadHistory();
    syncChannel?.postMessage({ type: 'project_updated', projectId: projId });
    return projId;
  },
  saveCurrentProject: async (name) => {
    const active = get().currentProject;
    const synced = syncProjectReferences(active);
    const projId = synced.id || `proj_${Date.now()}`;
    const projName = name || synced.name;
    const existing = get().history.find((p) => p.id === projId);
    const createdAt = existing?.createdAt || new Date().toISOString();

    const projectData: Project = {
      id: projId,
      name: projName,
      createdAt,
      provider: get().apiConfig.provider,
      modelName: get().apiConfig.modelName,
      srtContent: synced.srtContent,
      scriptContent: active.scriptContent || '',
      srtMeta: synced.srtMeta,
      sceneMapping: synced.sceneMapping,
      imagePrompts: synced.imagePrompts,
      characters: synced.characters || [],
      exteriors: synced.exteriors || [],
      props: synced.props || [],
      selectedStyleId: synced.selectedStyleId || 'manga_color',
      videoSaveDir: active.videoSaveDir || '',
      autoDownloadVideo: !!active.autoDownloadVideo,
      bgmSuggestions: active.bgmSuggestions || [],
      bgmVolumeDb: active.bgmVolumeDb ?? -18,
      hookSegments: active.hookSegments || []
    };

    await saveProject(projectData);
    set((state) => ({
      currentProject: {
        ...state.currentProject,
        ...projectData
      },
      characters: projectData.characters || [],
      exteriors: projectData.exteriors || [],
      props: projectData.props || []
    }));
    await get().loadHistory();
    syncChannel?.postMessage({ type: 'project_updated', projectId: projId });
  },
  loadProject: async (id) => {
    let proj = await getProject(id);
    if (proj) {
      let syncedProj = syncProjectReferences(proj);
      const recalculatedMapping = recalculateProjectTimeRanges(syncedProj.sceneMapping, syncedProj.srtContent || '');
      if (JSON.stringify(recalculatedMapping) !== JSON.stringify(syncedProj.sceneMapping)) {
        syncedProj = {
          ...syncedProj,
          sceneMapping: recalculatedMapping
        };
        await saveProject(syncedProj);
        proj = syncedProj;
        await get().loadHistory();
      } else if (syncedProj !== proj) {
        await saveProject(syncedProj);
        proj = syncedProj;
        await get().loadHistory();
      }
      const runningStatus = get().runningProjects[id] || null;
      const runningCombo = get().runningCombos?.[id] || null;
      const hasAssetsGen = get().assetGeneratingIds?.some(key => key.startsWith(`${id}_`)) || false;
      const assetJobKey = `${id}_asset`;
      const isAssetJobRunning = !!get().batchJobs?.[assetJobKey]?.isRunning;

      const chars = proj.characters || [];
      const exts = proj.exteriors || [];
      const propsList = proj.props || [];
      set({
        currentProject: {
          id: proj.id,
          name: proj.name,
          provider: proj.provider,
          modelName: proj.modelName,
          srtContent: proj.srtContent,
          scriptContent: proj.scriptContent || '',
          srtMeta: proj.srtMeta,
          sceneMapping: proj.sceneMapping,
          imagePrompts: proj.imagePrompts,
          characters: chars,
          exteriors: exts,
          props: propsList,
          selectedStyleId: proj.selectedStyleId || 'manga_color',
          videoSaveDir: proj.videoSaveDir || '',
          autoDownloadVideo: !!proj.autoDownloadVideo,
          bgmSuggestions: proj.bgmSuggestions || [],
          bgmVolumeDb: proj.bgmVolumeDb ?? -18,
          hookSegments: proj.hookSegments || []
        },
        characters: chars,
        exteriors: exts,
        props: propsList,
        isGeneratingCombo1: runningCombo === 'combo1',
        isGeneratingCombo2: runningCombo === 'combo2',
        isGeneratingFullCombo: runningCombo === 'combo3',
        isGeneratingSceneMapping: runningStatus === 'mapping' || runningStatus === 'mapping_queued',
        isGeneratingImagePrompts: runningStatus === 'prompts' || runningStatus === 'prompts_queued',
        isGeneratingAssets: hasAssetsGen || runningStatus === 'assets' || isAssetJobRunning,
        batchStatus: runningStatus === 'mapping_queued' || runningStatus === 'prompts_queued'
          ? 'Waiting in API queue...'
          : runningStatus === 'prompts'
          ? 'Generating prompts...'
          : ''
      });
      // Optionally sync API config to the project's saved config
      get().setApiConfig({
        provider: proj.provider as any,
        modelName: proj.modelName
      });
    }
  },
  deleteProject: async (id) => {
    await dbDeleteProject(id);
    if (get().currentProject.id === id) {
      set({
        currentProject: {
          id: null,
          name: 'Untitled Project',
          provider: 'gemini',
          modelName: 'gemini-2.5-flash',
          srtContent: '',
          scriptContent: '',
          srtMeta: { lineCount: 0, duration: '00:00:00' },
          sceneMapping: [],
          imagePrompts: [],
          characters: [],
          exteriors: [],
          props: [],
          bgmSuggestions: [],
          bgmVolumeDb: -18,
          hookSegments: []
        },
        bgmFiles: []
      });
    }
    await get().loadHistory();
    syncChannel?.postMessage({ type: 'project_deleted', projectId: id });
  },
  duplicateProject: async (id) => {
    const proj = await getProject(id);
    if (proj) {
      const newProj: Project = {
        id: `proj_${Date.now()}`,
        name: `${proj.name} - Copy`,
        createdAt: new Date().toISOString(),
        provider: proj.provider || get().apiConfig.provider,
        modelName: proj.modelName || get().apiConfig.modelName,
        srtContent: proj.srtContent || '',
        scriptContent: proj.scriptContent || '',
        srtMeta: JSON.parse(JSON.stringify(proj.srtMeta || { lineCount: 0, duration: '00:00:00' })),
        sceneMapping: JSON.parse(JSON.stringify(proj.sceneMapping || [])),
        imagePrompts: JSON.parse(JSON.stringify(proj.imagePrompts || [])),
        characters: JSON.parse(JSON.stringify(proj.characters || [])),
        exteriors: JSON.parse(JSON.stringify(proj.exteriors || [])),
        props: JSON.parse(JSON.stringify(proj.props || [])),
        selectedStyleId: proj.selectedStyleId || 'manga_color',
        videoSaveDir: proj.videoSaveDir || '',
        autoDownloadVideo: !!proj.autoDownloadVideo,
        bgmSuggestions: JSON.parse(JSON.stringify(proj.bgmSuggestions || [])),
        bgmVolumeDb: proj.bgmVolumeDb ?? -18,
        hookSegments: JSON.parse(JSON.stringify(proj.hookSegments || []))
      };
      await saveProject(newProj);
      await get().loadHistory();
      syncChannel?.postMessage({ type: 'project_updated', projectId: newProj.id });
    }
  },
  exportProject: async (id) => {
    try {
      const proj = await getProject(id);
      if (!proj) {
        alert('Không tìm thấy dự án trong Database.');
        return;
      }

      const exportData = JSON.parse(JSON.stringify(proj));
      set({ batchStatus: "Đang đóng gói dữ liệu và mã hóa hình ảnh..." });

      const toBase64 = async (url: string): Promise<string> => {
        try {
          const res = await fetch(url);
          const blob = await res.blob();
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch (e) {
          console.warn(`Failed to convert image to base64 for export: ${url}`, e);
          return '';
        }
      };

      if (exportData.imagePrompts) {
        for (const prompt of exportData.imagePrompts) {
          if (prompt.imageUrl && !prompt.imageUrl.startsWith('data:')) {
            const b64 = await toBase64(prompt.imageUrl);
            if (b64) {
              prompt.imageBase64 = b64;
            }
          }
        }
      }

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `${proj.name || 'storyboard'}_project.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      set({ batchStatus: "Xuất dự án thành công!" });
    } catch (err: any) {
      alert('Xuất dự án thất bại: ' + err.message);
      set({ batchStatus: "" });
    }
  },
  importProject: async (projectData) => {
    try {
      const newId = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const importedProject: any = {
        ...projectData,
        id: newId,
        createdAt: new Date().toISOString(),
        name: `${projectData.name || 'Imported Project'} (Imported)`
      };

      // Restore shot images base64
      if (importedProject.imagePrompts) {
        for (const prompt of importedProject.imagePrompts) {
          if (prompt.imageBase64) {
            prompt.imageUrl = prompt.imageBase64;
            delete prompt.imageBase64;
          }
        }
      }

      // Save immediately so it appears in list
      await saveProject(importedProject);
      await get().loadHistory();
      await get().loadProject(newId);
      syncChannel?.postMessage({ type: 'project_updated', projectId: newId });

      const statusToast = "Đang kiểm tra và tải lên các ảnh tham chiếu lên Google Drive...";
      set({ batchStatus: statusToast });

      const isMediaIdValid = async (mediaId: string): Promise<boolean> => {
        if (!mediaId) return false;
        try {
          const res = await fetch(`https://drive.google.com/thumbnail?id=${mediaId}`, { method: 'GET' });
          if (res.ok) {
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('image')) return true;
          }
          return false;
        } catch (e) {
          return false;
        }
      };

      const ensureReferenceValid = async (ref: any, name: string) => {
        if (ref.mediaId) {
          const valid = await isMediaIdValid(ref.mediaId);
          if (valid) return { mediaId: ref.mediaId, accountId: ref.accountId };
        }
        if (ref.image && ref.image.startsWith('data:image')) {
          try {
            const fileRes = await fetch(ref.image);
            const blob = await fileRes.blob();
            const file = new File([blob], name, { type: blob.type || 'image/png' });
            const uploadRes = (await get().uploadImage(file)) as any;
            if (uploadRes && uploadRes.success) {
              return {
                mediaId: uploadRes.media_id || uploadRes.mediaId,
                accountId: uploadRes.account_id || uploadRes.accountId
              };
            }
          } catch (err) {
            console.error(`Failed to upload ${name}:`, err);
          }
        }
        return { mediaId: ref.mediaId, accountId: ref.accountId };
      };

      const ensureInputImageValid = async (ref: any, name: string) => {
        if (ref.inputMediaId) {
          const valid = await isMediaIdValid(ref.inputMediaId);
          if (valid) return { inputMediaId: ref.inputMediaId, inputAccountId: ref.inputAccountId };
        }
        if (ref.inputImage && ref.inputImage.startsWith('data:image')) {
          try {
            const fileRes = await fetch(ref.inputImage);
            const blob = await fileRes.blob();
            const file = new File([blob], name, { type: blob.type || 'image/png' });
            const uploadRes = (await get().uploadImage(file)) as any;
            if (uploadRes && uploadRes.success) {
              return {
                inputMediaId: uploadRes.media_id || uploadRes.mediaId,
                inputAccountId: uploadRes.account_id || uploadRes.accountId
              };
            }
          } catch (err) {
            console.error(`Failed to upload input ${name}:`, err);
          }
        }
        return { inputMediaId: ref.inputMediaId, inputAccountId: ref.inputAccountId };
      };

      // Characters
      if (importedProject.characters) {
        for (const char of importedProject.characters) {
          if (char.image) {
            const { mediaId, accountId } = await ensureReferenceValid(char, `char_${char.characterId}.png`);
            char.mediaId = mediaId;
            char.accountId = accountId;
          }
          if (char.inputImage) {
            const { inputMediaId, inputAccountId } = await ensureInputImageValid(char, `char_input_${char.characterId}.png`);
            char.inputMediaId = inputMediaId;
            char.inputAccountId = inputAccountId;
          }
        }
      }

      // Exteriors
      if (importedProject.exteriors) {
        for (const ext of importedProject.exteriors) {
          if (ext.image) {
            const { mediaId, accountId } = await ensureReferenceValid(ext, `ext_${ext.exteriorId}.png`);
            ext.mediaId = mediaId;
            ext.accountId = accountId;
          }
          if (ext.inputImage) {
            const { inputMediaId, inputAccountId } = await ensureInputImageValid(ext, `ext_input_${ext.exteriorId}.png`);
            ext.inputMediaId = inputMediaId;
            ext.inputAccountId = inputAccountId;
          }
        }
      }

      // Props
      if (importedProject.props) {
        for (const prop of importedProject.props) {
          if (prop.image) {
            const { mediaId, accountId } = await ensureReferenceValid(prop, `prop_${prop.propId}.png`);
            prop.mediaId = mediaId;
            prop.accountId = accountId;
          }
          if (prop.inputImage) {
            const { inputMediaId, inputAccountId } = await ensureInputImageValid(prop, `prop_input_${prop.propId}.png`);
            prop.inputMediaId = inputMediaId;
            prop.inputAccountId = inputAccountId;
          }
        }
      }

      await saveProject(importedProject);
      await get().loadHistory();
      syncChannel?.postMessage({ type: 'project_updated', projectId: newId });
      
      if (get().currentProject.id === newId) {
        set({
          currentProject: importedProject,
          characters: importedProject.characters || [],
          exteriors: importedProject.exteriors || [],
          props: importedProject.props || [],
          batchStatus: 'Import dự án thành công!'
        });
      }
    } catch (err: any) {
      console.error('Import project failed:', err);
      alert('Import dự án thất bại: ' + err.message);
    }
  },

  // Character Reference
  characters: [],
  loadCharacters: async () => {
    const list = get().currentProject.characters || [];
    set({ characters: list });
  },
  addCharacter: async (characterId, image, mediaId, accountId) => {
    let active = get().currentProject;
    if (!active.id) {
      await get().saveCurrentProject(active.name);
      active = get().currentProject;
    }
    set((state) => {
      const existingIndex = (state.currentProject.characters || []).findIndex(
        (c) => c.characterId.toLowerCase() === characterId.toLowerCase()
      );
      let updatedChars = [...(state.currentProject.characters || [])];
      if (existingIndex !== -1) {
        updatedChars[existingIndex] = {
          ...updatedChars[existingIndex],
          image,
          mediaId: mediaId !== undefined ? mediaId : updatedChars[existingIndex].mediaId,
          accountId: accountId !== undefined ? accountId : updatedChars[existingIndex].accountId
        };
      } else {
        updatedChars.push({ characterId, image, mediaId, accountId });
      }
      return {
        currentProject: { ...state.currentProject, characters: updatedChars },
        characters: updatedChars
      };
    });
    await get().saveCurrentProject();
  },
  deleteCharacter: async (characterId) => {
    let active = get().currentProject;
    const updatedChars = (active.characters || []).filter((c) => c.characterId !== characterId);
    set((state) => ({
      currentProject: { ...state.currentProject, characters: updatedChars },
      characters: updatedChars
    }));
    await get().saveCurrentProject();
  },
  updateCharacterPrompt: async (characterId, prompt) => {
    const active = get().currentProject;
    if (!active.id) return;
    const updatedChars = (active.characters || []).map((c) => {
      if (c.characterId.toLowerCase() === characterId.toLowerCase()) {
        return { ...c, prompt };
      }
      return c;
    });
    set({
      currentProject: { ...active, characters: updatedChars },
      characters: updatedChars
    });
    await get().saveCurrentProject();
  },

  // Exterior Reference
  exteriors: [],
  loadExteriors: async () => {
    const list = get().currentProject.exteriors || [];
    set({ exteriors: list });
  },
  addExterior: async (exteriorId, image, mediaId, accountId) => {
    let active = get().currentProject;
    if (!active.id) {
      await get().saveCurrentProject(active.name);
      active = get().currentProject;
    }
    set((state) => {
      const existingIndex = (state.currentProject.exteriors || []).findIndex(
        (e) => e.exteriorId.toLowerCase() === exteriorId.toLowerCase()
      );
      let updatedExts = [...(state.currentProject.exteriors || [])];
      if (existingIndex !== -1) {
        updatedExts[existingIndex] = {
          ...updatedExts[existingIndex],
          image,
          mediaId: mediaId !== undefined ? mediaId : updatedExts[existingIndex].mediaId,
          accountId: accountId !== undefined ? accountId : updatedExts[existingIndex].accountId
        };
      } else {
        updatedExts.push({ exteriorId, image, mediaId, accountId });
      }
      return {
        currentProject: { ...state.currentProject, exteriors: updatedExts },
        exteriors: updatedExts
      };
    });
    await get().saveCurrentProject();
  },
  deleteExterior: async (exteriorId) => {
    let active = get().currentProject;
    const updatedExts = (active.exteriors || []).filter((e) => e.exteriorId !== exteriorId);
    set((state) => ({
      currentProject: { ...state.currentProject, exteriors: updatedExts },
      exteriors: updatedExts
    }));
    await get().saveCurrentProject();
  },
  updateExteriorPrompt: async (exteriorId, prompt) => {
    const active = get().currentProject;
    if (!active.id) return;
    const updatedExts = (active.exteriors || []).map((e) => {
      if (e.exteriorId.toLowerCase() === exteriorId.toLowerCase()) {
        return { ...e, prompt };
      }
      return e;
    });
    set({
      currentProject: { ...active, exteriors: updatedExts },
      exteriors: updatedExts
    });
    await get().saveCurrentProject();
  },

  // Prop Reference
  props: [],
  loadProps: async () => {
    const list = get().currentProject.props || [];
    set({ props: list });
  },
  addProp: async (propId, image, mediaId, accountId) => {
    let active = get().currentProject;
    if (!active.id) {
      await get().saveCurrentProject(active.name);
      active = get().currentProject;
    }
    set((state) => {
      const existingIndex = (state.currentProject.props || []).findIndex(
        (p) => p.propId.toLowerCase() === propId.toLowerCase()
      );
      let updatedProps = [...(state.currentProject.props || [])];
      if (existingIndex !== -1) {
        updatedProps[existingIndex] = {
          ...updatedProps[existingIndex],
          image,
          mediaId: mediaId !== undefined ? mediaId : updatedProps[existingIndex].mediaId,
          accountId: accountId !== undefined ? accountId : updatedProps[existingIndex].accountId
        };
      } else {
        updatedProps.push({ propId, image, mediaId, accountId });
      }
      return {
        currentProject: { ...state.currentProject, props: updatedProps },
        props: updatedProps
      };
    });
    await get().saveCurrentProject();
  },
  deleteProp: async (propId) => {
    let active = get().currentProject;
    const updatedProps = (active.props || []).filter((p) => p.propId !== propId);
    set((state) => ({
      currentProject: { ...state.currentProject, props: updatedProps },
      props: updatedProps
    }));
    await get().saveCurrentProject();
  },
  updatePropPrompt: async (propId, prompt) => {
    const active = get().currentProject;
    if (!active.id) return;
    const updatedProps = (active.props || []).map((p) => {
      if (p.propId.toLowerCase() === propId.toLowerCase()) {
        return { ...p, prompt };
      }
      return p;
    });
    set({
      currentProject: { ...active, props: updatedProps },
      props: updatedProps
    });
    await get().saveCurrentProject();
  },
  uploadImage: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('googleApiUrl', get().apiConfig.googleApiUrl || '');
    const response = await fetch('/api/upload_image', {
      method: 'POST',
      body: formData
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Upload failed with status ${response.status}`);
    }
    return response.json();
  },
  updateAssetInputImage: async (type, id, image, mediaId, accountId) => {
    let active = get().currentProject;
    if (!active.id) return;
    
    set((state) => {
      const proj = state.currentProject;
      if (type === 'character') {
        const updated = (proj.characters || []).map((c) => {
          if (c.characterId.toLowerCase() === id.toLowerCase()) {
            return {
              ...c,
              inputImage: image !== null ? image : undefined,
              inputMediaId: mediaId !== null ? mediaId : undefined,
              inputAccountId: accountId !== null ? accountId : undefined
            };
          }
          return c;
        });
        return {
          currentProject: { ...proj, characters: updated },
          characters: updated
        };
      } else if (type === 'exterior') {
        const updated = (proj.exteriors || []).map((e) => {
          if (e.exteriorId.toLowerCase() === id.toLowerCase()) {
            return {
              ...e,
              inputImage: image !== null ? image : undefined,
              inputMediaId: mediaId !== null ? mediaId : undefined,
              inputAccountId: accountId !== null ? accountId : undefined
            };
          }
          return e;
        });
        return {
          currentProject: { ...proj, exteriors: updated },
          exteriors: updated
        };
      } else { // prop
        const updated = (proj.props || []).map((p) => {
          if (p.propId.toLowerCase() === id.toLowerCase()) {
            return {
              ...p,
              inputImage: image !== null ? image : undefined,
              inputMediaId: mediaId !== null ? mediaId : undefined,
              inputAccountId: accountId !== null ? accountId : undefined
            };
          }
          return p;
        });
        return {
          currentProject: { ...proj, props: updated },
          props: updated
        };
      }
    });

    await get().saveCurrentProject();
  },

  generateAssetImage: async (type, id, config) => {
    const active = get().currentProject;
    if (!active.id) {
      throw new Error('Please open or save a project first.');
    }

    const key = `${active.id}_${type}_${id}`;
    set((state) => ({
      assetGeneratingIds: [...state.assetGeneratingIds, key],
      isGeneratingAssets: true
    }));

    let localControllerCreated = false;
    if (!get().assetAbortController) {
      set({ assetAbortController: new AbortController() });
      localControllerCreated = true;
    }

    try {
      let prompt = '';
      let existingMediaId = '';
      let existingAccountId = '';

      const activeStyle = get().getSelectedStyle();
      if (type === 'character') {
        const char = (active.characters || []).find(c => c.characterId.toLowerCase() === id.toLowerCase());
        const details = [char?.gender, char?.age].filter(Boolean).join(', ') || 'Japanese individual';
        const defaultPrompt = `Character Sheet of ${getDisplayName(id)}, 3-view reference sheet (front, side, back), full body, white background, modern present-day Japan (year 2026) realism, avoiding retro Shouwa-era appearance, grounded Japanese TV drama realism, ${activeStyle.characterSuffix}, ${details}, modern fashionable Japanese clothing, restrained emotional presence, natural standing posture, neutral facial expression, realistic fabric folds, cinematic realism, production design reference sheet.`;
        
        prompt = char?.prompt || defaultPrompt;
        if (char?.prompt) {
          if (prompt.includes('modern colored manga anime style')) {
            prompt = prompt.replace('modern colored manga anime style', activeStyle.characterSuffix);
          } else if (!prompt.includes(activeStyle.characterSuffix)) {
            prompt = `${prompt}, ${activeStyle.characterSuffix}`;
          }
        }
        existingMediaId = char?.inputMediaId || '';
        existingAccountId = char?.inputAccountId || '';
      } else if (type === 'exterior') {
        const ext = (active.exteriors || []).find(e => e.exteriorId.toLowerCase() === id.toLowerCase());
        const defaultPrompt = `Background layout sheet of ${getDisplayName(id)}, 4-camera-angle sheet showing 4 different viewpoints/angles (front, reverse, left side, right side) of the same scene in a 2x2 grid layout, empty scene, no people, modern present-day Japan (year 2026) apartment realism, contemporary metropolitan Japanese design, avoiding retro Shouwa-era aesthetics, ${activeStyle.backgroundSuffix}, consistent furniture and layout across all 4 angles, realistic practical lighting, subtle emotional atmosphere, believable lived-in details, cinematic depth, production-ready environment design reference sheet.`;
        
        prompt = ext?.prompt || defaultPrompt;
        if (ext?.prompt) {
          if (prompt.includes('modern colored manga anime style')) {
            prompt = prompt.replace('modern colored manga anime style', activeStyle.backgroundSuffix);
          } else if (!prompt.includes(activeStyle.backgroundSuffix)) {
            prompt = `${prompt}, ${activeStyle.backgroundSuffix}`;
          }
        }
        existingMediaId = ext?.inputMediaId || '';
        existingAccountId = ext?.inputAccountId || '';
      } else if (type === 'prop') {
        const prop = (active.props || []).find(p => p.propId.toLowerCase() === id.toLowerCase());
        const defaultPrompt = `Product layout sheet of ${getDisplayName(id)}, showing the item from multiple clean angles (front, side, isometric), isolated on a pure white background, modern present-day Japan design, avoiding retro appearance, ${activeStyle.characterSuffix}, [detailed prop description showing consistent colors, materials, and form], realistic textures, clean studio lighting, production design reference sheet.`;
        
        prompt = prop?.prompt || defaultPrompt;
        if (prop?.prompt) {
          if (prompt.includes('modern colored manga anime style')) {
            prompt = prompt.replace('modern colored manga anime style', activeStyle.characterSuffix);
          } else if (!prompt.includes(activeStyle.characterSuffix)) {
            prompt = `${prompt}, ${activeStyle.characterSuffix}`;
          }
        }
        existingMediaId = prop?.inputMediaId || '';
        existingAccountId = prop?.inputAccountId || '';
      }

      const payload: any = {
        projectId: active.id,
        stt: type === 'character'
          ? (active.characters || []).findIndex(c => c.characterId.toLowerCase() === id.toLowerCase()) + 1
          : type === 'exterior'
          ? (active.exteriors || []).findIndex(e => e.exteriorId.toLowerCase() === id.toLowerCase()) + 1
          : (active.props || []).findIndex(p => p.propId.toLowerCase() === id.toLowerCase()) + 1,
        concurrency: get().imageGenConfig.concurrency,
        prompt,
        count: config?.count !== undefined ? config.count : get().imageGenConfig.count,
        aspect_ratio: config?.aspect_ratio || get().imageGenConfig.aspectRatio,
        model: config?.model || get().imageGenConfig.model,
        for_video: true,
        assetType: type,
        assetId: `${active.id}_${id}`,
        googleApiUrl: get().apiConfig.googleApiUrl || ''
      };

      if (existingMediaId && existingAccountId) {
        payload.media_ids = [existingMediaId];
        payload.account_id = existingAccountId;
      }

      const signal = get().assetAbortController?.signal;

      const delayTime = get().imageGenConfig.delayTime || 5;
      await enforceImageGenDelay(delayTime);

      const response = await fetch('/api/image/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: signal || undefined
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(cleanErrorMessage(errText) || 'Failed to generate image');
      }

      const resData = await response.json();
      if (!resData.success || !resData.images || resData.images.length === 0) {
        throw new Error('Image generation API returned unsuccessful status');
      }

      const imgData = resData.images[0];
      const imageUrl = imgData.url;
      const mediaId = imgData.media_id;
      const accountId = resData.account_id;

      if (type === 'character') {
        await get().addCharacter(id, imageUrl, mediaId, accountId);
      } else if (type === 'exterior') {
        await get().addExterior(id, imageUrl, mediaId, accountId);
      } else if (type === 'prop') {
        await get().addProp(id, imageUrl, mediaId, accountId);
      }
    } finally {
      if (localControllerCreated) {
        set({ assetAbortController: null });
      }
      set((state) => {
        const updatedIds = state.assetGeneratingIds.filter(g => g !== key);
        return {
          assetGeneratingIds: updatedIds,
          isGeneratingAssets: updatedIds.length > 0
        };
      });
    }
  },



  // AI execution states
  isGeneratingSceneMapping: false,
  isGeneratingImagePrompts: false,
  isGeneratingAssets: false,
  isGeneratingCombo1: false,
  isGeneratingCombo2: false,
  isGeneratingFullCombo: false,
  assetAbortController: null as AbortController | null,
  cancelAssetGeneration: () => {
    const controller = get().assetAbortController;
    if (controller) {
      controller.abort();
    }
    const active = get().currentProject;
    if (active.id) {
      get().cancelBatchJob(active.id, 'asset');
    }
    set({
      assetAbortController: null,
      assetGeneratingIds: [],
      isGeneratingAssets: false
    });
    if (active.id) {
      get().updateGeneratingFlags(active.id);
    }
  },
  assetGeneratingIds: [],
  mappingAbortController: null as AbortController | null,
  cancelSceneMapping: () => {
    const controller = get().mappingAbortController;
    if (controller) {
      controller.abort();
    }
    set({
      mappingAbortController: null,
      isGeneratingSceneMapping: false,
      batchStatus: 'Scene mapping cancelled.'
    });
    const active = get().currentProject;
    if (active.id) {
      set((state) => {
        const updatedRunning = { ...state.runningProjects };
        delete updatedRunning[active.id!];
        return { runningProjects: updatedRunning };
      });
      get().updateGeneratingFlags(active.id);
    }
  },
  promptsAbortController: null as AbortController | null,
  cancelImagePrompts: () => {
    const controller = get().promptsAbortController;
    if (controller) {
      controller.abort();
    }
    set({
      promptsAbortController: null,
      isGeneratingImagePrompts: false,
      batchStatus: 'Image prompt generation cancelled.'
    });
    const active = get().currentProject;
    if (active.id) {
      set((state) => {
        const updatedRunning = { ...state.runningProjects };
        delete updatedRunning[active.id!];
        return { runningProjects: updatedRunning };
      });
      get().updateGeneratingFlags(active.id);
    }
  },
  cancelCombo1: () => {
    const active = get().currentProject;
    get().cancelSceneMapping();
    get().cancelImagePrompts();
    if (active.id) {
      set((state) => {
        const updatedCombos = { ...state.runningCombos };
        delete updatedCombos[active.id!];
        return {
          runningCombos: updatedCombos,
          batchStatus: 'Đã hủy Combo 1.'
        };
      });
      get().updateGeneratingFlags(active.id);
    }
  },
  cancelCombo2: () => {
    const active = get().currentProject;
    get().cancelSceneMapping();
    get().cancelImagePrompts();
    get().cancelAssetGeneration();
    if (active.id) {
      set((state) => {
        const updatedCombos = { ...state.runningCombos };
        delete updatedCombos[active.id!];
        return {
          runningCombos: updatedCombos,
          batchStatus: 'Đã hủy Combo 2.'
        };
      });
      get().updateGeneratingFlags(active.id);
    }
  },
  cancelFullCombo: () => {
    const active = get().currentProject;
    get().cancelSceneMapping();
    get().cancelImagePrompts();
    get().cancelAssetGeneration();
    if (active.id) {
      get().cancelBatchJob(active.id, 'shot');
      get().cancelBatchJob(active.id, 'video');
      set((state) => {
        const updatedCombos = { ...state.runningCombos };
        delete updatedCombos[active.id!];
        return {
          runningCombos: updatedCombos,
          batchStatus: 'Đã hủy Combo Full.'
        };
      });
      get().updateGeneratingFlags(active.id);
    }
  },
  batchStatus: '',
  runningProjects: {},
  runningCombos: {},
  updateGeneratingFlags: (projId) => {
    const isCurrent = get().currentProject.id === projId;
    if (!isCurrent) return;

    const runningStatus = get().runningProjects[projId] || null;
    const runningCombo = get().runningCombos[projId] || null;
    const hasAssetsGen = get().assetGeneratingIds.some((key: string) => key.startsWith(`${projId}_`));
    const assetJobKey = `${projId}_asset`;
    const isAssetJobRunning = !!get().batchJobs[assetJobKey]?.isRunning;

    set({
      isGeneratingCombo1: runningCombo === 'combo1',
      isGeneratingCombo2: runningCombo === 'combo2',
      isGeneratingFullCombo: runningCombo === 'combo3',
      isGeneratingSceneMapping: runningStatus === 'mapping' || runningStatus === 'mapping_queued',
      isGeneratingImagePrompts: runningStatus === 'prompts' || runningStatus === 'prompts_queued',
      isGeneratingAssets: hasAssetsGen || runningStatus === 'assets' || isAssetJobRunning
    });
  },
  tokenUsage: {
    inputTokens: 0,
    outputTokens: 0,
    cost: 0
  },
  resetTokenUsage: () => {
    set({ tokenUsage: { inputTokens: 0, outputTokens: 0, cost: 0 } });
  },

  // Queue state
  apiQueue: [],
  isProcessingQueue: false,
  addToQueue: (projectId, type, run) => {
    const newQueueItem = { projectId, type, run };
    set((state) => ({
      apiQueue: [...state.apiQueue, newQueueItem],
      runningProjects: {
        ...state.runningProjects,
        [projectId]: type === 'mapping' ? 'mapping_queued' : 'prompts_queued'
      }
    }));
    get().updateGeneratingFlags(projectId);
    if (get().currentProject.id === projectId) {
      set({ batchStatus: 'Waiting in API queue...' });
    }

    setTimeout(() => {
      get().processNextInQueue().catch(err => console.error("Error processing queue:", err));
    }, 0);
  },
  processNextInQueue: async () => {
    if (get().isProcessingQueue) return;
    set({ isProcessingQueue: true });

    try {
      while (get().apiQueue.length > 0) {
        const nextItem = get().apiQueue[0];
        if (!nextItem) break;

        const { run } = nextItem;

        // Remove the item from the queue
        set((state) => ({
          apiQueue: state.apiQueue.slice(1)
        }));

        try {
          await run();
        } catch (err) {
          console.error("Queue execution error:", err);
        }
      }
    } finally {
      set({ isProcessingQueue: false });
    }
  },

  // AI Actions
  generateSceneMapping: async (resume = false) => {
    let active = get().currentProject;
    let projId = active.id;

    if (!projId) {
      projId = `proj_${Date.now()}`;
      await get().saveCurrentProject(active.name);
      active = get().currentProject;
    }

    const srtContent = active.srtContent;
    if (!srtContent) throw new Error('Please upload an SRT file first.');
    const { provider, apiKey, modelName } = get().apiConfig;
    if (!apiKey) throw new Error('Please enter your API Key in settings.');

    set({ mappingAbortController: new AbortController() });

    const runTask = async () => {
      set((state) => ({
        runningProjects: { ...state.runningProjects, [projId!]: 'mapping' as const }
      }));
      get().updateGeneratingFlags(projId!);
      if (get().currentProject.id === projId) {
        set({ batchStatus: 'Running scene mapping...' });
      }

      try {
        await executeSceneMappingIncrementalFlow(
          projId!,
          srtContent,
          get().targetDuration,
          get().sceneMappingPrompt,
          get().apiConfig,
          set,
          get,
          resume
        );
        await get().loadHistory();
      } catch (err: any) {
        if (err.name === 'AbortError' || err.message?.includes('aborted') || err.message?.includes('stopped')) {
          console.warn('Scene mapping generation aborted.');
          if (get().currentProject.id === projId) {
            set({ batchStatus: 'Đã dừng tạo phân cảnh.' });
          }
        } else {
          throw err;
        }
      } finally {
        set((state) => {
          const updatedRunning = { ...state.runningProjects };
          delete updatedRunning[projId!];
          return {
            runningProjects: updatedRunning,
            mappingAbortController: null
          };
        });
        get().updateGeneratingFlags(projId!);
      }
    };

    get().addToQueue(projId!, 'mapping', runTask);
  },

  generateImagePrompts: async (resume = false) => {
    let active = get().currentProject;
    let projId = active.id;

    if (!projId) {
      projId = `proj_${Date.now()}`;
      await get().saveCurrentProject(active.name);
      active = get().currentProject;
    }

    const sceneMapping = active.sceneMapping;
    if (sceneMapping.length === 0) {
      throw new Error('Please generate or add Scene Mapping entries first.');
    }
    const { provider, apiKey, modelName } = get().apiConfig;
    if (!apiKey) throw new Error('Please enter your API Key in settings.');

    set({ promptsAbortController: new AbortController() });

    const runTask = async () => {
      set((state) => ({
        runningProjects: { ...state.runningProjects, [projId!]: 'prompts' as const }
      }));
      get().updateGeneratingFlags(projId!);
      if (get().currentProject.id === projId) {
        set({ batchStatus: 'Starting prompt generation...' });
      }

      try {
        await executeImagePromptsContextualFlow(
          projId!,
          sceneMapping,
          get().imagePromptPrompt,
          get().apiConfig,
          set,
          get,
          resume
        );
        if (get().currentProject.id === projId) {
          set({ batchStatus: 'Generation complete!' });
        }
        await get().loadHistory();
      } catch (error: any) {
        if (error.name === 'AbortError' || error.message?.includes('aborted') || error.message?.includes('stopped')) {
          console.warn('Image prompt generation aborted.');
          if (get().currentProject.id === projId) {
            set({ batchStatus: 'Đã dừng tạo prompts.' });
          }
        } else {
          console.error('Error generating image prompts:', error);
          throw error;
        }
      } finally {
        set((state) => {
          const updatedRunning = { ...state.runningProjects };
          delete updatedRunning[projId!];
          return {
            runningProjects: updatedRunning,
            promptsAbortController: null
          };
        });
        get().updateGeneratingFlags(projId!);
      }
    };

    get().addToQueue(projId!, 'prompts', runTask);
  },

  generateAllMappingAndPrompts: async (resume = false) => {
    let active = get().currentProject;
    let projId = active.id;

    if (!projId) {
      projId = `proj_${Date.now()}`;
      await get().saveCurrentProject(active.name);
      active = get().currentProject;
    }

    const srtContent = active.srtContent;
    if (!srtContent) throw new Error('Vui lòng tải tệp phụ đề SRT lên trước.');
    const { provider, apiKey, modelName } = get().apiConfig;
    if (!apiKey) throw new Error('Vui lòng nhập API Key trong phần cài đặt.');

    set((state) => ({
      mappingAbortController: new AbortController(),
      promptsAbortController: new AbortController(),
      runningCombos: { ...state.runningCombos, [projId!]: 'combo1' as const }
    }));
    get().updateGeneratingFlags(projId!);

    const runTask = async () => {
      // 1. Scene Mapping
      set((state) => ({
        runningProjects: { ...state.runningProjects, [projId!]: 'mapping' as const }
      }));
      get().updateGeneratingFlags(projId!);
      if (get().currentProject.id === projId) {
        set({ batchStatus: 'Đang lập sơ đồ phân cảnh...' });
      }

      try {
        const { scenes } = await executeSceneMappingIncrementalFlow(
          projId!,
          srtContent,
          get().targetDuration,
          get().sceneMappingPrompt,
          get().apiConfig,
          set,
          get,
          resume
        );

        // 2. Image Prompts
        set((state) => ({
          runningProjects: { ...state.runningProjects, [projId!]: 'prompts' as const }
        }));
        get().updateGeneratingFlags(projId!);
        if (get().currentProject.id === projId) {
          set({ batchStatus: 'Đang tạo các prompt vẽ ảnh...' });
        }

        await executeImagePromptsContextualFlow(
          projId!,
          scenes,
          get().imagePromptPrompt,
          get().apiConfig,
          set,
          get,
          resume
        );

        if (get().currentProject.id === projId) {
          set({ batchStatus: 'Tạo prompts hoàn tất!' });
        }
        await get().loadHistory();

      } catch (error: any) {
        if (error.name === 'AbortError' || error.message?.includes('aborted') || error.message?.includes('stopped')) {
          console.warn('All mapping & prompts generation aborted.');
          if (get().currentProject.id === projId) {
            set({ batchStatus: 'Đã dừng tiến trình Combo 1.' });
          }
        } else {
          console.error('Error generating all mappings and prompts:', error);
          throw error;
        }
      } finally {
        set((state) => {
          const updatedRunning = { ...state.runningProjects };
          delete updatedRunning[projId!];
          const updatedCombos = { ...state.runningCombos };
          delete updatedCombos[projId!];
          return {
            runningProjects: updatedRunning,
            runningCombos: updatedCombos,
            mappingAbortController: null,
            promptsAbortController: null
          };
        });
        get().updateGeneratingFlags(projId!);
      }
    };

    get().addToQueue(projId!, 'mapping', runTask);
  },

  generateCombo2: async (resume = false) => {
    let active = get().currentProject;
    let projId = active.id;

    if (!projId) {
      projId = `proj_${Date.now()}`;
      await get().saveCurrentProject(active.name);
      active = get().currentProject;
    }

    const srtContent = active.srtContent;
    if (!srtContent) throw new Error('Vui lòng tải tệp phụ đề SRT lên trước.');
    const { apiKey } = get().apiConfig;
    if (!apiKey) throw new Error('Vui lòng nhập API Key trong phần cài đặt.');

    set((state) => ({
      mappingAbortController: new AbortController(),
      promptsAbortController: new AbortController(),
      assetAbortController: new AbortController(),
      runningCombos: { ...state.runningCombos, [projId!]: 'combo2' as const }
    }));
    get().updateGeneratingFlags(projId!);

    const runTask = async () => {
      // 1. Scene Mapping
      set((state) => ({
        runningProjects: { ...state.runningProjects, [projId!]: 'mapping' as const }
      }));
      get().updateGeneratingFlags(projId!);
      if (get().currentProject.id === projId) {
        set({ batchStatus: 'Đang lập sơ đồ phân cảnh...' });
      }

      try {
        const { scenes } = await executeSceneMappingIncrementalFlow(
          projId!,
          srtContent,
          get().targetDuration,
          get().sceneMappingPrompt,
          get().apiConfig,
          set,
          get,
          resume
        );

        // 2. Image Prompts
        set((state) => ({
          runningProjects: { ...state.runningProjects, [projId!]: 'prompts' as const }
        }));
        get().updateGeneratingFlags(projId!);
        if (get().currentProject.id === projId) {
          set({ batchStatus: 'Đang tạo các prompt vẽ ảnh...' });
        }

        await executeImagePromptsContextualFlow(
          projId!,
          scenes,
          get().imagePromptPrompt,
          get().apiConfig,
          set,
          get,
          resume
        );

        // 3. Generate Reference Images (Assets)
        set((state) => ({
          runningProjects: { ...state.runningProjects, [projId!]: 'assets' as const }
        }));
        get().updateGeneratingFlags(projId!);
        if (get().currentProject.id === projId) {
          set({ batchStatus: 'Kiểm tra ảnh tham chiếu nhân vật/bối cảnh...' });
        }

        let missingAssetsToGen = {
          characters: [] as string[],
          exteriors: [] as string[],
          props: [] as string[]
        };

        if (resume) {
          const proj = get().currentProject;
          missingAssetsToGen.characters = (proj.characters || [])
            .filter(c => !c.image && !c.mediaId)
            .map(c => c.characterId);
          missingAssetsToGen.exteriors = (proj.exteriors || [])
            .filter(e => !e.image && !e.mediaId)
            .map(e => e.exteriorId);
          missingAssetsToGen.props = (proj.props || [])
            .filter(p => !p.image && !p.mediaId)
            .map(p => p.propId);
        }

        const hasMissingAssets = !resume || 
          missingAssetsToGen.characters.length > 0 || 
          missingAssetsToGen.exteriors.length > 0 || 
          missingAssetsToGen.props.length > 0;

        if (hasMissingAssets) {
          if (get().currentProject.id === projId) {
            set({ batchStatus: 'Đang tự động vẽ ảnh tham chiếu (Assets)...' });
          }
          if (resume) {
            await get().generateAllAssetImages(missingAssetsToGen);
          } else {
            await get().generateAllAssetImages();
          }

          // Wait for asset generation batch to finish
          const assetJobKey = `${projId}_asset`;
          await new Promise<void>((resolve, reject) => {
            const checkInterval = setInterval(() => {
              if (!get().runningProjects[projId!]) {
                clearInterval(checkInterval);
                reject(new Error('AbortError'));
                return;
              }
              const jobState = get().batchJobs[assetJobKey];
              if (!jobState || !jobState.isRunning) {
                clearInterval(checkInterval);
                resolve();
              }
            }, 1000);
          });
        }

        // Retrieve latest project characters, exteriors, and props with generated image references
        let updatedProj = await getProject(projId!);
        if (updatedProj && get().currentProject.id === projId) {
          set((state) => ({
            characters: updatedProj.characters || [],
            exteriors: updatedProj.exteriors || [],
            props: updatedProj.props || [],
            currentProject: {
              ...state.currentProject,
              characters: updatedProj.characters || [],
              exteriors: updatedProj.exteriors || [],
              props: updatedProj.props || [],
              sceneMapping: (state.currentProject?.sceneMapping || []).length > 0 ? state.currentProject.sceneMapping : (updatedProj.sceneMapping || []),
              imagePrompts: (state.currentProject?.imagePrompts || []).length > 0 ? state.currentProject.imagePrompts : (updatedProj.imagePrompts || [])
            }
          }));
        }

        if (get().currentProject.id === projId) {
          set({ batchStatus: 'Tạo prompts và ảnh tham chiếu thành công!' });
        }
        await get().loadHistory();

      } catch (error: any) {
        if (error.name === 'AbortError' || error.message?.includes('aborted') || error.message?.includes('stopped')) {
          console.warn('Combo 2 generation aborted.');
          if (get().currentProject.id === projId) {
            set({ batchStatus: 'Đã dừng tiến trình Combo 2.' });
          }
        } else {
          console.error('Error in Combo 2:', error);
          if (get().currentProject.id === projId) {
            set({ batchStatus: `Lỗi Combo 2: ${error.message}` });
          }
          throw error;
        }
      } finally {
        set((state) => {
          const updatedRunning = { ...state.runningProjects };
          delete updatedRunning[projId!];
          const updatedCombos = { ...state.runningCombos };
          delete updatedCombos[projId!];
          return {
            runningProjects: updatedRunning,
            runningCombos: updatedCombos,
            mappingAbortController: null,
            promptsAbortController: null,
            assetAbortController: null
          };
        });
        get().updateGeneratingFlags(projId!);
      }
    };

    get().addToQueue(projId!, 'mapping', runTask);
  },



  generateFullCombo: async (resume = false) => {
    let active = get().currentProject;
    let projId = active.id;

    if (!projId) {
      projId = `proj_${Date.now()}`;
      await get().saveCurrentProject(active.name);
      active = get().currentProject;
    }

    const srtContent = active.srtContent;
    if (!srtContent) throw new Error('Vui lòng tải tệp phụ đề SRT lên trước.');
    const { apiKey } = get().apiConfig;
    if (!apiKey) throw new Error('Vui lòng nhập API Key trong phần cài đặt.');
    if (!active.videoSaveDir) throw new Error('Vui lòng thiết lập thư mục lưu video trong tab Cấu hình dự án trước khi chạy Combo Full.');

    set((state) => ({
      mappingAbortController: new AbortController(),
      promptsAbortController: new AbortController(),
      assetAbortController: new AbortController(),
      runningCombos: { ...state.runningCombos, [projId!]: 'combo3' as const }
    }));
    get().updateGeneratingFlags(projId!);

    const runTask = async () => {
      // 1. Scene Mapping
      set((state) => ({
        runningProjects: { ...state.runningProjects, [projId!]: 'mapping' as const }
      }));
      get().updateGeneratingFlags(projId!);
      if (get().currentProject.id === projId) {
        set({ batchStatus: 'Đang tạo phân cảnh (Scene Mapping)...' });
      }

      try {
        const { scenes } = await executeSceneMappingIncrementalFlow(
          projId!,
          srtContent,
          get().targetDuration,
          get().sceneMappingPrompt,
          get().apiConfig,
          set,
          get,
          resume
        );

        // 2. Image Prompts
        set((state) => ({
          runningProjects: { ...state.runningProjects, [projId!]: 'prompts' as const }
        }));
        get().updateGeneratingFlags(projId!);
        if (get().currentProject.id === projId) {
          set({ batchStatus: 'Đang tạo các prompt vẽ ảnh phân cảnh...' });
        }

        await executeImagePromptsContextualFlow(
          projId!,
          scenes,
          get().imagePromptPrompt,
          get().apiConfig,
          set,
          get,
          resume
        );

        // 3. Generate Reference Images (Assets)
        set((state) => ({
          runningProjects: { ...state.runningProjects, [projId!]: 'assets' as const }
        }));
        get().updateGeneratingFlags(projId!);
        if (get().currentProject.id === projId) {
          set({ batchStatus: 'Kiểm tra ảnh tham chiếu nhân vật/bối cảnh...' });
        }

        let missingAssetsToGen = {
          characters: [] as string[],
          exteriors: [] as string[],
          props: [] as string[]
        };

        if (resume) {
          const proj = get().currentProject;
          missingAssetsToGen.characters = (proj.characters || [])
            .filter(c => !c.image && !c.mediaId)
            .map(c => c.characterId);
          missingAssetsToGen.exteriors = (proj.exteriors || [])
            .filter(e => !e.image && !e.mediaId)
            .map(e => e.exteriorId);
          missingAssetsToGen.props = (proj.props || [])
            .filter(p => !p.image && !p.mediaId)
            .map(p => p.propId);
        }

        const hasMissingAssets = !resume || 
          missingAssetsToGen.characters.length > 0 || 
          missingAssetsToGen.exteriors.length > 0 || 
          missingAssetsToGen.props.length > 0;

        if (hasMissingAssets) {
          if (get().currentProject.id === projId) {
            set({ batchStatus: 'Đang tự động vẽ ảnh tham chiếu (Assets)...' });
          }
          if (resume) {
            await get().generateAllAssetImages(missingAssetsToGen);
          } else {
            await get().generateAllAssetImages();
          }

          // Wait for asset generation batch to finish
          const assetJobKey = `${projId}_asset`;
          await new Promise<void>((resolve, reject) => {
            const checkInterval = setInterval(() => {
              if (!get().runningProjects[projId!]) {
                clearInterval(checkInterval);
                reject(new Error('AbortError'));
                return;
              }
              const jobState = get().batchJobs[assetJobKey];
              if (!jobState || !jobState.isRunning) {
                clearInterval(checkInterval);
                resolve();
              }
            }, 1000);
          });
        }

        // Retrieve latest project characters, exteriors, and props with generated image references
        let updatedProj = await getProject(projId!);
        if (updatedProj && get().currentProject.id === projId) {
          set((state) => ({
            characters: updatedProj.characters || [],
            exteriors: updatedProj.exteriors || [],
            props: updatedProj.props || [],
            currentProject: {
              ...state.currentProject,
              characters: updatedProj.characters || [],
              exteriors: updatedProj.exteriors || [],
              props: updatedProj.props || [],
              sceneMapping: (state.currentProject?.sceneMapping || []).length > 0 ? state.currentProject.sceneMapping : (updatedProj.sceneMapping || []),
              imagePrompts: (state.currentProject?.imagePrompts || []).length > 0 ? state.currentProject.imagePrompts : (updatedProj.imagePrompts || [])
            }
          }));
        }

        // 4. Generate Shot Images
        const projData = (updatedProj || get().currentProject) as any;

        const totalStts = projData.imagePrompts.length;
        if (totalStts === 0) {
          throw new Error('Không có phân cảnh nào để tạo ảnh và video.');
        }

        // Identify which shots to generate
        let sttToGenShots = projData.imagePrompts.map((p: any) => p.stt);
        if (resume) {
          sttToGenShots = projData.imagePrompts
            .filter((p: any) => !p.imageUrl)
            .map((p: any) => p.stt);
        }

        if (sttToGenShots.length > 0) {
          set((state) => ({
            runningProjects: { ...state.runningProjects, [projId!]: 'shots' as const }
          }));
          get().updateGeneratingFlags(projId!);
          if (get().currentProject.id === projId) {
            set({ 
              batchStatus: `Bắt đầu vẽ ${sttToGenShots.length} ảnh phân cảnh (Shots)...`
            });
          }
          await get().startBatchShotGeneration(sttToGenShots);

          // Wait for shot generation batch to finish
          const shotJobKey = `${projId}_shot`;
          await new Promise<void>((resolve, reject) => {
            const checkInterval = setInterval(() => {
              if (!get().runningProjects[projId!]) {
                clearInterval(checkInterval);
                reject(new Error('AbortError'));
                return;
              }
              const jobState = get().batchJobs[shotJobKey];
              if (!jobState || !jobState.isRunning) {
                clearInterval(checkInterval);
                resolve();
              } else {
                const total = jobState.tasks.length;
                const done = jobState.completed.length;
                const failed = jobState.failed.length;
                if (get().currentProject.id === projId) {
                  set({ batchStatus: `Đang vẽ ảnh phân cảnh (Shots): ${done}/${total} (Lỗi: ${failed})` });
                }
              }
            }, 1000);
          });
        }

        // 5. Generate Video segments sequentially
        const afterShotsProj = await getProject(projId!);
        if (!afterShotsProj) throw new Error('Không thể tải thông tin dự án sau khi vẽ ảnh.');

        // Identify which videos to generate
        const sttToGenVideos = afterShotsProj.imagePrompts
          .filter((p: any) => p.imageUrl && !p.videoUrl)
          .map((p: any) => p.stt);

        if (sttToGenVideos.length > 0) {
          set((state) => ({
            runningProjects: { ...state.runningProjects, [projId!]: 'video' as const }
          }));
          get().updateGeneratingFlags(projId!);
          if (get().currentProject.id === projId) {
            set({ batchStatus: `Bắt đầu tạo ${sttToGenVideos.length} video phân cảnh...` });
          }
          await get().startBatchVideoGeneration(sttToGenVideos);

          // Wait for video generation batch to finish
          const videoJobKey = `${projId}_video`;
          await new Promise<void>((resolve, reject) => {
            const checkInterval = setInterval(() => {
              if (!get().runningProjects[projId!]) {
                clearInterval(checkInterval);
                reject(new Error('AbortError'));
                return;
              }
              const jobState = get().batchJobs[videoJobKey];
              if (!jobState || !jobState.isRunning) {
                clearInterval(checkInterval);
                resolve();
              } else {
                const total = jobState.tasks.length;
                const done = jobState.completed.length;
                const failed = jobState.failed.length;
                if (get().currentProject.id === projId) {
                  set({ batchStatus: `Đang tạo video phân cảnh: ${done}/${total} (Lỗi: ${failed})` });
                }
              }
            }, 1000);
          });
        }

        // 5. Automatic Video Export/Compilation
        const finalProj = await getProject(projId!);
        if (!finalProj) throw new Error('Không thể tải dữ liệu dự án để biên dịch video.');

        set((state) => ({
          runningProjects: { ...state.runningProjects, [projId!]: 'export' as const }
        }));
        get().updateGeneratingFlags(projId!);
        if (get().currentProject.id === projId) {
          set({ batchStatus: 'Đang khởi chạy tiến trình xuất phim (.mp4) tổng hợp...' });
        }

        // Call the export POST endpoint
        const exportRes = await fetch('/api/video/export', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            projectId: projId,
            projectName: finalProj.name,
            sceneMapping: finalProj.sceneMapping || [],
            imagePrompts: finalProj.imagePrompts || [],
            srtContent: finalProj.srtContent || '',
            style: get().getSelectedStyle() || {},
            videoSaveDir: finalProj.videoSaveDir,
            videoType: 'mixed',
            bgmVolumeDb: -18,
            bgmSuggestions: finalProj.bgmSuggestions || []
          })
        });

        if (!exportRes.ok) {
          const errData = await exportRes.json();
          throw new Error(errData.error || `Lỗi từ máy chủ xuất video: ${exportRes.status}`);
        }

        // Poll export status progress
        let exportDone = false;
        while (!exportDone) {
          if (!get().runningProjects[projId!]) {
            console.log('[Combo Full] Export cancelled.');
            return;
          }

          const statusRes = await fetch(`/api/video/export?projectId=${projId}`);
          if (!statusRes.ok) {
            throw new Error(`Không thể lấy trạng thái xuất phim: ${statusRes.status}`);
          }

          const statusData = await statusRes.json();
          const status = statusData.status;
          const percent = statusData.percent || 0;
          const msg = statusData.message || '';

          if (status === 'completed') {
            exportDone = true;
            if (get().currentProject.id === projId) {
              set({ batchStatus: `Xuất video thành công! File đã lưu vào thư mục của bạn.` });
            }
            break;
          } else if (status === 'failed') {
            throw new Error(msg || 'Tiến trình render video FFmpeg thất bại.');
          } else {
            if (get().currentProject.id === projId) {
              set({ batchStatus: `Đang kết xuất video: ${percent}% - ${msg}` });
            }
          }

          // Sleep 3 seconds
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        await get().loadHistory();

      } catch (error: any) {
        if (error.name === 'AbortError' || error.message?.includes('aborted') || error.message?.includes('stopped') || error.message === 'AbortError') {
          console.warn('Full combo generation aborted.');
          if (get().currentProject.id === projId) {
            set({ batchStatus: 'Đang dừng hoặc đã hủy Combo Full.' });
          }
        } else {
          console.error('Error in Combo Full:', error);
          if (get().currentProject.id === projId) {
            set({ batchStatus: `Lỗi Combo Full: ${error.message}` });
          }
          throw error;
        }
      } finally {
        set((state) => {
          const updatedRunning = { ...state.runningProjects };
          delete updatedRunning[projId!];
          const updatedCombos = { ...state.runningCombos };
          delete updatedCombos[projId!];
          return {
            runningProjects: updatedRunning,
            runningCombos: updatedCombos,
            mappingAbortController: null,
            promptsAbortController: null,
            assetAbortController: null
          };
        });
        get().updateGeneratingFlags(projId!);
      }
    };

    get().addToQueue(projId!, 'mapping', runTask);
  },

  // Background Batch Job Manager
  startBatchShotGeneration: async (sttList) => {
    const active = get().currentProject;
    if (!active.id) return;
    const projectId = active.id;
    const jobKey = `${projectId}_shot`;

    const newJob: BatchJobState = {
      projectId,
      type: 'shot',
      tasks: [...sttList],
      currentIndex: 0,
      completed: [],
      failed: [],
      isRunning: true
    };

    set((state) => ({
      batchJobs: {
        ...state.batchJobs,
        [jobKey]: newJob
      }
    }));

    const concurrency = get().imageGenConfig.concurrency || 1;

    (async () => {
      let tasks = [...sttList];
      let attempt = 1;
      const maxBatchAttempts = 3;

      while (tasks.length > 0 && attempt <= maxBatchAttempts) {
        let activeIndex = 0;
        const failedTasksThisPass: number[] = [];

        if (attempt > 1) {
          set((state) => {
            const jobState = state.batchJobs[jobKey];
            if (!jobState) return {};
            return {
              batchJobs: {
                ...state.batchJobs,
                [jobKey]: {
                  ...jobState,
                  failed: jobState.failed.filter(f => !tasks.includes(Number(f)))
                }
              }
            };
          });
        }

        const worker = async () => {
          while (true) {
            const currentJob = get().batchJobs[jobKey];
            if (!currentJob || !currentJob.isRunning) {
              break;
            }

            let indexToRun = -1;
            set((state) => {
              const jobState = state.batchJobs[jobKey];
              if (!jobState || !jobState.isRunning || activeIndex >= tasks.length) {
                return {};
              }
              indexToRun = activeIndex++;
              return {
                batchJobs: {
                  ...state.batchJobs,
                  [jobKey]: {
                    ...jobState,
                    currentIndex: Math.min(activeIndex, tasks.length - 1)
                  }
                }
              };
            });

            if (indexToRun === -1 || indexToRun >= tasks.length) {
              break;
            }

            const stt = tasks[indexToRun];
            let success = false;
            let inlineRetries = 2; // inline retry 2 additional times (3 attempts total)
            let lastError: any = null;

            while (inlineRetries >= 0 && !success) {
              const innerJob = get().batchJobs[jobKey];
              if (!innerJob || !innerJob.isRunning) {
                break;
              }
              try {
                const projData = await getProject(projectId);
                if (!projData) throw new Error('Project not found in database');

                await get().generateShotImageForProject(projectId, stt, projData);
                success = true;
              } catch (err) {
                lastError = err;
                inlineRetries--;
                if (inlineRetries >= 0) {
                  console.warn(`[Retry] Shot ${stt} failed. Retrying inline (${2 - inlineRetries}/2)...`);
                  await new Promise(resolve => setTimeout(resolve, 2500));
                }
              }
            }

            if (success) {
              set((state) => {
                const jobState = state.batchJobs[jobKey];
                if (!jobState) return {};
                return {
                  batchJobs: {
                    ...state.batchJobs,
                    [jobKey]: {
                      ...jobState,
                      completed: [...jobState.completed, String(stt)],
                      failed: jobState.failed.filter(f => f !== String(stt))
                    }
                  }
                };
              });
            } else {
              console.error(`Failed to generate shot ${stt} for project ${projectId} on pass ${attempt}:`, lastError);
              failedTasksThisPass.push(stt);
              set((state) => {
                const jobState = state.batchJobs[jobKey];
                if (!jobState) return {};
                const failedList = jobState.failed.includes(String(stt)) ? jobState.failed : [...jobState.failed, String(stt)];
                return {
                  batchJobs: {
                    ...state.batchJobs,
                    [jobKey]: {
                      ...jobState,
                      failed: failedList
                    }
                  }
                };
              });
            }
          }
        };

        const workers = Array(Math.min(concurrency, tasks.length))
          .fill(null)
          .map(() => worker());

        await Promise.all(workers);

        // Update list for next attempt
        tasks = [...failedTasksThisPass];
        if (tasks.length > 0) {
          attempt++;
          if (attempt <= maxBatchAttempts) {
            console.log(`[Batch Retry] Starting pass ${attempt} for failed shots: ${tasks.join(', ')}`);
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
      }

      set((state) => {
        const jobState = state.batchJobs[jobKey];
        if (!jobState) return {};
        return {
          batchJobs: {
            ...state.batchJobs,
            [jobKey]: {
              ...jobState,
              isRunning: false
            }
          }
        };
      });
    })();
  },

  startBatchVideoGeneration: async (sttList) => {
    const active = get().currentProject;
    if (!active.id) return;
    const projectId = active.id;
    const jobKey = `${projectId}_video`;

    const newJob: BatchJobState = {
      projectId,
      type: 'video',
      tasks: [...sttList],
      currentIndex: 0,
      completed: [],
      failed: [],
      isRunning: true
    };

    set((state) => ({
      batchJobs: {
        ...state.batchJobs,
        [jobKey]: newJob
      }
    }));

    const concurrency = get().videoGenConfig.concurrency || 1;

    (async () => {
      const tasks = [...sttList];
      let activeIndex = 0;

      const worker = async () => {
        while (true) {
          const currentJob = get().batchJobs[jobKey];
          if (!currentJob || !currentJob.isRunning) {
            break;
          }

          let indexToRun = -1;
          set((state) => {
            const jobState = state.batchJobs[jobKey];
            if (!jobState || !jobState.isRunning || activeIndex >= tasks.length) {
              return {};
            }
            indexToRun = activeIndex++;
            return {
              batchJobs: {
                ...state.batchJobs,
                [jobKey]: {
                  ...jobState,
                  currentIndex: Math.min(activeIndex, tasks.length - 1)
                }
              }
            };
          });

          if (indexToRun === -1 || indexToRun >= tasks.length) {
            break;
          }

          const stt = tasks[indexToRun];
          
          try {
            const projData = await getProject(projectId);
            if (!projData) throw new Error('Project not found in database');
            
            const row = projData.imagePrompts.find(p => p.stt === stt);
            if (!row || !row.imageUrl) {
              console.warn(`Skipping video generation for STT #${stt} - missing shot image`);
              set((state) => {
                const jobState = state.batchJobs[jobKey];
                if (!jobState) return {};
                return {
                  batchJobs: {
                    ...state.batchJobs,
                    [jobKey]: {
                      ...jobState,
                      failed: [...jobState.failed, String(stt)]
                    }
                  }
                };
              });
              continue;
            }

            await get().generateVideoForProject(projectId, stt, projData);

            set((state) => {
              const jobState = state.batchJobs[jobKey];
              if (!jobState) return {};
              return {
                batchJobs: {
                  ...state.batchJobs,
                  [jobKey]: {
                    ...jobState,
                    completed: [...jobState.completed, String(stt)]
                  }
                }
              };
            });
          } catch (err) {
            console.error(`Failed to generate video for STT ${stt} in project ${projectId}:`, err);
            set((state) => {
              const jobState = state.batchJobs[jobKey];
              if (!jobState) return {};
              return {
                batchJobs: {
                  ...state.batchJobs,
                  [jobKey]: {
                    ...jobState,
                    failed: [...jobState.failed, String(stt)]
                  }
                }
              };
            });
          }
        }
      };

      const workers = Array(Math.min(concurrency, tasks.length))
        .fill(null)
        .map(() => worker());

      await Promise.all(workers);

      set((state) => {
        const jobState = state.batchJobs[jobKey];
        if (!jobState) return {};
        return {
          batchJobs: {
            ...state.batchJobs,
            [jobKey]: {
              ...jobState,
              isRunning: false
            }
          }
        };
      });
    })();
  },

  startBatchAssetGeneration: async (selectedIds, config) => {
    const active = get().currentProject;
    if (!active.id) return;
    const projectId = active.id;
    const jobKey = `${projectId}_asset`;

    let charsToGen: string[] = [];
    let extsToGen: string[] = [];
    let propsToGen: string[] = [];

    if (selectedIds) {
      charsToGen = selectedIds.characters || [];
      extsToGen = selectedIds.exteriors || [];
      propsToGen = selectedIds.props || [];
    } else {
      charsToGen = (active.characters || []).map(c => c.characterId);
      extsToGen = (active.exteriors || []).map(e => e.exteriorId);
      propsToGen = (active.props || []).map(p => p.propId);
    }

    const tasks: Array<{ type: 'character' | 'exterior' | 'prop'; id: string }> = [];
    charsToGen.forEach(id => tasks.push({ type: 'character', id }));
    extsToGen.forEach(id => tasks.push({ type: 'exterior', id }));
    propsToGen.forEach(id => tasks.push({ type: 'prop', id }));

    if (tasks.length === 0) return;

    const newJob: BatchJobState = {
      projectId,
      type: 'asset',
      tasks: [...tasks],
      currentIndex: 0,
      completed: [],
      failed: [],
      isRunning: true
    };

    set((state) => ({
      batchJobs: {
        ...state.batchJobs,
        [jobKey]: newJob
      }
    }));

    const concurrency = get().imageGenConfig.concurrency || 1;

    (async () => {
      let activeIndex = 0;

      const worker = async () => {
        while (true) {
          const currentJob = get().batchJobs[jobKey];
          if (!currentJob || !currentJob.isRunning) {
            break;
          }

          let indexToRun = -1;
          set((state) => {
            const jobState = state.batchJobs[jobKey];
            if (!jobState || !jobState.isRunning || activeIndex >= tasks.length) {
              return {};
            }
            indexToRun = activeIndex++;
            return {
              batchJobs: {
                ...state.batchJobs,
                [jobKey]: {
                  ...jobState,
                  currentIndex: Math.min(activeIndex, tasks.length - 1)
                }
              }
            };
          });

          if (indexToRun === -1 || indexToRun >= tasks.length) {
            break;
          }

          const task = tasks[indexToRun];
          const taskKey = `${task.type}_${task.id}`;

          let success = false;
          let retries = 3;
          let lastError: any = null;

          while (retries >= 0 && !success) {
            try {
              const projData = await getProject(projectId);
              if (!projData) throw new Error('Project not found in database');

              await get().generateAssetImageForProject(projectId, task.type, task.id, projData, config);
              success = true;
            } catch (err) {
              lastError = err;
              retries--;
              if (retries >= 0) {
                console.warn(`Retry generation for asset ${taskKey} (attempt ${3 - retries}/3)...`);
                await new Promise(resolve => setTimeout(resolve, 1500));
              }
            }
          }

          if (success) {
            set((state) => {
              const jobState = state.batchJobs[jobKey];
              if (!jobState) return {};
              return {
                batchJobs: {
                  ...state.batchJobs,
                  [jobKey]: {
                    ...jobState,
                    completed: [...jobState.completed, taskKey]
                  }
                }
              };
            });
          } else {
            console.error(`Failed to generate asset ${taskKey} after 3 retries:`, lastError);
            set((state) => {
              const jobState = state.batchJobs[jobKey];
              if (!jobState) return {};
              return {
                batchJobs: {
                  ...state.batchJobs,
                  [jobKey]: {
                    ...jobState,
                    failed: [...jobState.failed, taskKey]
                  }
                }
              };
            });
          }
        }
      };

      const workers = Array(Math.min(concurrency, tasks.length))
        .fill(null)
        .map(() => worker());

      await Promise.all(workers);

      set((state) => {
        const jobState = state.batchJobs[jobKey];
        if (!jobState) return {};
        return {
          batchJobs: {
            ...state.batchJobs,
            [jobKey]: {
              ...jobState,
              isRunning: false
            }
          }
        };
      });
    })();
  },

  cancelBatchJob: (projectId, type) => {
    const jobKey = `${projectId}_${type}`;
    set((state) => {
      const job = state.batchJobs[jobKey];
      if (!job) return {};
      return {
        batchJobs: {
          ...state.batchJobs,
          [jobKey]: {
            ...job,
            isRunning: false
          }
        }
      };
    });
  },

  generateShotImageForProject: async (projectId, stt, projData) => {
    const isCurrent = get().currentProject.id === projectId;
    const genKey = `${projectId}_${stt}`;
    if (isCurrent) {
      set((state) => ({
        shotGeneratingIds: [...state.shotGeneratingIds, genKey]
      }));
    }

    try {
      const row = projData.imagePrompts.find((p: any) => p.stt === stt);
      if (!row) throw new Error('Shot segment not found.');

      const charNames = parseCharactersField(row.characters);

      const missingCharImages = charNames.filter((name) => {
        const char = findBestCharacterMatch(projData.characters || [], name);
        return !char || !char.image;
      });
      if (missingCharImages.length > 0) {
        throw new Error(`Chưa có ảnh tham chiếu cho nhân vật: ${missingCharImages.join(', ')}`);
      }

      const matchedChars = charNames
        .map((name) => findBestCharacterMatch(projData.characters || [], name))
        .filter((c): c is CharacterReference => !!c);

      const propNames = parseCharactersField(row.props || '');
      const missingPropImages = propNames.filter((name) => {
        const prop = findBestPropMatch(projData.props || [], name);
        return !prop || !prop.image;
      });
      if (missingPropImages.length > 0) {
        throw new Error(`Chưa có ảnh tham chiếu cho đạo cụ: ${missingPropImages.join(', ')}`);
      }

      const matchedProps = propNames
        .map((name) => findBestPropMatch(projData.props || [], name))
        .filter((p): p is PropReference => !!p);

      const extName = (row.exterior || '').trim();
      const matchedExt = extName
        ? findBestExteriorMatch(projData.exteriors || [], extName)
        : undefined;

      if (extName && (!matchedExt || !matchedExt.image)) {
        throw new Error(`Chưa có ảnh tham chiếu cho bối cảnh: "${extName}"`);
      }

      const mediaIds: string[] = [];
      let accountId = '';

      matchedChars.forEach((c) => {
        if (c.mediaId) mediaIds.push(c.mediaId);
        if (c.accountId && !accountId) accountId = c.accountId;
      });

      matchedProps.forEach((p) => {
        if (p.mediaId) mediaIds.push(p.mediaId);
        if (p.accountId && !accountId) accountId = p.accountId;
      });

      if (matchedExt && matchedExt.mediaId) {
        mediaIds.push(matchedExt.mediaId);
        if (matchedExt.accountId && !accountId) accountId = matchedExt.accountId;
      }

      const styleId = projData.selectedStyleId || 'manga_color';
      const style = get().styles.find(s => s.id === styleId) || get().styles[0] || DEFAULT_STYLES[0];
      const finalPrompt = `${row.description}, ${style.sceneSuffix}`;

      const payload: any = {
        projectId,
        stt: row.stt,
        concurrency: get().imageGenConfig.concurrency,
        prompt: finalPrompt,
        count: get().imageGenConfig.count,
        aspect_ratio: get().imageGenConfig.aspectRatio,
        model: get().imageGenConfig.model,
        for_video: true,
        assetType: 'shot',
        assetId: `shot_${projectId}_${row.stt}`,
        googleApiUrl: get().apiConfig.googleApiUrl || ''
      };

      if (mediaIds.length > 0) {
        payload.media_ids = mediaIds;
      }
      if (accountId) {
        payload.account_id = accountId;
      }

      const delayTime = get().imageGenConfig.delayTime || 5;
      await enforceImageGenDelay(delayTime);

      const response = await fetch('/api/image/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(cleanErrorMessage(errText) || 'Failed to generate shot image');
      }

      const resData = await response.json();
      if (!resData.success || !resData.images || resData.images.length === 0) {
        throw new Error('Image generation API returned unsuccessful status');
      }

      const imgData = resData.images[0];
      const imageUrl = imgData.url;
      const mediaId = imgData.media_id;
      const resAccountId = resData.account_id;

      // Auto download shot image to PC images folder if configured
      if (projData.videoSaveDir) {
        try {
          const sep = projData.videoSaveDir.includes('/') ? '/' : '\\';
          const cleanBase = projData.videoSaveDir.replace(/[\\/]+$/, '');
          const imagesSaveDir = `${cleanBase}${sep}images`;
          await fetch('/api/video/download', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              url: imageUrl,
              saveDir: imagesSaveDir,
              fileName: `shot_${String(stt).padStart(2, '0')}.png`
            })
          });
        } catch (downloadErr) {
          console.error('Error auto-downloading image:', downloadErr);
        }
      }

      await runInProjectDbQueue(async () => {
        const latestProj = await getProject(projectId);
        if (latestProj) {
          latestProj.imagePrompts = latestProj.imagePrompts.map((p) => {
            if (p.stt === stt) {
              return {
                ...p,
                imageUrl,
                mediaId,
                accountId: resAccountId
              };
            }
            return p;
          });
          await saveProject(latestProj);
          syncChannel?.postMessage({ type: 'project_updated', projectId });

          if (get().currentProject.id === projectId) {
            set({
              currentProject: latestProj
            });
          }
        }
      });
    } finally {
      if (get().currentProject.id === projectId) {
        set((state) => ({
          shotGeneratingIds: state.shotGeneratingIds.filter(x => x !== genKey)
        }));
      }
    }
  },

  generateVideoForProject: async (projectId, stt, projData) => {
    const isCurrent = get().currentProject.id === projectId;
    const key = `${projectId}_${stt}`;
    if (isCurrent) {
      set((state) => ({
        videoGeneratingIds: [...state.videoGeneratingIds, key]
      }));
    }

    try {
      const row = projData.imagePrompts.find((p: any) => p.stt === stt);
      if (!row) throw new Error('Shot segment not found.');

      if (!row.imageUrl) {
        throw new Error('Chưa có ảnh phân cảnh. Vui lòng vẽ ảnh phân cảnh trước khi tạo video!');
      }

      let refMediaId = row.mediaId || '';
      let refAccountId = row.accountId || '';

      const isMediaIdValid = async (mediaId: string): Promise<boolean> => {
        if (!mediaId) return false;
        try {
          const res = await fetch(`https://drive.google.com/thumbnail?id=${mediaId}`, { method: 'GET' });
          if (res.ok) {
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('image')) return true;
          }
          return false;
        } catch (e) {
          return false;
        }
      };

      if (refMediaId) {
        const valid = await isMediaIdValid(refMediaId);
        if (!valid) {
          console.warn(`Shot ${stt} mediaId ${refMediaId} is invalid or expired. Attempting to re-upload image...`);
          refMediaId = '';
        }
      }

      if (!refMediaId && row.imageUrl) {
        try {
          const fileRes = await fetch(row.imageUrl);
          const blob = await fileRes.blob();
          const file = new File([blob], `shot_${stt}.png`, { type: blob.type || 'image/png' });
          const uploadRes = (await get().uploadImage(file)) as any;
          if (uploadRes && uploadRes.success) {
            refMediaId = uploadRes.media_id || uploadRes.mediaId;
            refAccountId = uploadRes.account_id || uploadRes.accountId;
            
            await runInProjectDbQueue(async () => {
              const latestProj = await getProject(projectId);
              if (latestProj) {
                latestProj.imagePrompts = latestProj.imagePrompts.map((p: any) => {
                  if (p.stt === stt) {
                    return { ...p, mediaId: refMediaId, accountId: refAccountId };
                  }
                  return p;
                });
                await saveProject(latestProj);
                if (get().currentProject.id === projectId) {
                  set({ currentProject: latestProj });
                }
              }
            });
          }
        } catch (uploadErr) {
          console.error(`Failed to auto re-upload shot image for video generation:`, uploadErr);
        }
      }

      const payload: any = {
        projectId,
        stt: row.stt,
        prompt: row.motion || 'cinematic motion, slow pan',
        concurrency: get().videoGenConfig.concurrency || 1,
        aspect_ratio: get().videoGenConfig.aspectRatio || 'VIDEO_ASPECT_RATIO_LANDSCAPE',
        model: refMediaId ? 'veo_3_1_r2v_lite_low_priority' : (get().videoGenConfig.model || 'veo_3_1_r2v_lite_low_priority'),
        duration: '4 Giây',
        count: get().videoGenConfig.count || 1,
        assetType: 'video',
        assetId: `video_${projectId}_${row.stt}`,
        googleApiUrl: get().apiConfig.googleApiUrl || ''
      };

      if (refMediaId) {
        payload.media_ids = [refMediaId];
      }
      if (refAccountId) {
        payload.account_id = refAccountId;
      }

      const response = await fetch('/api/video/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(cleanErrorMessage(errText) || 'Failed to generate video');
      }

      const resData = await response.json();
      let videoUrl = '';
      if (resData.success && resData.videos && resData.videos.length > 0) {
        videoUrl = resData.videos[0].url;
      } else if (resData.success && resData.url) {
        videoUrl = resData.url;
      } else if (resData.url) {
        videoUrl = resData.url;
      }

      if (!videoUrl) {
        throw new Error('API response not success or no video URL returned');
      }

      let autoDownloadConfig: { autoDownloadVideo?: boolean; videoSaveDir?: string } = {};

      await runInProjectDbQueue(async () => {
        const latestProj = await getProject(projectId);
        if (latestProj) {
          latestProj.imagePrompts = latestProj.imagePrompts.map((p) => {
            if (p.stt === stt) {
              return {
                ...p,
                videoUrl
              };
            }
            return p;
          });
          await saveProject(latestProj);
          syncChannel?.postMessage({ type: 'project_updated', projectId });

          autoDownloadConfig = {
            autoDownloadVideo: latestProj.autoDownloadVideo,
            videoSaveDir: latestProj.videoSaveDir
          };

          if (get().currentProject.id === projectId) {
            set({
              currentProject: latestProj
            });
          }
        }
      });

      if (autoDownloadConfig.autoDownloadVideo && autoDownloadConfig.videoSaveDir) {
        try {
          const sep = autoDownloadConfig.videoSaveDir.includes('/') ? '/' : '\\';
          const cleanBase = autoDownloadConfig.videoSaveDir.replace(/[\\/]+$/, '');
          const videosSaveDir = `${cleanBase}${sep}videos`;
          const downloadResponse = await fetch('/api/video/download', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              url: videoUrl,
              saveDir: videosSaveDir,
              fileName: `segment_${String(stt).padStart(2, '0')}.mp4`
            })
          });
          if (!downloadResponse.ok) {
            console.error('Failed to auto-download video:', await downloadResponse.text());
          }
        } catch (downloadErr) {
          console.error('Error auto-downloading video:', downloadErr);
        }
      }
    } finally {
      if (get().currentProject.id === projectId) {
        set((state) => ({
          videoGeneratingIds: state.videoGeneratingIds.filter((id) => id !== key)
        }));
      }
    }
  },

  generateAssetImageForProject: async (
    projectId: string,
    type: 'character' | 'exterior' | 'prop',
    id: string,
    projData: any,
    config?: any
  ) => {
    const isCurrent = get().currentProject.id === projectId;
    const key = `${projectId}_${type}_${id}`;
    if (isCurrent) {
      set((state) => ({
        assetGeneratingIds: [...state.assetGeneratingIds, key],
        isGeneratingAssets: true
      }));
    }

    try {
      let prompt = '';
      let referenceMediaId = '';
      let referenceAccountId = '';

      const styleId = projData.selectedStyleId || 'manga_color';
      const activeStyle = get().styles.find(s => s.id === styleId) || get().styles[0] || DEFAULT_STYLES[0];

      if (type === 'character') {
        const char = (projData.characters || []).find((c: any) => c.characterId.toLowerCase() === id.toLowerCase());
        const details = [char?.gender, char?.age].filter(Boolean).join(', ') || 'Japanese individual';
        const defaultPrompt = `Character Sheet of ${getDisplayName(id)}, 3-view reference sheet (front, side, back), full body, white background, modern present-day Japan (year 2026) realism, avoiding retro Shouwa-era appearance, grounded Japanese TV drama realism, ${activeStyle.characterSuffix}, ${details}, modern fashionable Japanese clothing, restrained emotional presence, natural standing posture, neutral facial expression, realistic fabric folds, cinematic realism, production design reference sheet.`;
        
        prompt = char?.prompt || defaultPrompt;
        if (char?.prompt) {
          if (prompt.includes('modern colored manga anime style')) {
            prompt = prompt.replace('modern colored manga anime style', activeStyle.characterSuffix);
          } else if (!prompt.includes(activeStyle.characterSuffix)) {
            prompt = `${prompt}, ${activeStyle.characterSuffix}`;
          }
        }
        referenceMediaId = char?.inputMediaId || '';
        referenceAccountId = char?.inputAccountId || '';
      } else if (type === 'exterior') {
        const ext = (projData.exteriors || []).find((e: any) => e.exteriorId.toLowerCase() === id.toLowerCase());
        const defaultPrompt = `Background layout sheet of ${getDisplayName(id)}, 4-camera-angle sheet showing 4 different viewpoints/angles (front, reverse, left side, right side) of the same scene in a 2x2 grid layout, empty scene, no people, modern present-day Japan (year 2026) apartment realism, contemporary metropolitan Japanese design, avoiding retro Shouwa-era aesthetics, ${activeStyle.backgroundSuffix}, consistent furniture and layout across all 4 angles, realistic practical lighting, subtle emotional atmosphere, believable lived-in details, cinematic depth, production-ready environment design reference sheet.`;
        
        prompt = ext?.prompt || defaultPrompt;
        if (ext?.prompt) {
          if (prompt.includes('modern colored manga anime style')) {
            prompt = prompt.replace('modern colored manga anime style', activeStyle.backgroundSuffix);
          } else if (!prompt.includes(activeStyle.backgroundSuffix)) {
            prompt = `${prompt}, ${activeStyle.backgroundSuffix}`;
          }
        }
        referenceMediaId = ext?.inputMediaId || '';
        referenceAccountId = ext?.inputAccountId || '';
      } else if (type === 'prop') {
        const prop = (projData.props || []).find((p: any) => p.propId.toLowerCase() === id.toLowerCase());
        const defaultPrompt = `Product layout sheet of ${getDisplayName(id)}, showing the item from multiple clean angles (front, side, isometric), isolated on a pure white background, modern present-day Japan design, avoiding retro appearance, ${activeStyle.characterSuffix}, [detailed prop description showing consistent colors, materials, and form], realistic textures, clean studio lighting, production design reference sheet.`;
        
        prompt = prop?.prompt || defaultPrompt;
        if (prop?.prompt) {
          if (prompt.includes('modern colored manga anime style')) {
            prompt = prompt.replace('modern colored manga anime style', activeStyle.characterSuffix);
          } else if (!prompt.includes(activeStyle.characterSuffix)) {
            prompt = `${prompt}, ${activeStyle.characterSuffix}`;
          }
        }
        referenceMediaId = prop?.inputMediaId || '';
        referenceAccountId = prop?.inputAccountId || '';
      }

      const payload: any = {
        projectId,
        stt: type === 'character'
          ? (projData.characters || []).findIndex((c: any) => c.characterId.toLowerCase() === id.toLowerCase()) + 1
          : type === 'exterior'
          ? (projData.exteriors || []).findIndex((e: any) => e.exteriorId.toLowerCase() === id.toLowerCase()) + 1
          : (projData.props || []).findIndex((p: any) => p.propId.toLowerCase() === id.toLowerCase()) + 1,
        concurrency: get().imageGenConfig.concurrency,
        prompt,
        count: config?.count !== undefined ? config.count : get().imageGenConfig.count,
        aspect_ratio: config?.aspect_ratio || get().imageGenConfig.aspectRatio,
        model: config?.model || get().imageGenConfig.model,
        for_video: true,
        assetType: type,
        assetId: `${projectId}_${id}`,
        googleApiUrl: get().apiConfig.googleApiUrl || ''
      };

      if (referenceMediaId) {
        payload.media_ids = [referenceMediaId];
        if (referenceAccountId) {
          payload.account_id = referenceAccountId;
        }
      }

      const delayTime = get().imageGenConfig.delayTime || 5;
      await enforceImageGenDelay(delayTime);

      const response = await fetch('/api/image/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(cleanErrorMessage(errText) || 'Failed to generate image');
      }

      const resData = await response.json();
      if (!resData.success || !resData.images || resData.images.length === 0) {
        throw new Error('Image generation API returned unsuccessful status');
      }

      const imgData = resData.images[0];
      const imageUrl = imgData.url;
      const mediaId = imgData.media_id;
      const accountId = resData.account_id;

      await runInProjectDbQueue(async () => {
        const latestProj = await getProject(projectId);
        if (latestProj) {
          if (type === 'character') {
            latestProj.characters = (latestProj.characters || []).map((c) => {
              if (c.characterId.toLowerCase() === id.toLowerCase()) {
                return { ...c, image: imageUrl, mediaId, accountId };
              }
              return c;
            });
          } else if (type === 'exterior') {
            latestProj.exteriors = (latestProj.exteriors || []).map((e) => {
              if (e.exteriorId.toLowerCase() === id.toLowerCase()) {
                return { ...e, image: imageUrl, mediaId, accountId };
              }
              return e;
            });
          } else if (type === 'prop') {
            latestProj.props = (latestProj.props || []).map((p) => {
              if (p.propId.toLowerCase() === id.toLowerCase()) {
                return { ...p, image: imageUrl, mediaId, accountId };
              }
              return p;
            });
          }
          await saveProject(latestProj);
          syncChannel?.postMessage({ type: 'project_updated', projectId });

          if (get().currentProject.id === projectId) {
            set({
              currentProject: latestProj,
              characters: latestProj.characters || [],
              exteriors: latestProj.exteriors || [],
              props: latestProj.props || []
            });
          }
        }
      });
    } finally {
      if (get().currentProject.id === projectId) {
        set((state) => {
          const updatedIds = state.assetGeneratingIds.filter(g => g !== key);
          return {
            assetGeneratingIds: updatedIds,
            isGeneratingAssets: updatedIds.length > 0
          };
        });
      }
    }
  },

  generateAllAssetImages: async (selectedIds, config) => {
    const active = get().currentProject;
    if (!active.id) return;
    await get().startBatchAssetGeneration(selectedIds, config);
  },

  generateAllShotImages: async () => {
    const active = get().currentProject;
    if (!active.id) return;
    const sttList = active.imagePrompts.map(p => p.stt);
    await get().startBatchShotGeneration(sttList);
  },

  generateBgmSuggestions: async () => {
    const active = get().currentProject;
    if (!active.id) return;
    const { provider, apiKey, modelName } = get().apiConfig;
    if (!apiKey) throw new Error('Vui lòng nhập API Key trong Cấu hình dự án (Settings).');

    const sceneMapping = active.sceneMapping || [];
    if (sceneMapping.length === 0) {
      throw new Error('Vui lòng thực hiện Scene Mapping trước khi gợi ý nhạc nền.');
    }

    set({ isGeneratingBgmSuggestions: true });

    try {
      // Build a concise timeline description of scenes for the AI
      const scenesTimeline = sceneMapping.map((s) => {
        return `- Cảnh ${s.stt} [Thời gian: ${s.timeRange}]: Tình huống: "${s.mainSituation}". Cảm xúc chính: "${s.mainEmotion}". Mô tả cảnh: "${s.sceneDescription}".`;
      }).join('\n');

      const systemPrompt = `Bạn là một chuyên gia biên tập âm thanh và đạo diễn âm nhạc cho phim. Nhiệm vụ của bạn là phân tích diễn biến cảm xúc và kịch bản hình ảnh từ danh sách phân cảnh của người dùng, sau đó phân chia toàn bộ thời lượng video thành các đoạn nhạc nền (BGM) hợp lý (từ 2 đến 5 đoạn tùy độ dài và sự thay đổi cảm xúc của video).
Với mỗi đoạn nhạc nền (BGM segment), hãy gợi ý các trường thông tin:
1. "id": dạng "bgm_1", "bgm_2"...
2. "title": Tiêu đề thể hiện tính chất âm nhạc hoặc phân cảnh (ví dụ: "Bắt đầu cuộc hành trình", "Căng thẳng leo thang", "Bình yên lắng đọng")
3. "timeRange": Khoảng thời gian áp dụng nhạc này (định dạng "MM:SS - MM:SS", ví dụ: "00:00 - 01:45", đoạn cuối cùng phải kết thúc đúng thời điểm kết thúc của cảnh cuối).
4. "description": Lý do lựa chọn đoạn nhạc này phù hợp với diễn biến kịch bản.
5. "genre": Thể loại nhạc đề xuất (ví dụ: "Cinematic", "Lo-Fi", "Anime OST", "Orchestral", "Ambient", "Acoustic", "Epic Drama")
6. "instrument": Nhạc cụ chủ đạo chính (ví dụ: "Piano", "Violin", "Acoustic Guitar", "Electric Guitar", "Synth", "Orchestra Strings")
7. "tone": Tông nhạc/Tâm trạng chính (ví dụ: "Melancholic", "Suspenseful", "Epic/Heroic", "Peaceful", "Romantic", "Dark/Tense", "Happy/Upbeat")
8. "sunoPrompt": Gợi ý tag prompt tiếng Anh cực kỳ chất lượng để nhập vào Suno AI tạo nhạc nền. Gợi ý này phải viết hoàn toàn bằng các từ khóa/tag tiếng Anh ngắn gọn, phân tách bằng dấu phẩy, không viết thành câu dài. Ví dụ: "melancholic piano, cinematic strings, ambient, emotional, slow tempo".

Hãy trả về kết quả dưới dạng JSON array duy nhất, không kèm giải thích hay ký tự thừa nào ngoài JSON.`;

      const prompt = `Dưới đây là danh sách phân cảnh và mốc thời gian của video:\n\n${scenesTimeline}\n\nTổng thời lượng video: ${active.srtMeta?.duration || 'Chưa rõ'}\n\nHãy chia timeline trên thành các đoạn nhạc nền (BGM) tối ưu và đề xuất thông số kèm Suno AI prompt tương ứng dưới dạng JSON array.`;

      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: active.id,
          type: 'bgm_suggestions',
          label: 'Gợi ý nhạc nền',
          provider,
          apiKey,
          modelName,
          prompt,
          systemPrompt,
          responseFormat: 'json'
        })
      });

      if (!res.ok) {
        throw new Error(`AI Request failed: ${await res.text()}`);
      }

      const resJson = await res.json();
      const parsedData = JSON.parse(resJson.text);
      if (!Array.isArray(parsedData)) {
        throw new Error('Dữ liệu AI trả về không phải là một danh sách hợp lệ.');
      }

      // Keep existing custom audioFile assignments if IDs match
      const updatedBgm = parsedData.map((row: any, idx: number) => {
        const existingRow = active.bgmSuggestions?.find((b) => b.id === row.id || (b.title === row.title && idx === active.bgmSuggestions?.indexOf(b)));
        return {
          id: row.id || `bgm_${idx + 1}`,
          title: row.title || `Khúc nhạc ${idx + 1}`,
          timeRange: row.timeRange || '00:00 - 00:05',
          description: row.description || '',
          genre: row.genre || 'Cinematic',
          instrument: row.instrument || 'Piano',
          tone: row.tone || 'Melancholic',
          sunoPrompt: row.sunoPrompt || 'cinematic, piano, emotional',
          audioFile: existingRow?.audioFile || ''
        };
      });

      set((state) => ({
        currentProject: {
          ...state.currentProject,
          bgmSuggestions: updatedBgm
        }
      }));

      await get().saveCurrentProject();
      await get().scanLocalBgmFiles(); // Scan and auto-pair after generation
    } catch (err: any) {
      console.error('Failed to generate BGM suggestions:', err);
      throw err;
    } finally {
      set({ isGeneratingBgmSuggestions: false });
    }
  },

  updateBgmSuggestionCell: async (bgmId, colId, value) => {
    const active = get().currentProject;
    if (!active.id) return;
    const bgmSuggestions = active.bgmSuggestions || [];
    const updated = bgmSuggestions.map((row) => {
      if (row.id === bgmId) {
        return { ...row, [colId]: value };
      }
      return row;
    });

    set((state) => ({
      currentProject: {
        ...state.currentProject,
        bgmSuggestions: updated
      }
    }));
    await get().saveCurrentProject();
  },

  regenerateBgmPrompt: async (bgmId) => {
    const active = get().currentProject;
    if (!active.id) return;
    const { provider, apiKey, modelName } = get().apiConfig;
    if (!apiKey) throw new Error('Vui lòng cấu hình API Key để tạo lại prompt.');

    const bgmSuggestions = active.bgmSuggestions || [];
    const target = bgmSuggestions.find((b) => b.id === bgmId);
    if (!target) return;

    // Set prompt to loading status temporarily in UI
    const originalPrompt = target.sunoPrompt;
    const loadingUpdated = bgmSuggestions.map((row) => {
      if (row.id === bgmId) {
        return { ...row, sunoPrompt: 'Đang tạo lại prompt...' };
      }
      return row;
    });
    set((state) => ({
      currentProject: {
        ...state.currentProject,
        bgmSuggestions: loadingUpdated
      }
    }));

    try {
      const systemPrompt = `Nhiệm vụ của bạn là tạo một prompt mô tả âm nhạc bằng tiếng Anh ngắn gọn dạng từ khóa (tag) cách nhau bởi dấu phẩy, dành cho Suno AI tạo nhạc nền.
Yêu cầu:
- Viết 100% bằng tiếng Anh.
- Chỉ bao gồm các tag từ khóa ngắn gọn, không viết thành câu dài.
- Ví dụ đúng: "melancholic piano, cinematic strings, slow tempo, ambient, emotional, cinematic drama"
- Trả về CHỈ duy nhất chuỗi tag từ khóa này, không có thêm ký tự giải thích hay định dạng gì khác.`;

      const prompt = `Hãy tạo một Suno AI BGM prompt dựa trên các thông số sau:
- Thể loại chính (Genre): ${target.genre}
- Nhạc cụ chính (Instrument): ${target.instrument}
- Tâm trạng/Tông nhạc (Tone): ${target.tone}
- Mô tả bối cảnh/Mục đích sử dụng: ${target.description}`;

      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: active.id,
          type: 'bgm_prompt_regenerate',
          label: `Tạo lại prompt BGM ${target.title}`,
          provider,
          apiKey,
          modelName,
          prompt,
          systemPrompt,
          responseFormat: 'text'
        })
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const resJson = await res.json();
      const newPrompt = resJson.text.trim().replace(/^["']|["']$/g, ''); // strip optional quotes

      const finalUpdated = bgmSuggestions.map((row) => {
        if (row.id === bgmId) {
          return { ...row, sunoPrompt: newPrompt };
        }
        return row;
      });

      set((state) => ({
        currentProject: {
          ...state.currentProject,
          bgmSuggestions: finalUpdated
        }
      }));
      await get().saveCurrentProject();
    } catch (err: any) {
      console.error('Failed to regenerate prompt:', err);
      // Revert loading status
      const reverted = bgmSuggestions.map((row) => {
        if (row.id === bgmId) {
          return { ...row, sunoPrompt: originalPrompt };
        }
        return row;
      });
      set((state) => ({
        currentProject: {
          ...state.currentProject,
          bgmSuggestions: reverted
        }
      }));
      throw err;
    }
  },

  scanLocalBgmFiles: async () => {
    const active = get().currentProject;
    if (!active.id || !active.videoSaveDir) return;

    try {
      const sep = active.videoSaveDir.includes('/') ? '/' : '\\';
      const bgmDir = `${active.videoSaveDir.replace(/[\\/]+$/, '')}${sep}bgm`;

      const res = await fetch(`/api/video/select-directory?path=${encodeURIComponent(bgmDir)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.files)) {
          const files = data.files.map((f: any) => ({
            name: f.name,
            path: f.path,
            duration: f.duration || 0
          }));

          set({ bgmFiles: files });

          // Auto-pair suggested BGM segments with local files if they are not selected yet
          const audioExtensions = ['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac', '.mp4'];
          const audioFiles = files
            .filter((f: any) => audioExtensions.some((ext) => f.name.toLowerCase().endsWith(ext)))
            .sort((a: any, b: any) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

          const bgmSuggestions = active.bgmSuggestions || [];
          let updated = false;

          const newSuggestions = bgmSuggestions.map((s, idx) => {
            if (!s.audioFile) {
              // 1. Try sequential mapping first based on alphabetical/numerical sorted order
              if (audioFiles[idx]) {
                updated = true;
                return { ...s, audioFile: audioFiles[idx].name };
              }

              // 2. Fallback: Try pattern matching if sequential is not available
              const idxStr = String(idx + 1);
              const targetMatch = files.find((f: any) => {
                const fname = f.name.toLowerCase();
                return fname.includes(`bgm_${idxStr}`) || 
                       fname.includes(`bgm${idxStr}`) || 
                       fname.includes(`_${idxStr}.`) || 
                       fname.startsWith(`${idxStr}.`) ||
                       fname.startsWith(`${idxStr}_`) ||
                       fname.includes(s.id.toLowerCase());
              });

              if (targetMatch) {
                updated = true;
                return { ...s, audioFile: targetMatch.name };
              }
            }
            return s;
          });

          if (updated) {
            set((state) => ({
              currentProject: {
                ...state.currentProject,
                bgmSuggestions: newSuggestions
              }
            }));
            await get().saveCurrentProject();
          }
        }
      }
    } catch (err) {
      console.error('Failed to scan local BGM files:', err);
    }
  }
}));
