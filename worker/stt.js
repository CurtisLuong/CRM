const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const MIME_TYPES = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac']);

/** Transcribe one short, in-memory recording. No bucket or database is used. */
export async function handleStt(request, env, requireUser) {
  const denied = await requireUser(request, env);
  if (denied) return denied;
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > MAX_AUDIO_BYTES) return json({ error: 'Bản ghi quá lớn (tối đa 8 MB).' }, 413);
  const mime = String(request.headers.get('Content-Type') || '').split(';')[0].toLowerCase();
  if (!MIME_TYPES.has(mime)) return json({ error: 'Định dạng audio không được hỗ trợ.' }, 415);
  if (!env.GEMINI_API_KEY) return json({ error: 'Worker chưa cấu hình dịch vụ nhận dạng giọng nói.' }, 503);

  const audioRead = await readBoundedAudio(request);
  if (audioRead.error) return json({ error: audioRead.error }, audioRead.status);
  const bytes = audioRead.bytes;
  const base64 = bytesToBase64(bytes);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        model: 'gemini-3.5-transcribe',
        store: false,
        input: [{ type: 'audio', data: base64, mime_type: mime }],
        generation_config: { transcription_config: { language_codes: ['vi-VN'], mode: 'verbatim' } },
      }),
      signal: controller.signal,
    });
    if (!response.ok) return json({ error: response.status >= 500 ? 'Dịch vụ nhận dạng đang bận. Thử lại sau.' : 'Không nhận dạng được audio.' }, response.status >= 500 ? 502 : 422);
    const result = await response.json();
    const transcript = (typeof result.output_text === 'string' ? result.output_text : extractText(result)).trim().slice(0, 4000);
    if (!transcript) return json({ error: 'Không nghe rõ nội dung. Thử ghi âm lại.' }, 422);
    return json({ transcript });
  } catch (error) {
    if (error?.name === 'AbortError') return json({ error: 'Nhận dạng quá thời gian. Thử ghi âm ngắn hơn.' }, 504);
    return json({ error: 'Không kết nối được dịch vụ nhận dạng.' }, 502);
  } finally {
    clearTimeout(timer);
    bytes.fill(0);
  }
}

async function readBoundedAudio(request) {
  const reader = request.body?.getReader();
  if (!reader) return { error: 'Thiếu audio.', status: 400 };
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_AUDIO_BYTES) {
        await reader.cancel();
        chunks.forEach((chunk) => chunk.fill(0));
        return { error: 'Bản ghi phải từ 1 byte đến 8 MB.', status: 413 };
      }
      chunks.push(value);
    }
  } catch {
    chunks.forEach((chunk) => chunk.fill(0));
    return { error: 'Audio không hợp lệ.', status: 400 };
  }
  if (!total) return { error: 'Audio trống.', status: 400 };
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
    chunk.fill(0);
  }
  return { bytes };
}

function extractText(result) {
  return (result?.steps || [])
    .filter((step) => step?.type === 'model_output')
    .flatMap((step) => step.content || [])
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n');
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
