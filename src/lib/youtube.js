/**
 * 사용자가 입력한 유튜브 URL 또는 ID 문자열에서 11자리 videoId를 안전하게 추출한다.
 * - 지원: watch?v=, youtu.be/, /embed/, /shorts/, /live/, 그리고 raw ID
 * - 보안: 임의 문자열을 그대로 iframe에 넘기지 않도록, 최종적으로 11자
 *   [A-Za-z0-9_-] 패턴만 통과시킨다(입력 검증/화이트리스트).
 * @returns {string|null} 유효한 videoId 또는 null
 */
export function parseYouTubeId(input) {
  if (!input) return null;
  const raw = input.trim();

  // 1) 이미 순수 ID 형태인 경우
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;

  // 2) URL 파싱 시도
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      return sanitize(url.pathname.slice(1));
    }
    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      const v = url.searchParams.get('v');
      if (v) return sanitize(v);
      // /embed/ID, /shorts/ID, /live/ID
      const m = url.pathname.match(/\/(embed|shorts|live)\/([A-Za-z0-9_-]{11})/);
      if (m) return sanitize(m[2]);
    }
  } catch {
    // URL 이 아니면 아래 정규식 폴백으로 진행
  }

  // 3) 폴백: 문자열 어딘가에 있는 11자 ID 패턴
  const fallback = raw.match(/[A-Za-z0-9_-]{11}/);
  return fallback ? sanitize(fallback[0]) : null;
}

function sanitize(id) {
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

/** videoId → 표준 공유 링크 (크레딧 표기용) */
export function watchUrl(id) {
  return `https://www.youtube.com/watch?v=${id}`;
}
