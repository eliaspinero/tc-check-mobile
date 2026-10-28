import tseslint from 'typescript-eslint';

// Every text a checker reads comes from client/src/i18n, in both languages.
const i18nText = [
  { selector: 'JSXText[value=/\\p{L}/u]', message: 'Put user-facing text in client/src/i18n and use t()' },
  {
    selector: 'JSXAttribute[name.name=/^(aria-label|placeholder|title|alt)$/] > Literal',
    message: 'Put user-facing text in client/src/i18n and use t()',
  },
];

// A Door43 error reaches the checker only through door43ErrorText, which words it in the phone's
// language. A Door43 error is one thrown by a call on `api` (the Door43 client) or a Door43ApiError.
const door43Message = [
  "CallExpression[callee.property.name=/^(then|catch)$/]:has(CallExpression[callee.object.name='api']) > :function MemberExpression[property.name='message']",
  "TryStatement:has(CallExpression[callee.object.name='api']) > CatchClause MemberExpression[property.name='message']",
  "MemberExpression[property.name='message'][object.typeAnnotation.typeName.name='Door43ApiError']",
].map((selector) => ({ selector, message: "Show a Door43 error with door43ErrorText(e) from screens/door43Error.ts, not its .message" }));

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
      'no-restricted-syntax': ['error', ...door43Message],
    },
  },
  {
    files: ['client/src/screens/**/*.tsx', 'client/src/App.tsx'],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: { 'no-restricted-syntax': ['error', ...i18nText] },
  },
  {
    // A later block replaces no-restricted-syntax, so the screens list both.
    files: ['client/src/screens/**/*.tsx'],
    rules: { 'no-restricted-syntax': ['error', ...i18nText, ...door43Message] },
  },
);
