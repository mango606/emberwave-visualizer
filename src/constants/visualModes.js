/**
 * 10가지 테마 모드(반응 스타일).
 *
 * 각 모드는 (1) Web Audio 분석기 파라미터와 (2) 캔버스 렌더링 파라미터를
 * 하나의 "설정 객체"로 캡슐화한다. 모드를 바꾸면 App 이 분석기를 재설정하고,
 * Visualizer 는 같은 설정 객체를 읽어 렌더링 동작만 달리한다.
 *
 * 필드 설명
 *  - fftSize:      주파수 해상도(2의 거듭제곱). 클수록 막대가 촘촘해진다.
 *  - smoothing:    smoothingTimeConstant(0~1). 클수록 반응이 부드럽고 느리다.
 *  - bars:         화면에 그릴 막대 개수.
 *  - segments:     막대 하나를 구성하는 LED 세그먼트(칸) 개수.
 *  - segGap:       세그먼트 사이 간격(px).
 *  - decay:        막대가 내려올 때의 감쇠 계수(1에 가까울수록 천천히 하강).
 *  - glow:         shadowBlur 값(0이면 글로우 없음).
 *  - frameInterval:렌더 간격(ms). 0이면 매 프레임, 값이 크면 레트로처럼 끊긴다.
 *  - bassBoost:    저역대 막대 강조 배율(1이면 강조 없음).
 *  - mirror:       상하 대칭으로 그릴지 여부.
 *  - peakHold:     피크 홀드(정점에 잠시 머무는 캡) 사용 여부.
 *  - peakDecay:    피크 캡이 떨어지는 속도.
 *  - pulse:        저역 에너지로 전체 막대를 함께 들썩이게 할지 여부.
 *  - idleSpeed:    무음(대기) 상태에서 '불멍' 앰비언트 물결의 속도.
 */
export const VISUAL_MODES = [
  {
    id: 'calm', nameKo: '차분한', desc: '물결처럼 부드럽고 느리게',
    fftSize: 2048, smoothing: 0.9, bars: 32, segments: 22, segGap: 3,
    decay: 0.9, glow: 10, frameInterval: 0, bassBoost: 1.0,
    mirror: false, peakHold: false, peakDecay: 0.012, pulse: false, idleSpeed: 0.4,
  },
  {
    id: 'energetic', nameKo: '신나는', desc: '베이스에 강하게 튀어 오르게',
    fftSize: 1024, smoothing: 0.6, bars: 40, segments: 20, segGap: 2,
    decay: 0.78, glow: 8, frameInterval: 0, bassBoost: 1.6,
    mirror: false, peakHold: true, peakDecay: 0.02, pulse: false, idleSpeed: 1.0,
  },
  {
    id: 'retro8', nameKo: '레트로 8비트', desc: '프레임이 끊기는 8비트 감성',
    fftSize: 256, smoothing: 0.35, bars: 14, segments: 9, segGap: 4,
    decay: 0.5, glow: 0, frameInterval: 90, bassBoost: 1.2,
    mirror: false, peakHold: false, peakDecay: 0.02, pulse: false, idleSpeed: 0.5,
  },
  {
    id: 'wave', nameKo: '웨이브', desc: '잔잔하게 흐르는 파형',
    fftSize: 2048, smoothing: 0.88, bars: 48, segments: 24, segGap: 2,
    decay: 0.92, glow: 6, frameInterval: 0, bassBoost: 1.0,
    mirror: false, peakHold: false, peakDecay: 0.01, pulse: false, idleSpeed: 0.3,
  },
  {
    id: 'pulse', nameKo: '펄스', desc: '비트에 맞춰 전체가 들썩',
    fftSize: 512, smoothing: 0.7, bars: 36, segments: 18, segGap: 3,
    decay: 0.8, glow: 14, frameInterval: 0, bassBoost: 1.3,
    mirror: false, peakHold: false, peakDecay: 0.02, pulse: true, idleSpeed: 0.7,
  },
  {
    id: 'minimal', nameKo: '미니멀', desc: '얇고 담백하게',
    fftSize: 1024, smoothing: 0.85, bars: 28, segments: 16, segGap: 2,
    decay: 0.9, glow: 0, frameInterval: 0, bassBoost: 1.0,
    mirror: false, peakHold: false, peakDecay: 0.01, pulse: false, idleSpeed: 0.25,
  },
  {
    id: 'spectrum', nameKo: '스펙트럼', desc: '촘촘하고 정밀한 전대역',
    fftSize: 4096, smoothing: 0.75, bars: 96, segments: 26, segGap: 1,
    decay: 0.82, glow: 4, frameInterval: 0, bassBoost: 1.0,
    mirror: false, peakHold: false, peakDecay: 0.01, pulse: false, idleSpeed: 0.5,
  },
  {
    id: 'mirror', nameKo: '미러', desc: '상하로 대칭되는 무대',
    fftSize: 2048, smoothing: 0.8, bars: 40, segments: 12, segGap: 2,
    decay: 0.85, glow: 10, frameInterval: 0, bassBoost: 1.1,
    mirror: true, peakHold: false, peakDecay: 0.01, pulse: false, idleSpeed: 0.5,
  },
  {
    id: 'neon-glow', nameKo: '네온 글로우', desc: '번지는 네온 잔광',
    fftSize: 1024, smoothing: 0.82, bars: 32, segments: 20, segGap: 3,
    decay: 0.88, glow: 26, frameInterval: 0, bassBoost: 1.0,
    mirror: false, peakHold: false, peakDecay: 0.01, pulse: false, idleSpeed: 0.35,
  },
  {
    id: 'vu-meter', nameKo: 'VU 미터', desc: '피크 홀드가 살아있는 계기판',
    fftSize: 512, smoothing: 0.7, bars: 16, segments: 14, segGap: 4,
    decay: 0.75, glow: 8, frameInterval: 0, bassBoost: 1.2,
    mirror: false, peakHold: true, peakDecay: 0.015, pulse: false, idleSpeed: 0.4,
  },
];

export const DEFAULT_MODE_ID = 'calm';
