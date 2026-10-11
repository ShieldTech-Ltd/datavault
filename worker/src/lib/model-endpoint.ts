export function modelApiBase(configured: string | undefined): string {
  const value = configured ?? "https://api.openai.com/v1";
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Model API endpoint is invalid."); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new Error("Model API endpoint must use HTTPS without embedded credentials or query parameters.");
  }
  return url.href.replace(/\/+$/, "");
}
