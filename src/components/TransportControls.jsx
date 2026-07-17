import { useRef } from 'react';

/** mm:ss 포맷 */
function fmt(t) {
  if (!Number.isFinite(t)) return '0:00';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * TransportControls
 * MP3 파일(복수) 업로드 + 이전/재생·일시정지/다음 + 탐색(seek) 바.
 */
export default function TransportControls({ state, onFiles, onToggle, onSeek, onPrev, onNext }) {
  const fileRef = useRef(null);
  const hasTracks = state.tracks.length > 0;
  const multi = state.tracks.length > 1;

  const pickFiles = (e) => {
    if (e.target.files?.length) onFiles(e.target.files);
    e.target.value = ''; // 같은 파일 재선택 가능하도록 초기화
  };

  return (
    <div className="space-y-3">
      {/* 파일 선택 (여러 개) */}
      <button
        onClick={() => fileRef.current?.click()}
        className="w-full truncate rounded-lg border border-ink-600 bg-ink-700 px-3 py-2.5 text-left text-sm transition hover:border-muted"
      >
        {state.fileName ? (
          <span className="truncate text-white">{state.fileName}</span>
        ) : (
          <span className="text-muted">MP3 파일 선택 (여러 개 가능)…</span>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        multiple
        onChange={pickFiles}
        className="hidden"
      />

      {/* 이전 · 재생/일시정지 · 다음 */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={onPrev}
          disabled={!hasTracks}
          aria-label="이전 곡"
          className="text-muted transition enabled:hover:text-white disabled:opacity-25"
        >
          <PrevIcon />
        </button>
        <button
          onClick={onToggle}
          disabled={!hasTracks}
          aria-label={state.isPlaying ? '일시정지' : '재생'}
          className="grid h-12 w-12 place-items-center rounded-full bg-ember text-ink-900 transition enabled:hover:bg-ember-soft disabled:cursor-not-allowed disabled:opacity-30"
        >
          {state.isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          onClick={onNext}
          disabled={!multi}
          aria-label="다음 곡"
          className="text-muted transition enabled:hover:text-white disabled:opacity-25"
        >
          <NextIcon />
        </button>
      </div>

      {/* 탐색 바 */}
      <div className="flex items-center gap-3 font-mono text-[11px] text-muted">
        <span className="w-9 text-right">{fmt(state.currentTime)}</span>
        <input
          type="range"
          min="0"
          max={state.duration || 0}
          step="0.1"
          value={state.currentTime}
          onChange={(e) => onSeek(Number(e.target.value))}
          disabled={!state.isReady}
          className="range-ember"
          aria-label="재생 위치"
        />
        <span className="w-9">{fmt(state.duration)}</span>
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  );
}
function PrevIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 6h2v12H7zM20 6v12l-9-6z" />
    </svg>
  );
}
function NextIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M15 6h2v12h-2zM4 6l9 6-9 6z" />
    </svg>
  );
}
