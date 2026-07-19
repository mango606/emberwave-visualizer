/**
 * File System Access API 유틸리티
 * -------------------------------------------------------------
 * Chromium 계열에서 지원하는 showDirectoryPicker 로 폴더 "핸들"을 얻으면,
 * 스냅샷(webkitdirectory)과 달리 이후에도 같은 핸들로 폴더를 다시 읽을 수
 * 있어 새로 추가된 곡을 자동으로 반영할 수 있다.
 */

const AUDIO_RE = /\.(mp3|m4a|aac|ogg|wav|flac)$/i;

/** 브라우저가 File System Access API 를 지원하는지 */
export function supportsFSA() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * 디렉터리 핸들을 재귀 순회하며 오디오 파일을 수집한다.
 * @returns {Promise<Array<{ file: File, path: string }>>}
 *          path 는 폴더 기준 상대 경로로, 재스캔 시 신곡 판별 키로 쓴다.
 */
export async function scanAudioFiles(dirHandle, base = '') {
  const out = [];
  for await (const [name, handle] of dirHandle.entries()) {
    const path = base ? `${base}/${name}` : name;
    if (handle.kind === 'file') {
      if (AUDIO_RE.test(name)) {
        try {
          const file = await handle.getFile();
          out.push({ file, path });
        } catch {
          // 읽기 실패한 파일(잠김/삭제 중)은 건너뛴다
        }
      }
    } else if (handle.kind === 'directory') {
      out.push(...(await scanAudioFiles(handle, path)));
    }
  }
  // 경로 기준 정렬로 폴더 구조 순서를 안정적으로 유지
  out.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
  return out;
}
