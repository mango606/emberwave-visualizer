import { PALETTES } from '../constants/palettes';

/** 12가지 LED 색상 팔레트를 스와치 버튼으로 선택 */
export default function PalettePicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {PALETTES.map((p) => {
        const active = p.id === value;
        return (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            title={p.nameKo}
            aria-label={p.nameKo}
            aria-pressed={active}
            className={`group relative aspect-square rounded-lg border transition ${
              active ? 'border-white' : 'border-ink-600 hover:border-muted'
            }`}
            style={{
              // 팔레트의 아래→위 그라디언트를 스와치로 미리 보여준다
              background: `linear-gradient(to top, ${p.stops.join(',')})`,
            }}
          >
            {active && (
              <span className="absolute inset-0 rounded-lg ring-2 ring-white ring-offset-2 ring-offset-ink-800" />
            )}
          </button>
        );
      })}
    </div>
  );
}
