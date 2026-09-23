/** 代码规范检查：聚焦真实缺陷（未使用变量、hooks 依赖、可疑代码），不介入排版风格。 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      'dist/**', 'build/**', 'node_modules/**', 'android/**', 'ugreen/**',
      'release-artifacts/**', 'test-results/**', '.tmp*/**', 'public/**', 'scripts/*.mjs',
      // 设计素材生成脚本（一次性工具，非产品代码）
      'design/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'server.ts', 'tests/**/*.ts', 'scripts/**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        window: 'readonly', document: 'readonly', localStorage: 'readonly',
        sessionStorage: 'readonly', fetch: 'readonly', FormData: 'readonly',
        Blob: 'readonly', URL: 'readonly', URLSearchParams: 'readonly',
        crypto: 'readonly', navigator: 'readonly', console: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly',
        clearInterval: 'readonly', AbortController: 'readonly', Buffer: 'readonly',
        process: 'readonly', structuredClone: 'readonly', performance: 'readonly',
        requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
      },
    },
    rules: {
      // TypeScript 已检查未定义标识符，重复的 no-undef 只会对浏览器/Node 全局误报
      'no-undef': 'off',
      // 真实缺陷类：保持 error
      'react-hooks/rules-of-hooks': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-fallthrough': 'error',
      'no-unreachable': 'error',
      // 类型聚合命名空间是既有约定
      '@typescript-eslint/no-namespace': 'off',
      // 渐进改进类：先以 warning 呈现，避免阻塞构建
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly' },
    },
    rules: { 'no-undef': 'off' },
  },
  {
    // 服务端与脚本允许 console
    files: ['server.ts', 'src/server/**/*.ts', 'scripts/**/*.ts', 'tests/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // 测试夹具里用 any 构造数据属惯用法，不在测试文件里制造噪音，
    // 让警告聚焦产品代码里真正需要收窄的类型
    files: ['tests/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
);
