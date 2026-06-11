import { NextResponse } from 'next/server';
import { cleanErrorMessage } from '../../../../lib/utils';

interface QueueItem {
  id: string;
  projectId: string;
  stt: number;
  assetType: string;
  assetId: string;
  payload: any;
  concurrency: number;
  resolve: (value: any) => void;
  reject: (reason: any) => void;
}

interface LogItem {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'error';
  projectId: string;
  message: string;
}

const queue: QueueItem[] = [];
const activeItems: Array<{ id: string; projectId: string; stt: number; assetType: string; assetId: string; startTime: string }> = [];
const systemLogs: LogItem[] = [];
let activeCount = 0;

function addLog(type: 'info' | 'success' | 'error', projectId: string, message: string) {
  const log: LogItem = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    timestamp: new Date().toLocaleTimeString(),
    type,
    projectId,
    message
  };
  systemLogs.push(log);
  if (systemLogs.length > 200) {
    systemLogs.shift();
  }
}

async function processQueue() {
  if (queue.length === 0) return;

  // Sort the queue:
  // 1. By projectId (alphabetically)
  // 2. By stt (numerical order)
  queue.sort((a, b) => {
    if (a.projectId !== b.projectId) {
      return a.projectId.localeCompare(b.projectId);
    }
    return a.stt - b.stt;
  });

  while (queue.length > 0) {
    // Determine if there is an active project currently running items
    const activeProjectId = activeItems.length > 0 ? activeItems[0].projectId : null;
    let targetIndex = -1;

    if (activeProjectId === null) {
      targetIndex = 0;
    } else {
      targetIndex = queue.findIndex(item => item.projectId === activeProjectId);
    }

    if (targetIndex === -1) {
      break;
    }

    const nextItem = queue[targetIndex];
    const itemConcurrency = nextItem.concurrency || 1;

    if (activeCount >= itemConcurrency) {
      break;
    }

    // Remove the item from queue
    queue.splice(targetIndex, 1);

    activeCount++;
    runItem(nextItem).finally(() => {
      activeCount--;
      processQueue().catch((err) => console.error('Error running video queue:', err));
    });
  }
}

async function runItem(item: QueueItem) {
  const { id, projectId, stt, assetType, assetId, payload, resolve, reject } = item;
  
  activeItems.push({
    id,
    projectId,
    stt,
    assetType,
    assetId,
    startTime: new Date().toLocaleTimeString()
  });
  
  addLog('info', projectId, `Bắt đầu tạo Video: "${assetId}" (STT: ${stt})`);

  try {
    const { googleApiUrl, ...generatorPayload } = payload;
    const baseUrl = googleApiUrl ? String(googleApiUrl).replace(/\/+$/, '') : 'http://127.0.0.1:5000';
    const targetUrl = `${baseUrl}/api/generate_video`;

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(generatorPayload)
    });

    // Remove from activeItems
    const idx = activeItems.findIndex(x => x.id === id);
    if (idx !== -1) activeItems.splice(idx, 1);

    if (!response.ok) {
      const errorText = await response.text();
      const rawMsg = errorText || `API returned status ${response.status}`;
      const errMsg = cleanErrorMessage(rawMsg);
      addLog('error', projectId, `Tạo Video thất bại: "${assetId}" - Lỗi: ${errMsg}`);
      reject(new Error(errMsg));
      return;
    }

    const data = await response.json();
    addLog('success', projectId, `Tạo Video thành công: "${assetId}"`);
    resolve(data);
  } catch (err: any) {
    // Remove from activeItems
    const idx = activeItems.findIndex(x => x.id === id);
    if (idx !== -1) activeItems.splice(idx, 1);
    
    const errMsg = cleanErrorMessage(err.message);
    addLog('error', projectId, `Tạo Video thất bại: "${assetId}" - Lỗi: ${errMsg}`);
    reject(new Error(errMsg));
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  let filteredQueue = queue;
  let filteredActive = activeItems;
  let filteredLogs = systemLogs;

  if (projectId) {
    filteredQueue = queue.filter(item => item.projectId === projectId);
    filteredActive = activeItems.filter(item => item.projectId === projectId);
    filteredLogs = systemLogs.filter(log => log.projectId === projectId);
  }

  return NextResponse.json({
    queue: filteredQueue.map(item => ({
      id: item.id,
      projectId: item.projectId,
      stt: item.stt,
      assetType: item.assetType,
      assetId: item.assetId
    })),
    active: filteredActive,
    logs: filteredLogs
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { projectId, stt, concurrency, assetType = 'video', assetId = `Video #${stt}`, ...generatorPayload } = body;

    const itemId = `video_item_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    addLog('info', String(projectId || ''), `Đã thêm vào hàng chờ tạo Video: "${assetId}" (STT: ${stt})`);

    const data = await new Promise((resolve, reject) => {
      queue.push({
        id: itemId,
        projectId: String(projectId || ''),
        stt: Number(stt || 0),
        assetType: String(assetType),
        assetId: String(assetId),
        concurrency: concurrency ? Number(concurrency) : 1,
        payload: {
          ...generatorPayload,
          projectId: String(projectId || ''),
          stt: Number(stt || 0),
          assetType: String(assetType),
          assetId: String(assetId)
        },
        resolve,
        reject
      });

      processQueue().catch((err) => console.error('Error running video queue:', err));
    });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
