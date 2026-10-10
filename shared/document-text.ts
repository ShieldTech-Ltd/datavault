export const MAX_TEXT_BYTES = 2 * 1024 * 1024;
export const MULTIPART_OVERHEAD_BYTES = 16 * 1024;

/** Preserve the exact reviewed bytes, including a UTF8 BOM, for owner signing. */
export function decodeCollectionText(bytes: Uint8Array, name: string): string {
  if (bytes.byteLength > MAX_TEXT_BYTES) throw Error('Text exceeds the 2 MiB limit.');
  if (!/\.(md|txt)$/i.test(name)) throw Error('Upload reviewed Markdown or TXT text.');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw Error('Text must contain valid UTF8.'); }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text) || /^\ufeff?(?:%PDF-|PK\x03\x04)/u.test(text))
    throw Error('Binary files must be extracted locally before upload.');
  if (!text.trim()) throw Error('File is empty.');
  return text;
}
