#!/usr/bin/env node
// Local-only OpenAI-compatible response for a payment integration rehearsal.
import { readFileSync } from "node:fs";
import https from "node:https";

const certPath = process.env.LOCAL_MODEL_CERT;
const keyPath = process.env.LOCAL_MODEL_KEY;
if (!certPath || !keyPath)
  throw new Error(
    "Set LOCAL_MODEL_CERT and LOCAL_MODEL_KEY to local test certificate files."
  );
const server = https.createServer(
  { key: readFileSync(keyPath), cert: readFileSync(certPath) },
  async (req, res) => {
    if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
      res.writeHead(404).end();
      return;
    }
    let body = "";
    for await (const part of req) {
      body += part;
      if (body.length > 64_000) {
        res.writeHead(413).end();
        return;
      }
    }
    let passageId;
    try {
      const payload = JSON.parse(body);
      passageId = payload.messages
        ?.find((item) => item.role === "user")
        ?.content?.match(/<passage id="([^"]+)">/)?.[1];
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (!passageId || !/^0x[0-9a-fA-F]{64}:chunk-\d+$/.test(passageId)) {
      res.writeHead(422).end();
      return;
    }
    const response = JSON.stringify({
      choices: [
        {
          message: {
            content: `The guide says to keep clear records. [Passage ${passageId}]`,
          },
        },
      ],
    });
    res.writeHead(200, { "content-type": "application/json" }).end(response);
  }
);
server.listen(9443, "127.0.0.1", () =>
  console.log("Local model stub ready on 127.0.0.1:9443")
);
