/**
 * LiveInput
 * -------------------------------------------------------------
 * 음악 외의 실시간 오디오로 비주얼라이저를 구동하는 토글 두 개.
 *  - 마이크: getUserMedia 로 입력을 받아 바를 반응시킨다.
 *  - 탭 소리: getDisplayMedia 로 이 탭의 오디오(내부 유튜브 포함)를 캡처한다.
 *
 * 유튜브 iframe 오디오는 cross-origin 이라 직접 연결할 수 없어, '탭 소리' 공유가
 * 유튜브 사운드를 시각화하는 현실적인 경로임을 안내 문구로 함께 노출한다.
 */
export default function LiveInput({ micOn, tabOn, error, onToggleMic, onToggleTab, onNotice }) {
  /** 탭 소리: getDisplayMedia 미지원(모바일 등) 환경이면 안내만 표시 */
  const handleTab = () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      onNotice?.('탭 소리 공유는 PC 브라우저에서만 지원됩니다.');
      return;
    }
    onToggleTab();
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <Toggle active={micOn} onClick={onToggleMic} icon={<MicIcon />} label="마이크" />
        <Toggle active={tabOn} onClick={handleTab} icon={<TabIcon />} label="탭 소리" />
      </div>

      {error && <p className="mt-2 text-xs text-[#ff6b6b]">{error}</p>}

      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        유튜브 소리는 브라우저 보안상 직접 연결할 수 없어요. ‘탭 소리’로 이 탭의 오디오를 공유하면 유튜브에도 바가 반응합니다. (Chrome·Edge 권장, 공유 창에서 ‘탭 오디오도 공유’ 체크)
      </p>
    </div>
  );
}

function Toggle({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
        active
          ? 'border-ember bg-ember/15 text-ember-soft'
          : 'border-ink-600 bg-ink-700/40 text-muted hover:border-muted hover:text-white'
      }`}
    >
      <span className="relative">
        {icon}
        {active && (
          <span className="absolute -right-1 -top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-ember" />
        )}
      </span>
      {label}
    </button>
  );
}

function MicIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0M12 17v4" />
    </svg>
  );
}
function TabIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M3 9h18M8 4v5" />
    </svg>
  );
}
