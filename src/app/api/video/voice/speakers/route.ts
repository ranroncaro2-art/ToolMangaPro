import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const engineUrl = searchParams.get('engineUrl') || 'http://127.0.0.1:50021';
    
    // Normalize url
    const normalizedUrl = engineUrl.replace(/\/+$/, '');
    const targetUrl = `${normalizedUrl}/speakers`;

    const res = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Local engine returned status ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json({ success: true, speakers: data });
  } catch (err: any) {
    return NextResponse.json({ 
      success: false, 
      error: `Không thể kết nối đến Aivis Speech / VoiceVox tại địa chỉ này. Hãy chắc chắn rằng bạn đã mở ứng dụng và bật Server API. Chi tiết: ${err.message}` 
    }, { status: 500 });
  }
}
