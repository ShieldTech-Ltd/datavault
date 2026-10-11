import { describe, expect, it, vi } from 'vitest';
import { decodeCollectionText, MAX_TEXT_BYTES } from '../../../shared/document-text';
import { boundedApiRequest } from '../lib/http-security';
import { handleRegisterCollection } from '../routes/collections';
import { makeEnv, MockR2Bucket } from './helpers';
import { retrievePassages, storeCollection } from '../lib/r2';
import { keccak256, toBytes } from 'viem';
vi.mock('../lib/config', () => ({ paidServiceConfigured: () => true }));

describe('reviewed document byte boundaries', () => {
  it('preserves exact UTF8 including BOM and accepts exactly 2 MiB', () => {
    const text = '\ufeff' + 'é'.repeat((2 * 1024 * 1024 - 4) / 2) + 'x';
    const bytes = new TextEncoder().encode(text);
    expect(bytes.length).toBe(2 * 1024 * 1024);
    expect(decodeCollectionText(bytes, 'reviewed.md')).toBe(text);
    expect(() => decodeCollectionText(new Uint8Array(MAX_TEXT_BYTES + 1), 'a.txt')).toThrow(/2 MiB/);
  });
  it('rejects invalid UTF8, binary control characters and disguised PDF/ZIP', () => {
    for (const bytes of [new Uint8Array([0xc3, 0x28]), new Uint8Array([65, 0, 66]), toBytes('%PDF-1.7\n'), toBytes('PK\x03\x04')]) {
      expect(() => decodeCollectionText(bytes, 'a.md')).toThrow();
    }
    expect(() => decodeCollectionText(toBytes('text'), 'a.pdf')).toThrow();
  });
  it('allows multipart overhead but bounds the actual envelope', async () => {
    const req = (n: number) => new Request('https://example.test/api/collections', { method: 'POST', body: new Uint8Array(n) });
    expect(await boundedApiRequest(req(MAX_TEXT_BYTES + 16 * 1024))).toBeInstanceOf(Request);
    expect((await boundedApiRequest(req(MAX_TEXT_BYTES + 16 * 1024 + 1)) as Response).status).toBe(413);
  });
  it('rejects raw PDF and invalid UTF8 before an R2 write', async () => {
    for (const [name, bytes] of [['a.pdf', toBytes('%PDF-1.7\n')], ['a.md', new Uint8Array([0xc3, 0x28])]] as const) {
      const bucket = new MockR2Bucket();
      const put = vi.spyOn(bucket, 'put');
      const env = makeEnv({ CONTRACT_ADDRESS: '0x' + '11'.repeat(20), COLLECTION_STORE: bucket });
      const form = new FormData();
      form.set('file', new Blob([bytes]), name);
      form.set('priceWei', '1');
      form.set('ownerAddress', '0x' + '22'.repeat(20));
      const response = await handleRegisterCollection(new Request('https://example.test/api/collections', { method: 'POST', body: form }), env as never);
      expect(response.status).toBe(400);
      expect(put).not.toHaveBeenCalled();
    }
  });
  it('ingests and retrieves 2 MiB while retaining the four bounded passage context', async () => {
    const start = performance.now();
    const text = ('Evidence about orbital mechanics.\n\n'.repeat(64000)).slice(0, MAX_TEXT_BYTES).padEnd(MAX_TEXT_BYTES, 'x');
    const hash = keccak256(toBytes(text));
    const env = makeEnv();
    await storeCollection('size-probe', text, hash, env as never);
    const result = await retrievePassages('size-probe', 'orbital', hash, env as never);
    expect(result.contentHash).toBe(hash);
    expect(result.passages).toHaveLength(4);
    expect(result.passages.every(p => p.length <= 1600)).toBe(true);
    expect(performance.now() - start).toBeLessThan(10000);
    console.info(`2 MiB local ingestion and retrieval: ${Math.round(performance.now() - start)} ms`);
  });
});
