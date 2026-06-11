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
