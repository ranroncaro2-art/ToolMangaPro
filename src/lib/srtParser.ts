export interface SubtitleBlock {
  id: number;
  timeRange: string;
  startTime: string;
  endTime: string;
  text: string;
}

export interface SRTParseResult {
  blocks: SubtitleBlock[];
  lineCount: number;
  duration: string; // HH:MM:SS or MM:SS format
}

export function parseSRT(srtContent: string): SRTParseResult {
  const blocks: SubtitleBlock[] = [];
  if (!srtContent) {
    return { blocks: [], lineCount: 0, duration: '00:00:00' };
  }

  // Normalize all line endings (\r\n and \r) to \n
  // And replace any line containing only spaces/whitespace with a clean empty line
  const normalized = srtContent
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t\r]*\n/g, '\n\n');

  const rawBlocks = normalized.split(/\n\n+/);

  for (const blockText of rawBlocks) {
    const lines = blockText.trim().split('\n');
    if (lines.length < 2) continue;

    // Line 1: Sequence Number
    const id = parseInt(lines[0].trim(), 10);
    if (isNaN(id)) continue;

    // Line 2: Timecode Range (e.g. 00:00:01,000 --> 00:00:04,000)
    const timecodeLine = lines[1].trim();
    if (!timecodeLine.includes('-->')) continue;

    const [startTime, endTime] = timecodeLine.split('-->').map(t => t.trim());
    if (!startTime || !endTime) continue;

    // Lines 3+: Text
    const text = lines.slice(2).join(' ').trim();

    blocks.push({
      id,
      timeRange: timecodeLine,
      startTime,
      endTime,
      text
    });
  }

  // Get total duration (from the last block's end time)
  let duration = '00:00:00';
  if (blocks.length > 0) {
    const lastBlock = blocks[blocks.length - 1];
    // Remove millisecond part for simpler display (e.g., "00:01:23,450" -> "00:01:23")
    const match = lastBlock.endTime.match(/^(\d{2}:\d{2}:\d{2})/);
    if (match) {
      duration = match[1];
    } else {
      duration = lastBlock.endTime.split(',')[0];
    }
  }

  return {
    blocks,
    lineCount: blocks.length,
    duration
  };
}

export function extractCoreText(line: string): string {
  // 1. Check if there is a colon (half-width or full-width) separating character name
  const colonIndex = line.indexOf(':') !== -1 ? line.indexOf(':') : line.indexOf('：');
  let dialogue = line;
  if (colonIndex !== -1) {
    dialogue = line.substring(colonIndex + 1);
  }
  
  // 2. Remove nuance blocks in curly braces (both half-width and full-width)
  dialogue = dialogue
    .replace(/\{[^{}]*\}/g, '')
    .replace(/｛[^｛｝]*｝/g, '');
    
  // 3. Strip brackets and quotes (Japanese and English)
  dialogue = dialogue.replace(/^[「『（\("'\s\[［]+|[」』）\)"'\s\]］]+$/g, '');
  
  // 4. Remove all whitespace and common punctuation for clean comparison
  return dialogue
    .replace(/[\s\r\n\t]/g, '')
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()\"'「」『』（）｛｝\[\]［］。、？！\?\!]/g, '')
    .toLowerCase();
}

export function computeOverlap(str1: string, str2: string): number {
  const set1 = new Set(str1.split(''));
  const set2 = new Set(str2.split(''));
  let intersection = 0;
  for (const char of set1) {
    if (set2.has(char)) {
      intersection++;
    }
  }
  const minLen = Math.min(str1.length, str2.length);
  if (minLen === 0) return 0;
  return intersection / minLen;
}

export function matchScriptWithSrt(scriptContent: string, srtContent: string): string {
  const parseResult = parseSRT(srtContent);
  const blocks = parseResult.blocks;
  if (blocks.length === 0) return srtContent;

  const scriptLines = scriptContent
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (scriptLines.length !== blocks.length) {
    throw new Error(`Số dòng kịch bản (${scriptLines.length}) khác số phân cảnh phụ đề (${blocks.length})`);
  }

  const updatedBlocks = blocks.map((block, i) => {
    const matchedLine = scriptLines[i];
    // Remove nuance blocks in curly braces (both half-width and full-width)
    const cleanedLine = matchedLine
      .replace(/\{[^{}]*\}/g, '')
      .replace(/｛[^｛｝]*｝/g, '')
      .replace(/ +/g, ' ')
      .trim();
    return {
      ...block,
      text: cleanedLine
    };
  });

  // Re-serialize the blocks back to SRT string format
  return updatedBlocks.map((block) => {
    return `${block.id}\n${block.timeRange}\n${block.text}`;
  }).join('\n\n');
}

