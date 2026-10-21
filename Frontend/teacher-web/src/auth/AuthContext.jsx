import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { supabase } from "../lib/supabase.js";
import { api, ACCOUNT_OFF_TEXT } from '../lib/api.js'

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  // Ask the backend who this is. The role check here is only for a friendly
  // message. The backend checks the role again on every request.
  const loadProfile = useCallback(async () => {
    const me = await api.get("/auth/me");
    if (me.role !== "teacher") {
      await supabase.auth.signOut();
      throw new Error("This dashboard is for teachers only.");
    }
    setProfile(me);
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        try {
          await loadProfile();
        } catch (err) {
          if (active) setNotice(err.message); // keep the message so the login page can show it
        }
      }
      if (active) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setProfile(null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(
    async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        console.error('Supabase sign-in error:', error.status, error.message)
        // A banned user gets a clear message instead of "wrong password".
        if (error.code === 'user_banned' || /banned/i.test(error.message || '')) {
          throw new Error(ACCOUNT_OFF_TEXT)
        }
        throw new Error(
          import.meta.env.DEV
            ? `Sign-in failed: ${error.message}`
            : 'Wrong email or password.',
        )
      }
      await loadProfile();
    },
    [loadProfile],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const clearNotice = useCallback(() => setNotice(""), []);

  return (
    <AuthContext.Provider
      value={{ profile, loading, notice, clearNotice, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
