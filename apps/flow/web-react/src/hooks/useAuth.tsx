/* eslint-disable react-refresh/only-export-components -- context pattern exports both provider and hook */
import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { getMainApiUrl } from '@/config/api-config';

interface Profile {
  id: string;
  display_name: string;
}

interface User {
  id: string;
  email?: string;
}

interface Session {
  access_token: string;
  user: User;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const authStore = useAuthStore();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const hasCheckedAuthRef = useRef(false);
  const isUpdatingAuthRef = useRef(false);

  const fetchProfile = useCallback(async (userId: string) => {
    // Use API endpoint for profiles instead of direct Supabase
    try {
      const apiUrl = getMainApiUrl();
      
      const token = authStore.token;
      if (!token) {
        return;
      }
      
      const response = await fetch(`${apiUrl}/flow/profiles/${userId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data) {
          setProfile({
            id: data.id,
            display_name: data.displayName,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  }, [authStore.token]);

  const updateAuthState = useCallback(async () => {
    // Prevent infinite loops
    if (isUpdatingAuthRef.current) {
      return;
    }
    isUpdatingAuthRef.current = true;

    try {
      if (authStore.isAuthenticated && authStore.token) {
        // Create user object from token (we'll decode it or fetch user info)
        // For now, create a minimal user object
        // In production, you might want to decode the JWT or fetch user info
        const userObj: User = {
          id: '', // Will be populated from profile fetch
          email: authStore.userEmail || undefined,
        };

        // Create session object
        const sessionObj: Session = {
          access_token: authStore.token,
          user: userObj,
        };

        setSession(sessionObj);
        setUser(userObj);

               // Fetch user info from API and set up Supabase session for queries
               if (authStore.token) {
                 try {
                   const mainApiUrl = getMainApiUrl();
                   const response = await fetch(`${mainApiUrl}/auth/me`, {
                     headers: {
                       'Authorization': `Bearer ${authStore.token}`,
                     },
                   });

            if (response.ok) {
              const userData = await response.json();
              const updatedUser: User = {
                id: userData.id,
                email: userData.email,
              };
              setUser(updatedUser);
              setSession({
                access_token: authStore.token,
                user: updatedUser,
              });

              // Fetch profile from API
              if (userData.id) {
                await fetchProfile(userData.id);
              }
            } else if (response.status === 401) {
              // Token is invalid - clear auth state
              console.warn('Auth token invalid, clearing session');
              setUser(null);
              setSession(null);
              setProfile(null);
              // Clear the invalid token from store
              authStore.logout();
            }
          } catch (error) {
            console.error('Error fetching user info:', error);
          }
        }
      } else {
        setUser(null);
        setSession(null);
        setProfile(null);
      }
    } finally {
      isUpdatingAuthRef.current = false;
    }
  }, [authStore, fetchProfile]);

  // Wait for auth store to hydrate before checking auth (only once)
  useEffect(() => {
    if (!authStore.hasHydrated || hasCheckedAuthRef.current) {
      return;
    }

    hasCheckedAuthRef.current = true;
    
    // Check auth status when store hydrates (only once)
    authStore.checkAuth().then(() => {
      updateAuthState();
      setLoading(false);
    });
  }, [authStore, authStore.hasHydrated, updateAuthState]);

  // Update auth state when store values change (but not on initial mount)
  useEffect(() => {
    if (!authStore.hasHydrated || !hasCheckedAuthRef.current) {
      return;
    }
    updateAuthState();
  }, [authStore.token, authStore.isAuthenticated, authStore.userEmail, authStore.hasHydrated, updateAuthState]);

  const signUp = async (email: string, password: string, displayName: string) => {
    const success = await authStore.signup(email, password, displayName);
    
    if (success) {
      // Update auth state after successful signup
      await updateAuthState();
      return { error: null };
    } else {
      return { error: new Error(authStore.error || 'Signup failed') };
    }
  };

  const signIn = async (email: string, password: string) => {
    const success = await authStore.login(email, password);
    
    if (success) {
      // Update auth state after successful login
      await updateAuthState();
      return { error: null };
    } else {
      return { error: new Error(authStore.error || 'Login failed') };
    }
  };

  const signOut = async () => {
    await authStore.logout();
    setProfile(null);
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
