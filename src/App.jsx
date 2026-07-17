import { useEffect, useMemo, useState } from 'react';
import Visualizer from './components/Visualizer';
import TransportControls from './components/TransportControls';
import Playlist from './components/Playlist';
import PalettePicker from './components/PalettePicker';
import ModePicker from './components/ModePicker';
import VolumeMixer from './components/VolumeMixer';
import AsmrPlayer from './components/AsmrPlayer';
import { useAudioEngine } from './hooks/useAudioEngine';
import { PALETTES, DEFAULT_PALETTE_ID } from './constants/palettes';
import { VISUAL_MODES, DEFAULT_MODE_ID } from './constants/visualModes';
import { watchUrl } from './lib/youtube';

export default function App() {
  const engine = useAudioEngine();
  const { setAnalyserConfig, setMusicVolume } = engine;
  const isPlaying = engine.state.isPlaying;

  const [paletteId, setPaletteId] = useState(DEFAULT_PALETTE_ID);
  const [modeId, setModeId] = useState(DEFAULT_MODE_ID);
  const [musicVol, setMusicVol] = useState(90);
  const [asmrVol, setAsmrVol] = useState(45);
  const [asmrInfo, setAsmrInfo] = useState(null); // { id, title } | null

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
            isPlaying={engine.state.isPlaying}
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
            />
            <Playlist
              tracks={engine.state.tracks}
              currentIndex={engine.state.currentIndex}
              onSelect={engine.playTrack}
            />
          </div>

          <div className="panel">
            <div className="panel-label">
              <Dot /> 볼륨 믹서 · mixer
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
              <Dot /> asmr · 유튜브 배경음
            </div>
            <AsmrPlayer volume={asmrVol} onInfo={setAsmrInfo} />
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
