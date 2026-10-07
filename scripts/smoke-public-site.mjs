#!/usr/bin/env node
import { checkPublicSmoke } from "./lib/public-smoke.mjs";

try {
  const result = await checkPublicSmoke(process.env.PUBLIC_SITE_URL);
  console.log(`Public smoke passed for ${result.collectionId} at price ${result.priceWei} wei.`);
} catch (error) {
  console.error(`Public smoke failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
}
