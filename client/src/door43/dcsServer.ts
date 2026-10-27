// The Door43 server, chosen by the build, never by the user (tC4 src/data/dcsServer.ts rule):
// a development build (vite dev) and a test build (vite build --mode qa, the test APK) use
// qa.door43.org, which holds no durable data; any other build uses production.
const PRODUCTION = 'https://git.door43.org';
const QA = 'https://qa.door43.org';
export const dcsServerFor = (env: { DEV?: unknown; MODE?: unknown }): string => (env.DEV === true || env.MODE === 'qa' ? QA : PRODUCTION);
export const DCS_SERVER: string = dcsServerFor(import.meta.env);
