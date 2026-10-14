import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Flame, Heart, Search, Trash2, Upload, Target, Loader2, ArrowUpLeft, Leaf, Library as LibraryIcon, CheckCheck, Sparkles } from "lucide-react";
import { deleteBook, getBooks, putBook, type Book } from "@/lib/db";
import { importFile } from "@/lib/parse";
import { Button } from "@/components/ui/button";
import retreat from "@/assets/reading-retreat.jpg";
import { badges, dayKey, getStats, setGoal, streak, weekMinutes } from "@/lib/stats";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "مكتبتي — مكتبة كتبك الشخصية" },
      { name: "description", content: "استورد كتبك PDF وEPUB وTXT واقرأها بثيمات مريحة وتظليل وأهداف يومية." },
      { property: "og:title", content: "مكتبتي — مكتبة كتبك الشخصية" },
      { property: "og:description", content: "قارئ كتب ممتع ومريح يعمل بدون إنترنت." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Library,
});

const FILTERS = ["الكل", "أقرأ الآن", "انتهيت", "المفضلة", "جديد"] as const;
const coverTone = (s: string) => [...s].reduce((a, c) => a + c.charCodeAt(0), 0) % 4;

function Ring({ value, size = 64 }: { value: number; size?: number }) {
  const r = size / 2 - 5, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={6} className="fill-none stroke-muted" />
      <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={6} strokeLinecap="round"
        className="fill-none stroke-accent transition-all duration-700"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, value))} />
    </svg>
  );
}

function Library() {
  const [books, setBooks] = useState<Book[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("الكل");
  const [busy, setBusy] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [stats, setStats] = useState<ReturnType<typeof getStats> | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = () => getBooks().then((b) => setBooks(b.sort((a, z) => (z.lastOpened || z.addedAt) - (a.lastOpened || a.addedAt))));
  useEffect(() => { load(); setStats(getStats()); }, []);

  const handle = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      setBusy(f.name);
      try { await putBook(await importFile(f)); } catch (e) { alert(`تعذر استيراد ${f.name}: ${(e as Error).message}`); }
    }
    setBusy(null); load();
  };

  const shown = useMemo(() => books.filter((b) => {
    if (q && !`${b.title} ${b.author}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "أقرأ الآن") return b.progress > 0.005 && b.progress < 0.98;
    if (filter === "انتهيت") return b.progress >= 0.98;
    if (filter === "المفضلة") return b.favorite;
    if (filter === "جديد") return b.progress <= 0.005;
    return true;
  }), [books, q, filter]);

  const today = stats?.days[dayKey()] || 0;
  const finished = books.filter((b) => b.progress >= 0.98).length;
  const continueBook = books.find((b) => b.progress > 0.005 && b.progress < 0.98);

  return (
    <div className="library-shell min-h-screen pb-12"
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files); }}>
      <header className="library-header border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="brand-mark grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground"><BookOpen className="size-6" /></span>
            <div><h1 className="font-display text-3xl font-bold leading-none">مكتبتي</h1><p className="mt-1.5 text-[11px] text-muted-foreground">بين الصفحات، مساحة لك</p></div>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"><Leaf className="size-4 text-primary" /> وقتك الهادئ يبدأ هنا</span>
            <Button size="lg" onClick={() => input.current?.click()} disabled={!!busy} className="import-button">
              {busy ? <Loader2 className="animate-spin" /> : <Upload />}{busy ? "جارٍ الاستيراد…" : "استيراد كتاب"}
            </Button>
          </div>
          <input ref={input} type="file" multiple hidden accept=".pdf,.epub,.txt,.md,.markdown"
            onChange={(e) => e.target.files && handle(e.target.files)} />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 sm:px-8">
        <section className="retreat-banner relative mt-7 overflow-hidden" aria-label="مساحتك للقراءة">
          <img src={retreat} alt="بحيرة هادئة بين الأشجار وركن للقراءة" width={1920} height={768} className="absolute inset-0 size-full object-cover" />
          <div className="retreat-shade absolute inset-0" />
          <div className="relative z-10 flex min-h-[285px] flex-col items-start justify-center px-7 py-8 text-retreat-foreground sm:px-10">
            <span className="mb-3 flex items-center gap-2 text-xs"><span className="h-px w-6 bg-retreat-foreground/60" /> لحظة بعيدًا عن الضجيج</span>
            <h2 className="font-display text-4xl font-bold leading-snug sm:text-5xl">عالمك بين<br />صفحات كتاب.</h2>
            <p className="mt-3 text-sm text-retreat-foreground/80">خذ نفسًا… واترك الحكاية تأخذك.</p>
            {continueBook ? <Button asChild variant="secondary" className="mt-5 bg-retreat-foreground text-primary hover:bg-retreat-foreground/90"><Link to="/read/$id" params={{ id: continueBook.id }}><BookOpen /> تابع القراءة <ArrowUpLeft /></Link></Button> : <Button variant="secondary" onClick={() => input.current?.click()} className="mt-5 bg-retreat-foreground text-primary hover:bg-retreat-foreground/90"><BookOpen /> اختر كتابك الأول <ArrowUpLeft /></Button>}
          </div>
          <span className="absolute bottom-5 left-6 hidden items-center gap-2 text-xs text-retreat-foreground/80 sm:flex"><Leaf className="size-4" /> مساحة صغيرة، لعوالم كبيرة</span>
        </section>

        {stats && <section className="reading-stats mt-6 grid grid-cols-2 border-b border-border pb-6 md:grid-cols-4">
          <div className="flex items-center gap-3 py-3"><div className="relative grid place-items-center"><Ring size={48} value={today / stats.goal} /><Target className="absolute size-4 text-primary" /></div><div><p className="text-[11px] text-muted-foreground">هدف القراءة اليومي</p><div className="mt-1 flex items-baseline gap-1 text-lg font-bold">{today}<span className="text-xs font-normal text-muted-foreground">/</span><select aria-label="هدف القراءة اليومي" value={stats.goal} onChange={(e) => { setGoal(+e.target.value); setStats(getStats()); }} className="goal-select bg-transparent text-sm text-foreground">{[10, 15, 20, 30, 45, 60].map((g) => <option key={g} value={g}>{g}</option>)}</select><span className="text-xs font-normal text-muted-foreground">دقيقة</span></div></div></div>
          <div className="flex items-center gap-3 py-3"><span className="stat-symbol stat-warm"><Flame className="size-5" /></span><div><p className="text-[11px] text-muted-foreground">سلسلة القراءة</p><p className="mt-1 text-lg font-bold">{streak(stats)} <span className="text-xs font-normal text-muted-foreground">يوم متواصل</span></p></div></div>
          <div className="flex items-center gap-3 py-3"><span className="stat-symbol stat-green"><CheckCheck className="size-5" /></span><div><p className="text-[11px] text-muted-foreground">رحلات أتممتها</p><p className="mt-1 text-lg font-bold">{finished} <span className="text-xs font-normal text-muted-foreground">كتاب مكتمل</span></p></div></div>
          <div className="flex items-center gap-3 py-3"><span className="stat-symbol stat-lilac"><Sparkles className="size-5" /></span><div><p className="text-[11px] text-muted-foreground">هذا الأسبوع · {weekMinutes(stats)} دقيقة</p><div className="mt-1 flex gap-2">{badges(finished).map((b) => <span key={b.name} title={`${b.name}: ${b.desc}`} className={`text-lg ${b.on ? "" : "opacity-25 grayscale"}`}>{b.icon}</span>)}</div></div></div>
        </section>}

        {continueBook && <section className="continue-strip mt-6 flex items-center gap-4 border-b border-border pb-6">
          <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-secondary text-primary"><BookOpen className="size-6" /></span>
          <div className="min-w-0 flex-1"><p className="mb-1 text-[11px] text-muted-foreground">حكايتك لم تنتهِ بعد</p><Link to="/read/$id" params={{ id: continueBook.id }} className="block truncate text-sm font-semibold">{continueBook.title}</Link></div>
          <div className="hidden w-28 sm:block"><p className="mb-2 text-left text-xs text-muted-foreground">{Math.round(continueBook.progress * 100)}%</p><div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${continueBook.progress * 100}%` }} /></div></div>
          <Button asChild variant="outline" size="sm"><Link to="/read/$id" params={{ id: continueBook.id }}>أكمل القراءة <ArrowUpLeft /></Link></Button>
        </section>}

        <section className="mt-8" aria-label="كتبك">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3"><LibraryIcon className="size-5 text-primary" /><h2 className="font-display text-3xl font-bold">رفوفك الخاصة</h2><span className="rounded-md bg-secondary px-2 py-1 text-xs text-muted-foreground">{books.length} كتاب</span></div>
            <label className="library-search flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-card px-3 sm:w-64"><Search className="size-4 shrink-0 text-muted-foreground" /><input aria-label="البحث عن كتاب" value={q} onChange={(e) => setQ(e.target.value)} placeholder="عنوان الكتاب أو اسم المؤلف…" className="min-w-0 w-full bg-transparent text-xs outline-none" /></label>
          </div>
          <div className="library-filters mt-4 flex gap-5 overflow-x-auto border-b border-border" role="tablist" aria-label="تصفية الكتب">
            {FILTERS.map((f) => <Button key={f} role="tab" aria-selected={filter === f} variant="ghost" onClick={() => setFilter(f)} className={`filter-tab shrink-0 rounded-none px-0 pb-4 pt-3 ${filter === f ? "filter-active" : "text-muted-foreground"}`}>{f === "المفضلة" && <Heart className="size-3.5" />}{f}</Button>)}
          </div>
          {books.length === 0 ? <div className={`empty-library mt-8 flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed py-8 text-center ${drag ? "border-primary bg-secondary" : "border-border"}`}>
            <span className="mb-3 grid size-14 place-items-center rounded-full bg-secondary text-primary"><BookOpen className="size-6" /></span><h3 className="font-display text-2xl font-bold">كل حكاية تبدأ بصفحة</h3><p className="mt-2 text-xs text-muted-foreground">مكتبتك تنتظر أول كتاب</p><Button onClick={() => input.current?.click()} variant="outline" className="mt-4"><Upload /> استيراد كتاب</Button><span className="mt-3 text-[10px] text-muted-foreground" dir="ltr">PDF · EPUB · TXT · Markdown</span>
          </div> : <motion.div layout className="book-grid mt-7 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"><AnimatePresence>{shown.map((b) => {
            const left = Math.ceil((b.wordCount * (1 - b.progress)) / 200);
            return <motion.article key={b.id} layout initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} className="group min-w-0">
              <Link to="/read/$id" params={{ id: b.id }} className="block" aria-label={`قراءة ${b.title}`}><motion.div whileHover={{ y: -5 }} whileTap={{ scale: 0.98 }} className="book-cover relative aspect-[2/3] overflow-hidden rounded-md shadow-book">
                {b.cover ? <img src={b.cover} alt={b.title} className="size-full object-cover" loading="lazy" /> : <div data-tone={coverTone(b.title)} className="generated-cover flex size-full flex-col justify-between p-4 text-cover-foreground"><div className="flex items-center justify-between"><span className="text-[10px] opacity-70">{b.format}</span><BookOpen className="size-4 opacity-60" /></div><div><span className="mb-3 block h-px w-8 bg-cover-foreground/50" /><h3 className="font-display text-2xl font-bold leading-snug">{b.title}</h3></div><p className="text-[10px] opacity-80">{b.author || "من مكتبتك الشخصية"}</p></div>}
                <div className="book-spine absolute inset-y-0 start-0 w-2" /><span className="absolute bottom-2 end-2 rounded bg-card/95 px-2 py-1 text-[9px] text-foreground">{b.format}</span>
              </motion.div></Link>
              <div className="mt-3 flex items-start gap-1"><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold" title={b.title}>{b.title}</h3><p className="mt-1 truncate text-[11px] text-muted-foreground">{b.author || "مؤلف غير معروف"}</p></div><Button size="icon" variant="ghost" className="size-7 shrink-0" title="مفضلة" aria-label="مفضلة" aria-pressed={b.favorite} onClick={async () => { await putBook({ ...b, favorite: !b.favorite }); load(); }}><Heart className={b.favorite ? "fill-destructive text-destructive" : "text-muted-foreground"} /></Button></div>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${b.progress * 100}%` }} /></div>
              <div className="mt-1.5 flex items-center justify-between gap-1"><span className="text-[10px] text-muted-foreground">{Math.round(b.progress * 100)}% · {b.progress >= 0.98 ? "مكتمل" : `~${left < 60 ? left + " د" : Math.round(left / 60) + " س"} متبقية`}</span><Button variant="ghost" size="icon" className="size-6 text-muted-foreground" title="حذف الكتاب" aria-label="حذف" onClick={async () => { if (confirm("حذف الكتاب؟")) { await deleteBook(b.id); load(); } }}><Trash2 className="size-3" /></Button></div>
            </motion.article>;
          })}</AnimatePresence></motion.div>}
          {books.length > 0 && shown.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">لا توجد كتب مطابقة</p>}
        </section>
        <footer className="mt-10 flex items-center justify-center gap-2 border-t border-border pt-5 text-[11px] text-muted-foreground"><Leaf className="size-3.5" /> صفحة أخرى… وهدوء أكثر.</footer>
      </main>
      {drag && <div className="pointer-events-none fixed inset-3 z-50 grid place-items-center rounded-xl border-2 border-dashed border-primary bg-background/95"><div className="flex items-center gap-3 text-xl text-primary"><Upload /> أضف كتبك إلى المكتبة</div></div>}
    </div>
  );
}
