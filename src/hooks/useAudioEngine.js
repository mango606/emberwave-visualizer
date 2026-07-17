import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useAudioEngine
 * -------------------------------------------------------------
 * 로컬 MP3 재생목록 + 실시간 주파수 분석을 담당하는 Web Audio 엔진.
 *
 * 오디오 그래프:
 *   MediaElementSource → AnalyserNode → GainNode(볼륨) → destination
 *
 * 설계 포인트
 *  - 재생목록: 여러 파일을 objectURL 로 만들어 tracksRef 에 보관하고,
 *    현재 인덱스(indexRef)의 트랙만 <audio> 에 로드한다.
 *  - 자동 넘김: 곡이 끝나면('ended') 다음 트랙으로 이동한다. 이벤트 핸들러가
 *    항상 최신 상태를 보도록 onEndedRef 로 콜백을 주입한다(stale closure 방지).
 *  - MediaElementSource 는 <audio> 당 한 번만 생성 가능하므로, 트랙 전환 시
 *    노드는 재사용하고 el.src 만 교체한다.
 *  - 오토플레이 정책: 그래프 생성/ctx.resume 은 사용자 제스처 시점에 수행하고,
 *    자동 넘김 시엔 이미 재생 중이던 컨텍스트를 이어받아 재생한다.
 */
export function useAudioEngine() {
  const audioElRef = useRef(null); // HTMLAudioElement
  const ctxRef = useRef(null);
  const sourceRef = useRef(null);
  const gainRef = useRef(null);
  const analyserRef = useRef(null);

  const tracksRef = useRef([]); // [{ name, url }]
  const indexRef = useRef(-1);
  const onEndedRef = useRef(() => {}); // 곡 종료 시 실행할 최신 콜백
  const pendingPlayRef = useRef(null); // 대기 중인 canplay 리스너(중복 방지)

  const [state, setState] = useState({
    tracks: [], // UI 표시용(name 만): [{ name }]
    currentIndex: -1,
    fileName: '',
    isReady: false,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
  });

  /** 최초 1회: 오디오 엘리먼트 준비 + 이벤트 바인딩 */
  useEffect(() => {
    const el = new Audio();
    el.preload = 'metadata';
    audioElRef.current = el;

    const onLoaded = () => setState((s) => ({ ...s, duration: el.duration || 0 }));
    const onTime = () => setState((s) => ({ ...s, currentTime: el.currentTime }));
    const onPlay = () => setState((s) => ({ ...s, isPlaying: true }));
    const onPause = () => setState((s) => ({ ...s, isPlaying: false }));
    const onEnded = () => onEndedRef.current(); // 자동 넘김 로직으로 위임

    el.addEventListener('loadedmetadata', onLoaded);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);

    return () => {
      el.pause();
      el.removeEventListener('loadedmetadata', onLoaded);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      tracksRef.current.forEach((t) => URL.revokeObjectURL(t.url)); // 메모리 정리
      ctxRef.current?.close();
    };
  }, []);

  /** 사용자 제스처 시점에 오디오 그래프를 최초 1회 구성 */
  const ensureGraph = useCallback(() => {
    if (ctxRef.current) {
      if (ctxRef.current.state === 'suspended') ctxRef.current.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const source = ctx.createMediaElementSource(audioElRef.current);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.85;
    const gain = ctx.createGain();
    gain.gain.value = 0.9;

    source.connect(analyser);
    analyser.connect(gain);
    gain.connect(ctx.destination);

    ctxRef.current = ctx;
    sourceRef.current = source;
    analyserRef.current = analyser;
    gainRef.current = gain;
  }, []);

  /** 지정 인덱스의 트랙을 로드한다. autoplay 이면 로딩 완료(canplay) 후 재생 */
  const loadIndex = useCallback(
    (i, autoplay) => {
      const el = audioElRef.current;
      const track = tracksRef.current[i];
      if (!el || !track) return;

      el.src = track.url;
      el.load();
      indexRef.current = i;
      setState((s) => ({
        ...s,
        currentIndex: i,
        fileName: track.name,
        isReady: true,
        currentTime: 0,
      }));

      if (autoplay) {
        ensureGraph();
        // 이전에 대기 중이던 canplay 리스너가 있으면 제거(빠른 연속 전환 대비)
        if (pendingPlayRef.current) el.removeEventListener('canplay', pendingPlayRef.current);
        const onCan = () => {
          el.removeEventListener('canplay', onCan);
          pendingPlayRef.current = null;
          if (ctxRef.current?.state === 'suspended') ctxRef.current.resume();
          el.play().catch(() => {});
        };
        pendingPlayRef.current = onCan;
        el.addEventListener('canplay', onCan);
      }
    },
    [ensureGraph],
  );

  /** 여러 파일을 받아 재생목록을 구성한다(오디오 파일만 필터링) */
  const loadFiles = useCallback(
    (fileList) => {
      const files = Array.from(fileList || []).filter(
        (f) => f.type.startsWith('audio/') || /\.(mp3|m4a|aac|ogg|wav|flac)$/i.test(f.name),
      );
      if (!files.length) return;

      tracksRef.current.forEach((t) => URL.revokeObjectURL(t.url)); // 이전 목록 정리
      const tracks = files.map((f) => ({ name: f.name, url: URL.createObjectURL(f) }));
      tracksRef.current = tracks;
      indexRef.current = 0;
      setState((s) => ({ ...s, tracks: tracks.map((t) => ({ name: t.name })) }));
      loadIndex(0, false); // 첫 곡은 로드만(재생은 사용자 클릭 때)
    },
    [loadIndex],
  );

  /** 곡 종료 시 자동 넘김: 목록이 여러 곡이면 순환 재생, 단일 곡이면 정지 */
  useEffect(() => {
    onEndedRef.current = () => {
      const tracks = tracksRef.current;
      if (tracks.length > 1) {
        const next = (indexRef.current + 1) % tracks.length;
        loadIndex(next, true);
      } else {
        setState((s) => ({ ...s, isPlaying: false, currentTime: 0 }));
      }
    };
  }, [loadIndex]);

  /** 재생/일시정지 토글 */
  const togglePlay = useCallback(async () => {
    const el = audioElRef.current;
    if (!el) return;
    if (!el.src && tracksRef.current.length) {
      loadIndex(0, true); // 아직 아무것도 로드 안 됐지만 목록이 있으면 첫 곡 재생
      return;
    }
    if (!el.src) return;
    ensureGraph();
    if (ctxRef.current?.state === 'suspended') await ctxRef.current.resume();
    if (el.paused) await el.play().catch(() => {});
    else el.pause();
  }, [ensureGraph, loadIndex]);

  /** 목록에서 특정 트랙 선택 재생 */
  const playTrack = useCallback((i) => loadIndex(i, true), [loadIndex]);

  /** 다음 곡(순환) */
  const next = useCallback(() => {
    const t = tracksRef.current;
    if (!t.length) return;
    loadIndex((indexRef.current + 1) % t.length, true);
  }, [loadIndex]);

  /** 이전 곡: 3초 이상 재생됐으면 현재 곡을 처음으로, 아니면 이전 곡으로(음악 플레이어 관례) */
  const prev = useCallback(() => {
    const t = tracksRef.current;
    if (!t.length) return;
    const el = audioElRef.current;
    if (el && el.currentTime > 3) {
      el.currentTime = 0;
      return;
    }
    loadIndex((indexRef.current - 1 + t.length) % t.length, true);
  }, [loadIndex]);

  /** 탐색(초 단위) */
  const seek = useCallback((time) => {
    const el = audioElRef.current;
    if (el?.src) el.currentTime = time;
  }, []);

  /** 음악 볼륨(0~1) - GainNode 제어 */
  const setMusicVolume = useCallback((v) => {
    if (gainRef.current) gainRef.current.gain.value = v;
  }, []);

  /** 모드 전환 시 분석기 파라미터 재설정 */
  const setAnalyserConfig = useCallback(({ fftSize, smoothing }) => {
    const a = analyserRef.current;
    if (!a) return;
    if (fftSize && a.fftSize !== fftSize) a.fftSize = fftSize;
    if (typeof smoothing === 'number') a.smoothingTimeConstant = smoothing;
  }, []);

  return {
    state,
    analyserRef,
    loadFiles,
    togglePlay,
    playTrack,
    next,
    prev,
    seek,
    setMusicVolume,
    setAnalyserConfig,
  };
}
