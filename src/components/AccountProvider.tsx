import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getScope, setScope } from "@/lib/account";
import { syncLibrary } from "@/lib/db";
const AccountContext = createContext<{ user: User | null }>({ user: null });
export const useAccount = () => useContext(AccountContext);
export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null); const [ready, setReady] = useState(false);
  const queryClient = useQueryClient(); const router = useRouter();
  useEffect(() => {
    let alive = true;
    const apply = (next: User | null) => { if (!alive) return; setScope(next?.id || null); setUser(next); setReady(true); };
    void supabase.auth.getUser().then(({ data }) => apply(data.user));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      if (getScope() !== (session?.user.id || "guest")) queryClient.clear();
      apply(session?.user || null); void router.invalidate();
      if (event !== "SIGNED_OUT") void queryClient.invalidateQueries();
    });
    const online = () => { void syncLibrary().catch(() => {}); };
    window.addEventListener("online", online); navigator.storage?.persist?.().catch(() => {});
    return () => { alive = false; data.subscription.unsubscribe(); window.removeEventListener("online", online); };
  }, [queryClient, router]);
  return <AccountContext.Provider value={{ user }}>{ready ? <div key={user?.id || "guest"}>{children}</div> : <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">جارٍ فتح مكتبتك…</div>}</AccountContext.Provider>;
}