import { useEffect, useRef, useState } from 'react';

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
export default function Playlist({ tracks, currentIndex, onSelect, onRemove, onReorder, onClearAll }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  // 전체 비우기 2단계 확인: window.confirm 은 메인 스레드를 막아 INP 지표를
  // 해치므로, 버튼 자체가 확인 상태로 바뀌는 논블로킹 패턴을 쓴다.
  // 첫 클릭 → 4초간 확인 모드, 그 안에 다시 클릭 → 실행, 방치 → 자동 복귀.
  const [confirmClear, setConfirmClear] = useState(false);
  const confirmTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(confirmTimerRef.current), []);

  // 행별 액션 열림 상태: 그립(⋮⋮)을 탭하면 해당 행의 이동/삭제 버튼이 나타난다.
  // 주의: 모든 훅은 아래 early return 보다 반드시 먼저 호출되어야 한다.
  // (조건부 반환 뒤에 훅을 두면 목록이 비었다 채워질 때 훅 개수가 달라져
  //  React error #310 으로 전체 트리가 크래시한다)
  const [openIndex, setOpenIndex] = useState(null);

  if (!tracks.length) return null;

  const drop = (to) => {
    if (dragIndex !== null && dragIndex !== to) onReorder(dragIndex, to);
    setDragIndex(null);
    setOverIndex(null);
  };

  // 행별 액션 열림 상태 관련 핸들러 (상태 선언은 early return 위에 있음)
  const moveUp = (i) => {
    if (i <= 0) return;
    onReorder(i, i - 1);
    setOpenIndex(i - 1); // 이동한 행을 계속 따라간다
  };
  const moveDown = (i) => {
    if (i >= tracks.length - 1) return;
    onReorder(i, i + 1);
    setOpenIndex(i + 1);
  };
  const removeAt = (i) => {
    setOpenIndex(null);
    onRemove(i);
  };

  const handleClear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      confirmTimerRef.current = setTimeout(() => setConfirmClear(false), 4000);
      return;
    }
    clearTimeout(confirmTimerRef.current);
    setConfirmClear(false);
    onClearAll();
  };

  return (
    <div className="mt-3 border-t border-ink-600/60 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          {tracks.length}곡
        </span>
        <button
          onClick={handleClear}
          title="재생목록과 저장 데이터 전체 삭제"
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition ${
            confirmClear
              ? 'bg-[#ff6b6b]/15 text-[#ff6b6b]'
              : 'text-muted hover:text-[#ff6b6b]'
          }`}
        >
          <TrashIcon /> {confirmClear ? '한 번 더 누르면 삭제' : '비우기'}
        </button>
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
              {/* 그립: 데스크톱에서는 드래그 손잡이, 탭하면 액션 버튼 토글 */}
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                aria-label="트랙 이동·삭제 메뉴"
                aria-expanded={openIndex === i}
                className={`shrink-0 cursor-grab px-0.5 py-1 transition ${
                  openIndex === i ? 'text-ember-soft' : 'text-ink-600 group-hover:text-muted'
                }`}
              >
                <GripIcon />
              </button>

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

              {openIndex === i ? (
                /* 열린 행: 위/아래 이동 + 삭제 (터치용 액션) */
                <span className="flex shrink-0 items-center gap-0.5">
                  <button
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                    aria-label="위로 이동"
                    className="px-1 py-1 text-muted transition hover:text-white disabled:opacity-25"
                  >
                    <UpIcon />
                  </button>
                  <button
                    onClick={() => moveDown(i)}
                    disabled={i === tracks.length - 1}
                    aria-label="아래로 이동"
                    className="px-1 py-1 text-muted transition hover:text-white disabled:opacity-25"
                  >
                    <DownIcon />
                  </button>
                  <button
                    onClick={() => removeAt(i)}
                    aria-label={`${stripExt(t.name)} 삭제`}
                    className="px-1 py-1 text-muted transition hover:text-[#ff6b6b]"
                  >
                    <XIcon />
                  </button>
                </span>
              ) : (
                <>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted">
                    {fmt(t.duration)}
                  </span>
                  <button
                    onClick={() => removeAt(i)}
                    aria-label={`${stripExt(t.name)} 삭제`}
                    className="shrink-0 text-muted opacity-0 transition hover:text-[#ff6b6b] focus:opacity-100 group-hover:opacity-100"
                  >
                    <XIcon />
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function UpIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}
function DownIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />
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
