import { useEffect, useRef, useState } from 'react';
import { CloudArrowUp } from './icons';
import { extractLocalDocument } from './documents/client';
import { MAX_TEXT_BYTES } from '../../../shared/document-text';

export default function DocumentImport({ onReviewed }: { onReviewed: (name: string, text: string) => void }) {
  const [text, setText] = useState(''), [name, setName] = useState('');
  const [progress, setProgress] = useState(''), [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const job = useRef<ReturnType<typeof extractLocalDocument>>();
  const epoch = useRef(0);
  const clear = () => { epoch.current++; job.current?.cancel(); job.current = undefined; setBusy(false); setReady(false); setText(''); setName(''); setProgress(''); setError(''); };
  useEffect(() => () => { epoch.current++; job.current?.cancel(); }, []);
  async function select(file?: File) {
    clear();
    if (!file) return;
    const generation = epoch.current;
    setBusy(true); setProgress('Reading locally. No document upload.');
    try {
      job.current = extractLocalDocument(file, message => { if (epoch.current === generation) setProgress(message); });
      const value = await job.current.result;
      if (epoch.current !== generation) return;
      setText(value); setReady(true); setName(file.name.replace(/\.[^.]+$/, '').slice(0, 80)); setProgress('Review extracted text before continuing.');
    } catch (failure) { if (epoch.current === generation) setError(failure instanceof Error ? failure.message : 'Extraction failed.'); }
    finally { if (epoch.current === generation) { setBusy(false); job.current = undefined; } }
  }
  const size = new TextEncoder().encode(text).length;
  return <div className="dv-source-text dv-website-import">
    <label className="dv-upload-dropzone" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void select(event.dataTransfer.files?.[0]); }}>
      <CloudArrowUp size={46} weight="duotone"/><strong>Drag &amp; drop your file here</strong>
      <small>PDF or DOCX up to 10 MiB. Markdown or TXT up to 2 MiB.</small>
      <input type="file" aria-label="Knowledge document" accept=".pdf,.docx,.md,.txt" onChange={event => { void select(event.target.files?.[0]); event.target.value = ''; }}/>
    </label>
    <small>Extracted text stays in this tab until you review it. PDF: selectable text only, up to 200 pages. Images, layout, headers and embedded content may be omitted. Check coverage and reading order.</small>
    {progress && <p role="status">{progress}</p>}
    {error && <p role="alert">{error} Select a file to retry.</p>}
    {(busy || ready) && <button type="button" className="dv-button secondary" onClick={clear}>Cancel extraction and clear</button>}
    {!busy && ready && <>
      <label>Collection name<input value={name} maxLength={80} onChange={event => setName(event.target.value)}/></label>
      <label>Review extracted text<textarea value={text} rows={8} onChange={event => setText(event.target.value)}/></label>
      <small>{size.toLocaleString()} / {MAX_TEXT_BYTES.toLocaleString()} UTF8 bytes</small>
      {size > MAX_TEXT_BYTES && <p role="alert">Reviewed text exceeds 2 MiB.</p>}
      <button type="button" className="dv-button" disabled={!name.trim() || !text.trim() || size > MAX_TEXT_BYTES} onClick={() => onReviewed(name, text)}>Use reviewed text</button>
    </>}
  </div>;
}
