import type { Book } from "./db";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const toParas = (t: string) =>
  t.split(/\n\s*\n|\r\n\s*\r\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p).replace(/\n/g, "<br/>")}</p>`).join("");

const mdToHtml = (t: string) =>
  t.split(/\n\s*\n/).map((b) => {
    const s = b.trim();
    const h = s.match(/^(#{1,3})\s+(.*)$/s);
    if (h) { const l = h[1]!.length; return `<h${l}>${esc(h[2]!)}</h${l}>`; }
    if (s.startsWith(">")) return `<blockquote>${esc(s.replace(/^>\s?/gm, ""))}</blockquote>`;
    return s ? `<p>${esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>").replace(/\n/g, "<br/>")}</p>` : "";
  }).join("");

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((r) => { const f = new FileReader(); f.onload = () => r(f.result as string); f.readAsDataURL(b); });

async function parseEpub(file: File) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);
  const dp = new DOMParser();
  const container = dp.parseFromString(await zip.file("META-INF/container.xml")!.async("text"), "application/xml");
  const opfPath = container.querySelector("rootfile")!.getAttribute("full-path")!;
  const base = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const opf = dp.parseFromString(await zip.file(opfPath)!.async("text"), "application/xml");
  const title = opf.getElementsByTagName("dc:title")[0]?.textContent || file.name;
  const author = opf.getElementsByTagName("dc:creator")[0]?.textContent || "";
  const items = new Map<string, { href: string; props: string; type: string }>();
  opf.querySelectorAll("manifest > item").forEach((i) =>
    items.set(i.getAttribute("id")!, { href: i.getAttribute("href")!, props: i.getAttribute("properties") || "", type: i.getAttribute("media-type") || "" }));
  const resolve = (h: string) => {
    const parts = (base + decodeURIComponent(h)).split("/"); const out: string[] = [];
    parts.forEach((p) => (p === ".." ? out.pop() : p !== "." && out.push(p))); return out.join("/");
  };
  let cover: string | undefined;
  const coverId = opf.querySelector('meta[name="cover"]')?.getAttribute("content");
  const coverItem = [...items.values()].find((i) => i.props.includes("cover-image")) || (coverId ? items.get(coverId) : undefined);
  if (coverItem) { const f = zip.file(resolve(coverItem.href)); if (f) cover = await blobToDataUrl(new Blob([await f.async("arraybuffer")], { type: coverItem.type })); }
  let html = "";
  for (const ref of opf.querySelectorAll("spine > itemref")) {
    const it = items.get(ref.getAttribute("idref")!); if (!it) continue;
    const f = zip.file(resolve(it.href)); if (!f) continue;
    const doc = dp.parseFromString(await f.async("text"), "text/html");
    doc.querySelectorAll("script,style,link,img,svg,image,iframe").forEach((e) => e.remove());
    doc.querySelectorAll("*").forEach((e) => { [...e.attributes].forEach((a) => { if (a.name !== "href") e.removeAttribute(a.name); }); });
    html += `<section>${doc.body?.innerHTML || ""}</section>`;
  }
  return { title, author, cover, html };
}

async function parsePdf(file: File) {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  let html = ""; let cover: string | undefined; let scans = 0;
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    if (i === 1) {
      const vp = page.getViewport({ scale: 0.6 }); const c = document.createElement("canvas");
      c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext("2d")!, viewport: vp, canvas: c } as never).promise;
      cover = c.toDataURL("image/jpeg", 0.8);
    }
    const tc = await page.getTextContent();
    let text = "";
    for (const it of tc.items as { str: string; hasEOL?: boolean }[]) text += it.str + (it.hasEOL ? "\n" : " ");
    if (text.trim().length < 20) {
      // scanned page: keep it as an image
      const vp = page.getViewport({ scale: 2 }); const c = document.createElement("canvas");
      c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext("2d")!, viewport: vp, canvas: c } as never).promise;
      html += `<section class="scan"><img src="${c.toDataURL("image/jpeg", 0.6)}" alt=""/></section>`;
      c.width = c.height = 0; scans++;
      continue;
    }
    html += `<section>${toParas(text.replace(/\n(?=\S)/g, " ").replace(/ {2,}/g, "\n\n"))}</section>`;
  }
  const meta = (await pdf.getMetadata().catch(() => null))?.info as { Title?: string; Author?: string } | undefined;
  return { title: meta?.Title || file.name.replace(/\.pdf$/i, ""), author: meta?.Author || "", cover, html, scans };
}

export async function importFile(file: File): Promise<Book> {
  const ext = file.name.split(".").pop()!.toLowerCase();
  let r: { title: string; author: string; cover?: string | undefined; html: string; scans?: number };
  if (ext === "epub") r = await parseEpub(file);
  else if (ext === "pdf") r = await parsePdf(file);
  else if (ext === "md" || ext === "markdown") r = { title: file.name.replace(/\.\w+$/, ""), author: "", html: mdToHtml(await file.text()) };
  else if (ext === "txt") r = { title: file.name.replace(/\.\w+$/, ""), author: "", html: toParas(await file.text()) };
  else throw new Error("صيغة غير مدعومة");
  const plain = r.html.replace(/<[^>]+>/g, " ");
  if (plain.trim().length < 20 && !r.scans)
    throw new Error("مفيش نص في الملف ده (غالبًا صفحات مصورة/ممسوحة ضوئيًا أو ملف محمي)");

  const ar = (plain.slice(0, 5000).match(/[\u0600-\u06FF]/g) || []).length;
  const lat = (plain.slice(0, 5000).match(/[a-zA-Z]/g) || []).length;
  return {
    id: crypto.randomUUID(), title: r.title, author: r.author, cover: r.cover, html: r.html, format: ext.toUpperCase(), size: file.size,
    dir: ar > lat ? "rtl" : "ltr", wordCount: plain.split(/\s+/).filter(Boolean).length + (r.scans || 0) * 250,
    progress: 0, favorite: false, addedAt: Date.now(), highlights: [],
  };
}
