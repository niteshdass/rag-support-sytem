import fetch from 'node-fetch';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { AppError } from '../../utils/errors.js';

const SCRAPER_TIMEOUT_MS = 30_000;

export interface ScrapedContent {
  title: string;
  content: string;
  url: string;
}

export async function fetchAndParse(url: string): Promise<ScrapedContent> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCRAPER_TIMEOUT_MS);

  let html: string;
  try {
    const response = await fetch(url, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new AppError(502, 'SCRAPE_ERROR', `HTTP ${response.status} fetching ${url}`);
    }
    html = await response.text();
  } catch (err) {
    if (err instanceof AppError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new AppError(502, 'SCRAPE_ERROR', `Failed to fetch ${url}: ${message}`);
  } finally {
    clearTimeout(timer);
  }

  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article?.textContent) {
    throw new AppError(422, 'PARSE_ERROR', `Unable to parse readable content from ${url}`);
  }

  return {
    title: article.title ?? '',
    content: article.textContent,
    url,
  };
}
