import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
  try {
    const { url, saveDir, fileName } = await req.json();

    if (!url || !saveDir || !fileName) {
      return NextResponse.json({ error: 'Missing url, saveDir, or fileName' }, { status: 400 });
    }

    // Resolve home directory (e.g. support ~/Downloads format if needed, though absolute paths are preferred)
    let resolvedSaveDir = saveDir;
    if (saveDir.startsWith('~/')) {
      const homedir = process.env.HOME || process.env.USERPROFILE || '';
      resolvedSaveDir = path.join(homedir, saveDir.slice(2));
    }

    // Ensure save directory exists
    if (!fs.existsSync(resolvedSaveDir)) {
      fs.mkdirSync(resolvedSaveDir, { recursive: true });
    }

    // Fetch the video file
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch video file from url: ${url}. Status: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const targetPath = path.join(resolvedSaveDir, fileName);
    fs.writeFileSync(targetPath, Buffer.from(buffer));

    return NextResponse.json({ success: true, path: targetPath });
  } catch (err: any) {
    console.error('Download video route error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
