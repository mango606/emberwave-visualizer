/**
 * 설정 유지(localStorage) 유틸리티
 * -------------------------------------------------------------
 * 팔레트·모드·볼륨·EQ 를 저장해 재방문 시 복원한다.
 *
 * 설계 포인트
 *  - 키에 버전(v1)을 포함: 이후 설정 스키마가 바뀌면 버전을 올려
 *    구버전 데이터와의 충돌 없이 자연스럽게 초기화되도록 한다.
 *  - localStorage 는 시크릿 모드·저장소 차단 환경에서 예외를 던질 수
 *    있으므로 모든 접근을 try/catch 로 감싸고, 실패 시 조용히 기본값을 쓴다.
 */

const KEY = 'emberwave:settings:v1';

/** 저장된 설정을 읽는다. 없거나 손상됐으면 null */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/** 현재 설정을 저장한다(실패해도 앱 동작에는 영향 없음) */
export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 저장 불가 환경(시크릿 모드 등)은 무시
  }
}
