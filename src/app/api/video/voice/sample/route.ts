import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const speakerId = searchParams.get('speakerId');
    const engineUrl = searchParams.get('engineUrl') || 'http://127.0.0.1:50021';

    if (!speakerId) {
      return NextResponse.json({ success: false, error: 'Thiếu speakerId' }, { status: 400 });
    }

    let finalSpeakerId = speakerId;
    let finalEngineUrl = engineUrl;

    if (speakerId.includes('|')) {
      const parts = speakerId.split('|');
      finalEngineUrl = parts[0];
      finalSpeakerId = parts[1];
    }

    const normalizedEngineUrl = finalEngineUrl.replace(/\/+$/, '');

    // Short Japanese greeting sentence for testing
    const text = "はじめまして、よろしくお願いいたします。";

    // 1. Get audio query parameters
    const queryUrl = `${normalizedEngineUrl}/audio_query?text=${encodeURIComponent(text)}&speaker=${finalSpeakerId}`;
    const queryRes = await fetch(queryUrl, { method: 'POST' });
    if (!queryRes.ok) {
      const errText = await queryRes.text();
      throw new Error(`Failed to create audio query: ${errText || queryRes.statusText}`);
    }
    
    const queryJson = await queryRes.json();

    // 2. Synthesize audio
    const synthesisUrl = `${normalizedEngineUrl}/synthesis?speaker=${finalSpeakerId}`;
    const synthesisRes = await fetch(synthesisUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'audio/wav',
      },
      body: JSON.stringify(queryJson),
    });

    if (!synthesisRes.ok) {
      const errText = await synthesisRes.text();
      throw new Error(`Failed to synthesize audio: ${errText || synthesisRes.statusText}`);
    }

    const arrayBuffer = await synthesisRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return new Response(buffer, {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ 
      success: false, 
      error: `Không thể nghe thử giọng nói. Chi tiết: ${err.message}` 
    }, { status: 500 });
  }
}
