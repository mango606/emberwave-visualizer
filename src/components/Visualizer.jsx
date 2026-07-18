import { useEffect, useRef } from 'react';
import { rgba, sampleGradient } from '../lib/colorUtils';

/**
 * Visualizer
 * -------------------------------------------------------------
 * 직사각형 LED 바(세그먼트) 이퀄라이저를 Canvas 2D 로 렌더링한다.
 * 단일 requestAnimationFrame 루프에서 아래를 모두 처리한다.
 *   - 주파수 데이터 → 막대 레벨 매핑(로그 분포로 저역 강조)
 *   - 어택은 즉시, 릴리스는 mode.decay 로 하강(계기판 특유의 잔상)
 *   - 피크 홀드 캡 / 상하 미러 / 레트로 프레임 스킵 / 네온 글로우
 *   - 무음 시 '불멍' 앰비언트 물결
 *
 * 성능: props 가 바뀌어도 루프를 재시작하지 않도록 최신 값을 configRef 에 담고,
 *       레벨/피크/데이터 버퍼는 ref 로 유지해 매 프레임 재할당을 피한다.
 */
export default function Visualizer({ analyserRef, palette, mode, active }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);

  const configRef = useRef({ palette, mode, active });
  const levelsRef = useRef(new Float32Array(0)); // 현재 막대 레벨(0~1)
  const peaksRef = useRef(new Float32Array(0)); // 피크 홀드 위치(0~1)
  const dataRef = useRef(new Uint8Array(0)); // 주파수 바이트 버퍼
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const lastDrawRef = useRef(0);
  const startRef = useRef(performance.now());

  // 최신 props 를 루프에서 참조할 수 있도록 동기화
  useEffect(() => {
    configRef.current = { palette, mode, active };
  }, [palette, mode, active]);

  // 캔버스 해상도(devicePixelRatio) 대응 리사이즈
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2); // 과도한 픽셀 방지 상한
      const { clientWidth: w, clientHeight: h } = wrap;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      sizeRef.current = { w, h, dpr };
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    return () => ro.disconnect();
  }, []);

  // 메인 애니메이션 루프 (마운트 시 1회 시작)
  useEffect(() => {
    let raf;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const { palette, mode, active } = configRef.current;
      const now = performance.now();

      // 레트로 모드: frameInterval 만큼 렌더를 건너뛰어 '끊기는' 느낌 연출
      if (mode.frameInterval > 0 && now - lastDrawRef.current < mode.frameInterval) return;
      lastDrawRef.current = now;

      const bars = mode.bars;
      // 막대 개수 변경 시 레벨/피크 버퍼 재할당
      if (levelsRef.current.length !== bars) {
        levelsRef.current = new Float32Array(bars);
        peaksRef.current = new Float32Array(bars);
      }
      const levels = levelsRef.current;
      const peaks = peaksRef.current;

      const analyser = analyserRef.current;
      const live = active && analyser;

      // 1) 타깃 레벨 계산 -----------------------------------------
      if (live) {
        if (dataRef.current.length !== analyser.frequencyBinCount) {
          dataRef.current = new Uint8Array(analyser.frequencyBinCount);
        }
        const data = dataRef.current;
        analyser.getByteFrequencyData(data);

        const usable = data.length * 0.72; // 상위 초고역은 대체로 무음 → 잘라냄
        // 저역 에너지(펄스 모드용) 평균
        let bassSum = 0;
        const bassBins = Math.max(4, Math.floor(usable * 0.06));
        for (let b = 0; b < bassBins; b++) bassSum += data[b];
        const bass = bassSum / bassBins / 255;

        for (let i = 0; i < bars; i++) {
          // 로그성 분포(지수 1.35)로 저·중역에 해상도를 더 배분
          const lo = Math.floor(Math.pow(i / bars, 1.35) * usable);
          const hi = Math.max(lo + 1, Math.floor(Math.pow((i + 1) / bars, 1.35) * usable));
          let sum = 0;
          for (let j = lo; j < hi; j++) sum += data[j];
          let v = sum / (hi - lo) / 255;

          // 저역 부스트: 하위 1/3 막대를 mode.bassBoost 로 강조
          if (i < bars * 0.33 && mode.bassBoost > 1) {
            const w = 1 - i / (bars * 0.33);
            v *= 1 + (mode.bassBoost - 1) * w;
          }
          // 펄스 모드: 전체를 저역에 맞춰 함께 들썩이게
          if (mode.pulse) v = v * 0.7 + bass * 0.5;

          setTarget(levels, i, Math.min(1, v), mode.decay);
        }
      } else {
        // 무음(대기): '불멍' 앰비언트 물결 — 느린 이중 사인으로 유기적인 흔들림
        const t = ((now - startRef.current) / 1000) * mode.idleSpeed;
        for (let i = 0; i < bars; i++) {
          const wave =
            0.5 + 0.5 * Math.sin(t + i * 0.35) * Math.cos(t * 0.6 + i * 0.12);
          const v = 0.04 + 0.2 * Math.abs(wave);
          setTarget(levels, i, v, 0.9);
        }
      }

      // 2) 피크 홀드 갱신 -----------------------------------------
      if (mode.peakHold) {
        for (let i = 0; i < bars; i++) {
          if (levels[i] >= peaks[i]) peaks[i] = levels[i];
          else peaks[i] = Math.max(levels[i], peaks[i] - mode.peakDecay);
        }
      }

      // 3) 렌더링 -------------------------------------------------
      render(ctx, sizeRef.current, { levels, peaks, palette, mode });
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyserRef]);

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-hidden rounded-2xl border border-ink-600/50 bg-black"
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

/** 어택은 즉시, 릴리스는 감쇠(decay)로 서서히 하강 */
function setTarget(levels, i, target, decay) {
  levels[i] = target > levels[i] ? target : levels[i] * decay;
}

/** 실제 캔버스 드로잉 */
function render(ctx, size, { levels, peaks, palette, mode }) {
  const { w, h, dpr } = size;
  if (!w || !h) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // 논리 좌표계(CSS px) 기준으로 그리기
  ctx.clearRect(0, 0, w, h);

  const bars = mode.bars;
  const padX = Math.max(8, w * 0.02);
  const usableW = w - padX * 2;
  const slotW = usableW / bars;
  const barW = Math.max(1, slotW * 0.72); // 막대 사이 간격 확보
  const barOffset = (slotW - barW) / 2;

  const stops = palette.stops;

  for (let i = 0; i < bars; i++) {
    const x = padX + i * slotW + barOffset;
    const level = levels[i];

    if (mode.mirror) {
      // 상하 대칭: 화면 중앙에서 위/아래로 각각 segments 만큼
      const centerY = h / 2;
      const halfH = h / 2 - 4;
      const segH = halfH / mode.segments;
      drawSegments(ctx, { x, barW, level, segH, mode, stops, baseline: centerY, dir: -1 });
      drawSegments(ctx, { x, barW, level, segH, mode, stops, baseline: centerY, dir: 1 });
    } else {
      const padY = 10;
      const segH = (h - padY) / mode.segments;
      drawSegments(ctx, { x, barW, level, segH, mode, stops, baseline: h - 4, dir: -1 });

      // 피크 홀드 캡 (밝은 한 칸)
      if (mode.peakHold) {
        const peakIdx = Math.min(mode.segments - 1, Math.round(peaks[i] * mode.segments));
        if (peakIdx > 0) {
          const y = h - 4 - (peakIdx + 1) * segH + mode.segGap / 2;
          const c = sampleGradient(stops, peakIdx / (mode.segments - 1));
          ctx.shadowBlur = mode.glow ? mode.glow : 0;
          ctx.shadowColor = rgba(c, 0.9);
          ctx.fillStyle = rgba(c, 1);
          ctx.fillRect(x, y, barW, Math.max(2, segH - mode.segGap - 1));
        }
      }
    }
  }
  ctx.shadowBlur = 0; // 상태 초기화
}

/** 한 막대의 세그먼트들을 baseline 에서 dir 방향(위: -1)으로 쌓아 그린다 */
function drawSegments(ctx, { x, barW, level, segH, mode, stops, baseline, dir }) {
  const litSeg = Math.round(level * mode.segments);
  const fillH = Math.max(2, segH - mode.segGap);

  for (let s = 0; s < mode.segments; s++) {
    const ratio = mode.segments > 1 ? s / (mode.segments - 1) : 0; // 아래(0)→위(1)
    const color = sampleGradient(stops, ratio);
    const lit = s < litSeg;

    // dir<0 이면 위로, dir>0 이면 아래로 세그먼트 위치 계산
    const y =
      dir < 0
        ? baseline - (s + 1) * segH + mode.segGap / 2
        : baseline + s * segH + mode.segGap / 2;

    if (lit && mode.glow > 0) {
      ctx.shadowBlur = mode.glow;
      ctx.shadowColor = rgba(color, 0.9);
    } else {
      ctx.shadowBlur = 0;
    }
    // 켜진 칸은 선명하게, 꺼진 칸은 격자처럼 아주 흐리게
    ctx.fillStyle = rgba(color, lit ? 1 : 0.06);
    ctx.fillRect(x, y, barW, fillH);
  }
}
