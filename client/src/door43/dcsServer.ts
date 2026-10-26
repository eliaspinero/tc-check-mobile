// The Door43 server, chosen by the build, never by the user (tC4 src/data/dcsServer.ts rule):
// a development build uses qa.door43.org, which holds no durable data; any other build uses production.
const PRODUCTION = 'https://git.door43.org';
export const dcsServerFor = (env: { DEV?: unknown }): string => (env.DEV === true ? 'https://qa.door43.org' : PRODUCTION);
export const DCS_SERVER: string = dcsServerFor(import.meta.env);
