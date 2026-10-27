// Where the Door43 token is kept between app sessions. Never localStorage, a URL or a log.
export interface TokenStore {
  keep(token: string): Promise<void>;
  read(): Promise<string | null>;
  forget(): Promise<void>;
}

/** The browser and the journeys: the token lives in memory for this page only. */
export const memoryTokenStore = (): TokenStore => {
  let token: string | null = null;
  return {
    keep: async (t) => void (token = t),
    read: async () => token,
    forget: async () => void (token = null),
  };
};
