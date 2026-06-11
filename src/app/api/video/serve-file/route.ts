import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('path');

    if (!filePath) {
      console.log('[ServeFile] Missing path parameter');
      return new Response('Thiếu tham số path', { status: 400 });
    }

    const resolvedPath = path.resolve(filePath);
    console.log(`[ServeFile] Request: "${filePath}" -> Resolved: "${resolvedPath}"`);
    if (!fs.existsSync(resolvedPath)) {
      console.log(`[ServeFile] File does not exist: "${resolvedPath}"`);
      return new Response('Tệp không tồn tại', { status: 404 });
    }
    if (!fs.statSync(resolvedPath).isFile()) {
      console.log(`[ServeFile] Not a file: "${resolvedPath}"`);
      return new Response('Đường dẫn không phải là tệp', { status: 404 });
    }

    const stats = fs.statSync(resolvedPath);
    const fileSize = stats.size;
    const range = request.headers.get('range');

    // Determine content type
    let contentType = 'application/octet-stream';
    const ext = path.extname(resolvedPath).toLowerCase();
    if (ext === '.mp3') contentType = 'audio/mpeg';
    else if (ext === '.wav') contentType = 'audio/wav';
    else if (ext === '.m4a') contentType = 'audio/mp4';
    else if (ext === '.ogg') contentType = 'audio/ogg';
    else if (ext === '.aac') contentType = 'audio/aac';
    else if (ext === '.flac') contentType = 'audio/flac';
    else if (ext === '.mp4') contentType = 'video/mp4';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.webp') contentType = 'image/webp';

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      const fileStream = fs.createReadStream(resolvedPath, { start, end });

      return new Response(fileStream as any, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize.toString(),
          'Content-Type': contentType,
          'Cache-Control': 'no-cache'
        }
      });
    } else {
      const fileStream = fs.createReadStream(resolvedPath);

      return new Response(fileStream as any, {
        headers: {
          'Content-Length': fileSize.toString(),
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=31536000, immutable'
        }
      });
    }
  } catch (err: any) {
    console.error('Serve file route error:', err);
    return new Response(err.message, { status: 500 });
  }
}
