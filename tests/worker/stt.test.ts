import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error Worker source stays JavaScript to match intake-worker.js.
import { handleStt } from '../../worker/stt.js';

afterEach(() => vi.restoreAllMocks());

function audioRequest(mime: string) {
  return new Request('https://worker.example/stt', {
    method: 'POST',
    headers: { 'Content-Type': mime },
    body: 'voice bytes',
  });
}

describe('POST /stt handler', () => {
  it('authenticates before reading audio', async () => {
    const requireUser = vi.fn(async () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }));
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const response = await handleStt(new Request('https://worker.example/stt', { method: 'POST' }), {}, requireUser);

    expect(response.status).toBe(401);
    expect(requireUser).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unsupported audio types before calling the transcription service', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const response = await handleStt(audioRequest('text/plain'), { GEMINI_API_KEY: 'secret' }, async () => null);

    expect(response.status).toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('bounds streamed bodies even when Content-Length is absent', async () => {
    const response = await handleStt(
      new Request('https://worker.example/stt', {
        method: 'POST',
        headers: { 'Content-Type': 'audio/webm' },
        body: new Uint8Array(8 * 1024 * 1024 + 1),
      }),
      { GEMINI_API_KEY: 'secret' },
      async () => null,
    );
    expect(response.status).toBe(413);
  });

  it('sends inline WebM with vi-VN and storage disabled, then returns only transcript', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ output_text: 'Khách hẹn gọi lại chiều mai.' }), { status: 200 }),
      );
    const response = await handleStt(audioRequest('audio/webm'), { GEMINI_API_KEY: 'secret' }, async () => null);
    const request = fetchMock.mock.calls[0]?.[1];
    const payload = JSON.parse(String(request?.body));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ transcript: 'Khách hẹn gọi lại chiều mai.' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
      expect.any(Object),
    );
    expect(payload.model).toBe('gemini-3.5-transcribe');
    expect(payload.store).toBe(false);
    expect(payload.input[0]).toMatchObject({ type: 'audio', mime_type: 'audio/webm' });
    expect(payload.input[0].data).toBe(btoa('voice bytes'));
    expect(payload.generation_config.transcription_config.language_codes).toEqual(['vi-VN']);
  });
});
