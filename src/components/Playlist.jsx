/**
 * Playlist
 * 업로드된 트랙 목록을 순서대로 보여주고, 클릭 시 해당 곡으로 이동한다.
 * 현재 재생 중인 트랙은 앰버 톤으로 강조하며, 목록이 길면 내부에서 스크롤된다.
 */
export default function Playlist({ tracks, currentIndex, onSelect }) {
  if (!tracks.length) return null;
  return (
    <div className="mt-3 max-h-44 space-y-1 overflow-y-auto border-t border-ink-600/60 pt-3 pr-1">
      {tracks.map((t, i) => {
        const active = i === currentIndex;
        return (
          <button
            key={i}
            onClick={() => onSelect(i)}
            className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-xs transition ${
              active ? 'bg-ember/15 text-ember-soft' : 'text-muted hover:bg-ink-700'
            }`}
          >
            <span className="w-4 shrink-0 text-right font-mono text-[10px]">
              {active ? '▶' : i + 1}
            </span>
            <span className="truncate">{t.name}</span>
          </button>
        );
      })}
    </div>
  );
}
