import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { token, branch = 'main' } = await req.json();

    const repoOwner = 'ranroncaro2-art';
    const repoName = 'ToolMangaPro';
    const downloadUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/zipball/${branch}`;
    
    const headers: Record<string, string> = {
      'User-Agent': 'ToolMangaPro-Updater',
      'Accept': 'application/vnd.github+json',
    };
    if (token && token.trim() !== '') {
      headers['Authorization'] = `token ${token.trim()}`;
    }

    console.log(`[Updater] Downloading update from branch: ${branch}...`);
    const response = await fetch(downloadUrl, { headers });
    if (!response.ok) {
      return NextResponse.json({ 
        success: false, 
        error: `GitHub API error: ${response.status} ${response.statusText}. Vui lòng kiểm tra lại Token hoặc quyền truy cập repository.` 
      }, { status: response.status });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const workspacePath = process.cwd();
    const zipPath = path.join(workspacePath, 'temp_update.zip');
    const extractedPath = path.join(workspacePath, 'temp_update_extracted');

    // Clean any remnants
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    if (fs.existsSync(extractedPath)) {
      fs.rmSync(extractedPath, { recursive: true, force: true });
    }

    fs.writeFileSync(zipPath, buffer);
    console.log(`[Updater] Saved temporary zip file to: ${zipPath}`);

    // Extract archive using PowerShell
    console.log('[Updater] Extracting update archive...');
    execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractedPath}' -Force"`);

    const dirs = fs.readdirSync(extractedPath).filter(file => {
      return fs.statSync(path.join(extractedPath, file)).isDirectory();
    });

    if (dirs.length === 0) {
      return NextResponse.json({ success: false, error: 'Giải nén thất bại: Không tìm thấy thư mục chứa mã nguồn trong file ZIP.' }, { status: 500 });
    }

    const repoSourcePath = path.join(extractedPath, dirs[0]);
    console.log(`[Updater] Copying files from: ${repoSourcePath} to workspace: ${workspacePath}`);

    // Recursive copy function excluding build outputs, node_modules, .git and temporary files
    const copyRecursiveSync = (src: string, dest: string) => {
      const exists = fs.existsSync(src);
      if (!exists) return;
      const stats = fs.statSync(src);
      const isDirectory = stats.isDirectory();
      if (isDirectory) {
        if (!fs.existsSync(dest)) {
          fs.mkdirSync(dest, { recursive: true });
        }
        fs.readdirSync(src).forEach(childItemName => {
          if (
            childItemName === '.git' ||
            childItemName === 'node_modules' ||
            childItemName === '.next' ||
            childItemName === 'dist' ||
            childItemName === 'temp_update.zip' ||
            childItemName === 'temp_update_extracted' ||
            childItemName === '.env' ||
            childItemName === '.env.local'
          ) {
            return;
          }
          copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
        });
      } else {
        fs.copyFileSync(src, dest);
      }
    };

    copyRecursiveSync(repoSourcePath, workspacePath);
    console.log('[Updater] Files copied successfully.');

    // Cleanup temp files
    try {
      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
      if (fs.existsSync(extractedPath)) {
        fs.rmSync(extractedPath, { recursive: true, force: true });
      }
      console.log('[Updater] Cleaned up temporary update files.');
    } catch (cleanupErr) {
      console.warn('[Updater] Failed to clean up temp files:', cleanupErr);
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Cập nhật thành công! Hệ thống đã được sao chép đè các tệp mới. Vui lòng tắt và khởi động lại ứng dụng.' 
    });

  } catch (err: any) {
    console.error('[Updater API] Error running update:', err);
    return NextResponse.json({ success: false, error: err.message || err }, { status: 500 });
  }
}
