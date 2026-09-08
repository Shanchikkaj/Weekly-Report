import React, { createContext, useContext, useState, useEffect } from 'react';
import { useLocation, Navigate } from 'react-router-dom';
import { authApi, setAccessToken } from '../api/client';

export interface User {
  id: string;
  email: string;
  role: 'team_member' | 'manager';
  active?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (payload: { email: string; password: string }) => Promise<void>;
  register: (payload: { email: string; password: string; role?: 'team_member' | 'manager' }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function parseJwt(token: string): any {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Initialize session via silent refresh on page load
  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      try {
        const data = await authApi.refresh();
        if (data && data.accessToken && isMounted) {
          const payload = parseJwt(data.accessToken);
          if (payload) {
            setAccessToken(data.accessToken);
            setToken(data.accessToken);
            setUser({
              id: payload.userId,
              email: payload.email,
              role: payload.role,
            });
          }
        }
      } catch (err) {
        // No active refresh session, proceed as unauthenticated
        setAccessToken(null);
        setToken(null);
        setUser(null);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    initSession();

    const handleAuthExpired = () => {
      setUser(null);
      setToken(null);
      setAccessToken(null);
    };

    window.addEventListener('auth:expired', handleAuthExpired);
    return () => {
      isMounted = false;
      window.removeEventListener('auth:expired', handleAuthExpired);
    };
  }, []);

  const login = async (payload: { email: string; password: string }) => {
    const res = await authApi.login(payload);
    setAccessToken(res.accessToken);
    setToken(res.accessToken);
    setUser(res.user as User);
  };

  const register = async (payload: { email: string; password: string; role?: 'team_member' | 'manager' }) => {
    await authApi.register(payload);
    // After registration, log the user in directly
    await login({ email: payload.email, password: payload.password });
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {}
    setAccessToken(null);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

/**
 * Route Guard: requires authenticated user
 */
export const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted">Checking authentication...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

/**
 * Role Guard: requires specific roles (e.g. manager)
 */
export const RoleRoute: React.FC<{ allowedRoles: string[]; children: React.ReactElement }> = ({
  allowedRoles,
  children,
}) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/reports" replace />;
  }

  return children;
};
