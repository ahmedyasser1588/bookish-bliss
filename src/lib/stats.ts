type Stats = { days: Record<string, number>; words: Record<string, number>; goal: number; monthGoal: number; night: number };
const KEY = "maktaba-stats";
export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
const DEF: Stats = { days: {}, words: {}, goal: 20, monthGoal: 600, night: 0 };

export function getStats(): Stats {
  try { return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
  catch { return { ...DEF }; }
}
const save = (s: Stats) => localStorage.setItem(KEY, JSON.stringify(s));
export function addMinute() {
  const s = getStats(); const k = dayKey();
  s.days[k] = (s.days[k] || 0) + 1;
  const h = new Date().getHours(); if (h >= 23 || h < 4) s.night++;
  save(s);
}
/** words read today (estimated from forward progress) */
export function addWords(n: number) {
  if (!(n > 0)) return;
  const s = getStats(); const k = dayKey();
  s.words[k] = (s.words[k] || 0) + Math.round(n); save(s);
}
export const setGoal = (g: number) => { const s = getStats(); s.goal = g; save(s); };
export const setMonthGoal = (g: number) => { const s = getStats(); s.monthGoal = g; save(s); };

export function streak(s = getStats()) {
  let n = 0; const d = new Date();
  if (!s.days[dayKey(d)]) d.setDate(d.getDate() - 1);
  while (s.days[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
export function bestStreak(s = getStats()) {
  const ks = Object.keys(s.days).filter((k) => s.days[k]).sort();
  let best = 0, cur = 0, prev = 0;
  for (const k of ks) { const t = Date.parse(k); cur = prev && t - prev === 864e5 ? cur + 1 : 1; best = Math.max(best, cur); prev = t; }
  return best;
}
export function weekMinutes(s = getStats()) {
  let t = 0; const d = new Date();
  for (let i = 0; i < 7; i++) { t += s.days[dayKey(d)] || 0; d.setDate(d.getDate() - 1); }
  return t;
}
export function monthMinutes(s = getStats(), m = dayKey().slice(0, 7)) {
  return Object.entries(s.days).reduce((a, [k, v]) => (k.startsWith(m) ? a + v : a), 0);
}
export function badges(finished: number) {
  const s = getStats(); const st = streak(s);
  const total = Object.values(s.days).reduce((a, b) => a + b, 0);
  return [
    { name: "البداية", desc: "أول دقيقة قراءة", on: total > 0, icon: "🌱" },
    { name: "بومة الليل", desc: "٣٠ دقيقة بعد ١١ مساءً", on: s.night >= 30, icon: "🦉" },
    { name: "دودة كتب", desc: "إنهاء ٣ كتب", on: finished >= 3, icon: "🐛" },
    { name: "أسبوع ناري", desc: "سلسلة ٧ أيام", on: st >= 7, icon: "🔥" },
    { name: "ماراثون", desc: "١٠ ساعات قراءة", on: total >= 600, icon: "🏃" },
  ];
}
