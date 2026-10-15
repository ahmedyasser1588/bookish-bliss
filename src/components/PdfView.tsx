import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Pen, Highlighter, Eraser, StickyNote, Check, Undo2 } from "lucide-react";
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

/** Shows the original PDF pages directly (like a normal PDF viewer), rendering only the pages on screen. */
export function PdfView({ file, initial, mode, rtl, ui, onProgress, onToggleUi, jump, draw, onDrawDone, drawings = {}, notes = {}, onSaveDrawing, onSaveNote }: Props) {
  const [tool, setTool] = useState<Tool>({ kind: "pen", color: INKS[1]! });
  const [pdf, setPdf] = useState<Pdf | null>(null);
  const [err, setErr] = useState("");
  const [ratio, setRatio] = useState(1.414);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const jumped = useRef(false);
  const touch = useRef<number | null>(null);

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

  const n = pdf?.numPages || 1;
  const fitW = Math.min(size.w - 16, 900);
  const pageW = mode === "page" ? Math.min(fitW, (size.h - 100) / ratio) * zoom : fitW * zoom;
  const pageH = pageW * ratio;

  const go = (p: number) => {
    const t = Math.min(n, Math.max(1, p));
    setPage(t);
    onProgress(n > 1 ? (t - 1) / (n - 1) : 1);
    if (mode === "scroll" && box) box.scrollTop = 64 + (t - 1) * (pageH + GAP);
  };
  const turn = (d: number) => go(page + d);
  useEffect(() => { if (jump && pdf) go(Math.round(jump.p * (n - 1)) + 1); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump?.k, pdf]);
  const pageProps = (i: number) => ({ tool: draw ? tool : null, drawing: drawings[i], note: notes[i], onSave: (u: string | null) => onSaveDrawing?.(i, u) });

  // jump to saved page once ready / when layout changes
  useEffect(() => {
    if (!pdf || !box || !size.w) return;
    if (mode === "scroll") box.scrollTop = 64 + (page - 1) * (pageH + GAP);
    jumped.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, box, size.w, mode, zoom]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") turn(rtl ? 1 : -1);
      if (e.key === "ArrowRight") turn(rtl ? -1 : 1);
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });

  const onScroll = () => {
    if (mode !== "scroll" || !box || !jumped.current) return;
    const p = Math.min(n, Math.floor((box.scrollTop - 64 + box.clientHeight / 2) / (pageH + GAP)) + 1);
    if (p !== page && p >= 1) { setPage(p); onProgress(n > 1 ? (p - 1) / (n - 1) : 1); }
  };

  return (
    <>
      <div
        ref={setBox}
        dir="ltr"
        onScroll={onScroll}
        onClick={(e) => {
          if (draw) return;
          const x = e.clientX / window.innerWidth;
          if (mode === "page" && x < 0.28) turn(rtl ? 1 : -1);
          else if (mode === "page" && x > 0.72) turn(rtl ? -1 : 1);
          else onToggleUi();
        }}
        onTouchStart={(e) => { touch.current = e.touches[0]?.clientX ?? null; }}
        onTouchEnd={(e) => {
          const s = touch.current; const x = e.changedTouches[0]?.clientX;
          touch.current = null;
          if (draw || mode !== "page" || zoom !== 1 || s == null || x == null || Math.abs(x - s) < 60) return;
          turn((x - s > 0) === rtl ? 1 : -1);
        }}
        className="absolute inset-0 overflow-auto"
        style={{ padding: mode === "page" ? "56px 8px 48px" : "64px 8px 80px" }}
      >
        {err && <p className="mt-24 text-center">تعذر فتح الملف: {err}</p>}
        {!pdf && !err && <p className="reader-mute mt-24 text-center">جارٍ فتح الكتاب…</p>}
        {pdf && size.w > 0 && (mode === "page" ? (
          <div className="flex min-h-full items-center justify-center">
            <PdfPage key={page} pdf={pdf} n={page} width={pageW} height={pageH} root={null} eager {...pageProps(page)} />
          </div>
        ) : (
          <div className="flex flex-col items-center" style={{ gap: GAP }}>
            {Array.from({ length: n }, (_, i) => (
              <PdfPage key={i} pdf={pdf} n={i + 1} width={pageW} height={pageH} root={box} {...pageProps(i + 1)} />
            ))}
          </div>
        ))}
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
          <Button variant="ghost" title="السابق" aria-label="السابق" onClick={() => turn(-1)} className="reader-ui reader-page-turn absolute start-2 top-1/2 z-10 p-2 opacity-70"><ChevronRight className="size-5" /></Button>
          <Button variant="ghost" title="التالي" aria-label="التالي" onClick={() => turn(1)} className="reader-ui reader-page-turn absolute end-2 top-1/2 z-10 p-2 opacity-70"><ChevronLeft className="size-5" /></Button>
        </>
      )}

      <div className="reader-footer pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4 pb-2 pt-2">
        <div className="reader-mute flex items-center justify-between text-xs">
          <span>صفحة {page} من {n}</span>
          <span>{Math.round(((page - 1) / Math.max(1, n - 1)) * 100)}%</span>
        </div>
        {ui && (
          <div className="pointer-events-auto mt-1 flex items-center gap-2">
            <Button variant="ghost" title="تصغير" aria-label="تصغير" className="reader-ui reader-tool" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}><ZoomOut className="size-4" /></Button>
            <input type="range" min={1} max={n} value={page} onChange={(e) => go(+e.target.value)} className="w-full accent-accent" dir={rtl ? "rtl" : "ltr"} />
            <Button variant="ghost" title="تكبير" aria-label="تكبير" className="reader-ui reader-tool" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}><ZoomIn className="size-4" /></Button>
          </div>
        )}
      </div>
    </>
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
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
