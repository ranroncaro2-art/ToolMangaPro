import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded or invalid file format' }, { status: 400 });
    }

    // Forward the file to the Python server
    const googleApiUrl = formData.get('googleApiUrl');
    const baseUrl = googleApiUrl ? String(googleApiUrl).replace(/\/+$/, '') : 'http://127.0.0.1:5000';
    const targetUrl = `${baseUrl}/api/upload_image`;
    const uploadFormData = new FormData();
    uploadFormData.append('file', file);

    const response = await fetch(targetUrl, {
      method: 'POST',
      body: uploadFormData
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ error: errText || `API error ${response.status}` }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 555 });
  }
}
