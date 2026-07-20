import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

/**
 * ESLint 설정 (flat config)
 * 핵심은 react-hooks 플러그인:
 *  - rules-of-hooks: 조건문/early return 뒤의 훅 호출을 "에러"로 차단
 *    (v1.0 직전 겪은 React #310 크래시를 저장 시점에 잡아주는 안전망)
 *  - exhaustive-deps: effect 의존성 누락을 경고
 */
export default [
  { ignores: ['dist', 'node_modules'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'warn',
      // JSX 에서 <Component /> 사용을 인식하지 못하는 한계 보완:
      // 대문자로 시작하는 식별자(컴포넌트)는 미사용 검사에서 제외
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
];
