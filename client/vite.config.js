import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 같은 와이파이의 휴대폰에서도 접속 가능 (터미널에 나오는 Network 주소로 접속)
    host: true,
    // /api 요청은 백엔드(4000)로 전달 → 프론트에 API 키가 노출되지 않음
    proxy: { '/api': 'http://localhost:4000' },
  },
});
