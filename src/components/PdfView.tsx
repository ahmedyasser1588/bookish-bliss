import { useEffect, useRef, useState } from "react";
import { MotionConfig, motion } from "framer-motion";
import {
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Pen, Highlighter, Eraser, StickyNote, Check, Undo2,
  Maximize, Minimize, MoveHorizontal, Square, BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { openPdf, type Pdf } from "@/lib/pdf";

type Props = {
  file: Blob;
  initial: number;
  mode: "page" | "scroll";
  rtl: boolean;
  ui: boolean;
  onProgress: (p: number) => void;
  onToggleUi: () => void;
  onModeChange?: (m: "page" | "scroll") => void;
  jump?: { p: number; k: number } | null;
  draw?: boolean;
  onDrawDone?: () => void;
  drawings?: Record<number, string>;
  notes?: Record<number, string>;
  onSaveDrawing?: (page: number, url: string | null) => void;
  onSaveNote?: (page: number, text: string) => void;
};

export type Tool = { kind: "pen" | "marker" | "eraser"; color: string };
const INKS = ["#1f2937", "#c2410c", "#2563eb", "#15803d", "#facc15"];

const GAP = 12;
const MIN_Z = 0.4;
const MAX_Z = 4;
const clampZ = (z: number) => Math.min(MAX_Z, Math.max(MIN_Z, z));

/** Acrobat-style PDF reader: sharp on-demand page rendering, fit-width/fit-page,
 *  pinch + ctrl-wheel + double-tap zoom, single page with smooth transitions or
 *  continuous scroll, a page box for navigation, and full-screen reading. */
export function PdfView({ file, initial, mode, rtl, ui, onProgress, onToggleUi, onModeChange, jump, draw, onDrawDone, drawings = {}, notes = {}, onSaveDrawing, onSaveNote }: Props) {
  const [tool, setTool] = useState<Tool>({ kind: "pen", color: INKS[1]! });
  const [pdf, setPdf] = useState<Pdf | null>(null);
  const [err, setErr] = useState("");
  const [ratio, setRatio] = useState(1.414);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [fs, setFs] = useState(false);
  const jumped = useRef(false);
  const touch = useRef<number | null>(null);
  const swiped = useRef(false);
  const zoomRef = useRef(1);
  const navDir = useRef(0);
  const pinchedAt = useRef(0);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d0: number; z0: number; mx: number; my: number } | null>(null);
  const pan = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let doc: Pdf | null = null; let dead = false;
    (async () => {
      try {
        doc = await openPdf(await file.arrayBuffer());
        const p1 = await doc.getPage(1);
        const vp = p1.getViewport({ scale: 1 });
        if (dead) return;
        setRatio(vp.height / vp.width);
        setPage(Math.min(doc.numPages, Math.max(1, Math.round(initial * (doc.numPages - 1)) + 1)));
        setPdf(doc);
      } catch (e) { setErr((e as Error).message); }
    })();
    return () => { dead = true; doc?.loadingTask.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  useEffect(() => {
    if (!box) return;
    const ro = new ResizeObserver(() => setSize({ w: box.clientWidth, h: box.clientHeight }));
    ro.observe(box); return () => ro.disconnect();
  }, [box]);

  useEffect(() => setPageInput(String(page)), [page]);

  // full-screen reading
  useEffect(() => {
    const h = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);
  const toggleFs = () => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen?.();
    } catch { /* unsupported (e.g. iOS Safari) — the hide-UI mode still gives an immersive view */ }
  };

  const n = pdf?.numPages || 1;
  const fitW = Math.max(1, Math.min(size.w - 16, 1200));
  const [fitMode, setFitMode] = useState<"width" | "page">("page");
  // zoom base: fit-width or fit-whole-page in single mode; width-fit in continuous mode
  const effBase = mode === "page"
    ? (fitMode === "width" ? fitW : Math.min(fitW, Math.max(1, (size.h - 104) / ratio)))
    : fitW;
  const effW = Math.max(1, effBase * zoom);
  const effH = effW * ratio;

  const go = (p: number, smooth = false) => {
    const t = Math.min(n, Math.max(1, p));
    setPage(t);
    onProgress(n > 1 ? (t - 1) / (n - 1) : 1);
    if (mode === "scroll" && box) box.scrollTo({ top: 64 + (t - 1) * (pageH + GAP), behavior: smooth && Math.abs(t - page) <= 2 ? "smooth" : "auto" });
  };
  const turn = (d: number) => { navDir.current = d; go(page + d, true); };
  const setZoomAt = (next: number, ax?: number, ay?: number) => {
    next = clampZ(next);
    const el = box; const z = zoomRef.current;
    if (el && next !== z) {
      const k = next / z;
      const px = ax ?? el.clientWidth / 2, py = ay ?? el.clientHeight / 2;
      el.scrollLeft = (el.scrollLeft + px) * k - px;
      el.scrollTop = (el.scrollTop + py) * k - py;
    }
    zoomRef.current = next;
    setZoom(next);
  };
  const zoomBy = (d: number) => setZoomAt(zoomRef.current + d);
  const setFit = (f: "width" | "page") => { setFitMode(f); setZoomAt(1); };

  useEffect(() => { if (jump && pdf) { navDir.current = 0; go(Math.round(jump.p * (n - 1)) + 1); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump?.k, pdf]);
  const pageProps = (i: number) => ({ tool: draw ? tool : null, drawing: drawings[i], note: notes[i], onSave: (u: string | null) => onSaveDrawing?.(i, u) });

  // jump to saved page once ready / when layout changes
  useEffect(() => {
    if (!pdf || !box || !size.w) return;
    if (mode === "scroll") box.scrollTop = 64 + (page - 1) * (effH + GAP);
    jumped.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, box, size.w, mode, effW]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,select,[contenteditable=true]") || draw) return;
      if (e.key === "ArrowLeft") turn(rtl ? 1 : -1);
      if (e.key === "ArrowRight") turn(rtl ? -1 : 1);
      if (e.key === "Home") go(1);
      if (e.key === "End") go(n);
      if (e.key === "+" || e.key === "=") zoomBy(0.25);
      if (e.key === "-") zoomBy(-0.25);
      if (e.key === "0") setZoomAt(1);
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });

  // ctrl/⌘ + wheel zooms around the cursor (trackpad pinch), normal wheel scrolls natively
  useEffect(() => {
    const el = box; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      setZoomAt(zoomRef.current * Math.exp(-dy * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [box]);

  const rel = (e: { clientX: number; clientY: number }) => {
    const r = box!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (draw || e.pointerType === "mouse" || !box) return;
    ptrs.current.set(e.pointerId, rel(e));
    try { box.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      pinch.current = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: zoomRef.current, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      pan.current = null;
      swiped.current = true;
    } else if (ptrs.current.size === 1 && zoomRef.current > 1) {
      pan.current = rel(e);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (draw || e.pointerType === "mouse" || !box || !ptrs.current.has(e.pointerId)) return;
    const p = rel(e); ptrs.current.set(e.pointerId, p);
    if (pinch.current && ptrs.current.size >= 2) {
      const [a, b] = [...ptrs.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const next = clampZ(pinch.current.z0 * (d / pinch.current.d0));
      const k = next / zoomRef.current;
      box.scrollLeft = (box.scrollLeft + mx) * k - mx;
      box.scrollTop = (box.scrollTop + my) * k - my;
      box.scrollLeft -= mx - pinch.current.mx;
      box.scrollTop -= my - pinch.current.my;
      pinch.current.mx = mx; pinch.current.my = my;
      zoomRef.current = next; setZoom(next);
    } else if (pan.current && zoomRef.current > 1) {
      if (mode === "scroll") box.scrollLeft -= p.x - pan.current.x;
      else { box.scrollLeft -= p.x - pan.current.x; box.scrollTop -= p.y - pan.current.y; }
      pan.current = p;
    }
  };
  const onPointerGone = (e: React.PointerEvent) => {
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size < 2) { if (pinch.current) pinchedAt.current = Date.now(); pinch.current = null; }
    if (ptrs.current.size === 0) pan.current = null;
  };

  const onScroll = () => {
    if (mode !== "scroll" || !box || !jumped.current) return;
    const p = Math.min(n, Math.floor((box.scrollTop - 64 + box.clientHeight / 2) / (effH + GAP)) + 1);
    if (p !== page && p >= 1) { setPage(p); onProgress(n > 1 ? (p - 1) / (n - 1) : 1); }
  };

  const commitPage = () => {
    const v = parseInt(pageInput, 10);
    if (Number.isFinite(v)) { navDir.current = 0; go(v, true); } else setPageInput(String(page));
  };

  return (
    <MotionConfig reducedMotion="user">
      <div
        ref={setBox}
        dir="ltr"
        onScroll={onScroll}
        className="pdf-scrollbox absolute inset-0 overflow-auto"
        style={{ padding: mode === "page" ? "56px 8px 56px" : "64px 8px 88px", touchAction: mode === "page" ? "none" : "pan-y" }}
        onClick={(e) => {
          if (draw || (e.target as HTMLElement).closest("button,input,textarea,select,a")) return;
          if (swiped.current) { swiped.current = false; return; }
          if (Date.now() - pinchedAt.current < 350) return;
          const x = e.clientX / window.innerWidth;
          if (mode === "page" && x < 0.28) turn(rtl ? 1 : -1);
          else if (mode === "page" && x > 0.72) turn(rtl ? -1 : 1);
          else onToggleUi();
        }}
        onDoubleClick={(e) => {
          if (draw) return;
          const r = box!.getBoundingClientRect();
          if (zoomRef.current > 1.2) setZoomAt(1);
          else setZoomAt(2.2, e.clientX - r.left, e.clientY - r.top);
        }}
        onTouchStart={(e) => { swiped.current = false; touch.current = e.touches[0]?.clientX ?? null; }}
        onTouchEnd={(e) => {
          const s = touch.current; const x = e.changedTouches[0]?.clientX;
          touch.current = null;
          if (draw || mode !== "page" || zoomRef.current !== 1 || s == null || x == null || Math.abs(x - s) < 60) return;
          swiped.current = true;
          turn((x - s > 0) === rtl ? 1 : -1);
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerGone}
        onPointerCancel={onPointerGone}
      >
        {err && <p className="mt-24 text-center">تعذر فتح الملف: {err}</p>}
        {!pdf && !err && <p className="reader-mute mt-24 text-center">جارٍ فتح الكتاب…</p>}
        {pdf && size.w > 0 && (mode === "page" ? (
          <div className="flex min-h-full items-center justify-center">
            <motion.div
              key={page}
              initial={{ opacity: 0, x: navDir.current === 0 ? 0 : navDir.current * (rtl ? -1 : 1) * 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
            >
              <PdfPage pdf={pdf} n={page} width={effW} height={effH} root={null} eager {...pageProps(page)} />
            </motion.div>
          </div>
        ) : (
          <div className="flex flex-col items-center" style={{ gap: GAP }}>
            {Array.from({ length: n }, (_, i) => (
              <PdfPage key={i} pdf={pdf} n={i + 1} width={effW} height={effH} root={box} {...pageProps(i + 1)} />
            ))}
          </div>
        ))}
      </div>

      {/* thin reading-progress line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 h-[3px]">
        <div className="h-full bg-accent/70 transition-[width] duration-300" style={{ width: `${(page / n) * 100}%` }} />
      </div>

      {draw && (
        <div className="reader-ui reader-panel absolute inset-x-0 bottom-0 z-30 flex flex-wrap items-center justify-center gap-1 rounded-t-xl p-3 pb-4" onClick={(e) => e.stopPropagation()}>
          {([["pen", Pen, "قلم"], ["marker", Highlighter, "تظليل"], ["eraser", Eraser, "ممحاة"]] as const).map(([k, I, t]) => (
            <Button key={k} variant="ghost" title={t} aria-label={t} aria-pressed={tool.kind === k} className={`reader-tool border-2 ${tool.kind === k ? "border-accent" : "border-transparent"}`} onClick={() => setTool({ ...tool, kind: k })}><I className="size-5" /></Button>
          ))}
          <span className="mx-1 h-6 w-px bg-border" />
          {INKS.map((c) => <button key={c} type="button" aria-label="لون" onClick={() => setTool({ kind: tool.kind === "eraser" ? "pen" : tool.kind, color: c })} className={`size-7 rounded-full border-2 ${tool.color === c ? "border-accent" : "border-transparent"}`} style={{ background: c }} />)}
          <span className="mx-1 h-6 w-px bg-border" />
          <Button variant="ghost" title="مسح رسم الصفحة" aria-label="مسح رسم الصفحة" className="reader-tool" onClick={() => { if (confirm("مسح كل الرسم في الصفحة دي؟")) onSaveDrawing?.(page, null); }}><Undo2 className="size-5" /></Button>
          <Button variant="ghost" title="ملاحظة على الصفحة" aria-label="ملاحظة على الصفحة" className="reader-tool" onClick={() => { const t = prompt(`ملاحظة على صفحة ${page}`, notes[page] || ""); if (t !== null) onSaveNote?.(page, t); }}><StickyNote className="size-5" /></Button>
          <Button variant="ghost" className="reader-tool gap-1 px-3" onClick={onDrawDone}><Check className="size-5" /> تم</Button>
        </div>
      )}

      {mode === "page" && ui && !draw && (
        <>
          <Button variant="ghost" title="السابق" aria-label="السابق" disabled={page === 1} onClick={() => turn(rtl ? 1 : -1)} className="reader-ui reader-page-turn absolute start-2 top-1/2 z-10 p-2 opacity-70"><ChevronRight className="size-5" /></Button>
          <Button variant="ghost" title="التالي" aria-label="التالي" disabled={page === n} onClick={() => turn(rtl ? -1 : 1)} className="reader-ui reader-page-turn absolute end-2 top-1/2 z-10 p-2 opacity-70"><ChevronLeft className="size-5" /></Button>
        </>
      )}

      <div className="reader-footer pointer-events-none absolute inset-x-0 bottom-0 z-20 px-3 pb-2 pt-2">
        <div className="reader-mute flex items-center justify-between text-xs">
          <span>صفحة {page} من {n}</span>
          <span>{Math.round(((page - 1) / Math.max(1, n - 1)) * 100)}%</span>
        </div>
        {ui && !draw && (
          <div className="pdf-controls pointer-events-auto mt-1 flex flex-wrap items-center justify-center gap-1">
            <Button variant="ghost" title="أول الصفحة" aria-label="أول الصفحة" className="reader-tool hidden sm:inline-flex" onClick={() => { navDir.current = 0; go(1, true); }}>«</Button>
            <Button variant="ghost" title="السابق" aria-label="السابق" disabled={page === 1} onClick={() => turn(rtl ? 1 : -1)} className="reader-tool"><ChevronRight className="size-4" /></Button>
            <span className="pdf-page-box flex items-center gap-1 text-xs">
              <input type="number" min={1} max={n} value={pageInput} dir="ltr" aria-label="رقم الصفحة"
                onChange={(e) => setPageInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                onBlur={commitPage} className="pdf-page-input" />
              <span className="reader-mute">/ {n}</span>
            </span>
            <Button variant="ghost" title="التالي" aria-label="التالي" disabled={page === n} onClick={() => turn(rtl ? -1 : 1)} className="reader-tool"><ChevronLeft className="size-4" /></Button>
            <Button variant="ghost" title="آخر الصفحة" aria-label="آخر الصفحة" className="reader-tool hidden sm:inline-flex" onClick={() => { navDir.current = 0; go(n, true); }}>»</Button>
            <input type="range" min={1} max={n} value={page} onChange={(e) => { navDir.current = 0; go(+e.target.value); }} className="mx-1 min-w-24 flex-1 accent-accent" dir={rtl ? "rtl" : "ltr"} aria-label="التنقل بين الصفحات" />
            <span className="pdf-divider" />
            <Button variant="ghost" title="تصغير" aria-label="تصغير" className="reader-tool" onClick={() => zoomBy(-0.25)}><ZoomOut className="size-4" /></Button>
            <Button variant="ghost" title="إعادة ملاءمة الصفحة" aria-label="نسبة العرض" className="pdf-zoom-value" onClick={() => setZoomAt(1)}>{Math.round(zoom * 100)}٪</Button>
            <Button variant="ghost" title="تكبير" aria-label="تكبير" className="reader-tool" onClick={() => zoomBy(0.25)}><ZoomIn className="size-4" /></Button>
            <Button variant="ghost" title="ملاءمة العرض" aria-label="ملاءمة العرض" aria-pressed={fitMode === "width" && zoom === 1} className={`reader-tool ${fitMode === "width" && zoom === 1 ? "border-accent" : ""}`} onClick={() => setFit("width")}><MoveHorizontal className="size-4" /></Button>
            <Button variant="ghost" title="ملاءمة الصفحة" aria-label="ملاءمة الصفحة" aria-pressed={fitMode === "page" && zoom === 1} className={`reader-tool ${fitMode === "page" && zoom === 1 ? "border-accent" : ""}`} onClick={() => setFit("page")}><Square className="size-4" /></Button>
            <span className="pdf-divider" />
            {onModeChange && (
              <Button variant="ghost" title={mode === "page" ? "تمرير مستمر" : "صفحة واحدة"} aria-label={mode === "page" ? "تمرير مستمر" : "صفحة واحدة"}
                className="reader-tool" onClick={() => onModeChange(mode === "page" ? "scroll" : "page")}>
                {mode === "page" ? <BookOpen className="size-4" /> : <Square className="size-4" />}
              </Button>
            )}
            <Button variant="ghost" title={fs ? "الخروج من ملء الشاشة" : "قراءة بملء الشاشة"} aria-label="ملء الشاشة" className="reader-tool" onClick={toggleFs}>{fs ? <Minimize className="size-4" /> : <Maximize className="size-4" />}</Button>
          </div>
        )}
      </div>
    </MotionConfig>
  );
}

type PageProps = { pdf: Pdf; n: number; width: number; height: number; root: HTMLElement | null; eager?: boolean; tool: Tool | null; drawing?: string | undefined; note?: string | undefined; onSave: (u: string | null) => void };
function PdfPage({ pdf, n, width, height, root, eager, tool, drawing, note, onSave }: PageProps) {
  const ink = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(!!eager);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (eager || !wrap.current) return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { root, rootMargin: "150% 0px" });
    io.observe(wrap.current); return () => io.disconnect();
  }, [eager, root]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    if (!visible) { c.width = c.height = 0; setDone(false); return; }
    let dead = false; let task: { cancel: () => void; promise: Promise<void> } | undefined;
    const t = setTimeout(async () => {
      try {
        const p = await pdf.getPage(n);
        if (dead) return;
        const base = p.getViewport({ scale: 1 });
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const vp = p.getViewport({ scale: (width * dpr) / base.width });
        const off = document.createElement("canvas");
        off.width = Math.floor(vp.width); off.height = Math.floor(vp.height);
        const rt = p.render({ canvasContext: off.getContext("2d")!, viewport: vp, canvas: off } as never) as unknown as { cancel: () => void; promise: Promise<void> };
        task = rt;
        await rt.promise;
        if (dead) return;
        c.width = off.width; c.height = off.height;
        c.getContext("2d")!.drawImage(off, 0, 0);
        off.width = off.height = 0;
        setDone(true);
      } catch { /* cancelled */ }
    }, eager ? 0 : 80);
    return () => { dead = true; clearTimeout(t); task?.cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, pdf, n, width, eager]);

  // ink layer: redraw saved drawing whenever size or data changes
  useEffect(() => {
    const c = ink.current; if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.floor(width * dpr); c.height = Math.floor(height * dpr);
    if (!drawing || !visible) return;
    const img = new Image();
    img.onload = () => c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    img.src = drawing;
  }, [drawing, width, height, visible]);

  const pt = (e: React.PointerEvent) => { const r = ink.current!.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * ink.current!.width, y: ((e.clientY - r.top) / r.height) * ink.current!.height }; };
  const stroke = (e: React.PointerEvent) => {
    if (!tool || !last.current) return;
    const c = ink.current!; const ctx = c.getContext("2d")!; const p = pt(e); const k = c.width / 600;
    ctx.globalCompositeOperation = tool.kind === "eraser" ? "destination-out" : tool.kind === "marker" ? "multiply" : "source-over";
    ctx.strokeStyle = tool.color; ctx.globalAlpha = tool.kind === "marker" ? 0.35 : 1;
    ctx.lineWidth = (tool.kind === "pen" ? 2.5 : tool.kind === "marker" ? 16 : 22) * k; ctx.lineCap = ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p;
  };

  return (
    <div ref={wrap} className="relative shrink-0 overflow-hidden rounded bg-card shadow-book" style={{ width, height }}>
      <canvas ref={canvas} className="block size-full" />
      <canvas ref={ink} className="absolute inset-0 size-full"
        style={{ pointerEvents: tool ? "auto" : "none", touchAction: tool ? "none" : "auto", cursor: tool ? "crosshair" : undefined }}
        onClick={(e) => tool && e.stopPropagation()}
        onTouchEnd={(e) => tool && e.stopPropagation()}
        onPointerDown={(e) => { if (!tool) return; e.stopPropagation(); ink.current!.setPointerCapture(e.pointerId); last.current = pt(e); stroke(e); }}
        onPointerMove={stroke}
        onPointerUp={() => { if (!tool || !last.current) return; last.current = null; onSave(ink.current!.toDataURL("image/png")); }} />
      {note && <div className="pointer-events-none absolute end-2 top-2 max-w-[60%] rounded-lg p-2 text-xs shadow-book" dir="auto" style={{ background: "var(--hl-yellow)" }}>📝 {note}</div>}
      {!done && <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">{n}</div>}
    </div>
  );
}
