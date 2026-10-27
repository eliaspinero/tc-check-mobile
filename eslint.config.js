import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['client/src/checking/**'] },
  {
    files: ['client/src/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
  },
  {
    files: ['client/src/screens/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['**/checking/**', '**/checking'], message: 'Use CheckingEngine from src/engine instead' }] }],
    },
  },
);
