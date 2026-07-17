import { useCallback, useEffect, useRef, useState } from 'react';
import YouTube from 'react-youtube';
import { parseYouTubeId } from '../lib/youtube';

/**
 * AsmrPlayer
 * -------------------------------------------------------------
 * 빗소리·모닥불 같은 유튜브 영상을 '화면에 보이지 않게' 오디오만 재생한다.
 *  - react-youtube 로 IFrame 을 1px 크기 + opacity 0 으로 숨긴다.
 *  - 볼륨은 부모(App)가 내려주는 volume(0~100)을 player.setVolume 으로 반영.
 *  - 영상 제목/ID 는 onInfo 로 부모에 올려, 하단 크레딧 UI 에서 출처를 표기.
 *
 * autoplay 정책: '재생' 클릭(사용자 제스처) 시점에 videoId 를 세팅하므로
 *               소리와 함께 자동 재생이 허용된다.
 */
export default function AsmrPlayer({ volume, onInfo }) {
  const [input, setInput] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [error, setError] = useState('');
  const playerRef = useRef(null);

  const start = useCallback(() => {
    const id = parseYouTubeId(input);
    if (!id) {
      setError('유효한 유튜브 링크 또는 11자리 ID 가 아닙니다.');
      return;
    }
    setError('');
    setActiveId(id);
  }, [input]);

  const stop = useCallback(() => {
    playerRef.current?.stopVideo?.();
    setActiveId(null);
    onInfo?.(null);
  }, [onInfo]);

  const onReady = useCallback(
    (e) => {
      playerRef.current = e.target;
      e.target.setVolume(volume);
      e.target.playVideo();
      // 제목은 재생이 시작되어야 채워지는 경우가 있어 onStateChange 에서도 갱신
      const d = e.target.getVideoData?.();
      if (d?.title) onInfo?.({ id: d.video_id || activeId, title: d.title });
    },
    [volume, activeId, onInfo],
  );

  const onStateChange = useCallback(
    (e) => {
      const d = e.target.getVideoData?.();
      if (d?.title) onInfo?.({ id: d.video_id || activeId, title: d.title });
    },
    [activeId, onInfo],
  );

  const onError = useCallback(() => {
    setError('영상을 재생할 수 없습니다(임베드 제한/삭제 가능).');
    onInfo?.(null);
  }, [onInfo]);

  // 볼륨 반영: 부모 volume 변화 → 플레이어 인스턴스가 있을 때만 setVolume
  useEffect(() => {
    playerRef.current?.setVolume?.(volume);
  }, [volume]);

  const opts = {
    height: '1',
    width: '1',
    playerVars: {
      autoplay: 1,
      controls: 0,
      loop: 1,
      playlist: activeId ?? undefined, // 단일 영상 무한 반복을 위해 자기 자신을 재생목록으로
      modestbranding: 1,
      playsinline: 1,
      disablekb: 1,
      rel: 0,
      fs: 0,
    },
  };

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && start()}
          placeholder="유튜브 링크 또는 영상 ID"
          className="min-w-0 flex-1 rounded-lg border border-ink-600 bg-ink-700 px-3 py-2 font-mono text-sm text-white placeholder:text-muted focus:border-ember focus:outline-none"
        />
        {activeId ? (
          <button
            onClick={stop}
            className="shrink-0 rounded-lg border border-ink-600 px-3 py-2 text-sm text-muted transition hover:text-white"
          >
            정지
          </button>
        ) : (
          <button
            onClick={start}
            className="shrink-0 rounded-lg bg-ember px-4 py-2 text-sm font-semibold text-ink-900 transition hover:bg-ember-soft"
          >
            재생
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-[#ff6b6b]">{error}</p>}

      {/* 숨김 플레이어: 레이아웃에는 남겨두되 시각적으로만 감춘다(display:none 은 일부 브라우저에서 오디오가 멈춤) */}
      {activeId && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed bottom-0 right-0 h-px w-px overflow-hidden opacity-0"
        >
          <YouTube
            videoId={activeId}
            opts={opts}
            onReady={onReady}
            onStateChange={onStateChange}
            onError={onError}
          />
        </div>
      )}
    </div>
  );
}
