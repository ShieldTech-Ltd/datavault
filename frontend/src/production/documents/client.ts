import { MAX_TEXT_BYTES } from '../../../../shared/document-text';

export function extractLocalDocument(file: File, progress: (message: string) => void,
  makeWorker = () => new Worker(new URL('./extract.worker.ts', import.meta.url), { type: 'module' }),
  timeoutMs = 30_000): { result: Promise<string>; cancel: () => void } {
  let worker: Worker | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  let rejectResult: (error: Error) => void;
  const finish = () => { settled = true; clearTimeout(timer); worker?.terminate(); };
  const result = new Promise<string>((resolve, reject) => {
    rejectResult = reject;
    const binary = /\.(pdf|docx)$/i.test(file.name);
    if (!/\.(pdf|docx|md|txt)$/i.test(file.name) || file.size > (binary ? 10 * 1024 * 1024 : MAX_TEXT_BYTES)) {
      finish(); reject(Error('Select PDF/DOCX up to 10 MiB or Markdown/TXT up to 2 MiB.')); return;
    }
    worker = makeWorker();
    timer = setTimeout(() => { finish(); reject(Error('Extraction timed out after 30 seconds. Try a smaller document.')); }, timeoutMs);
    worker.onmessage = event => {
      if (settled) return;
      const data = event.data;
      // PDF.js may emit its own bootstrap messages on the enclosing worker.
      // Only our tagged, shape-checked protocol can update or settle a job.
      if (!data || typeof data !== 'object' || data.source !== 'datavault-document-v1') return;
      if (data.kind === 'progress' && typeof data.progress === 'string') { progress(data.progress); return; }
      if (data.kind === 'error' && typeof data.error === 'string') { finish(); reject(Error(data.error)); return; }
      if (data.kind !== 'result' || typeof data.text !== 'string') return;
      finish();
      if (new TextEncoder().encode(data.text).length <= MAX_TEXT_BYTES) resolve(data.text);
      else reject(Error('Extracted text exceeds 2 MiB.'));
    };
    worker.onerror = () => { if (!settled) { finish(); reject(Error('Document extraction failed. Try another file.')); } };
    file.arrayBuffer().then(bytes => { if (!settled) worker!.postMessage({ source: 'datavault-document-v1', kind: 'extract', bytes, name: file.name, type: file.type }, [bytes]); }).catch(() => {
      if (!settled) { finish(); reject(Error('Could not read document.')); }
    });
  });
  return { result, cancel: () => { if (!settled) { finish(); rejectResult(Error('Extraction cancelled.')); } } };
}
