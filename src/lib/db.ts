export interface Project {
  id: string;
  name: string;
  createdAt: string;
  provider: string;
  modelName: string;
  srtContent: string;
  srtMeta: {
    lineCount: number;
    duration: string;
  };
  sceneMapping: SceneMappingRow[];
  imagePrompts: ImagePromptRow[];
  characters?: CharacterReference[];
  exteriors?: ExteriorReference[];
  props?: PropReference[];
  selectedStyleId?: string;
  selectedGenreId?: string;
  videoSaveDir?: string;
  autoDownloadVideo?: boolean;
  bgmSuggestions?: BgmSuggestionRow[];
  bgmVolumeDb?: number;
  scriptContent?: string;
  hookSegments?: number[];
}

export interface BgmSuggestionRow {
  id: string;
  title: string;
  timeRange: string;
  description: string;
  genre: string;
  instrument: string;
  tone: string;
  sunoPrompt: string;
  audioFile?: string;
}

export interface SceneMappingRow {
  stt: number;
  subtitleRange: string;
  timeRange: string;
  characters: string;
  props?: string;
  mainSituation: string;
  mainEmotion: string;
  sceneDescription: string;
}

export interface ImagePromptRow {
  stt: number;
  characters: string;
  props?: string;
  description: string;
  exterior: string;
  motion: string;
  imageUrl?: string;
  mediaId?: string;
  accountId?: string;
  videoUrl?: string;
    characterOverrides?: Record<string, { image: string; mediaId?: string; accountId?: string; mediaIdsByAccount?: Record<string, string> }>;
    exteriorOverride?: { image: string; mediaId?: string; accountId?: string; mediaIdsByAccount?: Record<string, string> };
  mediaIdsByAccount?: Record<string, string>;
}

export interface CharacterReference {
  characterId: string;
  image: string; // base64 DataURL or URL
  age?: string;
  gender?: string;
  personality?: string;
  role?: string;
  prompt?: string;
  mediaId?: string;
  accountId?: string;
  inputImage?: string;
  inputMediaId?: string;
    inputAccountId?: string;
  mediaIdsByAccount?: Record<string, string>;
}

export interface ExteriorReference {
  exteriorId: string;
  image: string; // base64 DataURL or URL
  prompt?: string;
  mediaId?: string;
  accountId?: string;
  inputImage?: string;
  inputMediaId?: string;
    inputAccountId?: string;
  mediaIdsByAccount?: Record<string, string>;
}

export interface PropReference {
  propId: string;
  image: string; // base64 DataURL or URL
  prompt?: string;
  mediaId?: string;
  accountId?: string;
  inputImage?: string;
  inputMediaId?: string;
    inputAccountId?: string;
  mediaIdsByAccount?: Record<string, string>;
}

const DB_NAME = 'MangaStoryboardDB';
const DB_VERSION = 1;

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('IndexedDB is only available in the browser'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('characters')) {
        db.createObjectStore('characters', { keyPath: 'characterId' });
      }
      if (!db.objectStoreNames.contains('exteriors')) {
        db.createObjectStore('exteriors', { keyPath: 'exteriorId' });
      }
      if (!db.objectStoreNames.contains('props')) {
        db.createObjectStore('props', { keyPath: 'propId' });
      }
    };
  });
}

// Projects operations
export async function saveProject(project: Project): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('projects', 'readwrite');
    const store = transaction.objectStore('projects');
    const request = store.put(project);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getProject(id: string): Promise<Project | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('projects', 'readonly');
    const store = transaction.objectStore('projects');
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('projects', 'readwrite');
    const store = transaction.objectStore('projects');
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function listProjects(): Promise<Project[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('projects', 'readonly');
    const store = transaction.objectStore('projects');
    const request = store.getAll();

    request.onsuccess = () => {
      // Sort projects by date descending (newest first)
      const list = request.result || [];
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      resolve(list);
    };
    request.onerror = () => reject(request.error);
  });
}

// Characters operations
export async function saveCharacter(char: CharacterReference): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('characters', 'readwrite');
    const store = transaction.objectStore('characters');
    const request = store.put(char);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteCharacter(characterId: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('characters', 'readwrite');
    const store = transaction.objectStore('characters');
    const request = store.delete(characterId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function listCharacters(): Promise<CharacterReference[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('characters', 'readonly');
    const store = transaction.objectStore('characters');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

// Exteriors operations
export async function saveExterior(ext: ExteriorReference): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('exteriors', 'readwrite');
    const store = transaction.objectStore('exteriors');
    const request = store.put(ext);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteExterior(exteriorId: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('exteriors', 'readwrite');
    const store = transaction.objectStore('exteriors');
    const request = store.delete(exteriorId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function listExteriors(): Promise<ExteriorReference[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('exteriors', 'readonly');
    const store = transaction.objectStore('exteriors');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

// Props operations
export async function saveProp(prop: PropReference): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('props', 'readwrite');
    const store = transaction.objectStore('props');
    const request = store.put(prop);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteProp(propId: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('props', 'readwrite');
    const store = transaction.objectStore('props');
    const request = store.delete(propId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function listProps(): Promise<PropReference[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('props', 'readonly');
    const store = transaction.objectStore('props');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

