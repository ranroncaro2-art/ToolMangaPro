import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

function getAudioDurationNode(filePath: string): number {
  try {
    const cmd = `ffmpeg -i "${filePath}"`;
    execSync(cmd, { stdio: 'pipe' });
  } catch (e: any) {
    const stderr = e.stderr?.toString() || '';
    const match = stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}\.\d+)/) || stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})/);
    if (match) {
      const hours = parseInt(match[1], 10);
      const mins = parseInt(match[2], 10);
      const secs = parseFloat(match[3]);
      return hours * 3600 + mins * 60 + secs;
    }
  }
  return 5.0; // fallback
}

// GET: List directories in a given path, along with common shortcuts & drives
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let targetPath = searchParams.get('path');

    const homeDir = process.env.USERPROFILE || process.env.HOME || 'C:\\';
    const projectDir = process.cwd();

    // Determine default shortcuts
    const shortcuts = [
      { name: 'Thư mục dự án', path: projectDir },
      { name: 'Thư mục cá nhân', path: homeDir },
    ];

    // List Windows drives
    for (let i = 67; i <= 90; i++) { // C to Z
      const drivePath = String.fromCharCode(i) + ':\\';
      try {
        if (fs.existsSync(drivePath)) {
          shortcuts.push({ name: `Ổ đĩa ${String.fromCharCode(i)}:`, path: drivePath });
        }
      } catch (e) {}
    }

    if (!targetPath) {
      targetPath = homeDir;
    }

    // Resolve path to handle absolute/relative formats
    targetPath = path.resolve(targetPath);

    if (!fs.existsSync(targetPath)) {
      return NextResponse.json({ 
        success: false, 
        message: 'Thư mục không tồn tại',
        currentPath: targetPath,
        parentPath: path.dirname(targetPath),
        folders: [],
        shortcuts 
      });
    }

    const stat = fs.statSync(targetPath);
    if (!stat.isDirectory()) {
      return NextResponse.json({ 
        success: false, 
        message: 'Đường dẫn không phải là thư mục',
        currentPath: targetPath,
        parentPath: path.dirname(targetPath),
        folders: [],
        shortcuts 
      });
    }

    const items = fs.readdirSync(targetPath, { withFileTypes: true });
    const folders: any[] = [];
    const files: any[] = [];

    items.forEach(item => {
      try {
        if (item.name.startsWith('.')) return;
        if (item.isDirectory()) {
          folders.push({
            name: item.name,
            path: path.join(targetPath, item.name)
          });
        } else if (item.isFile()) {
          const filePath = path.join(targetPath, item.name);
          const ext = path.extname(item.name).toLowerCase();
          const audioExts = ['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.flac'];
          let duration = 0;
          if (audioExts.includes(ext)) {
            duration = getAudioDurationNode(filePath);
          }
          files.push({
            name: item.name,
            path: filePath,
            duration
          });
        }
      } catch {}
    });

    folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    const parentPath = path.dirname(targetPath);

    return NextResponse.json({
      success: true,
      currentPath: targetPath,
      parentPath: parentPath === targetPath ? null : parentPath, // Root level check
      folders,
      files,
      shortcuts
    });
  } catch (err: any) {
    console.error('Failed to list directory:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Select a path, ensure it exists, and create 'images' and 'videos' subdirectories
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const selectedPath = body.path;

    if (!selectedPath) {
      return NextResponse.json({ error: 'Thiếu đường dẫn thư mục' }, { status: 400 });
    }

    // Resolve path
    const resolvedPath = path.resolve(selectedPath);

    // Create directory if it does not exist
    if (!fs.existsSync(resolvedPath)) {
      fs.mkdirSync(resolvedPath, { recursive: true });
    }

    // Automatically create images, videos, voice, and bgm directories
    const imagesDir = path.join(resolvedPath, 'images');
    const videosDir = path.join(resolvedPath, 'videos');
    const voiceDir = path.join(resolvedPath, 'voice');
    const bgmDir = path.join(resolvedPath, 'bgm');
    
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }
    if (!fs.existsSync(videosDir)) {
      fs.mkdirSync(videosDir, { recursive: true });
    }
    if (!fs.existsSync(voiceDir)) {
      fs.mkdirSync(voiceDir, { recursive: true });
    }
    if (!fs.existsSync(bgmDir)) {
      fs.mkdirSync(bgmDir, { recursive: true });
    }

    return NextResponse.json({ success: true, path: resolvedPath });
  } catch (err: any) {
    console.error('Failed to handle select-directory POST:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
