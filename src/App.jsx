import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Visualizer from './components/Visualizer';
import TransportControls from './components/TransportControls';
import Playlist from './components/Playlist';
import PalettePicker from './components/PalettePicker';
import ModePicker from './components/ModePicker';
import VolumeMixer from './components/VolumeMixer';
import EqControls from './components/EqControls';
import AsmrPlayer from './components/AsmrPlayer';
import LiveInput from './components/LiveInput';
import RecorderButton from './components/RecorderButton';
import { useAudioEngine } from './hooks/useAudioEngine';
import { PALETTES, DEFAULT_PALETTE_ID } from './constants/palettes';
import { VISUAL_MODES, DEFAULT_MODE_ID } from './constants/visualModes';
import { watchUrl } from './lib/youtube';
import { loadSettings, saveSettings } from './lib/storage';

// 앱 시작 시 1회 로드한 저장 설정(없으면 null)
const saved = loadSettings();

export default function App() {
  const engine = useAudioEngine();
  const { setAnalyserConfig, setMusicVolume, setEq: applyEq } = engine;
  const isPlaying = engine.state.isPlaying;

  // 저장된 값이 유효하면 복원, 아니면 기본값 (lazy initializer 로 최초 1회만 평가)
  const [paletteId, setPaletteId] = useState(() =>
    PALETTES.some((p) => p.id === saved?.paletteId) ? saved.paletteId : DEFAULT_PALETTE_ID,
  );
  const [modeId, setModeId] = useState(() =>
    VISUAL_MODES.some((m) => m.id === saved?.modeId) ? saved.modeId : DEFAULT_MODE_ID,
  );
  const [musicVol, setMusicVol] = useState(() =>
    Number.isFinite(saved?.musicVol) ? Math.min(100, Math.max(0, saved.musicVol)) : 50,
  );
  const [asmrVol, setAsmrVol] = useState(() =>
    Number.isFinite(saved?.asmrVol) ? Math.min(100, Math.max(0, saved.asmrVol)) : 50,
  );
  const [eq, setEq] = useState(() => {
    const e = saved?.eq;
    const ok = (v) => Number.isFinite(v) && v >= -12 && v <= 12;
    return e && ok(e.bass) && ok(e.mid) && ok(e.treble)
      ? { bass: e.bass, mid: e.mid, treble: e.treble }
      : { bass: 0, mid: 0, treble: 0 };
  });
  const [asmrInfo, setAsmrInfo] = useState(null); // { id, title } | null

  // 안내 토스트: 미지원 기능 클릭 시 등에 짧게 표시 후 자동 소멸
  const [toast, setToast] = useState('');
  const toastTimerRef = useRef(null);
  const canvasElRef = useRef(null); // 녹화용: Visualizer 캔버스 참조
  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), 2600);
  }, []);

  // 설정 변경 시마다 저장(작은 객체라 디바운스 불필요)
  useEffect(() => {
    saveSettings({ paletteId, modeId, musicVol, asmrVol, eq });
  }, [paletteId, modeId, musicVol, asmrVol, eq]);

  const palette = useMemo(
    () => PALETTES.find((p) => p.id === paletteId) ?? PALETTES[0],
    [paletteId],
  );
  const mode = useMemo(
    () => VISUAL_MODES.find((m) => m.id === modeId) ?? VISUAL_MODES[0],
    [modeId],
  );

  // 모드 전환 시 분석기(fftSize/smoothing) 재설정.
  // isPlaying 을 의존성에 포함해, 첫 재생으로 오디오 그래프가 만들어진 직후에도
  // 현재 모드의 파라미터가 확실히 반영되도록 한다.
  useEffect(() => {
    setAnalyserConfig({ fftSize: mode.fftSize, smoothing: mode.smoothing });
  }, [mode, isPlaying, setAnalyserConfig]);

  // 음악 볼륨(0~100 → 0~1)을 GainNode 에 반영
  useEffect(() => {
    setMusicVolume(musicVol / 100);
  }, [musicVol, setMusicVolume]);

  // EQ(저음/중음/고음 dB)를 BiquadFilter 체인에 반영
  useEffect(() => {
    applyEq(eq);
  }, [eq, applyEq]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-ink-900">
      {/* 헤더 */}
      <header className="flex shrink-0 items-center justify-between px-5 py-3">
        <div className="flex items-center gap-3">
          {/* 잉걸불 마크: '불멍' 콘셉트의 시그니처 */}
          <span className="relative grid h-8 w-8 place-items-center">
            <span className="absolute h-3 w-3 rounded-full bg-ember shadow-[0_0_16px_4px_rgba(255,176,0,0.6)]" />
            <span className="absolute h-6 w-6 rounded-full border border-ember/30" />
          </span>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">Emberwave</h1>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted">
              불멍 · led audio visualizer
            </p>
          </div>
        </div>
        <div className="hidden font-mono text-[11px] text-muted sm:block">
          {mode.nameKo} · {palette.nameKo}
        </div>
      </header>

      {/* 본문: 좌 비주얼라이저 / 우 컨트롤. 전체는 뷰포트에 고정되고
          컨트롤이 넘칠 때만 aside 내부에서 스크롤된다(페이지 스크롤 없음). */}
      <main className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4 lg:flex-row">
        <section className="h-[38vh] min-h-0 lg:h-auto lg:flex-1">
          <Visualizer
            analyserRef={engine.analyserRef}
            palette={palette}
            mode={mode}
            active={
              engine.state.isPlaying || engine.state.micOn || engine.state.tabOn
            }
            onCanvasReady={(el) => {
              canvasElRef.current = el;
            }}
          />
        </section>

        <aside className="min-h-0 flex-1 space-y-4 overflow-y-auto lg:flex-none lg:w-[360px] lg:pr-1">
          <div className="panel">
            <div className="panel-label">
              <Dot /> 재생 · 재생목록
            </div>
            <TransportControls
              state={engine.state}
              onFiles={engine.loadFiles}
              onToggle={engine.togglePlay}
              onSeek={engine.seek}
              onPrev={engine.prev}
              onNext={engine.next}
              fsaSupported={engine.fsaSupported}
              onConnectFolder={engine.connectFolder}
              onSyncFolder={engine.syncFolder}
              onDisconnectFolder={engine.disconnectFolder}
              onNotice={showToast}
            />
            <Playlist
              tracks={engine.state.tracks}
              currentIndex={engine.state.currentIndex}
              onSelect={engine.playTrack}
              onRemove={engine.removeTrack}
              onReorder={engine.reorderTracks}
              onShuffle={engine.shuffle}
            />
          </div>

          <div className="panel">
            <div className="panel-label">
              <Dot /> 볼륨 믹서
            </div>
            <VolumeMixer
              music={musicVol}
              asmr={asmrVol}
              onMusic={setMusicVol}
              onAsmr={setAsmrVol}
            />
          </div>

          <div className="panel">
            <div className="panel-label">
              <Dot /> 음질 조정
            </div>
            <EqControls eq={eq} onChange={setEq} />
          </div>

          <div className="panel">
            <div className="panel-label">
              <Dot /> YOUTUBE 반복 재생
            </div>
            <AsmrPlayer volume={asmrVol} onInfo={setAsmrInfo} />
          </div>

          <div className="panel">
            <div className="panel-label">
              <Dot /> 라이브 입력 · 마이크 / 탭 소리
            </div>
            <LiveInput
              micOn={engine.state.micOn}
              tabOn={engine.state.tabOn}
              error={engine.state.inputError}
              onToggleMic={engine.toggleMic}
              onToggleTab={engine.toggleTab}
              onNotice={showToast}
            />
          </div>

          <div className="panel">
            <div className="panel-label">
              <Dot /> 색상 · {PALETTES.length}가지 팔레트
            </div>
            <PalettePicker value={paletteId} onChange={setPaletteId} />
          </div>

          <div className="panel">
            <div className="panel-label">
              <Dot /> 모드 · {VISUAL_MODES.length}가지 반응 스타일
            </div>
            <ModePicker value={modeId} onChange={setModeId} />
          </div>
        </aside>
      </main>

      {/* 비주얼 녹화·공유: 최하단 중앙, 평소엔 반투명 */}
      <RecorderButton
        getCanvas={() => canvasElRef.current}
        getAudioStream={engine.getRecordingAudioStream}
        onNotice={showToast}
      />

      {/* 안내 토스트 */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-14 left-1/2 z-20 -translate-x-1/2 rounded-full border border-ink-600 bg-ink-800/95 px-4 py-2 text-xs text-white shadow-panel backdrop-blur"
        >
          {toast}
        </div>
      )}

      {/* 출처 크레딧: 재생 중인 ASMR 원본 표기 (좌하단 고정) */}
      {asmrInfo?.title && (
        <a
          href={watchUrl(asmrInfo.id)}
          target="_blank"
          rel="noreferrer noopener"
          className="fixed bottom-3 left-3 z-10 flex max-w-[70vw] items-center gap-2 rounded-full border border-ink-600 bg-ink-800/90 px-3 py-1.5 text-[11px] text-muted backdrop-blur transition hover:text-white sm:max-w-sm"
        >
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-ember" />
          <span className="truncate">
            Background ASMR Source: <span className="text-white">{asmrInfo.title}</span>
          </span>
        </a>
      )}
    </div>
  );
}

/** 패널 라벨 앞의 작은 앰버 점 */
function Dot() {
  return <span className="h-1.5 w-1.5 rounded-full bg-ember" />;
}
