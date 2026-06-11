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
