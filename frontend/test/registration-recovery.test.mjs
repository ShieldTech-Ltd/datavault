import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import renderer, { act } from "react-test-renderer";
import { File } from "node:buffer";
import { createServer } from "vite";
const owner = "0x" + "11".repeat(20),
  other = "0x" + "22".repeat(20),
  contract = "0x" + "ab".repeat(20),
  collectionId = "0x" + "bb".repeat(32),
  txHash = "0x" + "ee".repeat(32),
  parent = "0x" + "aa".repeat(32);
const defer = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
for (const scenario of [
  { interruption: "wallet switch", revision: true },
  { interruption: "network switch", revision: true },
  { interruption: "unmount", revision: true },
  { interruption: "wallet switch", revision: false },
  { interruption: "unmount", revision: true, normalRecovery: true },
  { interruption: "wallet switch", revision: true, legacy: true },
])
  test(
    `${
      scenario.revision ? "revision" : "ordinary"
    } submitted registration survives ${scenario.interruption}${
      scenario.normalRecovery
        ? " through ordinary owner recovery"
        : scenario.legacy
        ? " from legacy storage"
        : ""
    } and confirms the original transaction after reconnect`,
    { timeout: 15000 },
    async () => {
      const { interruption, revision, normalRecovery, legacy } = scenario;
      let recoveryNormal = false;
      const stored = new Map(),
        tx = defer(),
        called = defer(),
        completed = defer();
      let selected = owner,
        chain = 10143,
        sends = 0,
        uploads = 0,
        confirmations = 0,
        links = 0,
        waits = [];
      globalThis.File = File;
      globalThis.localStorage = {
        getItem: (k) => stored.get(k) ?? null,
        setItem: (k, v) => stored.set(k, v),
        removeItem: (k) => stored.delete(k),
      };
      const walletClient = {
        getAddresses: async () => [selected],
        getChainId: async () => chain,
        signMessage: async () => "signature",
        sendTransaction: async () => {
          sends++;
          called.resolve();
          return tx.promise;
        },
      };
      const walletFor = (address) => ({
        address,
        getWalletClient: async () => walletClient,
      });
      const runtime = {
        wallet: { primaryWallet: walletFor(owner), correctNetwork: true },
        chain: {
          waitForTransactionReceipt: async ({ hash }) => {
            waits.push(hash);
            return { status: "success" };
          },
          readContract: async () => [
            owner,
            "operator",
            1000000000000000n,
            1,
            true,
          ],
        },
      };
      globalThis.__registrationTest = runtime;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url, options) => {
        if (url === "/api/collections") {
          uploads++;
          return new Response(
            JSON.stringify({ collectionId, txCalldata: "0x1234" })
          );
        }
        if (url === `/api/collections/${collectionId}/confirm`) {
          confirmations++;
          assert.deepEqual(JSON.parse(options.body), {
            txHash,
            ownerAddress: owner,
          });
          return new Response("{}");
        }
        throw Error("Unexpected request " + url);
      };
      const vite = await createServer({
        server: { middlewareMode: true },
        appType: "custom",
        logLevel: "silent",
        define: { "import.meta.env.VITE_CHAIN_ID": JSON.stringify("10143") },
        plugins: [
          {
            name: "registration-fixtures",
            enforce: "pre",
            transform(code, id) {
              if (id.endsWith("/src/lib/wallet.tsx"))
                return "export function useWallet(){return globalThis.__registrationTest.wallet;}";
              if (id.endsWith("/src/lib/contract.ts"))
                return `export const CONTRACT_ADDRESS=${JSON.stringify(
                  contract
                )};export const DATAVAULT_ABI=[];export const viemClient=globalThis.__registrationTest.chain;`;
              if (
                id.endsWith("/src/production/CollectionVersions.tsx") ||
                id.endsWith("/src/production/CollectionEditor.tsx")
              )
                return "export default function Stub(){return null;}";
            },
          },
        ],
      });
      let component;
      try {
        const { default: Dashboard } = await vite.ssrLoadModule(
          "/src/components/OwnerDashboard.tsx"
        );
        const element = () =>
          React.createElement(Dashboard, {
            revisionParent: revision && !recoveryNormal ? parent : undefined,
            onConfirmed: async () => {
              links++;
              completed.resolve();
            },
            onChanged: () => completed.resolve(),
          });
        await act(async () => {
          component = renderer.create(element());
        });
        await act(async () => {
          component.root
            .findAllByType("input")
            .find((i) => i.props.type === "file")
            .props.onChange({
              target: {
                files: [
                  new File(["revised evidence"], "Revision.md", {
                    type: "text/markdown",
                  }),
                ],
              },
            });
          component.root
            .findAllByType("input")
            .find((i) => i.props.type === "checkbox")
            .props.onChange({ target: { checked: true } });
        });
        let operation;
        await act(async () => {
          operation = component.root
            .findAllByType("form")[0]
            .props.onSubmit({ preventDefault() {} });
          await called.promise;
        });
        const otherRecord = {
            collectionId: "0x" + "cc".repeat(32),
            txHash: "0x" + "dd".repeat(32),
            ownerAddress: other,
            name: "Other pending",
          },
          otherKey = `datavault_pending_registration:10143:${contract}:${other}`;
        stored.set(otherKey, JSON.stringify(otherRecord));
        await act(async () => {
          if (interruption === "unmount") component.unmount();
          else {
            if (interruption === "wallet switch") selected = other;
            else chain = 1;
            runtime.wallet = {
              primaryWallet: walletFor(selected),
              correctNetwork: chain === 10143,
            };
            component.update(element());
          }
        });
        await act(async () => {
          tx.resolve(txHash);
          await operation;
        });
        const ownKey = `datavault_pending_registration:10143:${contract}:${owner}`;
        assert.equal(
          stored.has(ownKey),
          true,
          "broadcast registration must be durable before the stale wallet/unmount fence"
        );
        assert.deepEqual(JSON.parse(stored.get(ownKey)), {
          collectionId,
          txHash,
          ownerAddress: owner,
          name: "Revision",
          ...(revision ? { revisionParent: parent } : {}),
        });
        assert.deepEqual(JSON.parse(stored.get(otherKey)), otherRecord);
        assert.equal(confirmations, 0);
        assert.equal(links, 0);
        assert.equal(waits.length, 0);
        if (interruption !== "unmount")
          await act(async () => component.unmount());
        if (legacy) {
          stored.set(
            `datavault_pending_registration:10143:${contract}`,
            stored.get(ownKey)
          );
          stored.delete(ownKey);
        }
        recoveryNormal = Boolean(normalRecovery);
        selected = owner;
        chain = 10143;
        runtime.wallet = {
          primaryWallet: walletFor(owner),
          correctNetwork: true,
        };
        await act(async () => {
          component = renderer.create(element());
        });
        const resume = component.root
          .findAllByType("button")
          .find((b) => b.children.join("") === "Resume confirmation");
        assert.ok(resume);
        await act(async () => {
          resume.props.onClick();
          await completed.promise;
        });
        assert.equal(sends, 1);
        assert.equal(uploads, 1);
        assert.equal(confirmations, 1);
        assert.deepEqual(waits, [txHash]);
        assert.equal(links, revision && !normalRecovery ? 1 : 0);
        assert.equal(stored.has(ownKey), false);
        if (normalRecovery) {
          const view = JSON.stringify(component.toJSON());
          assert.ok(view.includes(parent));
          assert.ok(view.includes(`/manage?collection=${parent}`));
          assert.ok(view.includes(collectionId));
        }
        if (legacy)
          assert.equal(
            stored.has(`datavault_pending_registration:10143:${contract}`),
            false
          );
        assert.deepEqual(JSON.parse(stored.get(otherKey)), otherRecord);
      } finally {
        await act(async () => component?.unmount());
        await vite.close();
        globalThis.fetch = originalFetch;
        delete globalThis.__registrationTest;
        delete globalThis.localStorage;
      }
    }
  );
