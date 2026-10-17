import { useEffect, useRef, useState } from 'react';
import type { RepositoryAccount } from '@/data/repositories/session';
import { Button } from '@/ui';

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

function getRecognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as Window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition || scope.webkitSpeechRecognition || null;
}

export function VoiceNoteInput({
  account,
  disabled,
  onTranscript,
}: {
  account: RepositoryAccount;
  disabled?: boolean;
  onTranscript: (transcript: string) => void;
}) {
  const recognition = useRef<Recognition | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [listening, setListening] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [fallback, setFallback] = useState(!getRecognitionConstructor());
  const [message, setMessage] = useState('');

  useEffect(
    () => () => {
      recognition.current?.abort();
      if (timeout.current) clearTimeout(timeout.current);
      const activeRecorder = recorder.current;
      if (activeRecorder?.state === 'recording') activeRecorder.stop();
      chunks.current = [];
    },
    [],
  );

  const startSpeech = () => {
    const Constructor = getRecognitionConstructor();
    if (!Constructor) {
      setFallback(true);
      return;
    }
    setMessage('');
    const instance = new Constructor();
    instance.lang = 'vi-VN';
    instance.interimResults = false;
    instance.continuous = false;
    instance.onresult = (event) => {
      const text = Array.from({ length: event.results.length }, (_, i) => event.results[i])
        .filter((result) => result?.isFinal)
        .map((result) => result?.[0]?.transcript?.trim() || '')
        .filter(Boolean)
        .join(' ');
      if (text) onTranscript(text);
    };
    instance.onerror = (event) => {
      setListening(false);
      setFallback(true);
      setMessage(
        event.error === 'not-allowed'
          ? 'Không có quyền dùng micro. Có thể thử Worker nếu quyền micro đã được cấp.'
          : 'Đọc giọng nói trên trình duyệt không thành công. Có thể thử Worker.',
      );
    };
    instance.onend = () => {
      setListening(false);
      recognition.current = null;
    };
    recognition.current = instance;
    try {
      instance.start();
      setListening(true);
    } catch {
      recognition.current = null;
      setListening(false);
      setFallback(true);
      setMessage('Trình duyệt không khởi động được đọc giọng nói. Có thể thử Worker.');
    }
  };

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
    setMessage('');
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
        setRecording(false);
        const blob = new Blob(chunks.current, { type: active.mimeType || 'audio/webm' });
        chunks.current = [];
        setTranscribing(true);
        void transcribe(blob)
          .then((transcript) => {
            if (!transcript) throw new Error('Không nghe rõ nội dung. Thử ghi âm lại.');
            onTranscript(transcript);
            setMessage('Đã nhận văn bản. Hãy rà lại trước khi lưu.');
          })
          .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Không nhận dạng được audio.'))
          .finally(() => setTranscribing(false));
      };
      active.start();
      recorder.current = active;
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

  return (
    <div className="flex flex-col items-start gap-1">
      {!fallback && (
        <Button
          type="button"
          disabled={disabled || recording || transcribing}
          onClick={listening ? () => recognition.current?.stop() : startSpeech}
        >
          {listening ? 'Dừng đọc giọng nói' : '🎙 Đọc giọng nói'}
        </Button>
      )}
      {fallback && (
        <Button
          type="button"
          disabled={disabled || listening || transcribing}
          onClick={recording ? () => recorder.current?.stop() : () => void startWorkerRecording()}
        >
          {recording ? 'Dừng và chuyển văn bản' : transcribing ? 'Đang nhận dạng…' : '🎙 Ghi âm qua Worker'}
        </Button>
      )}
      {message && (
        <p className="text-small text-text-2" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
