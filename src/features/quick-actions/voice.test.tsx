import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RepositoryAccount } from '@/data/repositories/session';
import { VoiceNoteInput } from './voice';

const account = {
  sync: {
    isOnline: () => true,
    client: { auth: { getSession: async () => ({ data: { session: { access_token: 'session-token' } } }) } },
  },
} as unknown as RepositoryAccount;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  delete (window as Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as Window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
});

describe('voice note input', () => {
  it('uses Web Speech vi-VN first and only returns final transcript text', async () => {
    let instance: MockRecognition | undefined;
    class MockRecognition {
      lang = '';
      interimResults = true;
      continuous = true;
      onresult: ((event: never) => void) | null = null;
      onerror: (() => void) | null = null;
      onend: (() => void) | null = null;
      start = vi.fn();
      stop = vi.fn();
      abort = vi.fn();
      constructor() {
        instance = this;
      }
    }
    (window as Window & { SpeechRecognition?: typeof MockRecognition }).SpeechRecognition = MockRecognition;
    const onTranscript = vi.fn();
    render(<VoiceNoteInput account={account} onTranscript={onTranscript} />);
    fireEvent.click(screen.getByRole('button', { name: '🎙 Đọc giọng nói' }));

    expect(instance?.lang).toBe('vi-VN');
    expect(instance?.interimResults).toBe(false);
    instance?.onresult?.({
      resultIndex: 0,
      results: [
        { isFinal: false, 0: { transcript: 'đang nói' } },
        { isFinal: true, 0: { transcript: 'Khách hẹn gọi lại' } },
      ],
    } as never);
    expect(onTranscript).toHaveBeenCalledWith('Khách hẹn gọi lại');
  });

  it('offers Worker fallback when Web Speech is unavailable and discards the recording after transcription', async () => {
    vi.stubEnv('VITE_WORKER_URL', 'https://worker.example');
    const trackStop = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: trackStop }] })) },
    });
    class MockRecorder {
      static isTypeSupported = vi.fn(() => true);
      state = 'inactive';
      mimeType = 'audio/webm;codecs=opus';
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {
        this.state = 'recording';
        this.ondataavailable?.({ data: new Blob(['ephemeral audio'], { type: 'audio/webm' }) });
      }
      stop() {
        this.state = 'inactive';
        this.onstop?.();
      }
    }
    vi.stubGlobal('MediaRecorder', MockRecorder);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer session-token' });
      expect(init?.headers).toMatchObject({ 'Content-Type': 'audio/webm;codecs=opus' });
      expect(init?.body).toBeInstanceOf(Blob);
      return new Response(JSON.stringify({ transcript: 'Khách quan tâm căn hai phòng ngủ' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const onTranscript = vi.fn();
    render(<VoiceNoteInput account={account} onTranscript={onTranscript} />);
    fireEvent.click(screen.getByRole('button', { name: '🎙 Ghi âm qua Worker' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dừng và chuyển văn bản' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Dừng và chuyển văn bản' }));

    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith('Khách quan tâm căn hai phòng ngủ'));
    expect(fetchMock).toHaveBeenCalledWith('https://worker.example/stt', expect.objectContaining({ method: 'POST' }));
    expect(trackStop).toHaveBeenCalled();
    expect(await screen.findByText('Đã nhận văn bản. Hãy rà lại trước khi lưu.')).toBeTruthy();
  });
});
