import { decodeCollectionText } from '../../../../shared/document-text';

// Parsers receive bytes only. Disable network primitives before examining input.
const deny = () => { throw Error('Document network access is disabled.'); };
Object.defineProperty(globalThis, 'fetch', { value: deny });
Object.defineProperty(globalThis, 'XMLHttpRequest', { value: deny });
Object.defineProperty(globalThis, 'WebSocket', { value: deny });
Object.defineProperty(globalThis, 'EventSource', { value: deny });

onmessage = async (event: MessageEvent) => {
  const request = event.data;
  if (!request || request.source !== 'datavault-document-v1' || request.kind !== 'extract' ||
      !(request.bytes instanceof ArrayBuffer) || typeof request.name !== 'string' || typeof request.type !== 'string') return;
  try {
    const { name, type } = event.data;
    const bytes = new Uint8Array(event.data.bytes);
    const extension = name.split('.').pop()?.toLowerCase();
    let text: string;
    if (extension === 'pdf') {
      if (type && type !== 'application/pdf') throw Error('File type does not match PDF.');
      const { extractPdf } = await import('./pdf');
      text = await extractPdf(bytes, (page, total) => postMessage({ source: 'datavault-document-v1', kind: 'progress', progress: `Extracting PDF page ${page} of ${total}` }));
    } else if (extension === 'docx') {
      if (type && type !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') throw Error('File type does not match DOCX.');
      const { extractDocx } = await import('./docx');
      text = extractDocx(bytes);
    } else {
      if (type && !['text/plain', 'text/markdown', 'text/x-markdown'].includes(type)) throw Error('Select a UTF8 Markdown or TXT file.');
      text = decodeCollectionText(bytes, name);
    }
    postMessage({ source: 'datavault-document-v1', kind: 'result', text });
  } catch (error) {
    postMessage({ source: 'datavault-document-v1', kind: 'error', error: error instanceof Error ? error.message : 'Document extraction failed.' });
  }
};
