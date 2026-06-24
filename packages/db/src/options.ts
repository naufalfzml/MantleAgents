import WebSocket from 'ws';

export function getSupabaseOptions() {
  return {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket as unknown as never },
  };
}
