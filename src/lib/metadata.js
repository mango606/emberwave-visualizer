import { parseBlob } from 'music-metadata';

/**
 * 오디오 파일에서 곡 제목·아티스트·앨범아트를 추출한다.
 * mp3(ID3v1/v2)뿐 아니라 m4a·flac·ogg 등 컨테이너별 태그도 처리된다.
 *
 * 반환 규칙(기본값 처리)
 *  - 태그가 없거나 파싱에 실패하면 빈 문자열을 돌려주고,
 *    호출부(엔진)가 "파일명(확장자 제거)"을 기본 제목으로 사용한다.
 *  - 앨범아트는 objectURL 로 만들어 반환하므로, 트랙 삭제 시 반드시
 *    URL.revokeObjectURL 로 해제해야 한다(엔진에서 처리).
 */
export async function readTags(file) {
  const empty = { title: '', artist: '', artUrl: '', artType: '' };
  try {
    const { common } = await parseBlob(file, { duration: false });
    let artUrl = '';
    let artType = '';
    const pic = common.picture?.[0];
    if (pic?.data?.length) {
      const blob = new Blob([pic.data], { type: pic.format || 'image/jpeg' });
      artUrl = URL.createObjectURL(blob);
      artType = pic.format || 'image/jpeg';
    }
    return {
      title: (common.title || '').trim(),
      artist: (common.artist || '').trim(),
      artUrl,
      artType,
    };
  } catch {
    return empty; // 손상 파일·미지원 포맷은 기본값으로
  }
}
