import { SceneMappingRow, ImagePromptRow } from '../db';

export interface AIConfig {
  provider: 'openai' | 'gemini' | 'claude';
  apiKey: string;
  modelName: string;
  projectId?: string;
  type?: 'mapping' | 'prompts' | 'general' | string;
  label?: string;
  googleApiUrl?: string;
  signal?: AbortSignal;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface AIResponse<T> {
  data: T;
  usage: TokenUsage;
}

export interface AIProvider {
  generateSceneMappingIncremental(
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
  }>>;

  generateImagePromptsContextual(
    scenes: SceneMappingRow[],
    characterRefs: any[],
    exteriorRefs: any[],
    propRefs: any[],
    promptTemplate: string,
    config: AIConfig
  ): Promise<AIResponse<ImagePromptRow[]>>;
}
