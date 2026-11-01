import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Cloud, CloudOff, Loader2, LogOut, UserRound, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAccount } from "./AccountProvider";
import { supabase } from "@/integrations/supabase/client";
import { syncLibrary, legacyCount, importLegacyBooks } from "@/lib/db";
export function AccountControls() {
  const { user } = useAccount(); const query = useQueryClient(); const navigate = useNavigate();
  const [status, setStatus] = useState("pending"); const [legacy, setLegacy] = useState(0); const [error, setError] = useState("");
  useEffect(() => {
    void legacyCount().then(setLegacy);
    const listen = (e: Event) => setStatus((e as CustomEvent<string>).detail);
    window.addEventListener("library-sync", listen); if (user) void syncLibrary().catch(() => {});
    return () => window.removeEventListener("library-sync", listen);
  }, [user]);
  async function signOut() {
    await query.cancelQueries(); query.clear(); const { error } = await supabase.auth.signOut();
    if (error) { setError("تعذر تسجيل الخروج، حاول تاني."); return; }
    await navigate({ to: "/auth", replace: true });
  }
  return <section className="flex flex-wrap items-center gap-3 border-b border-border py-3 text-sm">
    {user ? <>
      <span className="flex items-center gap-2 text-primary"><UserRound className="size-4" />{user.email?.split("@")[0]}</span>
      <span role="status" className="flex items-center gap-2 text-xs text-muted-foreground">{status === "saved" ? <Cloud className="size-4" /> : status === "error" ? <CloudOff className="size-4" /> : <Loader2 className="size-4 animate-spin" />}{status === "saved" ? "محفوظ في حسابك" : status === "error" ? "لم يُحفظ سحابيًا — النسخة على الجهاز" : "جارٍ حفظ مكتبتك…"}</span>
      <Button variant="ghost" size="icon" aria-label="إعادة الحفظ" title="إعادة الحفظ" onClick={() => void syncLibrary().catch(() => {})}><RefreshCw /></Button>
      {legacy > 0 && <Button variant="outline" onClick={async () => { if (!confirm("نسخ الكتب الموجودة على الجهاز إلى الحساب الحالي؟")) return; try { await importLegacyBooks(); setLegacy(0); window.dispatchEvent(new Event("library-restored")); } catch { setError("تعذر حفظ كل الكتب، اضغط إعادة الحفظ عند اتصال الإنترنت."); } }}>حفظ كتب الجهاز في حسابي ({legacy})</Button>}
      <Button variant="ghost" size="icon" className="ms-auto" aria-label="تسجيل الخروج" title="تسجيل الخروج" onClick={signOut}><LogOut /></Button>
    </> : <><span className="text-xs text-muted-foreground">الكتب حاليًا محفوظة على الجهاز فقط</span><Button asChild variant="outline" className="ms-auto"><Link to="/auth"><UserRound /> دخول / حساب جديد</Link></Button></>}
    {error && <p role="alert" className="w-full text-xs text-destructive">{error}</p>}
  </section>;
}