import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image, type, id, imageType, videoSaveDir } = body;

    if (!image || !type || !id || !imageType || !videoSaveDir) {
      return NextResponse.json({ error: 'Thiếu các tham số bắt buộc' }, { status: 400 });
    }

    const resolvedSaveDir = path.resolve(videoSaveDir);
    if (!fs.existsSync(resolvedSaveDir)) {
      fs.mkdirSync(resolvedSaveDir, { recursive: true });
    }

    const referencesDir = path.join(resolvedSaveDir, 'references');
    if (!fs.existsSync(referencesDir)) {
      fs.mkdirSync(referencesDir, { recursive: true });
    }

    // Sanitize ID to prevent directory traversal and remove characters invalid in Windows filenames (< > : " / \ | ? *)
    const safeId = String(id).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
    const filename = `${type}_${safeId}_${imageType}.png`;
    const targetFilePath = path.join(referencesDir, filename);

    // Save image to file
    if (image.startsWith('data:image')) {
      // Decode Base64 data URI
      const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        return NextResponse.json({ error: 'Định dạng ảnh Base64 không hợp lệ' }, { status: 400 });
      }
      const buffer = Buffer.from(matches[2], 'base64');
      fs.writeFileSync(targetFilePath, buffer);
    } else if (image.startsWith('http://') || image.startsWith('https://')) {
      // Download remote image (like Midjourney discord link)
      const res = await fetch(image);
      if (!res.ok) {
        throw new Error(`Không thể tải ảnh từ URL: ${image}`);
      }
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      fs.writeFileSync(targetFilePath, buffer);
    } else if (fs.existsSync(image)) {
      // Copy existing local file
      if (path.resolve(image) !== path.resolve(targetFilePath)) {
        fs.copyFileSync(image, targetFilePath);
      }
    } else {
      // Check if it's already a relative serve-file path in the same location, if so, nothing to do
      if (image.includes('/api/video/serve-file')) {
        return NextResponse.json({
          success: true,
          localPath: targetFilePath,
          localUrl: image
        });
      }
      return NextResponse.json({ error: 'Định dạng hình ảnh không được hỗ trợ' }, { status: 400 });
    }

    const localUrl = `/api/video/serve-file?path=${encodeURIComponent(targetFilePath)}`;

    return NextResponse.json({
      success: true,
      localPath: targetFilePath,
      localUrl
    });
  } catch (err: any) {
    console.error('[SaveReference API] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
