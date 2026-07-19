import { useCallback, useEffect, useRef, useState } from 'react';
import { scanAudioFiles, supportsFSA } from '../lib/fileSystem';

/**
 * 파일의 재생 길이(초)를 비동기로 측정한다.
 * 임시 오디오 엘리먼트에 metadata 만 로드해 duration 을 읽는다.
 */
function probeDuration(url) {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = 'metadata';
    a.src = url;
    a.addEventListener('loadedmetadata', () => resolve(a.duration || 0), { once: true });
    a.addEventListener('error', () => resolve(0), { once: true });
  });
}

/**
 * useAudioEngine
 * -------------------------------------------------------------
 * 로컬 MP3 재생목록 + 실시간 주파수 분석을 담당하는 Web Audio 엔진.
 *
 * 오디오 그래프:
 *   MediaElementSource → AnalyserNode → GainNode(볼륨) → destination
 *
 * 설계 포인트
 *  - 트랙은 { id, name, url, duration } 구조. 셔플·순서변경·삭제로 위치가
 *    바뀌어도 "현재 재생 중인 곡"을 놓치지 않도록 id(currentIdRef)로 추적하고,
 *    변경 후 indexRef 를 id 로부터 다시 계산한다.
 *  - 자동 넘김: 곡 종료('ended') 시 다음 트랙으로 이동. 이벤트 핸들러가 항상
 *    최신 상태를 보도록 onEndedRef 로 콜백을 주입한다(stale closure 방지).
 *  - MediaElementSource 는 <audio> 당 한 번만 생성 가능하므로 노드는 재사용하고
 *    el.src 만 교체한다.
 */
export function useAudioEngine() {
  const audioElRef = useRef(null);
  const ctxRef = useRef(null);
  const sourceRef = useRef(null);
  const gainRef = useRef(null);
  const analyserRef = useRef(null);

  const tracksRef = useRef([]); // [{ id, name, url, duration }]
  const indexRef = useRef(-1); // 현재 로드된 트랙의 위치
  const currentIdRef = useRef(null); // 현재 로드된 트랙의 id(위치 변화에도 유지)
  const idSeqRef = useRef(0); // 트랙 id 시퀀스
  const onEndedRef = useRef(() => {});
  const pendingPlayRef = useRef(null);

  // 라이브 입력(시각화 전용, destination 에는 연결하지 않음)
  const micStreamRef = useRef(null);
  const micNodeRef = useRef(null);
  const dispStreamRef = useRef(null);
  const dispNodeRef = useRef(null);

  // 연결된 폴더(File System Access API): { handle, name, paths: Set<string> }
  const folderRef = useRef(null);
  const pollTimerRef = useRef(null);

  const [state, setState] = useState({
    tracks: [], // UI 표시용: [{ id, name, duration }]
    currentIndex: -1,
    fileName: '',
    isReady: false,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    micOn: false, // 마이크 입력 활성 여부
    tabOn: false, // 탭/화면 오디오 공유 활성 여부
    inputError: '', // 라이브 입력 오류 메시지
    folderName: '', // 연결된 폴더 이름(FSA)
    folderCount: 0, // 폴더에서 가져온 트랙 수
  });

  /** tracksRef / indexRef 의 최신 상태를 UI state 에 반영 */
  const syncTracks = useCallback(() => {
    setState((s) => ({
      ...s,
      tracks: tracksRef.current.map((t) => ({ id: t.id, name: t.name, duration: t.duration })),
      currentIndex: indexRef.current,
    }));
  }, []);

  /** 최초 1회: 오디오 엘리먼트 준비 + 이벤트 바인딩 */
  useEffect(() => {
    const el = new Audio();
    el.preload = 'metadata';
    audioElRef.current = el;

    const onLoaded = () => setState((s) => ({ ...s, duration: el.duration || 0 }));
    const onTime = () => setState((s) => ({ ...s, currentTime: el.currentTime }));
    const onPlay = () => setState((s) => ({ ...s, isPlaying: true }));
    const onPause = () => setState((s) => ({ ...s, isPlaying: false }));
    const onEnded = () => onEndedRef.current();

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
      tracksRef.current.forEach((t) => URL.revokeObjectURL(t.url));
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      dispStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
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

    // 음악 경로와 시각화 탭을 분리한다.
    //  - 가청 경로: source → gain(볼륨) → destination
    //  - 시각화 탭: source → analyser (analyser 는 destination 으로 잇지 않음)
    // analyser 를 출력에 연결하지 않으므로, 이후 마이크·탭 소리를 analyser 에
    // 붙여도 스피커로 되돌아가는 하울링/에코가 생기지 않는다.
    source.connect(gain);
    gain.connect(ctx.destination);
    source.connect(analyser);

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
      currentIdRef.current = track.id;
      setState((s) => ({
        ...s,
        currentIndex: i,
        fileName: track.name,
        isReady: true,
        currentTime: 0,
      }));

      if (autoplay) {
        ensureGraph();
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

  /**
   * File 배열을 재생목록 뒤에 이어 붙이는 공용 헬퍼.
   * 파일 선택·폴더 스냅샷·FSA 폴더 스캔 모두 이 경로를 거친다.
   * 목록이 비어 있었다면 첫 곡을 로드해 재생 준비 상태로 만든다.
   */
  const appendTracks = useCallback(
    (files) => {
      if (!files.length) return [];
      const wasEmpty = tracksRef.current.length === 0;
      const added = files.map((f) => ({
        id: ++idSeqRef.current,
        name: f.name,
        url: URL.createObjectURL(f),
        duration: 0,
      }));
      tracksRef.current = [...tracksRef.current, ...added];

      if (wasEmpty) {
        indexRef.current = 0;
        currentIdRef.current = tracksRef.current[0].id;
        syncTracks();
        loadIndex(0, false); // 첫 곡은 로드만(재생은 사용자 클릭 때)
      } else {
        syncTracks();
      }

      // 새로 추가된 트랙의 길이를 비동기로 측정해 채워 넣는다
      added.forEach((t) => {
        probeDuration(t.url).then((d) => {
          t.duration = d;
          setState((s) => ({
            ...s,
            tracks: s.tracks.map((x) => (x.id === t.id ? { ...x, duration: d } : x)),
          }));
        });
      });
      return added;
    },
    [loadIndex, syncTracks],
  );

  /**
   * 여러 파일을 받아 재생목록에 추가한다(오디오 파일만 필터링).
   * 파일 선택과 폴더 스냅샷(webkitdirectory) 양쪽에서 공용으로 사용한다.
   */
  const loadFiles = useCallback(
    (fileList) => {
      const files = Array.from(fileList || []).filter(
        (f) => f.type.startsWith('audio/') || /\.(mp3|m4a|aac|ogg|wav|flac)$/i.test(f.name),
      );
      appendTracks(files);
    },
    [appendTracks],
  );

  /** 폴더 재스캔: 아직 목록에 없는 새 파일만 골라 이어 붙인다 */
  const syncFolder = useCallback(async () => {
    const folder = folderRef.current;
    if (!folder) return;
    try {
      const entries = await scanAudioFiles(folder.handle);
      const fresh = entries.filter((e) => !folder.paths.has(e.path));
      if (fresh.length) {
        fresh.forEach((e) => folder.paths.add(e.path));
        appendTracks(fresh.map((e) => e.file));
        setState((s) => ({ ...s, folderCount: folder.paths.size }));
      }
    } catch {
      // 권한 회수·폴더 삭제 등으로 접근 불가 시 자동 동기화만 중단
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      folderRef.current = null;
      setState((s) => ({ ...s, folderName: '', folderCount: 0 }));
    }
  }, [appendTracks]);

  /**
   * File System Access API 로 폴더를 연결한다(Chromium 계열).
   * 최초 스캔으로 오디오 파일을 목록에 올린 뒤, 20초 간격으로 재스캔해
   * 폴더에 새로 추가된 곡을 자동으로 반영한다. 기존 곡 재생은 방해하지 않는다.
   */
  const connectFolder = useCallback(async () => {
    if (!supportsFSA()) return false; // 호출부에서 webkitdirectory 폴백
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' });
      const entries = await scanAudioFiles(handle);
      folderRef.current = { handle, name: handle.name, paths: new Set(entries.map((e) => e.path)) };
      appendTracks(entries.map((e) => e.file));
      setState((s) => ({ ...s, folderName: handle.name, folderCount: entries.length }));

      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(syncFolder, 20000); // 20초마다 신곡 감지
      return true;
    } catch (e) {
      // 사용자가 선택 창을 닫은 경우(AbortError)는 조용히 무시
      if (e?.name !== 'AbortError') {
        setState((s) => ({ ...s, inputError: '폴더에 접근할 수 없습니다.' }));
      }
      return true; // FSA 경로를 탔으므로 폴백은 하지 않는다
    }
  }, [appendTracks, syncFolder]);

  /** 폴더 연결 해제: 자동 동기화 중단(이미 추가된 곡은 목록에 유지) */
  const disconnectFolder = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    folderRef.current = null;
    setState((s) => ({ ...s, folderName: '', folderCount: 0 }));
  }, []);

  /** 곡 종료 시 자동 넘김: 여러 곡이면 순환 재생, 단일 곡이면 정지 */
  useEffect(() => {
    onEndedRef.current = () => {
      const tracks = tracksRef.current;
      if (tracks.length > 1) {
        loadIndex((indexRef.current + 1) % tracks.length, true);
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
      loadIndex(0, true);
      return;
    }
    if (!el.src) return;
    ensureGraph();
    if (ctxRef.current?.state === 'suspended') await ctxRef.current.resume();
    if (el.paused) await el.play().catch(() => {});
    else el.pause();
  }, [ensureGraph, loadIndex]);

  const playTrack = useCallback((i) => loadIndex(i, true), [loadIndex]);

  /** 다음 곡(순환) */
  const next = useCallback(() => {
    const t = tracksRef.current;
    if (!t.length) return;
    loadIndex((indexRef.current + 1) % t.length, true);
  }, [loadIndex]);

  /** 이전 곡: 3초 이상 재생됐으면 현재 곡을 처음으로, 아니면 이전 곡으로 */
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

  /** 재생목록 셔플(Fisher-Yates). 현재 곡은 id 로 위치만 다시 계산 */
  const shuffle = useCallback(() => {
    const tracks = tracksRef.current;
    if (tracks.length < 2) return;
    for (let i = tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
    }
    indexRef.current = tracks.findIndex((x) => x.id === currentIdRef.current);
    syncTracks();
  }, [syncTracks]);

  /** 드래그 순서 변경: from 위치의 트랙을 to 위치로 이동 */
  const reorderTracks = useCallback(
    (from, to) => {
      const tracks = tracksRef.current;
      if (from === to || from < 0 || to < 0 || from >= tracks.length || to >= tracks.length) return;
      const [moved] = tracks.splice(from, 1);
      tracks.splice(to, 0, moved);
      indexRef.current = tracks.findIndex((x) => x.id === currentIdRef.current);
      syncTracks();
    },
    [syncTracks],
  );

  /** 트랙 삭제 */
  const removeTrack = useCallback(
    (i) => {
      const tracks = tracksRef.current;
      const target = tracks[i];
      if (!target) return;
      const wasCurrent = target.id === currentIdRef.current;
      const el = audioElRef.current;
      URL.revokeObjectURL(target.url);
      tracks.splice(i, 1);

      if (tracks.length === 0) {
        // 목록이 비면 재생 정지 및 초기화
        el.pause();
        el.removeAttribute('src');
        el.load();
        indexRef.current = -1;
        currentIdRef.current = null;
        setState((s) => ({
          ...s,
          tracks: [],
          currentIndex: -1,
          fileName: '',
          isReady: false,
          isPlaying: false,
          currentTime: 0,
          duration: 0,
        }));
        return;
      }

      if (wasCurrent) {
        // 재생 중이던 곡을 지웠으면, 그 자리에 온 곡을 이어서(재생 중이었다면 계속 재생)
        const wasPlaying = !el.paused;
        loadIndex(Math.min(i, tracks.length - 1), wasPlaying);
      } else {
        indexRef.current = tracks.findIndex((x) => x.id === currentIdRef.current);
      }
      syncTracks();
    },
    [loadIndex, syncTracks],
  );

  const seek = useCallback((time) => {
    const el = audioElRef.current;
    if (el?.src) el.currentTime = time;
  }, []);

  const setMusicVolume = useCallback((v) => {
    if (gainRef.current) gainRef.current.gain.value = v;
  }, []);

  /**
   * 마이크 입력을 analyser 에 연결/해제한다(시각화 전용, 재생 안 함).
   * 원신호를 그대로 쓰기 위해 에코 제거·노이즈 억제·자동 게인을 끈다.
   */
  const toggleMic = useCallback(async () => {
    if (micStreamRef.current) {
      micNodeRef.current?.disconnect();
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micNodeRef.current = null;
      micStreamRef.current = null;
      setState((s) => ({ ...s, micOn: false }));
      return;
    }
    try {
      ensureGraph();
      if (ctxRef.current?.state === 'suspended') await ctxRef.current.resume();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const node = ctxRef.current.createMediaStreamSource(stream);
      node.connect(analyserRef.current); // analyser 로만 연결(출력 X)
      micStreamRef.current = stream;
      micNodeRef.current = node;
      setState((s) => ({ ...s, micOn: true, inputError: '' }));
    } catch {
      setState((s) => ({ ...s, inputError: '마이크 권한이 거부되었거나 사용할 수 없습니다.' }));
    }
  }, [ensureGraph]);

  /**
   * 탭/화면 오디오 공유를 analyser 에 연결/해제한다.
   * 이 탭을 공유하면 내부 유튜브 iframe 오디오까지 캡처되어 바가 반응한다.
   * (Chromium 계열에서 '탭 오디오 공유' 지원. 영상 트랙은 즉시 정지한다.)
   */
  const toggleTab = useCallback(async () => {
    if (dispStreamRef.current) {
      dispNodeRef.current?.disconnect();
      dispStreamRef.current.getTracks().forEach((t) => t.stop());
      dispNodeRef.current = null;
      dispStreamRef.current = null;
      setState((s) => ({ ...s, tabOn: false }));
      return;
    }
    try {
      ensureGraph();
      if (ctxRef.current?.state === 'suspended') await ctxRef.current.resume();
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const audioTracks = stream.getAudioTracks();
      if (!audioTracks.length) {
        stream.getTracks().forEach((t) => t.stop());
        setState((s) => ({
          ...s,
          inputError: "오디오가 캡처되지 않았습니다. 공유 창에서 '탭 오디오도 공유'를 체크해 주세요.",
        }));
        return;
      }
      stream.getVideoTracks().forEach((t) => t.stop()); // 영상은 불필요
      const node = ctxRef.current.createMediaStreamSource(stream);
      node.connect(analyserRef.current); // analyser 로만 연결(출력 X, 유튜브 소리는 원래대로 들림)
      dispStreamRef.current = stream;
      dispNodeRef.current = node;
      // 사용자가 브라우저 UI 로 공유를 멈추면 자동 정리
      audioTracks[0].addEventListener('ended', () => {
        dispNodeRef.current?.disconnect();
        dispNodeRef.current = null;
        dispStreamRef.current = null;
        setState((s) => ({ ...s, tabOn: false }));
      });
      setState((s) => ({ ...s, tabOn: true, inputError: '' }));
    } catch {
      // 사용자가 공유를 취소한 경우 등
      setState((s) => ({ ...s, inputError: '탭 소리 공유가 취소되었거나 지원되지 않는 브라우저입니다.' }));
    }
  }, [ensureGraph]);

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
    shuffle,
    reorderTracks,
    removeTrack,
    seek,
    setMusicVolume,
    setAnalyserConfig,
    toggleMic,
    toggleTab,
    connectFolder,
    syncFolder,
    disconnectFolder,
    fsaSupported: supportsFSA(),
  };
}
