const STORAGE_KEY = 'mantleagents_jwt';

let token: string | null = null;
let onClearCallback: (() => void) | null = null;

export function getToken(): string | null {
  if (token) return token;
  if (typeof window !== 'undefined') {
    token = localStorage.getItem(STORAGE_KEY);
  }
  return token;
}

export function setToken(jwt: string): void {
  token = jwt;
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, jwt);
  }
}

export function clearToken(): void {
  token = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
  onClearCallback?.();
}

/** Register a callback invoked when clearToken() is called (e.g., on 401). */
export function onTokenCleared(cb: () => void): void {
  onClearCallback = cb;
}
