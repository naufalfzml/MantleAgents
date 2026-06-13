'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useActiveAccount, useActiveWalletConnectionStatus } from 'thirdweb/react';
import { toast } from 'sonner';
import { checkSession, logout as logoutFn, type AuthMeResponse } from '@/lib/auth';
import { getToken, clearToken, onTokenCleared } from '@/lib/token-store';

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  walletAddress: string | null;
  isOnboarded: boolean | null;
  user: AuthMeResponse | null;
  handleLogin: (jwt: string, address: string) => Promise<void>;
  handleLogout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const AUTH_CHANNEL = 'mantleagents-auth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const activeAccount = useActiveAccount();
  const walletStatus = useActiveWalletConnectionStatus();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isOnboarded, setIsOnboarded] = useState<boolean | null>(null);
  const [user, setUser] = useState<AuthMeResponse | null>(null);
  const sessionChecked = useRef(false);

  const resetState = useCallback(() => {
    setIsAuthenticated(false);
    setWalletAddress(null);
    setIsOnboarded(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const refreshSession = useCallback(async () => {
    try {
      const me = await checkSession();
      if (me) {
        setIsAuthenticated(true);
        setWalletAddress(me.wallet_address);
        setIsOnboarded(me.onboarding_completed);
        setUser(me);
      } else {
        resetState();
      }
    } catch {
      resetState();
    }
  }, [resetState]);

  const handleLogin = useCallback(
    async (_jwt: string, address: string) => {
      setWalletAddress(address);
      setIsAuthenticated(true);
      await refreshSession();
      new BroadcastChannel(AUTH_CHANNEL).postMessage({ type: 'login' });
    },
    [refreshSession],
  );

  const handleLogout = useCallback(async () => {
    await logoutFn();
    resetState();
    new BroadcastChannel(AUTH_CHANNEL).postMessage({ type: 'logout' });
  }, [resetState]);

  // Wait for thirdweb wallet status to settle before checking session.
  // "connecting" = auto-connect in progress; "unknown" = not yet determined (e.g. on refresh).
  // Once it resolves to "connected" or "disconnected" we know the wallet state.
  useEffect(() => {
    if (walletStatus === 'connecting' || walletStatus === 'unknown') return; // still resolving
    if (sessionChecked.current) return; // already ran
    sessionChecked.current = true;

    const token = getToken();
    if (token && activeAccount) {
      // Wallet connected + JWT exists — validate the session
      refreshSession().finally(() => setIsLoading(false));
    } else {
      // No wallet or no token — clear any stale JWT
      if (token && !activeAccount) {
        clearToken();
      }
      setIsLoading(false);
    }
  }, [walletStatus, activeAccount, refreshSession]);

  // Listen for 401-triggered token clears
  useEffect(() => {
    onTokenCleared(() => {
      resetState();
      toast.error('Session expired. Please reconnect.');
    });
  }, [resetState]);

  // Cross-tab auth synchronization
  useEffect(() => {
    const channel = new BroadcastChannel(AUTH_CHANNEL);
    channel.onmessage = (event) => {
      if (event.data?.type === 'logout') {
        resetState();
      } else if (event.data?.type === 'login') {
        refreshSession();
      }
    };
    return () => channel.close();
  }, [resetState, refreshSession]);

  // Sync with thirdweb wallet state: if the wallet disconnects after being
  // connected, clear the auth state. Debounce to avoid spurious logouts during
  // transient disconnects (reconnect, network switch, extension refresh).
  const hadAccount = useRef(false);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const DISCONNECT_DEBOUNCE_MS = 2500;

  useEffect(() => {
    if (activeAccount) {
      hadAccount.current = true;
      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
    } else if (hadAccount.current && isAuthenticated && walletStatus === 'disconnected') {
      if (disconnectTimerRef.current) return;
      disconnectTimerRef.current = setTimeout(() => {
        disconnectTimerRef.current = null;
        hadAccount.current = false;
        clearToken();
        resetState();
      }, DISCONNECT_DEBOUNCE_MS);
    }
    return () => {
      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current);
      }
    };
  }, [activeAccount, isAuthenticated, walletStatus, resetState]);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        walletAddress,
        isOnboarded,
        user,
        handleLogin,
        handleLogout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
