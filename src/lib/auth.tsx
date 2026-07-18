import { useQueryClient } from "@tanstack/react-query";
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { auth } from "./firebase";
import { COL, getDocById } from "./db";
import { provisionProfileFromInvite } from "./functions";
import type { Profile } from "./types";

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (nextUser: User) => {
    try {
      let data = await getDocById<Profile>(COL.profiles, nextUser.uid);
      if (!data && nextUser.email) {
        data = (await provisionProfileFromInvite(nextUser.uid, nextUser.email)) as Profile | null;
      }
      return data;
    } catch (error) {
      console.error("profile load error", error);
      return null;
    }
  };

  useEffect(() => {
    let mounted = true;

    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      if (!mounted) return;
      if (nextUser) {
        setLoading(true);
        setUser(nextUser);
        const p = await loadProfile(nextUser);
        if (mounted) {
          setProfile(p);
          setLoading(false);
        }
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      isAdmin: profile?.role === "admin",
      signOut: async () => {
        await firebaseSignOut(auth);
        setProfile(null);
        setUser(null);
      },
      refreshProfile: async () => {
        if (user) {
          const p = await loadProfile(user);
          setProfile(p);
        }
      },
    }),
    [user, profile, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useInvalidateOnProfileUpdate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["profile"] });
}
