import { Inflate } from 'fflate';
import { SaxesParser } from 'saxes';
import { MAX_TEXT_BYTES } from '../../../../shared/document-text';

const ENTRY_LIMIT = 10 * 1024 * 1024;
const TOTAL_LIMIT = 20 * 1024 * 1024;
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CONTENT_TYPE_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const embeddedRelationships = new Set([
  ...['http://schemas.openxmlformats.org/officeDocument/2006/relationships/', 'http://purl.oclc.org/ooxml/officeDocument/relationships/', 'http://schemas.microsoft.com/office/2006/relationships/']
    .flatMap(base => ['oleObject', 'package', 'vbaProject', 'control', 'activeXControlBinary'].map(type => base + type)),
]);
const embeddedContentTypes = new Set([
  'application/vnd.ms-office.vbaproject', 'application/vnd.ms-office.vbaprojectsignature',
  'application/vnd.openxmlformats-officedocument.oleobject',
  'application/vnd.ms-office.activex', 'application/vnd.ms-office.activex+xml',
  'application/vnd.ms-word.document.macroenabled.main+xml',
  'application/vnd.ms-word.template.macroenabledtemplate.main+xml',
]);
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});

/** Reject unsupported ZIP features rather than repairing ambiguous archives. */
export function extractDocx(bytes: Uint8Array): string {
  if (bytes.length > ENTRY_LIMIT) throw Error('Document exceeds 10 MiB.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (p: number) => view.getUint16(p, true);
  const u32 = (p: number) => view.getUint32(p, true);
  const fail = () => { throw Error('Malformed or unsupported DOCX archive.'); };
  if (bytes.length < 22 || u32(0) !== 0x04034b50) fail();
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && u32(end) !== 0x06054b50) end--;
  if (end < 0 || u32(end) !== 0x06054b50 || end + 22 + u16(end + 20) !== bytes.length) fail();
  const count = u16(end + 10), directory = u32(end + 16);
  if (!count || count > 1000 || u16(end + 4) || u16(end + 6) || u16(end + 8) !== count || directory + u32(end + 12) !== end) fail();
  let offset = directory, total = 0, localEnd = 0, document = '', types = false;
  const names = new Set<string>();
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || u32(offset) !== 0x02014b50) fail();
    const flags = u16(offset + 8), method = u16(offset + 10), crc = u32(offset + 16);
    const compressed = u32(offset + 20), declared = u32(offset + 24);
    const nameLength = u16(offset + 28), extraLength = u16(offset + 30), commentLength = u16(offset + 32);
    const local = u32(offset + 42);
    if (offset + 46 + nameLength + extraLength + commentLength > end || u16(offset + 34) || (flags & ~0x808) || ![0, 8].includes(method)) fail();
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    const key = name.toLowerCase();
    if (!name || /[\x00-\x1f\\:%]/u.test(name) || name.startsWith('/') || name.split('/').some(part => part === '..' || part === '.') || names.has(key)) fail();
    if (/vbaproject|macro|(?:^|\/)embeddings\//i.test(name)) throw Error('Macros and embedded files are not supported.');
    names.add(key);
    if (local !== localEnd || local + 30 > directory || u32(local) !== 0x04034b50 || u16(local + 6) !== flags || u16(local + 8) !== method) fail();
    const localNameLength = u16(local + 26), localExtraLength = u16(local + 28);
    const start = local + 30 + localNameLength + localExtraLength;
    if (start + compressed > directory || localNameLength !== nameLength || decoder.decode(bytes.subarray(local + 30, local + 30 + localNameLength)) !== name) fail();
    if (!(flags & 8) && (u32(local + 14) !== crc || u32(local + 18) !== compressed || u32(local + 22) !== declared)) fail();
    localEnd = start + compressed;
    if (flags & 8) {
      if (localEnd + 12 > directory) fail();
      if (u32(localEnd) === 0x08074b50) localEnd += 4;
      if (localEnd + 12 > directory || u32(localEnd) !== crc || u32(localEnd + 4) !== compressed || u32(localEnd + 8) !== declared) fail();
      localEnd += 12;
    }
    let actual = 0, checksum = 0xffffffff;
    const chunks: Uint8Array[] = [];
    const receive = (chunk: Uint8Array) => {
      actual += chunk.length; total += chunk.length;
      if (actual > ENTRY_LIMIT || total > TOTAL_LIMIT) throw Error('DOCX expanded content exceeds the safe limit.');
      for (const byte of chunk) checksum = crcTable[(checksum ^ byte) & 255] ^ (checksum >>> 8);
      if (/\.(xml|rels)$/i.test(name)) chunks.push(chunk.slice());
    };
    if (method === 0) {
      for (let p = start; p < start + compressed; p += 128) receive(bytes.subarray(p, Math.min(p + 128, start + compressed)));
    } else {
      // Small compressed pushes bound each synchronous inflate allocation too.
      const stream = new Inflate(receive);
      for (let p = start; p < start + compressed; p += 128) stream.push(bytes.subarray(p, Math.min(p + 128, start + compressed)), p + 128 >= start + compressed);
      if (!compressed) fail();
    }
    if (actual !== declared || ((checksum ^ 0xffffffff) >>> 0) !== crc) fail();
    if (chunks.length) {
      const joined = new Uint8Array(actual); let p = 0;
      for (const chunk of chunks) { joined.set(chunk, p); p += chunk.length; }
      const text = decoder.decode(joined);
      if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(text)) throw Error('XML entities and DTDs are not supported.');
      const extracted = parseXml(text, name === 'word/document.xml');
      if (name === 'word/document.xml') document = extracted;
      if (name === '[Content_Types].xml') {
        if (!text.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml') || /macroEnabled/i.test(text)) fail();
        types = true;
      }
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (offset !== end || localEnd !== directory || !types || !document.trim()) throw Error('No supported document text found in DOCX.');
  return document.trim();
}

function parseXml(xml: string, extract: boolean): string {
  const parser = new SaxesParser({ xmlns: true });
  const parts: string[] = []; let textDepth = 0, length = 0, inParagraph = false, prefix = '';
  const append = (text: string) => {
    length += encoder.encode(text).length;
    if (length > MAX_TEXT_BYTES) throw Error('Extracted text exceeds 2 MiB.');
    parts.push(text);
  };
  parser.on('doctype', () => { throw Error('XML DTDs are not supported.'); });
  parser.on('error', () => { throw Error('Malformed DOCX XML.'); });
  parser.on('opentag', tag => {
    const attributes = Object.values(tag.attributes);
    if ((tag.uri === PACKAGE_REL_NS && tag.local === 'Relationship' &&
          attributes.some(attr => attr.local === 'Type' && embeddedRelationships.has(attr.value))) ||
        (tag.uri === CONTENT_TYPE_NS && ['Default', 'Override'].includes(tag.local) &&
          attributes.some(attr => attr.local === 'ContentType' && embeddedContentTypes.has(attr.value.toLowerCase()))))
      throw Error('Macros and embedded files are not supported.');
    for (const attr of attributes) {
      if ((attr.local === 'TargetMode' && attr.value.toLowerCase() === 'external') ||
          (attr.local === 'Target' && /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(attr.value))) throw Error('External document resources are not supported.');
    }
    if (!extract || tag.uri !== WORD_NS) return;
    if (tag.local === 'p') { inParagraph = true; prefix = ''; }
    if (tag.local === 'pStyle') {
      const style = Object.values(tag.attributes).find(a => a.local === 'val')?.value ?? '';
      const heading = /^Heading([1-6])$/i.exec(style);
      if (heading) prefix = '#'.repeat(Number(heading[1])) + ' ';
    }
    if (tag.local === 'numPr') prefix = '- ';
    if (tag.local === 't') { if (prefix) { append(prefix); prefix = ''; } textDepth++; }
    if (tag.local === 'tab') append('\t');
    if (tag.local === 'br') append('\n');
  });
  parser.on('text', text => { if (extract && textDepth) append(text); });
  parser.on('closetag', tag => {
    if (!extract || tag.uri !== WORD_NS) return;
    if (tag.local === 't') textDepth--;
    if (tag.local === 'p' && inParagraph) { append('\n\n'); inParagraph = false; }
  });
  parser.write(xml).close();
  return parts.join('');
}
