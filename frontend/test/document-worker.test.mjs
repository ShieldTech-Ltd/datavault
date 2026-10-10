import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Worker } from 'node:worker_threads';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createServer } from 'vite';
import { pdfFixture, docxFixture, groundTruth } from './document-fixtures.mjs';

test('actual worker entry ignores PDF.js bootstrap and denies network while extracting real PDF and DOCX', { timeout: 30000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dv-worker-context-'));
  let vite;
  const workers = [];
  try {
    await build({ entryPoints: [resolve('src/production/documents/extract.worker.ts')], outdir: dir, bundle: true, splitting: true, format: 'esm', platform: 'browser', outExtension: { '.js': '.mjs' } });
    const shim = join(dir, 'shim.mjs');
    await writeFile(shim, `import { parentPort } from 'node:worker_threads';
      const listeners = new Set();
      globalThis.process = undefined;
      globalThis.self = globalThis;
      globalThis.onmessage = null;
      globalThis.postMessage = value => parentPort.postMessage(value);
      globalThis.addEventListener = (type, cb) => { if(type === 'message') listeners.add(cb); };
      globalThis.removeEventListener = (type, cb) => listeners.delete(cb);
      globalThis.Worker = class { constructor() { throw Error('Nested workers forbidden by test policy'); } };
      await import('./extract.worker.mjs');
      const denied = [];
      for (const api of ['fetch','XMLHttpRequest','WebSocket','EventSource']) {
        try { await globalThis[api]('https://network-must-not-run.invalid'); }
        catch(error) { if(error.message === 'Document network access is disabled.') denied.push(api); }
      }
      parentPort.postMessage({ testNetworkDenied: denied });
      parentPort.on('message', data => {
        const event = { data }; globalThis.onmessage?.(event);
        for(const listener of listeners) listener(event);
      });`);
    vite = await createServer({ cacheDir: join(dir, 'cache'), configFile: false, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false } });
    const { extractLocalDocument } = await vite.ssrLoadModule('/src/production/documents/client.ts');
    for (const [name, type, bytes] of [
      ['fixture.pdf', 'application/pdf', pdfFixture()],
      ['fixture.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', docxFixture()],
    ]) {
      const messages = [], network = [];
      let terminated = false;
      const thread = new Worker(pathToFileURL(shim)); workers.push(thread);
      const adapter = {
        onmessage: undefined, onerror: undefined,
        postMessage(value, transfer) { thread.postMessage(value, transfer); },
        terminate() { terminated = true; void thread.terminate(); },
      };
      thread.on('message', data => {
        if (data.testNetworkDenied) { network.push(...data.testNetworkDenied); return; }
        messages.push(data); adapter.onmessage?.({ data });
      });
      thread.on('error', error => adapter.onerror?.(error));
      const task = extractLocalDocument(new File([bytes], name, { type }), () => {}, () => adapter, 15000);
      assert.equal(await task.result, groundTruth);
      assert.equal(terminated, true);
      assert.deepEqual(network, ['fetch','XMLHttpRequest','WebSocket','EventSource']);
      if (name.endsWith('.pdf')) assert.ok(messages.some(m => m.sourceName === 'worker' && m.action === 'ready'), 'actual PDF.js core bootstrap exercised');
    }
  } finally {
    await Promise.all(workers.map(worker => worker.terminate()));
    await vite?.close(); await rm(dir, { recursive: true, force: true });
  }
});
