import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Flame, Heart, Search, Trash2, Upload, Target, Loader2 } from "lucide-react";
import { deleteBook, getBooks, putBook, type Book } from "@/lib/db";
import { importFile } from "@/lib/parse";
import { badges, dayKey, getStats, setGoal, streak, weekMinutes } from "@/lib/stats";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "مكتبتي — مكتبة كتبك الشخصية" },
      { name: "description", content: "استورد كتبك PDF وEPUB وTXT واقرأها بثيمات مريحة وتظليل وأهداف يومية." },
      { property: "og:title", content: "مكتبتي — مكتبة كتبك الشخصية" },
      { property: "og:description", content: "قارئ كتب ممتع ومريح يعمل بدون إنترنت." },
    ],
  }),
  component: Library,
});

const FILTERS = ["الكل", "أقرأ الآن", "انتهيت", "المفضلة", "جديد"] as const;
const hue = (s: string) => [...s].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;

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
    <div className="min-h-screen paper-grain pb-16"
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files); }}>
      <div className="mx-auto max-w-5xl px-5 pt-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-4xl font-bold text-primary">مكتبتي</h1>
            <p className="text-sm text-muted-foreground">{books.length} كتاب · {finished} مكتمل</p>
          </div>
          <button onClick={() => input.current?.click()}
            className="flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-semibold text-primary-foreground shadow-book transition active:scale-95">
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
            {busy ? "جارٍ الاستيراد…" : "استيراد كتاب"}
          </button>
          <input ref={input} type="file" multiple hidden accept=".pdf,.epub,.txt,.md,.markdown"
            onChange={(e) => e.target.files && handle(e.target.files)} />
        </header>

        {stats && (
          <section className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="flex items-center gap-4 rounded-2xl bg-card p-4 shadow-book">
              <div className="relative grid place-items-center"><Ring value={today / stats.goal} />
                <Target className="absolute size-5 text-accent" /></div>
              <div>
                <div className="text-sm text-muted-foreground">هدف اليوم</div>
                <div className="text-xl font-bold">{today} / 
                  <select value={stats.goal} onChange={(e) => { setGoal(+e.target.value); setStats(getStats()); }}
                    className="bg-transparent font-bold"> {[10, 15, 20, 30, 45, 60].map((g) => <option key={g} value={g}>{g}</option>)}</select> د
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-2xl bg-card p-4 shadow-book">
              <Flame className="size-10 text-accent" />
              <div><div className="text-sm text-muted-foreground">سلسلة القراءة</div>
                <div className="text-xl font-bold">{streak(stats)} يوم</div></div>
            </div>
            <div className="rounded-2xl bg-card p-4 shadow-book">
              <div className="text-sm text-muted-foreground">هذا الأسبوع: {weekMinutes(stats)} دقيقة</div>
              <div className="mt-2 flex gap-2">
                {badges(finished).map((b) => (
                  <span key={b.name} title={`${b.name}: ${b.desc}`}
                    className={`grid size-9 place-items-center rounded-full bg-muted text-lg ${b.on ? "" : "opacity-25 grayscale"}`}>{b.icon}</span>
                ))}
              </div>
            </div>
          </section>
        )}

        {continueBook && (
          <Link to="/read/$id" params={{ id: continueBook.id }}
            className="mt-4 flex items-center gap-4 rounded-2xl bg-primary p-4 text-primary-foreground shadow-book">
            <BookOpen className="size-8" />
            <div className="flex-1"><div className="text-sm opacity-80">تابع القراءة</div>
              <div className="font-bold">{continueBook.title}</div></div>
            <span className="text-2xl font-bold">{Math.round(continueBook.progress * 100)}%</span>
          </Link>
        )}

        <div className="mt-6 flex items-center gap-2 rounded-full bg-card px-4 py-2 shadow-book">
          <Search className="size-5 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالعنوان أو المؤلف…"
            className="w-full bg-transparent py-1 outline-none" />
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition ${filter === f ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground"}`}>{f}</button>
          ))}
        </div>

        {books.length === 0 ? (
          <button onClick={() => input.current?.click()}
            className={`mt-8 grid w-full place-items-center rounded-3xl border-2 border-dashed p-14 text-center transition ${drag ? "border-accent bg-secondary" : "border-border"}`}>
            <BookOpen className="size-14 text-primary" />
            <p className="mt-4 font-display text-2xl">مكتبتك فارغة</p>
            <p className="text-muted-foreground">اضغط أو اسحب ملفات PDF أو EPUB أو TXT أو Markdown</p>
          </button>
        ) : (
          <motion.div layout className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4">
            <AnimatePresence>
              {shown.map((b) => {
                const left = Math.ceil((b.wordCount * (1 - b.progress)) / 200);
                return (
                  <motion.div key={b.id} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
                    className="group">
                    <Link to="/read/$id" params={{ id: b.id }} className="block">
                      <motion.div whileHover={{ y: -6, rotate: -1 }} whileTap={{ scale: 0.97 }}
                        className="relative aspect-[2/3] overflow-hidden rounded-lg rounded-s-sm shadow-book">
                        {b.cover ? <img src={b.cover} alt={b.title} className="size-full object-cover" /> : (
                          <div className="flex size-full flex-col justify-between p-4 text-primary-foreground"
                            style={{ background: `linear-gradient(150deg, oklch(0.45 0.1 ${hue(b.title)}), oklch(0.28 0.07 ${hue(b.title) + 40}))` }}>
                            <span className="text-xs opacity-70">{b.format}</span>
                            <span className="font-display text-xl font-bold leading-tight">{b.title}</span>
                            <span className="text-xs opacity-80">{b.author}</span>
                          </div>
                        )}
                        <div className="absolute inset-y-0 start-0 w-2 bg-foreground/15" />
                      </motion.div>
                    </Link>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-accent" style={{ width: `${b.progress * 100}%` }} />
                    </div>
                    <div className="mt-1.5 flex items-start justify-between gap-1">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold">{b.title}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {Math.round(b.progress * 100)}% · {b.progress >= 0.98 ? "مكتمل" : `~${left < 60 ? left + " د" : Math.round(left / 60) + " س"} متبقية`}
                        </div>
                      </div>
                      <div className="flex shrink-0">
                        <button aria-label="مفضلة" onClick={async () => { await putBook({ ...b, favorite: !b.favorite }); load(); }}>
                          <Heart className={`size-4 ${b.favorite ? "fill-destructive text-destructive" : "text-muted-foreground"}`} /></button>
                        <button aria-label="حذف" className="ms-2" onClick={async () => { if (confirm("حذف الكتاب؟")) { await deleteBook(b.id); load(); } }}>
                          <Trash2 className="size-4 text-muted-foreground" /></button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
}
