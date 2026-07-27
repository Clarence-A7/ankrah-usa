"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { getCurrentUserSession, logoutUserSession } from "@/app/actions/auth";
import { useRouter } from "next/navigation";

interface UserPayload {
  id: string;
  email: string;
  role: string;
  name: string;
  avatarUrl: string | null;
}

interface AuthContextType {
  user: UserPayload | null;
  isLoading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<UserPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function loadSession() {
      try {
        const session = await getCurrentUserSession();
        setUser(session);
      } catch (err) {
        console.error("Auth context failed to parse session state token:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadSession();
  }, []);

  const logout = async () => {
    setIsLoading(true);
    await logoutUserSession();
    setUser(null);
    setIsLoading(false);
    router.push("/");
    router.refresh();
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error(
      "useAuth must be executed within an active AuthProvider scope.",
    );
  }
  return context;
};
