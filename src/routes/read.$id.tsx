import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight, Type, Highlighter, Timer, Volume2, VolumeX, ChevronLeft, ChevronRight,
  Copy, Download, Languages, BookA, X, Play, Pause, Trash2, CloudRain, FileImage, FileText,
  Bookmark, BookmarkPlus, Pen,
} from "lucide-react";
import { getBook, updateBook, type Book, type Highlight } from "@/lib/db";
import { addMinute, addWords } from "@/lib/stats";
import { Button } from "@/components/ui/button";
import { PdfView } from "@/components/PdfView";

export const Route = createFileRoute("/read/$id")({
  head: () => ({
    meta: [
      { title: "القراءة — مكتبتي" },
      { name: "description", content: "وضع قراءة هادئ مع ثيمات وتظليل وقراءة صوتية." },
      { property: "og:title", content: "القراءة — مكتبتي" },
      { property: "og:description", content: "اقرأ كتابك بتركيز وراحة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Reader,
});

type Settings = { theme: string; font: string; size: number; line: number; spacing: number; margin: number; mode: "scroll" | "page"; speed: number };
const DEF: Settings = { theme: "sepia", font: "Amiri", size: 20, line: 1.8, spacing: 0, margin: 24, mode: "page", speed: 1 };
const THEMES: [string, string][] = [["light", "فاتح"], ["sepia", "ورقي"], ["dark", "داكن"], ["oled", "أسود"]];
const FONTS = ["Amiri", "Noto Naskh Arabic", "Cairo", "Literata", "Georgia"];
const COLORS: [string, string][] = [["yellow", "فكرة"], ["green", "اقتباس"], ["pink", "مفردات"], ["blue", "سؤال"]];

function Reader() {
  const { id } = Route.useParams();
  const [book, setBook] = useState<Book | null>(null);
  const [s, setS] = useState<Settings>(DEF);
  const [ui, setUi] = useState(true);
  const [panel, setPanel] = useState<null | "type" | "hl" | "timer" | "bm">(null);
  const [draw, setDraw] = useState(false);
  const [jump, setJump] = useState<{ p: number; k: number } | null>(null);
  const [progress, setProgress] = useState(0);
  const [sel, setSel] = useState<{ text: string; x: number; y: number } | null>(null);
  const [dict, setDict] = useState<{ word: string; defs: string[] } | null>(null);
  const [auto, setAuto] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [orig, setOrig] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const restored = useRef(false);

  useEffect(() => {
    try { setS({ ...DEF, ...JSON.parse(localStorage.getItem("maktaba-settings") || "{}") }); } catch { /* ignore */ }
    getBook(id).then((b) => { if (b) { setBook(b); setProgress(b.progress); updateBook(id, { lastOpened: Date.now() }); } });
    const t = setInterval(() => document.visibilityState === "visible" && addMinute(), 60000);
    return () => { clearInterval(t); speechSynthesis?.cancel(); };
  }, [id]);
  const set = (p: Partial<Settings>) => setS((o) => { const n = { ...o, ...p }; localStorage.setItem("maktaba-settings", JSON.stringify(n)); return n; });

  const rtl = book?.dir === "rtl";
  const sign = rtl ? -1 : 1;
  const metrics = useCallback(() => {
    const el = box.current!;
    return s.mode === "page"
      ? { pos: Math.abs(el.scrollLeft), max: el.scrollWidth - el.clientWidth }
      : { pos: el.scrollTop, max: el.scrollHeight - el.clientHeight };
  }, [s.mode]);

  const goTo = useCallback((p: number) => {
    const el = box.current; if (!el) return;
    const { max } = metrics();
    if (s.mode === "page") {
      const w = el.clientWidth;
      el.scrollLeft = sign * Math.round((p * max) / w) * w;
    } else el.scrollTop = p * max;
  }, [metrics, s.mode, sign]);

  // restore position after layout changes
  useEffect(() => {
    if (!book) return;
    const t = setTimeout(() => { goTo(restored.current ? progress : book.progress); restored.current = true; }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, s.mode, s.size, s.line, s.margin, s.font, s.spacing]);

  const saveT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onScroll = () => {
    const { pos, max } = metrics();
    const p = max > 0 ? Math.min(1, pos / max) : 1;
    if (book && p > progress && p - progress < 0.2) addWords((p - progress) * book.wordCount);
    setProgress(p);
    clearTimeout(saveT.current);
    saveT.current = setTimeout(() => updateBook(id, { progress: p }), 400);
  };

  const turn = (d: number) => {
    const el = box.current!;
    if (s.mode === "page") el.scrollBy({ left: sign * d * el.clientWidth, behavior: "smooth" });
    else el.scrollBy({ top: d * el.clientHeight * 0.9, behavior: "smooth" });
  };

  // auto scroll
  useEffect(() => {
    if (!auto) return;
    let raf = 0, acc = 0;
    const step = () => {
      const el = box.current!;
      acc += s.speed * 0.4;
      if (s.mode === "scroll") { if (acc >= 1) { el.scrollTop += Math.floor(acc); acc %= 1; } }
      else if (acc > 600) { turn(1); acc = 0; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, s.speed, s.mode]);

  // paint highlights with CSS Highlight API
  useEffect(() => {
    const el = box.current;
    const H = (globalThis as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
    const reg = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
    if (!el || !book || !H || !reg) return;
    const nodes: Text[] = []; const starts: number[] = []; let full = "";
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { const n = w.currentNode as Text; starts.push(full.length); nodes.push(n); full += n.data; }
    const locate = (i: number) => { let k = 0; while (k + 1 < starts.length && starts[k + 1]! <= i) k++; return [nodes[k]!, i - starts[k]!] as const; };
    const groups: Record<string, Range[]> = {};
    for (const h of book.highlights) {
      const i = full.indexOf(h.text); if (i < 0) continue;
      const r = document.createRange();
      const [a, ao] = locate(i); const [b, bo] = locate(i + h.text.length);
      try { r.setStart(a, ao); r.setEnd(b, bo); (groups[h.color] ||= []).push(r); } catch { /* skip */ }
    }
    COLORS.forEach(([c]) => reg.set(`hl-${c}`, new H(...(groups[c] || []))));
  }, [book, s]);

  const onSelect = () => {
    const se = window.getSelection();
    const text = se?.toString().trim();
    if (!text || !se?.rangeCount) return setSel(null);
    const r = se.getRangeAt(0).getBoundingClientRect();
    setSel({ text, x: r.left + r.width / 2, y: r.top });
  };

  const addHl = async (color: string) => {
    if (!book || !sel) return;
    const note = color === "blue" ? prompt("أضف ملاحظة (اختياري)") || undefined : undefined;
    const h: Highlight = { id: crypto.randomUUID(), text: sel.text, color, note, createdAt: Date.now() };
    const highlights = [...book.highlights, h];
    setBook({ ...book, highlights }); updateBook(id, { highlights });
    window.getSelection()?.removeAllRanges(); setSel(null);
  };
  const editHl = (h: Highlight, patch: Partial<Highlight> | null) => {
    if (!book) return;
    const highlights = patch ? book.highlights.map((x) => (x.id === h.id ? { ...x, ...patch } : x)) : book.highlights.filter((x) => x.id !== h.id);
    setBook({ ...book, highlights }); updateBook(id, { highlights });
  };

  const lookup = async (word: string) => {
    setSel(null);
    const w = word.split(/\s+/)[0] ?? word;
    if (/[\u0600-\u06FF]/.test(w)) { window.open(`https://www.almaany.com/ar/dict/ar-ar/${encodeURIComponent(w)}/`, "_blank"); return; }
    setDict({ word: w, defs: ["جارٍ البحث…"] });
    try {
      const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w.toLowerCase())}`);
      const j = await r.json();
      const defs = Array.isArray(j) ? j[0].meanings.flatMap((m: { partOfSpeech: string; definitions: { definition: string }[] }) => m.definitions.slice(0, 2).map((d) => `(${m.partOfSpeech}) ${d.definition}`)) : ["لا يوجد تعريف"];
      setDict({ word: w, defs });
    } catch { setDict({ word: w, defs: ["تعذر الاتصال بالقاموس"] }); }
  };
  const translate = (t: string) => {
    setSel(null);
    window.open(`https://translate.google.com/?sl=auto&tl=${/[\u0600-\u06FF]/.test(t) ? "en" : "ar"}&text=${encodeURIComponent(t)}`, "_blank");
  };

  const speak = () => {
    if (speaking) { speechSynthesis.cancel(); setSpeaking(false); return; }
    const el = box.current!; const rect = el.getBoundingClientRect();
    const blocks = [...el.querySelectorAll("p,h1,h2,h3,li,blockquote")] as HTMLElement[];
    let i = blocks.findIndex((b) => { const r = b.getBoundingClientRect(); return r.bottom > rect.top && r.left < rect.right && r.right > rect.left; });
    if (i < 0) i = 0;
    setSpeaking(true);
    const next = () => {
      if (i >= blocks.length) return setSpeaking(false);
      const u = new SpeechSynthesisUtterance(blocks[i++]!.innerText);
      u.lang = rtl ? "ar-EG" : "en-US"; u.onend = next; u.onerror = () => setSpeaking(false);
      speechSynthesis.speak(u);
    };
    next();
  };

  const exportMd = (mode: "copy" | "file") => {
    if (!book) return;
    const md = `# ${book.title}\n\n` + book.highlights.map((h) => `> ${h.text}\n${h.note ? `\n**ملاحظة:** ${h.note}\n` : ""}`).join("\n");
    if (mode === "copy") navigator.clipboard.writeText(md);
    else { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" })); a.download = `${book.title}-highlights.md`; a.click(); }
  };

  if (!book) return <div className="reader grid min-h-screen place-items-center" data-theme={s.theme}>جارٍ فتح الكتاب…</div>;
  const minsLeft = Math.ceil((book.wordCount * (1 - progress)) / 200);
  const pdfMode = !!book.file && (!book.html || orig);
  const oldPdf = book.format === "PDF" && !book.file;
  const saveProgress = (p: number) => {
    if (p > progress && p - progress < 0.2) addWords((p - progress) * book.wordCount);
    setProgress(p);
    clearTimeout(saveT.current);
    saveT.current = setTimeout(() => updateBook(id, { progress: p }), 400);
  };
  const saveBms = (bookmarks: NonNullable<Book["bookmarks"]>) => { setBook({ ...book, bookmarks }); updateBook(id, { bookmarks }); };
  const addBm = () => {
    const label = book.pages ? `صفحة ${Math.round(progress * (book.pages - 1)) + 1}` : `${Math.round(progress * 100)}%`;
    saveBms([...(book.bookmarks || []), { id: crypto.randomUUID(), pos: progress, label, createdAt: Date.now() }]);
  };
  const jumpTo = (p: number) => { if (pdfMode) setJump({ p, k: Date.now() }); else goTo(p); };

  return (
    <div className="reader fixed inset-0 overflow-hidden" data-theme={s.theme}>
      <AnimatePresence>
        {ui && (
          <motion.header initial={{ y: -60 }} animate={{ y: 0 }} exit={{ y: -60 }}
            className="reader-ui reader-toolbar absolute inset-x-0 top-0 z-20 flex items-center gap-1 px-3 py-2">
            <Button asChild variant="ghost" className="reader-tool" title="رجوع للمكتبة"><Link to="/" aria-label="رجوع"><ArrowRight className="size-5" /></Link></Button>
            <div className="reader-title min-w-0 flex-1 truncate font-semibold">{book.title}</div>
            {book.file && book.html && (
              <Button variant="ghost" className="reader-tool" aria-label={orig ? "عرض النص" : "الشكل الأصلي"} title={orig ? "عرض النص" : "الشكل الأصلي للصفحات"} onClick={() => setOrig(!orig)}>
                {orig ? <FileText className="size-5" /> : <FileImage className="size-5" />}
              </Button>
            )}
            {!pdfMode && <Button variant="ghost" className="reader-tool" title="قراءة صوتية" aria-label="قراءة صوتية" onClick={speak}>{speaking ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}</Button>}
            {!pdfMode && <Button variant="ghost" className="reader-tool" title="تمرير تلقائي" aria-label="تمرير تلقائي" onClick={() => setAuto(!auto)}>{auto ? <Pause className="size-5" /> : <Play className="size-5" />}</Button>}
            <Button variant="ghost" className="reader-tool" title="العلامات المرجعية" aria-label="العلامات المرجعية" aria-pressed={panel === "bm"} onClick={() => setPanel(panel === "bm" ? null : "bm")}><Bookmark className="size-5" /></Button>
            {pdfMode && <Button variant="ghost" className="reader-tool" title="رسم وملاحظات" aria-label="رسم وملاحظات" aria-pressed={draw} onClick={() => { setDraw(!draw); setPanel(null); }}><Pen className="size-5" /></Button>}
            <Button variant="ghost" className="reader-tool" title="مؤقت" aria-label="مؤقت" aria-pressed={panel === "timer"} onClick={() => setPanel(panel === "timer" ? null : "timer")}><Timer className="size-5" /></Button>
            {!pdfMode && <Button variant="ghost" className="reader-tool" title="التظليلات" aria-label="التظليلات" onClick={() => setPanel(panel === "hl" ? null : "hl")}><Highlighter className="size-5" /></Button>}
            <Button variant="ghost" className="reader-tool" title="الخط" aria-label="الخط" aria-pressed={panel === "type"} onClick={() => setPanel(panel === "type" ? null : "type")}><Type className="size-5" /></Button>
          </motion.header>
        )}
      </AnimatePresence>

      {oldPdf && (
        <div className="reader-ui absolute inset-x-4 top-16 z-20 rounded-xl p-3 text-sm shadow-book">
          الكتاب ده اتحفظ بالطريقة القديمة. ارجع للمكتبة، احذفه، واستورده تاني عشان يفتح بصفحاته الأصلية.
        </div>
      )}

      {pdfMode ? (
        <PdfView file={book.file!} initial={progress} mode={s.mode} rtl={rtl} ui={ui}
          onProgress={saveProgress} onToggleUi={() => { setUi(!ui); setPanel(null); }}
          jump={jump} draw={draw} onDrawDone={() => setDraw(false)}
          drawings={book.drawings || {}} notes={book.pageNotes || {}}
          onSaveDrawing={(pg, u) => { const d = { ...(book.drawings || {}) }; if (u) d[pg] = u; else delete d[pg]; setBook({ ...book, drawings: d }); updateBook(id, { drawings: d }); }}
          onSaveNote={(pg, t) => { const d = { ...(book.pageNotes || {}) }; if (t.trim()) d[pg] = t.trim(); else delete d[pg]; setBook({ ...book, pageNotes: d }); updateBook(id, { pageNotes: d }); }} />
      ) : (
      <>
      <div ref={box} onScroll={onScroll} onMouseUp={onSelect} onTouchEnd={() => setTimeout(onSelect, 50)}
        onClick={(e) => {
          if (window.getSelection()?.toString()) return;
          const x = e.clientX / window.innerWidth;
          if (s.mode === "page" && x < 0.25) turn(rtl ? 1 : -1);
          else if (s.mode === "page" && x > 0.75) turn(rtl ? -1 : 1);
          else { setUi(!ui); setPanel(null); }
        }}
        dir={book.dir}
        className="book-content absolute inset-0"
        style={{
          fontFamily: `"${s.font}", serif`, fontSize: s.size, lineHeight: s.line, letterSpacing: `${s.spacing}px`,
          ...(s.mode === "page"
            ? { overflowX: "hidden", overflowY: "hidden", columnWidth: "100vw", columnGap: 0, columnFill: "auto", height: "100%", padding: `56px 0 44px` }
            : { overflowY: "auto", padding: `72px ${s.margin}px 60px` }),
        }}>
        <div style={s.mode === "page" ? { padding: `0 ${s.margin}px`, maxWidth: "none" } : { maxWidth: 720, margin: "0 auto" }}
          dangerouslySetInnerHTML={{ __html: book.html }} />
      </div>

      {s.mode === "page" && ui && (
        <>
          <Button variant="ghost" aria-label="السابق" onClick={() => turn(-1)} className="reader-ui reader-page-turn absolute start-2 top-1/2 z-10 p-2 opacity-70"><ChevronRight className="size-5" /></Button>
          <Button variant="ghost" aria-label="التالي" onClick={() => turn(1)} className="reader-ui reader-page-turn absolute end-2 top-1/2 z-10 p-2 opacity-70"><ChevronLeft className="size-5" /></Button>
        </>
      )}

      <div className="reader-footer absolute inset-x-0 bottom-0 z-10 px-4 pb-2 pt-2">
        <div className="reader-mute flex justify-between text-xs"><span>{Math.round(progress * 100)}%</span><span>{minsLeft} دقيقة متبقية</span></div>
        {ui && <input type="range" min={0} max={1000} value={progress * 1000} onChange={(e) => goTo(+e.target.value / 1000)} className="mt-1 w-full accent-accent" />}
      </div>
      </>
      )}

      {sel && (
        <div className="reader-ui fixed z-30 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-full p-1.5 shadow-book"
          style={{ left: Math.min(Math.max(sel.x, 150), window.innerWidth - 150), top: Math.max(sel.y - 8, 110) }}>
          {COLORS.map(([c, n]) => <Button variant="ghost" key={c} title={n} onClick={() => addHl(c)} className="size-7 rounded-full" style={{ background: `var(--hl-${c})` }} />)}
          <Button variant="ghost" className="p-1.5" title="قاموس" onClick={() => lookup(sel.text)}><BookA className="size-5" /></Button>
          <Button variant="ghost" className="p-1.5" title="ترجمة" onClick={() => translate(sel.text)}><Languages className="size-5" /></Button>
          <Button variant="ghost" className="p-1.5" title="نسخ" onClick={() => { navigator.clipboard.writeText(sel.text); setSel(null); }}><Copy className="size-5" /></Button>
        </div>
      )}

      <AnimatePresence>
        {panel && (
          <motion.aside initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 26 }}
            className="reader-ui reader-panel absolute inset-x-0 bottom-0 z-30 max-h-[70vh] overflow-y-auto rounded-t-xl p-5">
            <Button variant="ghost" className="reader-tool absolute end-3 top-3" onClick={() => setPanel(null)} aria-label="إغلاق"><X className="size-5" /></Button>
            {panel === "type" && (
              <div className="space-y-4">
                <h3 className="font-bold">المظهر</h3>
                <div className="grid grid-cols-4 gap-2">
                  {THEMES.map(([t, n]) => (
                    <Button variant="ghost" key={t} onClick={() => set({ theme: t })} data-theme={t}
                      className={`reader reader-choice theme-choice border-2 py-3 text-xs ${s.theme === t ? "border-accent" : "border-transparent"}`} aria-pressed={s.theme === t}><span className="theme-dot" />{n}</Button>
                  ))}
                </div>
                <div className="flex gap-2 overflow-x-auto">
                  {FONTS.map((f) => (
                    <Button variant="ghost" key={f} onClick={() => set({ font: f })} style={{ fontFamily: f }}
                      className={`reader-choice shrink-0 border-2 px-3 py-2 ${s.font === f ? "border-accent" : "border-transparent"}`}>{f === "Georgia" ? "Georgia" : "أبجد Aa"}</Button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(["page", "scroll"] as const).map((m) => (
                    <Button variant="ghost" key={m} onClick={() => set({ mode: m })}
                      className={`reader-choice border-2 py-2 ${s.mode === m ? "border-accent" : "border-transparent"}`}>{m === "page" ? "صفحات" : "تمرير مستمر"}</Button>
                  ))}
                </div>
                {([["size", "حجم الخط", 14, 34, 1], ["line", "تباعد الأسطر", 1.2, 2.6, 0.1], ["spacing", "تباعد الحروف", -1, 4, 0.5], ["margin", "الهوامش", 8, 80, 4], ["speed", "سرعة التمرير التلقائي", 0.3, 5, 0.1]] as const).map(([k, n, mn, mx, st]) => (
                  <label key={k} className="block text-sm">
                    <span className="flex justify-between"><span>{n}</span><span className="reader-mute">{(s[k] as number).toFixed(st < 1 ? 1 : 0)}</span></span>
                    <input type="range" min={mn} max={mx} step={st} value={s[k] as number} onChange={(e) => set({ [k]: +e.target.value })} className="w-full accent-accent" />
                  </label>
                ))}
              </div>
            )}
            {panel === "hl" && (
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <h3 className="flex-1 font-bold">التظليلات والملاحظات ({book.highlights.length})</h3>
                  <Button variant="ghost" onClick={() => exportMd("copy")} className="p-2" title="نسخ"><Copy className="size-5" /></Button>
                  <Button variant="ghost" onClick={() => exportMd("file")} className="me-8 p-2" title="تصدير Markdown"><Download className="size-5" /></Button>
                </div>
                {book.highlights.length === 0 && <p className="reader-mute text-sm">حدد أي نص في الكتاب لتظليله.</p>}
                <div className="space-y-3">
                  {book.highlights.map((h) => (
                    <div key={h.id} className="rounded-xl p-3" style={{ background: `var(--hl-${h.color})` }}>
                      <p className="text-sm" dir="auto">{h.text}</p>
                      {h.note && <p className="mt-1 text-xs font-semibold">📝 {h.note}</p>}
                      <div className="mt-2 flex gap-3 text-xs">
                        <Button variant="ghost" onClick={() => { const n = prompt("ملاحظة", h.note || ""); if (n !== null) editHl(h, { note: n }); }}>تعديل الملاحظة</Button>
                        <Button variant="ghost" onClick={() => editHl(h, null)}><Trash2 className="size-4" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {panel === "timer" && <Pomodoro />}
            {panel === "bm" && (
              <div>
                <h3 className="mb-3 font-semibold">العلامات المرجعية</h3>
                <Button className="mb-3" onClick={addBm}><BookmarkPlus className="size-4" /> علّم المكان الحالي</Button>
                {!(book.bookmarks?.length) && <p className="reader-mute text-sm">مفيش علامات لسه.</p>}
                <ul className="space-y-2">
                  {[...(book.bookmarks || [])].sort((a, b) => a.pos - b.pos).map((m) => (
                    <li key={m.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                      <button type="button" className="flex-1 text-start" onClick={() => { jumpTo(m.pos); setPanel(null); }}>
                        <div className="text-sm font-medium">{m.label}</div>
                        <div className="reader-mute text-xs">{new Date(m.createdAt).toLocaleDateString("ar-EG")}</div>
                      </button>
                      <Button variant="ghost" aria-label="حذف" onClick={() => saveBms((book.bookmarks || []).filter((x) => x.id !== m.id))}><Trash2 className="size-4" /></Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {dict && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="reader-ui fixed inset-x-6 top-24 z-40 rounded-2xl p-5 shadow-book" dir="ltr">
            <Button variant="ghost" className="absolute right-4 top-4" onClick={() => setDict(null)}><X className="size-5" /></Button>
            <h3 className="text-xl font-bold">{dict.word}</h3>
            <ul className="mt-2 list-disc space-y-1 ps-5 text-sm">{dict.defs.slice(0, 5).map((d, i) => <li key={i}>{d}</li>)}</ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Pomodoro() {
  const [len, setLen] = useState(25);
  const [left, setLeft] = useState(25 * 60);
  const [run, setRun] = useState(false);
  const [noise, setNoise] = useState<null | { stop: () => void }>(null);
  useEffect(() => {
    if (!run) return;
    const t = setInterval(() => setLeft((l) => { if (l <= 1) { setRun(false); navigator.vibrate?.(400); return 0; } return l - 1; }), 1000);
    return () => clearInterval(t);
  }, [run]);
  useEffect(() => () => noise?.stop(), [noise]);
  const toggleRain = () => {
    if (noise) { noise.stop(); setNoise(null); return; }
    const ctx = new AudioContext(); const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0); let last = 0;
    for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const g = ctx.createGain(); g.gain.value = 0.5; src.connect(g).connect(ctx.destination); src.start();
    setNoise({ stop: () => ctx.close() });
  };
  return (
    <div className="text-center">
      <h3 className="font-bold">جلسة قراءة عميقة</h3>
      <div className="pomodoro-clock my-5 font-mono">{String(Math.floor(left / 60)).padStart(2, "0")}:{String(left % 60).padStart(2, "0")}</div>
      <div className="flex justify-center gap-2">
        {[15, 25, 45].map((m) => (
          <Button variant="ghost" key={m} onClick={() => { setLen(m); setLeft(m * 60); setRun(false); }}
            className={`rounded-full border-2 px-3 py-1 text-sm ${len === m ? "border-accent" : "border-transparent"}`}>{m} د</Button>
        ))}
      </div>
      <div className="mt-4 flex justify-center gap-3">
        <Button variant="ghost" onClick={() => setRun(!run)} className="h-11 rounded-lg bg-primary px-6 py-2 font-bold text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground">{run ? <Pause /> : <Play />}{run ? "إيقاف" : "ابدأ"}</Button>
        <Button variant="ghost" onClick={toggleRain} className={`flex items-center gap-2 rounded-full border-2 px-4 py-2 ${noise ? "border-accent" : ""}`}>
          <CloudRain className="size-5" /> صوت المطر</Button>
      </div>
    </div>
  );
}
