import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Flame, Trophy, CalendarDays, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bestStreak, dayKey, getStats, monthMinutes, setMonthGoal, streak } from "@/lib/stats";

export const Route = createFileRoute("/stats")({
  head: () => ({
    meta: [
      { title: "إحصائيات القراءة — مكتبتي" },
      { name: "description", content: "أيام قراءتك، هدفك الشهري، وسرعة قراءتك." },
      { property: "og:title", content: "إحصائيات القراءة — مكتبتي" },
      { property: "og:description", content: "أيام قراءتك، هدفك الشهري، وسرعة قراءتك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StatsPage,
});

function StatsPage() {
  const [s, setS] = useState<ReturnType<typeof getStats> | null>(null);
  useEffect(() => setS(getStats()), []);
  if (!s) return null;

  const days = Array.from({ length: 30 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (29 - i)); const k = dayKey(d); return { k, m: s.days[k] || 0, w: s.words[k] || 0 }; });
  const max = Math.max(s.goal, ...days.map((d) => d.m));
  const month = monthMinutes(s);
  const totalM = Object.values(s.days).reduce((a, b) => a + b, 0);
  const totalW = Object.values(s.words).reduce((a, b) => a + b, 0);
  const wpm = totalM ? Math.round(totalW / totalM) : 0;
  const pct = Math.min(1, month / s.monthGoal);

  const cards = [
    { I: Flame, t: "السلسلة الحالية", v: `${streak(s)} يوم` },
    { I: Trophy, t: "أطول سلسلة", v: `${bestStreak(s)} يوم` },
    { I: CalendarDays, t: "دقائق الشهر", v: `${month}` },
    { I: Gauge, t: "سرعتك", v: wpm ? `${wpm} كلمة/دقيقة` : "—" },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-5 py-6 sm:px-8">
      <div className="mb-6 flex items-center gap-3">
        <Button asChild variant="ghost"><Link to="/" aria-label="رجوع"><ArrowRight className="size-5" /></Link></Button>
        <h1 className="font-display text-3xl font-bold">إحصائياتي</h1>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map(({ I, t, v }) => (
          <div key={t} className="rounded-xl border border-border bg-card p-4 shadow-book">
            <I className="mb-2 size-5 text-primary" />
            <p className="text-xs text-muted-foreground">{t}</p>
            <p className="mt-1 text-xl font-bold">{v}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-book">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">الهدف الشهري</h2>
          <select aria-label="الهدف الشهري" value={s.monthGoal} onChange={(e) => { setMonthGoal(+e.target.value); setS(getStats()); }} className="rounded-md border border-border bg-background px-2 py-1 text-sm">
            {[300, 450, 600, 900, 1200, 1800].map((g) => <option key={g} value={g}>{g} دقيقة</option>)}
          </select>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct * 100}%` }} /></div>
        <p className="mt-2 text-sm text-muted-foreground">{month} من {s.monthGoal} دقيقة · {Math.round(pct * 100)}%</p>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-book">
        <h2 className="mb-4 font-semibold">آخر ٣٠ يوم</h2>
        <div className="flex h-40 items-end gap-1" dir="ltr">
          {days.map((d) => (
            <div key={d.k} title={`${d.k}: ${d.m} دقيقة`} className="flex-1 rounded-t bg-primary/80" style={{ height: `${Math.max(2, (d.m / max) * 100)}%`, opacity: d.m ? 1 : 0.2 }} />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>من ٣٠ يوم</span><span>النهارده</span></div>
      </section>
    </main>
  );
}
