import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { RepositoryAccount } from '@/data/repositories/session';
import { IconButton } from './kit';

type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionConstructor = new () => Recognition;
type SpeechInputEvent = { text?: string; code?: string };
type SpeechInputEventName = 'partial' | 'end' | 'error';
type ListenerHandle = { remove(): void | Promise<void> };
type SpeechInputPlugin = {
  available?: () => Promise<{ available?: boolean }>;
  start?: (options: { lang: string }) => Promise<unknown>;
  stop?: () => Promise<unknown>;
  addListener?: (
    event: SpeechInputEventName,
    listener: (event: SpeechInputEvent) => void,
  ) => ListenerHandle | Promise<ListenerHandle>;
};
type NativeWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    nativePromise?: (plugin: string, method: string, args: Record<string, unknown>) => Promise<unknown>;
    Plugins?: { SpeechInput?: SpeechInputPlugin };
  };
};

type VoiceSource = 'native' | 'web' | 'worker';

export function appendVoiceTranscript(note: string, transcript: string) {
  return [note.trimEnd(), transcript.trim()].filter(Boolean).join(' ');
}

export function voiceNotePreview(note: string, interim: string) {
  return interim.trim() ? [note.trimEnd(), interim.trim()].filter(Boolean).join(' ') : note;
}

function getRecognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as Window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition || scope.webkitSpeechRecognition || null;
}

async function removeListeners(handles: ListenerHandle[]) {
  await Promise.allSettled(handles.map((handle) => Promise.resolve(handle.remove())));
}

export type VoiceNoteInputHandle = { stop(): Promise<void> };

export const VoiceNoteInput = forwardRef<
  VoiceNoteInputHandle,
  {
    account: RepositoryAccount;
    disabled?: boolean;
    onTranscript: (transcript: string) => void;
    onInterim?: (text: string) => void;
  }
>(function VoiceNoteInput({ account, disabled, onTranscript, onInterim }, ref) {
  const recognition = useRef<Recognition | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const source = useRef<VoiceSource | null>(null);
  const nativePlugin = useRef<SpeechInputPlugin | null>(null);
  const nativeListeners = useRef<ListenerHandle[]>([]);
  const latestNativeText = useRef('');
  const finalizedWebResults = useRef(new Map<number, string>());
  const stopWaiters = useRef(new Set<() => void>());
  const pendingTranscription = useRef<Promise<void> | null>(null);
  const workerPreferred = useRef(!getRecognitionConstructor());
  const nativeUnavailable = useRef(false);
  const [listening, setListening] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState('');

  const clearInterim = useCallback(() => onInterim?.(''), [onInterim]);
  const completeStop = useCallback(() => {
    const waiters = [...stopWaiters.current];
    stopWaiters.current.clear();
    waiters.forEach((resolve) => {
      resolve();
    });
  }, []);
  const waitForStop = useCallback(
    () =>
      new Promise<void>((resolve) => {
        stopWaiters.current.add(resolve);
      }),
    [],
  );
  const clearNativeListeners = useCallback(() => {
    const listeners = nativeListeners.current;
    nativeListeners.current = [];
    void removeListeners(listeners);
  }, []);

  const transcribe = async (blob: Blob) => {
    if (blob.size < 1 || blob.size > 8 * 1024 * 1024) throw new Error('Bản ghi trống hoặc vượt quá 8 MB.');
    const workerUrl = (import.meta.env.VITE_WORKER_URL || '').replace(/\/+$/, '');
    if (!workerUrl || !account.sync.isOnline() || !navigator.onLine)
      throw new Error('Worker STT chỉ dùng khi có mạng và đã cấu hình.');
    const session = await account.sync.client.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) throw new Error('Cần đăng nhập lại để dùng nhận dạng giọng nói.');
    const response = await fetch(`${workerUrl}/stt`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': blob.type || 'audio/webm' },
      body: blob,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || typeof body.transcript !== 'string')
      throw new Error(typeof body.error === 'string' ? body.error : `Worker trả lỗi ${response.status}.`);
    return body.transcript.trim();
  };

  const startWorkerRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMessage('Thiết bị này không hỗ trợ thu âm cho Worker.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((mime) =>
        MediaRecorder.isTypeSupported(mime),
      );
      const active = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream);
      chunks.current = [];
      active.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      active.onstop = () => {
        if (timeout.current) clearTimeout(timeout.current);
        timeout.current = null;
        stream.getTracks().forEach((track) => {
          track.stop();
        });
        recorder.current = null;
        source.current = null;
        setRecording(false);
        const blob = new Blob(chunks.current, { type: active.mimeType || 'audio/webm' });
        chunks.current = [];
        setTranscribing(true);
        const task = transcribe(blob)
          .then((transcript) => {
            if (!transcript) throw new Error('Không nghe rõ nội dung. Thử ghi âm lại.');
            onTranscript(transcript);
            setMessage('Đã nhận văn bản. Hãy rà lại trước khi lưu.');
          })
          .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Không nhận dạng được audio.'))
          .finally(() => {
            setTranscribing(false);
            pendingTranscription.current = null;
            completeStop();
          });
        pendingTranscription.current = task;
      };
      active.start();
      recorder.current = active;
      source.current = 'worker';
      setRecording(true);
      setMessage('Đang ghi âm · tối đa 30 giây. Audio chỉ gửi để nhận dạng rồi bỏ.');
      timeout.current = setTimeout(() => {
        if (active.state === 'recording') active.stop();
      }, 30_000);
    } catch (error) {
      setMessage(
        error instanceof Error && error.name === 'NotAllowedError'
          ? 'Chưa được cấp quyền micro.'
          : 'Không mở được micro.',
      );
    }
  };

  const startWebSpeech = () => {
    const Constructor = getRecognitionConstructor();
    if (!Constructor) return false;
    const instance = new Constructor();
    instance.lang = 'vi-VN';
    instance.interimResults = true;
    instance.continuous = true;
    finalizedWebResults.current = new Map();
    instance.onresult = (event) => {
      const newFinals: string[] = [];
      const interim: string[] = [];
      for (let index = 0; index < event.results.length; index++) {
        const result = event.results[index];
        const text = result?.[0]?.transcript?.trim() || '';
        if (!text) continue;
        if (result?.isFinal) {
          if (!finalizedWebResults.current.has(index)) {
            finalizedWebResults.current.set(index, text);
            newFinals.push(text);
          }
        } else {
          interim.push(text);
        }
      }
      if (newFinals.length) onTranscript(newFinals.join(' '));
      onInterim?.(interim.join(' '));
    };
    instance.onerror = (event) => {
      source.current = null;
      recognition.current = null;
      workerPreferred.current = true;
      setListening(false);
      clearInterim();
      setMessage(
        event.error === 'not-allowed'
          ? 'Không có quyền dùng micro. Có thể thử Worker nếu quyền micro đã được cấp.'
          : 'Đọc giọng nói trên trình duyệt không thành công. Có thể thử Worker.',
      );
      completeStop();
    };
    instance.onend = () => {
      source.current = null;
      recognition.current = null;
      setListening(false);
      clearInterim();
      completeStop();
    };
    recognition.current = instance;
    source.current = 'web';
    try {
      instance.start();
      setListening(true);
      return true;
    } catch {
      source.current = null;
      recognition.current = null;
      workerPreferred.current = true;
      setListening(false);
      setMessage('Trình duyệt không khởi động được đọc giọng nói. Có thể thử Worker.');
      return false;
    }
  };

  const tryNativeSpeech = async () => {
    const host = (window as NativeWindow).Capacitor;
    if (nativeUnavailable.current || !host) return false;
    const plugin = host.Plugins?.SpeechInput;
    if (!host.isNativePlatform?.() && !plugin) return false;
    const nativePromise = host.nativePromise?.bind(host);
    const available = async () => {
      if (plugin?.available) return plugin.available();
      if (nativePromise) return (await nativePromise('SpeechInput', 'available', {})) as { available?: boolean };
      return { available: false };
    };
    const call = (method: 'start' | 'stop', args: Record<string, unknown>) => {
      const direct = plugin?.[method];
      if (direct) return direct(args as { lang: string });
      if (nativePromise) return nativePromise('SpeechInput', method, args);
      return Promise.reject(new Error('Plugin không khả dụng.'));
    };
    if (!plugin?.addListener) return false;

    let isAvailable = false;
    try {
      isAvailable = (await available()).available === true;
    } catch {
      nativeUnavailable.current = true;
      return false;
    }
    if (!isAvailable) {
      nativeUnavailable.current = true;
      return false;
    }

    nativePlugin.current = plugin;
    latestNativeText.current = '';
    try {
      const partial = await plugin.addListener('partial', ({ text }) => {
        if (source.current !== 'native' || typeof text !== 'string') return;
        latestNativeText.current = text;
        onInterim?.(text);
      });
      const end = await plugin.addListener('end', ({ text }) => {
        if (source.current !== 'native') return;
        const finalText = (typeof text === 'string' && text.trim() ? text : latestNativeText.current).trim();
        if (finalText) onTranscript(finalText);
        source.current = null;
        nativePlugin.current = null;
        latestNativeText.current = '';
        setListening(false);
        clearInterim();
        clearNativeListeners();
        completeStop();
      });
      const error = await plugin.addListener('error', ({ code }) => {
        if (source.current !== 'native' || code === 'no_speech') return;
        source.current = null;
        nativePlugin.current = null;
        latestNativeText.current = '';
        nativeUnavailable.current = true;
        setListening(false);
        clearInterim();
        setMessage(
          code === 'not_allowed'
            ? 'Không có quyền dùng micro. Có thể thử nguồn đọc giọng nói khác.'
            : 'Đọc giọng nói trên Android không thành công. Có thể thử nguồn khác.',
        );
        clearNativeListeners();
        completeStop();
      });
      nativeListeners.current = [partial, end, error];
      source.current = 'native';
      setListening(true);
      await call('start', { lang: 'vi-VN' });
      return true;
    } catch {
      source.current = null;
      nativePlugin.current = null;
      nativeUnavailable.current = true;
      setListening(false);
      clearNativeListeners();
      return false;
    }
  };

  const start = async () => {
    setMessage('');
    setStarting(true);
    try {
      const plugin = (window as NativeWindow).Capacitor?.Plugins?.SpeechInput;
      if (!plugin?.addListener) {
        if (!workerPreferred.current && startWebSpeech()) return;
        workerPreferred.current = true;
        await startWorkerRecording();
        return;
      }
      if (await tryNativeSpeech()) return;
      if (!workerPreferred.current && startWebSpeech()) return;
      workerPreferred.current = true;
      await startWorkerRecording();
    } finally {
      setStarting(false);
    }
  };

  const stop = useCallback(async () => {
    if (source.current === 'native') {
      const done = waitForStop();
      try {
        const host = (window as NativeWindow).Capacitor;
        const plugin = nativePlugin.current;
        if (plugin?.stop) await plugin.stop();
        else if (host?.nativePromise) await host.nativePromise('SpeechInput', 'stop', {});
      } catch {
        source.current = null;
        nativePlugin.current = null;
        setListening(false);
        clearInterim();
        clearNativeListeners();
        completeStop();
      }
      await done;
      return;
    }
    if (source.current === 'web') {
      const done = waitForStop();
      try {
        recognition.current?.stop();
      } catch {
        recognition.current?.abort();
        source.current = null;
        recognition.current = null;
        setListening(false);
        clearInterim();
        completeStop();
      }
      await done;
      return;
    }
    if (source.current === 'worker') {
      const done = waitForStop();
      try {
        if (recorder.current?.state === 'recording') recorder.current.stop();
        else completeStop();
      } catch {
        completeStop();
      }
      await done;
      return;
    }
    if (pendingTranscription.current) await pendingTranscription.current;
  }, [clearInterim, clearNativeListeners, completeStop, waitForStop]);

  useImperativeHandle(ref, () => ({ stop }), [stop]);

  useEffect(() => {
    return () => {
      source.current = null;
      recognition.current?.abort();
      if (timeout.current) clearTimeout(timeout.current);
      const plugin = nativePlugin.current;
      if (plugin) void plugin.stop?.().catch(() => {});
      nativePlugin.current = null;
      clearNativeListeners();
      const activeRecorder = recorder.current;
      if (activeRecorder?.state === 'recording') activeRecorder.stop();
      chunks.current = [];
      completeStop();
    };
  }, [clearNativeListeners, completeStop]);

  const active = listening || recording;
  return (
    <>
      <IconButton
        type="button"
        icon={active ? 'voice_stop' : 'voice'}
        label={active ? 'Dừng nghe' : 'Nói để ghi chú'}
        variant="accent"
        disabled={disabled || starting || transcribing}
        aria-pressed={active}
        className={[
          // Cùng ô lưới với ô ghi chú: neo góc phải dưới ô, không theo dòng thông báo bên dưới.
          'col-start-1 row-start-1 m-2 self-end justify-self-end size-11 p-0 lg:size-11',
          active
            ? 'rounded-md bg-alert-tint text-alert-text hover:bg-alert-tint motion-safe:animate-pulse [animation-duration:2s] motion-reduce:animate-none'
            : 'rounded-full',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => (active ? void stop() : void start())}
      />
      {message && (
        <p className="col-start-1 row-start-2 mt-1 text-caption text-ink-muted" role="status">
          {message}
        </p>
      )}
    </>
  );
});
