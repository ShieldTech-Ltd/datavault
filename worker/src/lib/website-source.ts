import { parse, type DefaultTreeAdapterMap } from "parse5";
import { digest } from "./account-session";
import type { Env } from "./types";

export const WEBSITE_FAILURE =
  "Website import failed. Check approved hosts, public DNS, page size and content type. Use the final URL when a page redirects.";
const encoder = new TextEncoder();
export function publicHostname(host: string): boolean {
  return (
    host.length <= 253 &&
    host === host.toLowerCase() &&
    /^[a-z0-9.-]+$/.test(host) &&
    host.includes(".") &&
    !host.endsWith(".") &&
    !/\.(localhost|local|internal|test|invalid|home|lan|onion)$/.test(host) &&
    host
      .split(".")
      .every(
        (label) =>
          label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
      ) &&
    /[a-z]/.test(host.split(".").at(-1)!)
  );
}
export function websiteHosts(env: Env): string[] {
  const hosts = (env.WEBSITE_IMPORT_HOSTS ?? "")
    .split(",")
    .map((v) => v.trim());
  return hosts.length <= 100 && hosts.every(publicHostname)
    ? [...new Set(hosts)]
    : [];
}
export function websiteSelection(value: unknown, env: Env): string[] | null {
  const v = value as { urls?: unknown; permissionAccepted?: unknown } | null;
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !["urls", "permissionAccepted"].includes(k)) ||
    v.permissionAccepted !== true ||
    !Array.isArray(v.urls) ||
    v.urls.length < 1 ||
    v.urls.length > 5
  )
    return null;
  const allowed = websiteHosts(env),
    urls: string[] = [];
  for (const raw of v.urls) {
    if (
      typeof raw !== "string" ||
      raw.length > 2048 ||
      /[\s\\\u0000-\u001f\u007f]/.test(raw)
    )
      return null;
    try {
      const u = new URL(raw),
        authority = /^https:\/\/([^/]+)/.exec(raw)?.[1];
      if (
        u.protocol !== "https:" ||
        u.username ||
        u.password ||
        u.port ||
        u.search ||
        u.hash ||
        raw.includes("?") ||
        raw.includes("#") ||
        !authority ||
        authority !== u.hostname ||
        !publicHostname(u.hostname) ||
        !allowed.includes(u.hostname)
      )
        return null;
      urls.push(u.href);
    } catch {
      return null;
    }
  }
  return new Set(urls).size === urls.length ? urls : null;
}
function publicAddress(ip: string): boolean {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    const p = ip.split(".").map(Number);
    if (p.some((n, i) => n > 255 || String(n) !== ip.split(".")[i]))
      return false;
    const [a, b, c] = p;
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  // Only native global unicast IPv6. Reject transition, mapped, documentation and special-purpose space.
  if (!/^[0-9a-f:]+$/i.test(ip)) return false;
  try {
    const canonical = new URL("https://[" + ip + "]/").hostname.slice(1, -1);
    const first = parseInt(canonical.split(":")[0], 16),
      second = parseInt(canonical.split(":")[1] || "0", 16);
    return (
      first >= 0x2000 &&
      first <= 0x3fff &&
      !(first === 0x2001 && (second < 0x200 || second === 0xdb8)) &&
      first !== 0x2002 &&
      first !== 0x3fff
    );
  } catch {
    return false;
  }
}
async function bounded(
  response: Response,
  limit: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (!response.ok || response.status >= 300 || !response.body)
    throw Error("response");
  const length = response.headers.get("Content-Length");
  if (length && (!/^\d+$/.test(length) || Number(length) > limit))
    throw Error("size");
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      if (signal.aborted) throw Error("timeout");
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) throw Error("size");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel();
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
async function dnsCheck(host: string, signal: AbortSignal): Promise<string> {
  const addresses = new Set<string>(),
    visited = new Set<string>();
  async function resolve(name: string, depth: number): Promise<void> {
    if (
      depth > 5 ||
      visited.size >= 6 ||
      visited.has(name) ||
      !publicHostname(name)
    )
      throw Error("dns");
    visited.add(name);
    const aliases = new Set<string>();
    let found = false;
    for (const type of ["A", "AAAA"]) {
      const r = await fetch(
        "https://cloudflare-dns.com/dns-query?name=" +
          encodeURIComponent(name) +
          "&type=" +
          type,
        {
          redirect: "manual",
          signal,
          headers: { Accept: "application/dns-json" },
        },
      );
      const data = JSON.parse(
        new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(
          await bounded(r, 32768, signal),
        ),
      );
      if (
        data.Status !== 0 ||
        data.TC === true ||
        (data.Answer !== undefined && !Array.isArray(data.Answer))
      )
        throw Error("dns");
      for (const answer of data.Answer ?? []) {
        if (typeof answer.name !== "string" || typeof answer.data !== "string")
          throw Error("dns");
        const owner = answer.name.toLowerCase().replace(/\.$/, "");
        if (!publicHostname(owner)) throw Error("dns");
        if (answer.type === 1 || answer.type === 28) {
          if (
            !publicAddress(answer.data) ||
            (answer.type === 1) === answer.data.includes(":")
          )
            throw Error("dns");
          addresses.add(answer.data.toLowerCase());
          if (owner === name) found = true;
        } else if (answer.type === 5) {
          const target = answer.data.toLowerCase().replace(/\.$/, "");
          if (!publicHostname(target)) throw Error("dns");
          if (owner === name) aliases.add(target);
        } else throw Error("dns");
      }
    }
    if (aliases.size > 1 || (found && aliases.size)) throw Error("dns");
    for (const alias of aliases) await resolve(alias, depth + 1);
    if (!found && !aliases.size) throw Error("dns");
  }
  await resolve(host, 0);
  if (!addresses.size) throw Error("dns");
  return [...addresses].sort().join(",");
}
export function extractWebsiteText(html: string): string {
  const root = parse(html),
    parts: string[] = [],
    skip = new Set([
      "script",
      "style",
      "nav",
      "header",
      "footer",
      "noscript",
      "template",
      "svg",
      "math",
      "iframe",
      "object",
      "embed",
      "form",
      "button",
      "input",
      "select",
      "textarea",
    ]);
  const stack: DefaultTreeAdapterMap["node"][] = [root];
  let count = 0;
  while (stack.length) {
    const node = stack.pop()!;
    if (++count > 200000) throw Error("complexity");
    if (
      "tagName" in node &&
      (skip.has(node.tagName) ||
        node.attrs.some(
          (a) =>
            a.name === "hidden" ||
            (a.name === "aria-hidden" && a.value === "true") ||
            (a.name === "role" &&
              ["navigation", "banner", "contentinfo"].includes(a.value)),
        ))
    )
      continue;
    if (node.nodeName === "#text" && "value" in node) parts.push(node.value);
    if ("childNodes" in node) {
      parts.push("\n");
      for (let i = node.childNodes.length - 1; i >= 0; i--)
        stack.push(node.childNodes[i]);
    }
  }
  return parts
    .join("")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim();
}
export type WebsiteProvenance = {
  url: string;
  fetchedAt: string;
  contentDigest: string;
};
export async function fetchWebsitePages(
  env: Env,
  urls: string[],
  active: () => Promise<unknown>,
): Promise<{ text: string; provenance: WebsiteProvenance[] }> {
  if (!websiteSelection({ urls, permissionAccepted: true }, env))
    throw Error("selection");
  const parts: string[] = [],
    provenance: WebsiteProvenance[] = [];
  let totalBytes = 0;
  for (const url of urls) {
    if (!(await active())) throw Error("inactive");
    const deadline = Date.now() + 10000,
      controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 10000);
    try {
      const host = new URL(url).hostname,
        first = await dnsCheck(host, controller.signal),
        second = await dnsCheck(host, controller.signal);
      if (first !== second) throw Error("dns changed");
      const response = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html, text/plain",
          "User-Agent": "DataVault-selected-page-import",
        },
      });
      if (response.status >= 300 && response.status < 400)
        throw Error("redirect");
      const contentType = response.headers.get("Content-Type") ?? "";
      if (
        !/^text\/(?:html|plain)(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"|us-ascii|"us-ascii"))?\s*$/i.test(
          contentType,
        )
      )
        throw Error("type");
      const bytes = await bounded(
        response,
        2000000 - totalBytes,
        controller.signal,
      );
      totalBytes += bytes.byteLength;
      const source = new TextDecoder("utf-8", {
          fatal: true,
          ignoreBOM: false,
        }).decode(bytes),
        text = /^text\/html/i.test(contentType)
          ? extractWebsiteText(source)
          : source.trim();
      if (
        controller.signal.aborted ||
        !text ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)
      )
        throw Error("text");
      parts.push(urls.length > 1 ? "## " + url + "\n\n" + text : text);
      if (encoder.encode(parts.join("\n\n")).byteLength > 500000)
        throw Error("size");
      const fetchedAt = new Date().toISOString(),
        contentDigest = await digest(source);
      // Hashing is asynchronous and parsing can delay the abort timer.
      if (controller.signal.aborted || Date.now() >= deadline)
        throw Error("timeout");
      provenance.push({
        url,
        fetchedAt,
        contentDigest,
      });
    } finally {
      clearTimeout(timer);
    }
  }
  return { text: parts.join("\n\n"), provenance };
}
