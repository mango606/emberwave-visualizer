/**
 * EqControls
 * -------------------------------------------------------------
 * 음악 앱 스타일의 음질 조정 UI.
 *  - 프리셋: 자주 쓰는 조합을 한 번에 적용
 *  - 3밴드 슬라이더: 저음/중음/고음을 -12 ~ +12dB 로 미세 조정
 * eq 상태는 부모(App)가 소유하고, 여기서는 표시와 변경 이벤트만 담당한다.
 */

export const EQ_PRESETS = [
  { id: 'flat', nameKo: '기본', bass: 0, mid: 0, treble: 0 },
  { id: 'bass', nameKo: '베이스 부스트', bass: 7, mid: 0, treble: 1 },
  { id: 'vocal', nameKo: '보컬 강조', bass: -2, mid: 5, treble: 2 },
  { id: 'clear', nameKo: '클리어', bass: 0, mid: -2, treble: 5 },
  { id: 'lounge', nameKo: '라운지', bass: 3, mid: -1, treble: -2 },
  { id: 'live', nameKo: '라이브', bass: 4, mid: 2, treble: 3 },
];

const BANDS = [
  { key: 'bass', label: '저음' },
  { key: 'mid', label: '중음' },
  { key: 'treble', label: '고음' },
];

export default function EqControls({ eq, onChange }) {
  /** 현재 값과 일치하는 프리셋 id (없으면 null → '커스텀' 상태) */
  const activePreset =
    EQ_PRESETS.find((p) => p.bass === eq.bass && p.mid === eq.mid && p.treble === eq.treble)?.id ??
    null;

  return (
    <div className="space-y-4">
      {/* 프리셋 */}
      <div className="flex flex-wrap gap-1.5">
        {EQ_PRESETS.map((p) => {
          const active = p.id === activePreset;
          return (
            <button
              key={p.id}
              onClick={() => onChange({ bass: p.bass, mid: p.mid, treble: p.treble })}
              aria-pressed={active}
              className={`rounded-full border px-3 py-1 text-[11px] transition ${
                active
                  ? 'border-ember bg-ember/15 text-ember-soft'
                  : 'border-ink-600 text-muted hover:border-muted hover:text-white'
              }`}
            >
              {p.nameKo}
            </button>
          );
        })}
      </div>

      {/* 3밴드 슬라이더 */}
      <div className="space-y-3">
        {BANDS.map(({ key, label }) => (
          <div key={key}>
            <div className="mb-1.5 flex items-center justify-between font-mono text-[11px] text-muted">
              <span>{label}</span>
              <span className="tabular-nums text-ember-soft">
                {eq[key] > 0 ? `+${eq[key]}` : eq[key]} dB
              </span>
            </div>
            <input
              type="range"
              min="-12"
              max="12"
              step="1"
              value={eq[key]}
              onChange={(e) => onChange({ ...eq, [key]: Number(e.target.value) })}
              className="range-ember"
              aria-label={`${label} 게인`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
