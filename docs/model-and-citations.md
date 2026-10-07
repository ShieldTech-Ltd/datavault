# Model and Citations

## Provider

The Worker sends source passages and the buyer's question to an OpenAI-compatible chat completions API. The default model is `gpt-4o-mini`. Configure `MODEL_API_BASE` and `MODEL_NAME` in Worker secrets to use a different provider (e.g. Kimi via `https://api.moonshot.cn/v1`).

**Data disclosure:** Selected passages from the private R2 collection are sent to the configured model provider. The buyer UI explains this before payment, and the owner accepts the disclosure before registration. The prepare endpoint returns the quote, not a disclosure field.

## Citation format

The model is instructed to cite passages by their versioned ID:

```
[Passage {contentHash}:chunk-N]
```

Example: `[Passage 0xabc123...:chunk-0]`

The content hash in the ID pins the citation to the exact document version used by the query. Content replacement is disabled in this demo until on-chain policy versioning is coupled to it.

## Passage ID versioning

Passage IDs take the form `{contentHash}:{chunkId}` where:
- `contentHash` is the `keccak256` of the collection document at the time of retrieval
- `chunkId` is `chunk-N` where N is the zero-based index of a chunk capped at 600 words and 4,000 characters

The splitter normalizes whitespace and splits long tokens at Unicode character boundaries. A short nonempty document still produces a passage. An unchanged content hash must continue to use this splitter so stored passage IDs reconstruct the same text.

The receipt stores the exact cited passage IDs, not all retrieved passages. Only passages the model actually cited appear in the receipt.

## Citation validation

The Worker validates all citations before settling:

1. **Out-of-range numeric citations** (e.g. `[Passage 9]` when only 4 passages were provided): treated as a malformed response. The query fails and the buyer can call `refundExpired`.
2. **Unknown ID citations** (ID not in the provided set): same as above.
3. **No citations with no insufficient-evidence statement**: treated as hallucination, query fails.

## Insufficient-evidence responses

When the model determines the passages do not contain enough information to answer, it responds with a statement like "The passages do not contain information about X." The Worker detects this using a set of regular expression patterns and sets `isInsufficientEvidence: true` in the response.

**Insufficient-evidence answers are billable.** The collection was accessed and the model was invoked. The buyer UI explains this before payment. The public receipt records the settlement outcome and digest, but does not include the answer text or an insufficiency flag.

## Prompt injection protection

Passage content is wrapped in `<passage id="...">` XML tags in the model prompt. The system prompt instructs the model to treat passage contents as data only and ignore any embedded instructions. This mitigates prompt injection attacks where malicious content in a collection attempts to override the model's behavior.

## Request bounds

| Bound | Value |
|---|---|
| Model API timeout | 25 seconds |
| Max retrieved text | 4 passages, each at most 600 words and 4,000 characters |
| Max passages sent | 4 (top-ranked by keyword relevance) |
| Max tokens in response | 1,024 |
| Temperature | 0.2 (low randomness for factual answers) |

## Response digest

The receipt records `responseDigest = "sha256:" + sha256(answerText)`. This allows independent verification that the stored answer text matches the digest in the receipt. The digest covers exactly the answer bytes returned to the buyer.

## Limitations

- Passage retrieval uses keyword overlap scoring, not vector similarity. Semantically related passages with different vocabulary may not be retrieved.
- The model may cite a passage that only partially supports its answer.
- A crash during the model call leaves a claimed request that cannot currently be retried with the same request ID. The buyer can refund an open escrow after the on-chain timeout. There is no provider-level idempotency key.
- Live evidence requires `MODEL_API_KEY` to be set in Worker secrets.
