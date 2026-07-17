/**
 * 색상 유틸리티
 * LED 세그먼트마다 "높이 비율(0~1)"에 대응하는 색을 뽑아내기 위한 헬퍼 모음.
 * 팔레트는 여러 개의 HEX 색을 균등 간격의 그라디언트 스톱으로 취급한다.
 */

/** '#rrggbb' → { r, g, b } */
export function hexToRgb(hex) {
  const v = hex.replace('#', '');
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  };
}

/** 두 RGB 색을 t(0~1)로 선형 보간 */
function lerpRgb(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

/**
 * 균등 간격 HEX 배열에서 pos(0~1) 위치의 색을 보간해 반환한다.
 * 예) ['#000','#f00','#ff0'] 에서 pos=0.5 → 빨강.
 * 반복 계산을 피하려고 캐시(WeakMap)로 RGB 변환 결과를 재사용한다.
 */
const rgbCache = new WeakMap();
export function sampleGradient(stops, pos) {
  let rgbStops = rgbCache.get(stops);
  if (!rgbStops) {
    rgbStops = stops.map(hexToRgb);
    rgbCache.set(stops, rgbStops);
  }
  if (rgbStops.length === 1) return rgbStops[0];

  const clamped = Math.min(1, Math.max(0, pos));
  const scaled = clamped * (rgbStops.length - 1);
  const i = Math.floor(scaled);
  const frac = scaled - i;
  if (i >= rgbStops.length - 1) return rgbStops[rgbStops.length - 1];
  return lerpRgb(rgbStops[i], rgbStops[i + 1], frac);
}

/** { r, g, b } + alpha → 'rgba(...)' 문자열 */
export function rgba({ r, g, b }, a = 1) {
  return `rgba(${r},${g},${b},${a})`;
}
