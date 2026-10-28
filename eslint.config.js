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
  {
    // Every text a checker reads comes from client/src/i18n, in both languages.
    files: ['client/src/screens/**/*.tsx', 'client/src/App.tsx'],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'JSXText[value=/\\p{L}/u]', message: 'Put user-facing text in client/src/i18n and use t()' },
        {
          selector: 'JSXAttribute[name.name=/^(aria-label|placeholder|title|alt)$/] > Literal',
          message: 'Put user-facing text in client/src/i18n and use t()',
        },
      ],
    },
  },
);
