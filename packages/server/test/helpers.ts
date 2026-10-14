// A fetch stand-in that records requests and answers from a handler.
export interface RecordedRequest {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
}

export function fakeFetch(handler: (request: RecordedRequest, index: number) => Response | Promise<Response>) {
  const requests: RecordedRequest[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const request: RecordedRequest = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    requests.push(request);
    return handler(request, requests.length - 1);
  }) as typeof fetch;
  return { impl, requests };
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

export const emptyQuery = { results: [], next_cursor: null, has_more: false };

export const noSleep = async () => {};

export function page(id: string, properties: Record<string, unknown>, url = "https://www.notion.so/x") {
  return { object: "page", id, url, properties };
}

export const title = (text: string) => ({ id: "title", type: "title", title: text ? [{ plain_text: text }] : [] });
export const relation = (ids: string[], hasMore = false) => ({
  id: "r",
  type: "relation",
  relation: ids.map((id) => ({ id })),
  has_more: hasMore,
});
export const date = (start: string | null) => ({ id: "d", type: "date", date: start ? { start } : null });
export const richText = (text: string) => ({ id: "t", type: "rich_text", rich_text: [{ plain_text: text }] });
