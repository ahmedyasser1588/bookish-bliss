<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Books are stored offline in browser IndexedDB (src/lib/db.ts) and parsed client-side (src/lib/parse.ts); reading stats in localStorage — app must work without a backend.
- PDFs keep the original file in IndexedDB and are rendered page-by-page on demand with pdf.js (src/components/PdfView.tsx) — faster import and exact page look; pdf.js decoders (JBIG2/JPEG2000) are served from public/pdfjs-wasm and passed via wasmUrl, otherwise scanned pages render blank.
