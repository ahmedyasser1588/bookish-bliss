import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { BookOpen, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { usernameEmail } from "@/lib/account";
import { useAccount } from "@/components/AccountProvider";
export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [
    { title: "حسابك — مكتبتي" }, { name: "description", content: "ادخل إلى مكتبتك الخاصة باسم المستخدم وكلمة المرور." },
    { property: "og:title", content: "حسابك — مكتبتي" }, { property: "og:description", content: "مكتبة خاصة محفوظة لحسابك." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: Auth,
});
function Auth() {
  const [signup, setSignup] = useState(false); const [name, setName] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const navigate = useNavigate(); const { user } = useAccount();
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const email = usernameEmail(name);
      const result = signup ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } }) : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (!result.data.session) { setError("الحساب محتاج تأكيد البريد؛ لازم صاحب التطبيق يقفل تأكيد البريد علشان الدخول باسم فقط يشتغل."); return; }
      await navigate({ to: "/" });
    } catch (e) { setError(e instanceof Error && e.message.includes("اسم المستخدم") ? e.message : signup ? "تعذر إنشاء الحساب. الاسم قد يكون مستخدمًا، أو كلمة المرور غير مناسبة؛ جرّب اسمًا آخر وكلمة مرور أقوى." : "تعذر الدخول؛ راجع اسم المستخدم وكلمة المرور واتصال الإنترنت."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto min-h-screen max-w-md px-6 py-12">
    <Button asChild variant="ghost"><Link to="/"><ArrowRight /> المكتبة</Link></Button>
    <BookOpen className="mx-auto mt-12 size-12 text-primary" /><h1 className="mt-5 text-center font-display text-3xl font-bold">{signup ? "حساب جديد" : "أهلًا بعودتك"}</h1>
    {user ? <Button asChild className="mt-8 w-full"><Link to="/">افتح مكتبتك</Link></Button> : <form onSubmit={submit} className="mt-8 space-y-5">
      <label className="block space-y-2 text-sm"><span>اسم المستخدم</span><Input required autoComplete="username" dir="ltr" value={name} onChange={e => setName(e.target.value)} /></label>
      <label className="block space-y-2 text-sm"><span>كلمة المرور</span><Input required minLength={8} type="password" autoComplete={signup ? "new-password" : "current-password"} dir="ltr" value={password} onChange={e => setPassword(e.target.value)} /></label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button disabled={busy} className="w-full" type="submit">{busy && <Loader2 className="animate-spin" />}{signup ? "إنشاء حساب" : "دخول"}</Button>
      <Button type="button" variant="ghost" className="w-full" onClick={() => { setSignup(!signup); setError(""); }}>{signup ? "عندي حساب بالفعل" : "إنشاء حساب جديد"}</Button>
      {signup && <p className="text-xs text-muted-foreground">احفظ كلمة المرور في مكان آمن؛ الحساب بدون بريد إلكتروني، فاسترجاعها بالبريد غير متاح.</p>}
    </form>}
  </main>;
}