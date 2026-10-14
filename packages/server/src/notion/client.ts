import { decodePage, decodeQueryResponse, MalformedNotionError, type NotionPage } from "@thread/core";
import { log } from "../log.js";
import { NotionError } from "./errors.js";
import { RateLimiter } from "./rateLimiter.js";

const API_BASE = "https://api.notion.com/v1";
export const NOTION_VERSION = "2025-09-03";
const MAX_RETRIES = 3;

export interface NotionClientOptions {
  token: string;
  fetchImpl?: typeof fetch;
  limiter?: RateLimiter;
  sleep?: (ms: number) => Promise<void>;
  // Friendly database names for error messages, keyed by data source id.
  labels?: Record<string, string>;
}

// Transport only: knows HTTP, not Thread.
export class NotionClient {
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly limiter: RateLimiter;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly labels: Record<string, string>;

  constructor(options: NotionClientOptions) {
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.limiter = options.limiter ?? new RateLimiter();
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.labels = options.labels ?? {};
  }

  // `filter` is Notion's query filter object, passed through untouched. A
  // per-person refresh uses it to pull one person's interactions; a full
  // sync passes none and gets every row.
  async queryAll(dataSourceId: string, filter?: Record<string, unknown>): Promise<NotionPage[]> {
    const pages: NotionPage[] = [];
    let cursor: string | null = null;
    const notFound = NotionError.databaseNotShared(dataSourceId, this.labels[dataSourceId] ?? null);
    do {
      const body: Record<string, unknown> = { page_size: 100 };
      if (filter) body.filter = filter;
      if (cursor) body.start_cursor = cursor;
      const json = await this.send(`data_sources/${dataSourceId}/query`, "POST", body, notFound);
      let response;
      try {
        response = decodeQueryResponse(json);
      } catch (error) {
        throw NotionError.malformed(`query response for ${dataSourceId}: ${(error as Error).message}`);
      }
      for (const failure of response.skipped) {
        log.warn(`Skipping undecodable row in ${dataSourceId}: ${failure}`);
      }
      pages.push(...response.results);
      cursor = response.hasMore ? response.nextCursor : null;
    } while (cursor);
    return pages;
  }

  async fetchPage(id: string): Promise<NotionPage> {
    return this.page(await this.send(`pages/${id}`, "GET", null, NotionError.pageNotFound(id)));
  }

  async createPage(parentDataSourceId: string, properties: Record<string, unknown>): Promise<NotionPage> {
    const body = { parent: { type: "data_source_id", data_source_id: parentDataSourceId }, properties };
    const notFound = NotionError.databaseNotShared(parentDataSourceId, this.labels[parentDataSourceId] ?? null);
    return this.page(await this.send("pages", "POST", body, notFound));
  }

  async updatePage(id: string, properties: Record<string, unknown>): Promise<NotionPage> {
    return this.page(await this.send(`pages/${id}`, "PATCH", { properties }, NotionError.pageNotFound(id)));
  }

  // Notion's API has no hard delete. Archiving is reversible from Notion's
  // trash, which is the safer semantic anyway.
  async archivePage(id: string): Promise<void> {
    await this.send(`pages/${id}`, "PATCH", { archived: true }, NotionError.pageNotFound(id));
  }

  private page(json: unknown): NotionPage {
    try {
      return decodePage(json);
    } catch (error) {
      if (error instanceof MalformedNotionError) throw NotionError.malformed(`page response: ${error.message}`);
      throw error;
    }
  }

  private async send(path: string, method: string, body: unknown, notFound: NotionError): Promise<unknown> {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
    };
    if (body !== null) init.body = JSON.stringify(body);

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await this.limiter.waitForTurn();

      let response: Response;
      try {
        response = await this.fetchImpl(`${API_BASE}/${path}`, init);
      } catch (error) {
        throw NotionError.transport((error as Error).message);
      }

      if (response.ok) {
        try {
          return await response.json();
        } catch {
          throw NotionError.malformed(`${method} ${path} returned invalid JSON`);
        }
      }
      if (response.status === 401) throw NotionError.unauthorized();
      if (response.status === 404) throw notFound;
      if (response.status === 429) {
        if (attempt === MAX_RETRIES) break;
        const retryAfter = Number(response.headers.get("Retry-After"));
        await this.sleep((Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : 1) * 1000);
        continue;
      }
      throw NotionError.http(response.status, (await response.text()).slice(0, 500));
    }
    throw NotionError.rateLimited();
  }
}
