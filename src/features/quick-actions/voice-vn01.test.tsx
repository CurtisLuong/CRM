import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RepositoryAccount } from '@/data/repositories/session';
import { appendVoiceTranscript, VoiceNoteInput, voiceNotePreview } from './voice';

const account = {
  sync: {
    isOnline: () => true,
    client: { auth: { getSession: async () => ({ data: { session: { access_token: 'session-token' } } }) } },
  },
} as unknown as RepositoryAccount;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (window as Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as Window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  delete (window as Window & { Capacitor?: unknown }).Capacitor;
});

describe('VN-01 voice note input', () => {
  it('shows an interim preview, then replaces it with one final transcript after existing text', async () => {
    let instance: MockRecognition | undefined;
    class MockRecognition {
      lang = '';
      interimResults = false;
      continuous = false;
      onresult: ((event: never) => void) | null = null;
      onerror: ((event: { error?: string }) => void) | null = null;
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
    const onInterim = vi.fn();
    function Harness() {
      const [note, setNote] = useState('Đã gọi trước đó');
      const [interim, setInterim] = useState('');
      return (
        <>
          <textarea aria-label="Nội dung ghi chú" value={voiceNotePreview(note, interim)} readOnly />
          <VoiceNoteInput
            account={account}
            onTranscript={(text) => {
              onTranscript(text);
              setNote((current) => appendVoiceTranscript(current, text));
              setInterim('');
            }}
            onInterim={(text) => {
              onInterim(text);
              setInterim(text);
            }}
          />
        </>
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Nói để ghi chú' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dừng nghe' })).toBeTruthy());

    act(() =>
      instance?.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: false, 0: { transcript: 'khách quan tâm căn' } }],
      } as never),
    );
    expect(onTranscript).not.toHaveBeenCalled();
    expect(onInterim).toHaveBeenLastCalledWith('khách quan tâm căn');
    expect((screen.getByRole('textbox', { name: 'Nội dung ghi chú' }) as HTMLTextAreaElement).value).toBe(
      'Đã gọi trước đó khách quan tâm căn',
    );

    act(() =>
      instance?.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: 'khách quan tâm căn hộ' } }],
      } as never),
    );
    expect(onTranscript).toHaveBeenCalledTimes(1);
    expect(onTranscript).toHaveBeenCalledWith('khách quan tâm căn hộ');
    expect((screen.getByRole('textbox', { name: 'Nội dung ghi chú' }) as HTMLTextAreaElement).value).toBe(
      'Đã gọi trước đó khách quan tâm căn hộ',
    );

    act(() =>
      instance?.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: 'khách quan tâm căn hộ' } }],
      } as never),
    );
    expect(onTranscript).toHaveBeenCalledTimes(1);
  });

  it('uses native SpeechInput first, keeps listening through no_speech, and commits only on end', async () => {
    const listeners = new Map<string, (event: { text?: string; code?: string }) => void>();
    let webStarts = 0;
    class MockRecognition {
      lang = '';
      interimResults = false;
      continuous = false;
      onresult: ((event: never) => void) | null = null;
      onerror: (() => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        webStarts++;
      }
      stop() {}
      abort() {}
    }
    (window as Window & { SpeechRecognition?: typeof MockRecognition }).SpeechRecognition = MockRecognition;
    const nativePromise = vi.fn(async (_plugin: string, method: string) => {
      if (method === 'available') return { available: true };
      if (method === 'stop') listeners.get('end')?.({ text: 'Khách muốn xem căn mẫu' });
      return {};
    });
    (window as Window & { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      nativePromise,
      Plugins: {
        SpeechInput: {
          addListener: async (event: string, listener: (value: { text?: string; code?: string }) => void) => {
            listeners.set(event, listener);
            return { remove: vi.fn() };
          },
        },
      },
    };
    const onTranscript = vi.fn();
    const onInterim = vi.fn();
    render(<VoiceNoteInput account={account} onTranscript={onTranscript} onInterim={onInterim} />);
    fireEvent.click(screen.getByRole('button', { name: 'Nói để ghi chú' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dừng nghe' })).toBeTruthy());
    expect(nativePromise.mock.calls.map(([, method]) => method)).toEqual(['available', 'start']);
    expect(webStarts).toBe(0);

    act(() => listeners.get('error')?.({ code: 'no_speech' }));
    expect(screen.getByRole('button', { name: 'Dừng nghe' })).toBeTruthy();
    act(() => listeners.get('partial')?.({ text: 'Khách muốn xem căn' }));
    expect(onInterim).toHaveBeenLastCalledWith('Khách muốn xem căn');
    fireEvent.click(screen.getByRole('button', { name: 'Dừng nghe' }));

    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith('Khách muốn xem căn mẫu'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nói để ghi chú' })).toBeTruthy());
    expect(onInterim).toHaveBeenLastCalledWith('');
  });

  it('falls through to Web Speech when SpeechInput is unavailable and reports a denied microphone', async () => {
    let instance: MockRecognition | undefined;
    class MockRecognition {
      lang = '';
      interimResults = false;
      continuous = false;
      onresult: ((event: never) => void) | null = null;
      onerror: ((event: { error?: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start = vi.fn();
      stop = vi.fn();
      abort = vi.fn();
      constructor() {
        instance = this;
      }
    }
    (window as Window & { SpeechRecognition?: typeof MockRecognition }).SpeechRecognition = MockRecognition;
    (window as Window & { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      nativePromise: vi.fn(async () => ({ available: false })),
      Plugins: { SpeechInput: { addListener: async () => ({ remove: vi.fn() }) } },
    };
    render(<VoiceNoteInput account={account} onTranscript={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Nói để ghi chú' }));
    await waitFor(() => expect(instance?.start).toHaveBeenCalled());
    act(() => instance?.onerror?.({ error: 'not-allowed' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nói để ghi chú' })).toBeTruthy());
    expect(screen.getByRole('status').textContent).toContain('Không có quyền dùng micro');
  });
});
