import { api } from './api-client';
import { setToken, clearToken, getToken } from './token-store';

/** Response from GET /api/auth/me — note snake_case from Supabase */
export interface AuthMeResponse {
  id: string;
  wallet_address: string;
  display_name: string | null;
  auth_method: string | null;
  risk_profile: string | null;
  risk_answers: Record<string, unknown> | null;
  preferred_currencies: string[] | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

interface LoginResponse {
  token?: string;
  error?: string;
}

/**
 * Request a SIWE payload from the backend for the given address.
 */
export async function generatePayload(params: {
  address: string;
  chainId?: number;
}): Promise<unknown> {
  return api.post<unknown>('/api/auth/payload', {
    address: params.address,
    chainId: params.chainId,
  });
}

/**
 * Send signed payload to backend, receive JWT.
 * Handles known bug: backend returns 200 with { error } on invalid signature.
 */
export async function login(params: {
  payload: unknown;
  signature: string;
}): Promise<string> {
  const res = await api.post<LoginResponse>('/api/auth/login', {
    payload: params.payload,
    signature: params.signature,
  });

  if (res.error || !res.token) {
    throw new Error(res.error ?? 'Login failed: no token returned');
  }

  setToken(res.token);
  return res.token;
}

/**
 * Validate the current JWT and get the user profile.
 * Returns null if no token or token is invalid.
 */
export async function checkSession(): Promise<AuthMeResponse | null> {
  const token = getToken();
  if (!token) return null;

  try {
    return await api.get<AuthMeResponse>('/api/auth/me');
  } catch {
    return null;
  }
}

/**
 * Clear local JWT. Backend logout is a no-op acknowledgment.
 */
export async function logout(): Promise<void> {
  try {
    await api.post('/api/auth/logout');
  } catch {
    // Ignore — we're logging out regardless
  }
  clearToken();
}
