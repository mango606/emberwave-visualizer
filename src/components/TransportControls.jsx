import { useRef } from 'react';
import { isMobile } from '../lib/platform';

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
export default function TransportControls({
  state,
  onFiles,
  onToggle,
  onSeek,
  onPrev,
  onNext,
  fsaSupported,
  onConnectFolder,
  onSyncFolder,
  onDisconnectFolder,
  onNotice,
}) {
  const fileRef = useRef(null);
  const dirRef = useRef(null);
  const hasTracks = state.tracks.length > 0;
  const multi = state.tracks.length > 1;

  const pickFiles = (e) => {
    if (e.target.files?.length) onFiles(e.target.files);
    e.target.value = ''; // 같은 파일 재선택 가능하도록 초기화
  };

  /**
   * 폴더 연결: 모바일은 폴더 선택 자체가 미지원이라 안내만 하고,
   * FSA 지원 시 핸들 연결(자동 동기화), 미지원 데스크톱은 스냅샷 폴백.
   */
  const handleFolderClick = async () => {
    if (isMobile()) {
      onNotice?.('폴더 연결은 PC에서만 지원됩니다. 파일 추가를 이용해 주세요.');
      return;
    }
    if (fsaSupported) {
      await onConnectFolder();
    } else {
      dirRef.current?.click();
    }
  };

  return (
    <div className="space-y-3">
      {/* 현재 곡 표시(확장자 가림) */}
      {state.fileName && (
        <div className="truncate rounded-lg border border-ink-600/60 bg-ink-700/50 px-3 py-2 text-sm text-white">
          {state.fileName.replace(/\.[^.]+$/, '')}
        </div>
      )}

      {/* 파일 추가 / 폴더 연결 */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-ink-600 bg-ink-700 px-3 py-2.5 text-sm text-muted transition hover:border-muted hover:text-white"
        >
          <PlusIcon /> 파일 추가
        </button>
        <button
          onClick={handleFolderClick}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-ink-600 bg-ink-700 px-3 py-2.5 text-sm text-muted transition hover:border-muted hover:text-white"
        >
          <FolderIcon /> 폴더 연결
        </button>
      </div>

      {/* 연결된 폴더 칩: 폴더명 + 즉시 동기화 + 해제 */}
      {state.folderName && (
        <div className="flex items-center gap-2 rounded-lg border border-ember/40 bg-ember/10 px-3 py-2 text-xs">
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-ember" />
          <span className="min-w-0 flex-1 truncate text-ember-soft">
            {state.folderName} · {state.folderCount}곡 자동 동기화 중
          </span>
          <button
            onClick={onSyncFolder}
            title="지금 동기화"
            aria-label="지금 동기화"
            className="shrink-0 text-muted transition hover:text-white"
          >
            <RefreshIcon />
          </button>
          <button
            onClick={onDisconnectFolder}
            title="폴더 연결 해제"
            aria-label="폴더 연결 해제"
            className="shrink-0 text-muted transition hover:text-[#ff6b6b]"
          >
            <UnlinkIcon />
          </button>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        multiple
        onChange={pickFiles}
        className="hidden"
      />
      {/* webkitdirectory: 폴더를 통째로 선택하면 하위 파일까지 FileList 로 전달된다.
          엔진에서 오디오 파일만 필터링하므로 여기서는 그대로 넘긴다. */}
      <input
        ref={dirRef}
        type="file"
        webkitdirectory=""
        directory=""
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

function RefreshIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
    </svg>
  );
}
function UnlinkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
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
