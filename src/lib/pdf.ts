// Shared pdf.js loader (legacy build works on older Android browsers).
export async function openPdf(data: ArrayBuffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const worker = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  return pdfjs.getDocument({
    data,
    // these two avoid blank scanned pages ("Dependent image isn't ready yet") on some browsers
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
  }).promise;
}
export type Pdf = Awaited<ReturnType<typeof openPdf>>;
