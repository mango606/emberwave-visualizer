import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * RecorderButton
 * -------------------------------------------------------------
 * 비주얼라이저 화면을 소리와 함께 짧은 영상(webm)으로 녹화해 공유한다.
 *  - 영상: canvas.captureStream(30fps)
 *  - 오디오: 엔진의 MediaStreamDestination(음악 post-EQ + 마이크 + 탭 소리)
 *  - 공유: Web Share API(파일 공유 지원 시), 미지원이면 파일 다운로드로 폴백
 *
 * 성능 배려
 *  - captureStream/MediaRecorder 는 녹화 중에만 존재한다(대기 중 비용 0).
 *  - 30fps 고정 + timeslice(1초)로 청크를 나눠 메모리 사용을 평탄하게 유지.
 *  - 오디오 트랙은 clone 으로 추가해, 녹화 종료 시 원본 스트림을 죽이지 않는다.
 *
 * UI: 화면 최하단 중앙에 반투명으로 떠 있다가 호버 시 선명해진다.
 *     녹화 중에는 빨간 점 + 경과 시간이 항상 선명하게 표시된다.
 */
export default function RecorderButton({ getCanvas, getAudioStream, onNotice }) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const canvasTrackRef = useRef(null);

  const stop = useCallback(() => {
    recorderRef.current?.state !== 'inactive' && recorderRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const canvas = getCanvas();
    if (!canvas || !('MediaRecorder' in window)) {
      onNotice?.('이 브라우저에서는 녹화를 지원하지 않습니다.');
      return;
    }

    // 1) 영상 스트림: 캔버스에서 30fps 캡처
    const stream = canvas.captureStream(30);
    canvasTrackRef.current = stream.getVideoTracks()[0];

    // 2) 오디오 합류: 원본 훼손 방지를 위해 트랙을 복제해 추가
    const audio = getAudioStream?.();
    if (audio) audio.getAudioTracks().forEach((t) => stream.addTrack(t.clone()));

    // 3) 지원하는 코덱 선택(vp9 → vp8 → 기본)
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(
      (m) => MediaRecorder.isTypeSupported(m),
    );
    const rec = new MediaRecorder(stream, {
      ...(mime ? { mimeType: mime } : {}),
      videoBitsPerSecond: 4_000_000, // 화질과 파일 크기의 균형점
    });
    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    rec.onstop = async () => {
      // 캡처 트랙 정리(오디오는 clone 이라 원본 무사)
      stream.getTracks().forEach((t) => t.stop());
      clearInterval(timerRef.current);
      setRecording(false);
      setElapsed(0);

      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      chunksRef.current = [];
      if (!blob.size) return;
      const file = new File([blob], `emberwave-${Date.now()}.webm`, { type: 'video/webm' });

      // 공유 시트(모바일 등) 우선, 미지원·취소 시 다운로드 폴백
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'Emberwave' });
          return;
        } catch {
          // 사용자가 공유를 취소하면 다운로드로 이어가지 않고 종료
          return;
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    };

    rec.start(1000); // 1초 단위 청크로 메모리 평탄화
    recorderRef.current = rec;
    setRecording(true);
    const startedAt = Date.now();
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 500);
  }, [getCanvas, getAudioStream, onNotice]);

  // 언마운트 시 진행 중인 녹화 정리
  useEffect(
    () => () => {
      clearInterval(timerRef.current);
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    },
    [],
  );

  const mmss = `${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, '0')}`;

  return (
    <button
      onClick={recording ? stop : start}
      aria-label={recording ? '녹화 종료 및 공유' : '비주얼 녹화 시작'}
      title={recording ? '녹화 종료 및 공유' : '비주얼 녹화·공유'}
      className={`fixed bottom-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] backdrop-blur transition duration-300 ${
        recording
          ? 'border-[#ff4d4d]/60 bg-ink-800/95 text-white opacity-100'
          : 'border-ink-600 bg-ink-800/80 text-muted opacity-40 hover:text-white hover:opacity-100'
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          recording ? 'animate-pulse bg-[#ff4d4d]' : 'border border-current'
        }`}
      />
      {recording ? `녹화 중 ${mmss} · 눌러서 저장` : '비주얼 녹화'}
    </button>
  );
}
