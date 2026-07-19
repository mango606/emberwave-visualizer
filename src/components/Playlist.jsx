import { useState } from 'react';

/** 초 → m:ss (측정 전이면 --:--) */
function fmt(sec) {
  if (!sec || !Number.isFinite(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** 표시용 제목: 파일 확장자(.mp3, .m4a 등)를 가린다 */
function stripExt(name) {
  return name.replace(/\.[^.]+$/, '');
}

/**
 * Playlist
 * -------------------------------------------------------------
 * 업로드된 트랙 목록. 클릭 재생, 드래그로 순서 변경, 삭제, 셔플,
 * 트랙별 재생시간 표시를 지원한다. 현재 곡은 앰버 톤으로 강조한다.
 *
 * 순서 변경은 HTML5 Drag and Drop 으로 구현했다. 드래그 중인 항목(dragIndex)과
 * 드롭 대상(overIndex)을 로컬 상태로 추적해 시각적 피드백을 준다.
 */
export default function Playlist({ tracks, currentIndex, onSelect, onRemove, onReorder, onShuffle, onClearAll }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  if (!tracks.length) return null;

  const drop = (to) => {
    if (dragIndex !== null && dragIndex !== to) onReorder(dragIndex, to);
    setDragIndex(null);
    setOverIndex(null);
  };

  /** 파괴적 동작이므로 브라우저 확인 창을 거친 뒤 실행한다 */
  const clearAll = () => {
    if (window.confirm('재생목록과 브라우저에 저장된 음악 파일을 모두 삭제할까요?')) {
      onClearAll();
    }
  };

  return (
    <div className="mt-3 border-t border-ink-600/60 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          {tracks.length}곡
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onShuffle}
            disabled={tracks.length < 2}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted transition hover:text-ember-soft disabled:opacity-30"
          >
            <ShuffleIcon /> 셔플
          </button>
          <button
            onClick={clearAll}
            title="재생목록과 저장 데이터 전체 삭제"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted transition hover:text-[#ff6b6b]"
          >
            <TrashIcon /> 비우기
          </button>
        </div>
      </div>

      <ul className="max-h-44 space-y-1 overflow-y-auto pr-1">
        {tracks.map((t, i) => {
          const active = i === currentIndex;
          return (
            <li
              key={t.id}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragEnter={() => setOverIndex(i)}
              onDragOver={(e) => e.preventDefault()} // drop 허용
              onDrop={() => drop(i)}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              className={`group flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-xs transition ${
                active ? 'bg-ember/15 text-ember-soft' : 'text-muted hover:bg-ink-700'
              } ${overIndex === i && dragIndex !== null ? 'ring-1 ring-ember/50' : ''} ${
                dragIndex === i ? 'opacity-40' : ''
              }`}
            >
              <span className="shrink-0 cursor-grab text-ink-600 group-hover:text-muted" aria-hidden="true">
                <GripIcon />
              </span>

              {/* 클릭 시 해당 곡 재생 */}
              <button
                onClick={() => onSelect(i)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span className="w-3 shrink-0 text-right font-mono text-[10px]">
                  {active ? '▶' : i + 1}
                </span>
                <span className="truncate">{t.title || stripExt(t.name)}</span>
              </button>

              <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted">
                {fmt(t.duration)}
              </span>

              <button
                onClick={() => onRemove(i)}
                aria-label={`${stripExt(t.name)} 삭제`}
                className="shrink-0 text-muted opacity-0 transition hover:text-[#ff6b6b] focus:opacity-100 group-hover:opacity-100"
              >
                <XIcon />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />
    </svg>
  );
}
function ShuffleIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
    </svg>
  );
}
function GripIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
