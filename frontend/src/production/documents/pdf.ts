import { MAX_TEXT_BYTES } from '../../../../shared/document-text';

export async function extractPdf(bytes: Uint8Array, progress: (page: number, total: number) => void): Promise<string> {
  if (bytes.length > 10 * 1024 * 1024 || new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw Error('Invalid PDF or file exceeds 10 MiB.');
  // Both PDF.js halves execute inside our terminable worker, never the UI thread.
  // Loading the worker module first makes PDF.js use its local message loop.
  await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: bytes, verbosity: 0,
    useWorkerFetch: false, useSystemFonts: false, disableFontFace: true,
    disableAutoFetch: true, disableStream: true, disableRange: true,
    isOffscreenCanvasSupported: false, isImageDecoderSupported: false,
    stopAtErrors: true });
  let length = 0;
  const text: string[] = [];
  const append = (value: string) => {
    length += new TextEncoder().encode(value).length;
    if (length > MAX_TEXT_BYTES) throw Error('Extracted text exceeds 2 MiB.');
    text.push(value);
  };
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 200) throw Error('PDF exceeds 200 pages.');
    // Encrypted documents, even those with an empty opening password, are unsupported.
    if (await pdf.getPermissions() !== null) throw Error('Encrypted PDF is unsupported. Export an unencrypted copy.');
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const reader = page.streamTextContent().getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const item of value.items) if ('str' in item) append(item.str + (item.hasEOL ? '\n' : ' '));
        }
      } finally { await reader.cancel(); page.cleanup(); }
      append('\n\n'); progress(pageNumber, pdf.numPages);
    }
    const result = text.join('').trim();
    if (!result) throw Error('No selectable text found. Scanned PDFs need OCR elsewhere before import.');
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === 'PasswordException') throw Error('Password-protected PDF is unsupported. Export an unencrypted copy.');
    throw error;
  } finally { await task.destroy(); }
}
