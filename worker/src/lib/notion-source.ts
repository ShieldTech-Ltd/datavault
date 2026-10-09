import { connectorFetch } from "./connector-security";
import { NOTION_API_VERSION } from "./notion-connector";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const NOTION_FAILURE =
  "Notion import failed. Check selected page access and content limits, then reconnect or retry.";
export function notionSelection(value: any): string[] | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => k !== "pageIds") ||
    !Array.isArray(value.pageIds) ||
    value.pageIds.length < 1 ||
    value.pageIds.length > 5 ||
    !value.pageIds.every((v: unknown) => typeof v === "string" && UUID.test(v))
  )
    return null;
  const ids = value.pageIds.map((v: string) => v.toLowerCase());
  return new Set(ids).size === ids.length ? ids : null;
}
const textTypes = new Set([
  "paragraph",
  "heading_1",
  "heading_2",
  "heading_3",
  "bulleted_list_item",
  "numbered_list_item",
  "to_do",
  "toggle",
  "quote",
  "callout",
  "code",
]);
const containers = new Set(["column_list", "column", "table"]);
const plain = (values: any): string =>
  Array.isArray(values)
    ? values
        .map((v) => (typeof v?.plain_text === "string" ? v.plain_text : ""))
        .join("")
    : "";
export type NotionProvenance = {
  pageId: string;
  title: string;
  extractedAt: string;
  apiVersion: string;
  blocks: number;
  unsupported: Record<string, number>;
  coverage: "selected_text_only";
};
export async function fetchNotionPages(
  pageIds: string[],
  authorize: () => Promise<Record<string, string>>,
  active: () => Promise<unknown>,
  rejected: () => Promise<void>,
) {
  const budget = { bytes: 0, max: 2_000_000 };
  let blocks = 0,
    textBytes = 0;
  const parts: string[] = [],
    provenance: NotionProvenance[] = [];
  function append(text: string) {
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))
      throw Error("Text format");
    textBytes += new TextEncoder().encode(text + "\n\n").byteLength;
    if (textBytes > 500_000) throw Error("Text limit");
    parts.push(text);
  }
  async function get(path: string) {
    if (!(await active())) throw Error("Import inactive");
    const headers = await authorize();
    try {
      return await connectorFetch(
        "https://api.notion.com/v1/" + path,
        { headers: { ...headers, "Notion-Version": NOTION_API_VERSION } },
        2_000_000,
        budget,
      );
    } catch (e) {
      if (e instanceof Error && e.message === "Provider revoked")
        await rejected();
      throw e;
    }
  }
  for (const pageId of pageIds) {
    if (!UUID.test(pageId)) throw Error("Page id");
    const page = await get("pages/" + pageId);
    if (
      page?.object !== "page" ||
      page.id?.toLowerCase() !== pageId ||
      page.archived ||
      page.in_trash
    )
      throw Error("Page unavailable");
    const title =
      Object.values(page.properties ?? {})
        .filter((p: any) => p?.type === "title")
        .map((p: any) => plain(p.title))
        .join(" ") || "Untitled Notion page";
    const info: NotionProvenance = {
      pageId,
      title: title.slice(0, 512),
      extractedAt: new Date().toISOString(),
      apiVersion: NOTION_API_VERSION,
      blocks: 0,
      unsupported: Object.create(null),
      coverage: "selected_text_only",
    };
    append(title);
    const seen = new Set<string>();
    async function walk(id: string, depth: number) {
      if (depth > 5) throw Error("Depth limit");
      if (seen.has(id)) throw Error("Repeated block");
      seen.add(id);
      let cursor: string | null = null;
      const cursors = new Set<string>();
      do {
        const result = await get(
          "blocks/" +
            id +
            "/children?page_size=100" +
            (cursor ? "&start_cursor=" + encodeURIComponent(cursor) : ""),
        );
        if (
          !Array.isArray(result.results) ||
          result.results.length > 100 ||
          typeof result.has_more !== "boolean"
        )
          throw Error("Block response");
        for (const block of result.results) {
          if (++blocks > 500) throw Error("Block limit");
          info.blocks++;
          if (
            !UUID.test(block.id) ||
            typeof block.type !== "string" ||
            block.type.length > 100 ||
            typeof block.has_children !== "boolean"
          )
            throw Error("Block format");
          const type = block.type;
          if (textTypes.has(type)) append(plain(block[type]?.rich_text));
          else if (type === "table_row") {
            if (!Array.isArray(block.table_row?.cells))
              throw Error("Table format");
            append(block.table_row.cells.map(plain).join(" | "));
          } else if (!containers.has(type) && type !== "divider") {
            info.unsupported[type] = (info.unsupported[type] ?? 0) + 1;
            continue;
          }
          // Never traverse child_page, child_database, synced blocks or remote embeds.
          if (block.has_children) await walk(block.id, depth + 1);
        }
        cursor = result.has_more ? result.next_cursor : null;
        if (
          result.has_more &&
          (typeof cursor !== "string" ||
            !cursor ||
            cursor.length > 1024 ||
            cursors.has(cursor))
        )
          throw Error("Pagination");
        if (cursor) cursors.add(cursor);
      } while (cursor);
    }
    await walk(pageId, 0);
    provenance.push(info);
  }
  if (!(await active())) throw Error("Import inactive");
  return { text: parts.join("\n\n"), provenance };
}
