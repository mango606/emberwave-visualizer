import { useCallback, useEffect, useRef, useState } from 'react';
import { scanAudioFiles, supportsFSA } from '../lib/fileSystem';
import { saveTrack, deleteTrack, saveOrder, loadAllTracks, clearAllStored } from '../lib/trackStore';
import { readTags } from '../lib/metadata';

/** 표시용 기본 제목: 파일 확장자를 뗀 파일명 */
function stripExt(name) {
  return name.replace(/\.[^.]+$/, '');
}

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

/** 영구 트랙 id: 세션이 바뀌어도 유지되는 IndexedDB 키로 쓴다 */
let uidSeq = 0;
function newUid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${++uidSeq}`;
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
  const eqRef = useRef({ nodes: null, gains: { bass: 0, mid: 0, treble: 0 } }); // EQ 필터/보류값
  const volumeRef = useRef(0.5); // 그래프 생성 전 설정된 볼륨 보류값(기본 50%)
  const indexRef = useRef(-1); // 현재 로드된 트랙의 위치
  const currentIdRef = useRef(null); // 현재 로드된 트랙의 id(위치 변화에도 유지)
  const onEndedRef = useRef(() => {});
  const pendingPlayRef = useRef(null);
  const repeatRef = useRef('all'); // 'all' 전체 반복 | 'one' 한 곡 반복 | 'none' 반복 안 함

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
    repeatMode: 'all', // 반복 모드
  });

  /** tracksRef / indexRef 의 최신 상태를 UI state 에 반영 */
  const syncTracks = useCallback(() => {
    setState((s) => ({
      ...s,
      tracks: tracksRef.current.map((t) => ({
        id: t.id,
        name: t.name,
        duration: t.duration,
        title: t.title,
        artist: t.artist,
        artUrl: t.artUrl,
        artType: t.artType,
      })),
      currentIndex: indexRef.current,
    }));
  }, []);

  /** 최초 1회: 오디오 엘리먼트 준비 + 이벤트 바인딩 */
  useEffect(() => {
    const el = new Audio();
    el.preload = 'auto'; // 충분한 사전 버퍼링으로 재생 중 끊김 방지
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
      tracksRef.current.forEach((t) => {
        URL.revokeObjectURL(t.url);
        if (t.artUrl) URL.revokeObjectURL(t.artUrl);
      });
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
    // 음악 감상용 'playback' 힌트: 버퍼를 넉넉히 잡아 CPU 부하 시 끊김을 막는다.
    // (구형 webkit 은 옵션 객체를 거부할 수 있어 폴백을 둔다)
    let ctx;
    try {
      ctx = new Ctx({ latencyHint: 'playback' });
    } catch {
      ctx = new Ctx();
    }
    const source = ctx.createMediaElementSource(audioElRef.current);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.85;
    const gain = ctx.createGain();
    gain.gain.value = volumeRef.current; // 그래프 생성 전 설정된 볼륨을 그대로 반영

    // 3밴드 EQ(음질 조정): 저음(lowshelf) → 중음(peaking) → 고음(highshelf)
    // 각 밴드는 dB 단위 게인으로 조절한다. 그래프 생성 전에 설정된 값이 있으면
    // (eqRef.gains) 여기서 한 번에 반영한다.
    const bass = ctx.createBiquadFilter();
    bass.type = 'lowshelf';
    bass.frequency.value = 200; // 200Hz 이하 저역
    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 1000; // 1kHz 중심 중역
    mid.Q.value = 1;
    const treble = ctx.createBiquadFilter();
    treble.type = 'highshelf';
    treble.frequency.value = 3200; // 3.2kHz 이상 고역
    const g = eqRef.current.gains;
    bass.gain.value = g.bass;
    mid.gain.value = g.mid;
    treble.gain.value = g.treble;
    eqRef.current.nodes = { bass, mid, treble };

    // 가청 경로와 시각화 탭 분리:
    //  - 가청: source → EQ(bass→mid→treble) → gain(볼륨) → destination
    //  - 시각화: treble(EQ 통과 후) → analyser (destination 미연결)
    // analyser 를 EQ 뒤에 두어, 음질 조정 결과가 LED 바에도 그대로 반영된다.
    // 마이크·탭 소리는 이후 analyser 에 직접 합류해도 출력으로 새지 않는다.
    source.connect(bass);
    bass.connect(mid);
    mid.connect(treble);
    treble.connect(gain);
    gain.connect(ctx.destination);
    treble.connect(analyser);

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

  /** 현재 재생 순서를 IndexedDB 에 저장(실패 무시) */
  const persistOrder = useCallback(() => {
    saveOrder(tracksRef.current.map((t) => t.id)).catch(() => {});
  }, []);

  /**
   * 태그(제목·아티스트·앨범아트)를 비동기로 읽어 트랙에 채운다.
   * 태그가 없으면 기본값(파일명 제목)을 그대로 유지한다.
   */
  const attachTags = useCallback((track, blob) => {
    readTags(blob).then((tags) => {
      // 트랙이 그 사이 삭제됐으면 앨범아트 URL 만 정리하고 종료
      if (!tracksRef.current.some((t) => t.id === track.id)) {
        if (tags.artUrl) URL.revokeObjectURL(tags.artUrl);
        return;
      }
      if (tags.title) track.title = tags.title;
      track.artist = tags.artist;
      track.artUrl = tags.artUrl;
      track.artType = tags.artType;
      setState((s) => ({
        ...s,
        tracks: s.tracks.map((x) =>
          x.id === track.id
            ? { ...x, title: track.title, artist: track.artist, artUrl: track.artUrl, artType: track.artType }
            : x,
        ),
      }));
    });
  }, []);

  /**
   * File 배열을 재생목록 뒤에 이어 붙이는 공용 헬퍼.
   * 파일 선택·폴더 스냅샷·FSA 폴더 스캔 모두 이 경로를 거친다.
   * persist=true 면 파일 원본(Blob)을 IndexedDB 에 저장해 새로고침 후 복원한다.
   */
  const appendTracks = useCallback(
    (files, { persist = true } = {}) => {
      if (!files.length) return [];
      const wasEmpty = tracksRef.current.length === 0;
      const added = files.map((f) => ({
        id: newUid(),
        name: f.name,
        url: URL.createObjectURL(f),
        duration: 0,
        title: stripExt(f.name), // 태그가 없을 때의 기본 제목
        artist: '',
        artUrl: '',
        artType: '',
      }));
      tracksRef.current = [...tracksRef.current, ...added];

      if (persist) {
        files.forEach((f, i) => saveTrack(added[i].id, { name: f.name, blob: f }).catch(() => {}));
        persistOrder();
      }
      // 태그(제목·아티스트·앨범아트) 비동기 추출
      files.forEach((f, i) => attachTags(added[i], f));

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
    [loadIndex, syncTracks, persistOrder, attachTags],
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

  /** 곡 종료 시 동작: 반복 모드에 따라 분기한다 */
  useEffect(() => {
    onEndedRef.current = () => {
      const el = audioElRef.current;
      const tracks = tracksRef.current;
      const mode = repeatRef.current;

      // 한 곡 반복: 현재 곡을 처음부터 다시 재생
      if (mode === 'one') {
        if (el?.src) {
          el.currentTime = 0;
          el.play().catch(() => {});
        }
        return;
      }

      const isLast = indexRef.current >= tracks.length - 1;

      // 반복 안 함: 마지막 곡이면 정지, 아니면 다음 곡
      if (mode === 'none') {
        if (!tracks.length || isLast) {
          setState((s) => ({ ...s, isPlaying: false, currentTime: 0 }));
        } else {
          loadIndex(indexRef.current + 1, true);
        }
        return;
      }

      // 전체 반복(기본): 순환 재생 (단일 곡도 계속 반복)
      if (tracks.length) {
        loadIndex((indexRef.current + 1) % tracks.length, true);
      }
    };
  }, [loadIndex]);

  /** 반복 모드 설정('all' | 'one' | 'none') */
  const setRepeatMode = useCallback((mode) => {
    if (!['all', 'one', 'none'].includes(mode)) return;
    repeatRef.current = mode;
    setState((s) => ({ ...s, repeatMode: mode }));
  }, []);

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
    persistOrder();
  }, [syncTracks, persistOrder]);

  /** 드래그 순서 변경: from 위치의 트랙을 to 위치로 이동 */
  const reorderTracks = useCallback(
    (from, to) => {
      const tracks = tracksRef.current;
      if (from === to || from < 0 || to < 0 || from >= tracks.length || to >= tracks.length) return;
      const [moved] = tracks.splice(from, 1);
      tracks.splice(to, 0, moved);
      indexRef.current = tracks.findIndex((x) => x.id === currentIdRef.current);
      syncTracks();
      persistOrder();
    },
    [syncTracks, persistOrder],
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
      if (target.artUrl) URL.revokeObjectURL(target.artUrl); // 앨범아트도 해제
      tracks.splice(i, 1);
      deleteTrack(target.id).catch(() => {});
      persistOrder();

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
    [loadIndex, syncTracks, persistOrder],
  );

  const seek = useCallback((time) => {
    const el = audioElRef.current;
    if (el?.src) el.currentTime = time;
  }, []);

  /**
   * 전체 비우기: 재생을 멈추고 목록·objectURL·IndexedDB 저장 데이터를
   * 모두 삭제한다. 브라우저가 점유하던 디스크 공간이 해제된다.
   */
  const clearAll = useCallback(() => {
    const el = audioElRef.current;
    tracksRef.current.forEach((t) => {
      URL.revokeObjectURL(t.url);
      if (t.artUrl) URL.revokeObjectURL(t.artUrl); // 앨범아트도 해제
    });
    tracksRef.current = [];
    if (el) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
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
    clearAllStored().catch(() => {}); // 저장 불가 환경은 무시
  }, []);

  /**
   * 마운트 시 1회: IndexedDB 에 저장된 재생목록을 복원한다.
   * 저장된 uid 를 그대로 유지해야 이후 삭제·순서 변경이 같은 키로 반영된다.
   * (appendTracks 를 쓰지 않는 이유: 새 uid 발급 + Blob 재저장 낭비 방지)
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { order, records } = await loadAllTracks();
        if (cancelled || !order.length || tracksRef.current.length) return;
        const restored = order
          .map((uid) => {
            const r = records.get(uid);
            return r
              ? {
                  id: uid,
                  name: r.name,
                  url: URL.createObjectURL(r.blob),
                  duration: 0,
                  title: stripExt(r.name),
                  artist: '',
                  artUrl: '',
                  artType: '',
                  _blob: r.blob, // 태그 파싱용 임시 참조
                }
              : null;
          })
          .filter(Boolean);
        if (!restored.length) return;

        tracksRef.current = restored;
        indexRef.current = 0;
        currentIdRef.current = restored[0].id;
        syncTracks();
        loadIndex(0, false); // 자동 재생은 하지 않음(오토플레이 정책 + 사용자 의사 존중)

        restored.forEach((t) => {
          attachTags(t, t._blob);
          delete t._blob; // 파싱 요청 후 참조 해제
          probeDuration(t.url).then((d) => {
            t.duration = d;
            setState((s) => ({
              ...s,
              tracks: s.tracks.map((x) => (x.id === t.id ? { ...x, duration: d } : x)),
            }));
          });
        });
      } catch {
        // 저장소 접근 불가 환경은 조용히 빈 목록으로 시작
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [syncTracks, loadIndex, attachTags]);

  /**
   * Media Session API: 모바일에서 화면을 끄거나 다른 앱으로 전환해도
   * 재생이 유지되고, 잠금화면·알림창에 곡 정보와 재생 컨트롤이 표시된다.
   * (탭을 완전히 닫으면 웹 특성상 재생이 종료된다)
   * 참조하는 콜백들(togglePlay 등)이 모두 선언된 뒤에 등록해야 하므로 이 위치에 둔다.
   */
  // 곡이 바뀔 때: 잠금화면에 표시될 메타데이터 갱신(태그·앨범아트 우선)
  useEffect(() => {
    if (!('mediaSession' in navigator) || !state.fileName) return;
    const cur = state.tracks[state.currentIndex];
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: cur?.title || state.fileName.replace(/\.[^.]+$/, ''),
      artist: cur?.artist || 'Emberwave', // 태그가 없으면 기본값
      artwork: cur?.artUrl
        ? [{ src: cur.artUrl, sizes: '512x512', type: cur.artType || 'image/jpeg' }]
        : [{ src: '/icon.svg', sizes: '512x512', type: 'image/svg+xml' }],
    });
  }, [state.fileName, state.currentIndex, state.tracks]);

  // 재생 상태: 잠금화면 버튼의 ▶/⏸ 표시와 동기화
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = state.isPlaying ? 'playing' : 'paused';
  }, [state.isPlaying]);

  // 잠금화면·이어폰 버튼 액션 핸들러 등록
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', () => togglePlay());
    ms.setActionHandler('pause', () => togglePlay());
    ms.setActionHandler('previoustrack', () => prev());
    ms.setActionHandler('nexttrack', () => next());
    ms.setActionHandler('seekto', (d) => {
      if (typeof d.seekTime === 'number') seek(d.seekTime);
    });
    return () => {
      ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto'].forEach((a) =>
        ms.setActionHandler(a, null),
      );
    };
  }, [togglePlay, prev, next, seek]);

  /** 음악 볼륨(0~1). 그래프 생성 전이면 보류값으로 저장했다가 생성 시 반영 */
  // 잠금화면 진행 바: 곡 로드/재생 상태 변화 시에만 알려준다.
  // timeupdate 마다 갱신하지 않아도 브라우저가 재생 위치를 스스로 보간하므로
  // 성능 비용 없이 정확한 진행 바를 표시할 수 있다.
  useEffect(() => {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    const el = audioElRef.current;
    if (!el || !Number.isFinite(state.duration) || state.duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: state.duration,
        playbackRate: el.playbackRate || 1,
        position: Math.min(el.currentTime, state.duration),
      });
    } catch {
      // 일부 브라우저의 유효성 예외는 무시
    }
  }, [state.duration, state.isPlaying, state.currentIndex]);

  const setMusicVolume = useCallback((v) => {
    volumeRef.current = v;
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

  /**
   * 3밴드 EQ 게인 설정(dB, -12 ~ +12 권장).
   * 그래프 생성 전이면 값만 보관했다가 ensureGraph 에서 반영하고,
   * 생성 후에는 setTargetAtTime 으로 클릭 노이즈 없이 부드럽게 전환한다.
   */
  const setEq = useCallback(({ bass, mid, treble }) => {
    const gains = eqRef.current.gains;
    if (typeof bass === 'number') gains.bass = bass;
    if (typeof mid === 'number') gains.mid = mid;
    if (typeof treble === 'number') gains.treble = treble;

    const nodes = eqRef.current.nodes;
    const ctx = ctxRef.current;
    if (!nodes || !ctx) return;
    const t = ctx.currentTime;
    nodes.bass.gain.setTargetAtTime(gains.bass, t, 0.05);
    nodes.mid.gain.setTargetAtTime(gains.mid, t, 0.05);
    nodes.treble.gain.setTargetAtTime(gains.treble, t, 0.05);
  }, []);

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
    clearAll,
    setRepeatMode,
    seek,
    setMusicVolume,
    setEq,
    setAnalyserConfig,
    toggleMic,
    toggleTab,
    connectFolder,
    syncFolder,
    disconnectFolder,
    fsaSupported: supportsFSA(),
  };
}
