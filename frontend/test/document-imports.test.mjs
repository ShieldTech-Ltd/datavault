import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { pdfFixture, groundTruth } from './document-fixtures.mjs';
import React from 'react';
import { create, act } from 'react-test-renderer';

const xml = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DataVault fixture paragraph.</w:t></w:r></w:p></w:body></w:document>';
const docx = (extra = {}) => zipSync({ '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'), 'word/document.xml': strToU8(xml), ...extra });
test('local DOCX extraction rejects unsafe archives and extracts only text', async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), 'dv-document-'));
  const vite = await createServer({ cacheDir, configFile: false, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false } });
  try {
    const { extractDocx } = await vite.ssrLoadModule('/src/production/documents/docx.ts');
    assert.equal(extractDocx(docx()), 'DataVault fixture paragraph.');
    for (const extra of [
      { '../escape.xml': strToU8('bad') },
      { 'word/vbaProject.bin': new Uint8Array([1]) },
      { 'word/_rels/document.xml.rels': strToU8('<Relationships><Relationship TargetMode="External" Target="https://example.test/private"/></Relationships>') },
      { 'word/_rels/document.xml.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject" Target="renamed.bin"/></Relationships>') },
      { '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/renamed.bin" ContentType="application/vnd.ms-office.vbaProject"/></Types>') },
      { 'word/document.xml': strToU8('<!DOCTYPE x [<!ENTITY e SYSTEM "https://example.test">]><x>&e;</x>') },
      { 'bomb': new Uint8Array(10 * 1024 * 1024 + 1) },
    ]) assert.throws(() => extractDocx(docx(extra)));
    assert.throws(() => extractDocx(new Uint8Array([1, 2])));
    const bomb = docx({ 'bomb': new Uint8Array(10 * 1024 * 1024 + 1) });
    const view = new DataView(bomb.buffer);
    // Lie about decompressed sizes in BOTH headers: the actual stream must stop.
    for (let i=0; i < bomb.length-46; i++) {
      const sig=view.getUint32(i,true);
      if (sig===0x04034b50 && view.getUint32(i+22,true)>10*1024*1024) view.setUint32(i+22,1,true);
      if (sig===0x02014b50 && view.getUint32(i+24,true)>10*1024*1024) view.setUint32(i+24,1,true);
    }
    assert.throws(() => extractDocx(bomb), /expanded content/);
    assert.throws(() => extractDocx(docx({ a:new Uint8Array(8*1024*1024), b:new Uint8Array(8*1024*1024), c:new Uint8Array(8*1024*1024) })), /expanded content/);
    assert.throws(() => extractDocx(docx(Object.fromEntries(Array.from({length:1001},(_,i)=>[`f${i}`,new Uint8Array()])))));
    const encrypted = docx(); new DataView(encrypted.buffer).setUint16(6,1,true);
    assert.throws(() => extractDocx(encrypted));
    assert.throws(() => extractDocx(docx({ 'word/document.xml': strToU8(xml.replace('DataVault fixture paragraph.', 'x'.repeat(2 * 1024 * 1024 + 1))) })));
  } finally { await vite.close(); rmSync(cacheDir, { recursive: true, force: true }); }
});

test('PDF selectable text, no-text and page boundaries use real parser', async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), 'dv-pdf-'));
  const vite = await createServer({ cacheDir, configFile: false, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false } });
  try {
    const { extractPdf } = await vite.ssrLoadModule('/src/production/documents/pdf.ts');
    const progress = [];
    assert.equal(await extractPdf(pdfFixture(), (page,total) => progress.push([page,total])), groundTruth);
    assert.deepEqual(progress, [[1,1]]);
    await assert.rejects(extractPdf(pdfFixture(''), ()=>{}), /No selectable text/);
    await assert.rejects(extractPdf(pdfFixture('x',201), ()=>{}), /200 pages/);
    await assert.rejects(extractPdf(new Uint8Array([1,2]), ()=>{}), /Invalid PDF/);
    await assert.rejects(extractPdf(new Uint8Array(readFileSync(new URL('./fixtures/documents/encrypted.pdf',import.meta.url))), ()=>{}), /Password-protected/);
  } finally { await vite.close(); rmSync(cacheDir, { recursive: true, force: true }); }
});

test('review UI needs explicit handoff and clears pending private text on wallet-key remount', async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), 'dv-document-ui-'));
  let resolve, cancelled = 0, reviewed;
  globalThis.__documentFixture = () => ({ result: new Promise(r => {resolve=r;}), cancel(){cancelled++;} });
  const vite = await createServer({ cacheDir, configFile: false, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false },
    plugins:[{name:'document-client-fixture',enforce:'pre',transform(code,id){if(id.replaceAll('\\','/').endsWith('/documents/client.ts')) return 'export const extractLocalDocument=(...args)=>globalThis.__documentFixture(...args);';}}] });
  let component;
  try {
    const {default:DocumentImport} = await vite.ssrLoadModule('/src/production/DocumentImport.tsx');
    const element = key => React.createElement(DocumentImport,{key,onReviewed:(name,text)=>{reviewed={name,text};}});
    await act(async()=>{component=create(element('wallet-a'));});
    await act(async()=>{component.root.findByType('input').props.onChange({target:{files:[new File(['x'],'tiny.pdf')],value:'tiny.pdf'}});});
    assert.equal(reviewed,undefined);
    const late=resolve;
    await act(async()=>{component.update(element('wallet-b'));});
    assert.equal(cancelled,1);
    await act(async()=>{late('PRIVATE OLD WALLET');});
    assert.equal(component.root.findAllByType('textarea').length,0);
    await act(async()=>{component.root.findByType('input').props.onChange({target:{files:[new File(['x'],'tiny.pdf')],value:'tiny.pdf'}});});
    await act(async()=>{resolve('<img src=https://example.test> selectable text');});
    assert.equal(component.root.findByType('textarea').props.value,'<img src=https://example.test> selectable text');
    assert.equal(component.root.findAllByType('img').length,0);
    assert.equal(reviewed,undefined);
    await act(async()=>{component.root.findAllByType('button').find(b=>b.props.children==='Use reviewed text').props.onClick();});
    assert.equal(reviewed.text,'<img src=https://example.test> selectable text');
    await act(async()=>{component.root.findAllByType('button').find(b=>b.props.children==='Cancel extraction and clear').props.onClick();});
    assert.equal(component.root.findAllByType('textarea').length,0);
  } finally {
    if(component) await act(async()=>component.unmount());
    await vite.close(); delete globalThis.__documentFixture; rmSync(cacheDir,{recursive:true,force:true});
  }
});

test('worker client terminates cancellation, timeout and completed jobs; fences late results', async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), 'dv-extract-client-'));
  const vite = await createServer({ cacheDir, configFile: false, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false } });
  try {
    const { extractLocalDocument } = await vite.ssrLoadModule('/src/production/documents/client.ts');
    let terminated = 0;
    const worker = { postMessage() {}, terminate() { terminated++; }, onmessage: null };
    const file = new File(['hello'], 'hello.txt', {type:'text/plain'});
    const cancelled = extractLocalDocument(file, ()=> assert.fail('late progress'), ()=>worker);
    cancelled.cancel(); worker.onmessage({data:{text:'late'}});
    await assert.rejects(cancelled.result, /cancelled/); assert.equal(terminated,1);
    const timeout = extractLocalDocument(file, ()=>{}, ()=>worker, 5);
    await assert.rejects(timeout.result, /timed out/); assert.equal(terminated,2);
    const complete = extractLocalDocument(file, ()=>{}, ()=>worker);
    worker.onmessage({data:{text:'hello'}});
    assert.equal(await complete.result,'hello'); assert.equal(terminated,3);
  } finally { await vite.close(); rmSync(cacheDir, { recursive: true, force: true }); }
});
