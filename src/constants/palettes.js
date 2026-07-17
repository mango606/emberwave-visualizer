/**
 * 12가지 LED 색상 팔레트.
 *
 * 설계 의도(디자인 패턴): 렌더링 로직과 색상 데이터를 분리해서,
 * 비주얼라이저는 "팔레트라는 데이터"만 소비하도록 한다(데이터 주도 렌더링).
 * 새 색을 추가할 때 컴포넌트 수정 없이 이 배열만 늘리면 된다.
 *
 * stops: 아래(0) → 위(1) 방향으로 균등 배치되는 HEX 그라디언트 스톱.
 *        스톱이 1개면 단색, 2개 이상이면 세그먼트 높이에 따라 색이 변한다.
 * swatch: UI 미리보기용 대표 색(그라디언트 중앙 근처).
 */
export const PALETTES = [
  { id: 'neon-green', nameKo: '네온 그린', stops: ['#0f5132', '#39ff14'], swatch: '#39ff14' },
  { id: 'pure-white', nameKo: '퓨어 화이트', stops: ['#3a3a44', '#f5f5f5'], swatch: '#f5f5f5' },
  { id: 'synthwave', nameKo: '신스웨이브 퍼플', stops: ['#5b1e9c', '#b24bf3', '#ff3cac'], swatch: '#c94bf0' },
  { id: 'sunset', nameKo: '선셋 오렌지', stops: ['#7a1f0a', '#ff6b35', '#f7c948'], swatch: '#ff8a3d' },
  { id: 'aurora', nameKo: '오로라 블루', stops: ['#0a3d5c', '#00e5ff', '#3af0a0'], swatch: '#22e0d0' },
  { id: 'amber', nameKo: '앰버', stops: ['#4a2c00', '#ffb000'], swatch: '#ffb000' },
  { id: 'crimson', nameKo: '크림슨 레드', stops: ['#4a0510', '#ff2e4c'], swatch: '#ff2e4c' },
  { id: 'ice-cyan', nameKo: '아이스 시안', stops: ['#0a3a45', '#7df9ff'], swatch: '#7df9ff' },
  { id: 'vaporwave', nameKo: '베이퍼웨이브', stops: ['#01cdfe', '#b967ff', '#ff71ce'], swatch: '#b967ff' },
  { id: 'gold-lux', nameKo: '골드 럭스', stops: ['#3d2c00', '#ffd700', '#fff3b0'], swatch: '#ffd700' },
  { id: 'emerald', nameKo: '에메랄드', stops: ['#063d2e', '#2ee6a6'], swatch: '#2ee6a6' },
  // 클래식 VU 미터 감성: 아래는 안전(초록) → 위로 갈수록 경고(빨강)
  { id: 'vu-classic', nameKo: '클래식 VU', stops: ['#22c55e', '#eab308', '#f97316', '#ef4444'], swatch: '#eab308' },
];

export const DEFAULT_PALETTE_ID = 'amber'; // '불멍' 콘셉트에 맞는 잉걸불 톤을 기본값으로
