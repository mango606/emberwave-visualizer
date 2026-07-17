/**
 * VolumeMixer
 * 로컬 MP3(음악)와 유튜브 ASMR 볼륨을 각각 독립적으로 조절한다.
 * 두 값은 부모(App)에서 관리하며, 여기서는 슬라이더 UI 만 담당한다.
 */
export default function VolumeMixer({ music, asmr, onMusic, onAsmr }) {
  return (
    <div className="space-y-4">
      <Slider label="MUSIC" value={music} onChange={onMusic} />
      <Slider label="YOUTUBE" value={asmr} onChange={onAsmr} />
    </div>
  );
}

function Slider({ label, value, onChange }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between font-mono text-[11px] text-muted">
        <span>{label}</span>
        <span className="text-ember-soft">{value}</span>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range-ember"
        aria-label={label}
      />
    </div>
  );
}
