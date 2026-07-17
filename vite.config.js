import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite 설정: React 플러그인만으로 충분하며, Vercel은 별도 설정 없이
// `vite build` 결과물(dist/)을 자동 감지하여 배포합니다.
export default defineConfig({
  plugins: [react()],
});
