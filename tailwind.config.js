/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // 어두운 청음실 무드: 완전한 블랙이 아닌 미세하게 따뜻한 차콜
        ink: {
          900: '#0a0a0c', // 페이지 배경
          800: '#101014', // 패널 배경
          700: '#17171d', // 패널 내부 요소
          600: '#22222b', // 보더 강조
        },
        // '불멍' 콘셉트를 상징하는 앰버 엠버(잉걸불) 톤 - UI 크롬 액센트
        ember: {
          DEFAULT: '#ffb000',
          soft: '#ffc64d',
          dim: '#8a5f10',
        },
        muted: '#8b8b96', // 보조 텍스트
      },
      fontFamily: {
        // 하드웨어 계기판 느낌의 모노 + 깔끔한 산세리프 UI
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 40px -12px rgba(0,0,0,0.8)',
      },
    },
  },
  plugins: [],
};
