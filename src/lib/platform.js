/** 모바일 기기 여부(간단한 UA 판별). 기능 안내 문구 노출 용도로만 사용한다. */
export function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
