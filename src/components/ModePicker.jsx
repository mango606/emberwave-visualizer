import { VISUAL_MODES } from '../constants/visualModes';

/** 10가지 반응 모드를 이름 + 한 줄 설명 버튼으로 선택 */
export default function ModePicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {VISUAL_MODES.map((m) => {
        const active = m.id === value;
        return (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            aria-pressed={active}
            className={`rounded-lg border px-3 py-2 text-left transition ${
              active
                ? 'border-ember bg-ember/10'
                : 'border-ink-600 bg-ink-700/40 hover:border-muted'
            }`}
          >
            <div className={`text-sm font-semibold ${active ? 'text-ember-soft' : 'text-white'}`}>
              {m.nameKo}
            </div>
            <div className="mt-0.5 text-[11px] leading-tight text-muted">{m.desc}</div>
          </button>
        );
      })}
    </div>
  );
}
