// Small https GET that follows redirects. Used by the Grok30m self-updater
// (GitHub Releases JSON + vsix download). Not for telemetry.
import * as https from "node:https";
import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";

const MAX_REDIRECTS = 5;

export interface HttpGetOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

function isRedirect(status: number | undefined): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function getOnce(
  urlStr: string,
  headers: Record<string, string>,
  timeoutMs: number,
  dest?: fs.WriteStream,
): Promise<{ status: number; location?: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === "http:" ? http : https;
    const req = lib.request(
      url,
      {
        method: "GET",
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (isRedirect(status) && res.headers.location) {
          res.resume();
          resolve({ status, location: res.headers.location, body: Buffer.alloc(0) });
          return;
        }
        if (dest && status >= 200 && status < 300) {
          res.pipe(dest);
          dest.on("finish", () => resolve({ status, body: Buffer.alloc(0) }));
          dest.on("error", reject);
          res.on("error", reject);
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c as Buffer));
        res.on("end", () => resolve({ status, body: Buffer.concat(chunks) }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error(`GET ${urlStr} timed out`));
    });
    req.on("error", reject);
    req.end();
  });
}

async function follow(
  urlStr: string,
  headers: Record<string, string>,
  timeoutMs: number,
  dest?: fs.WriteStream,
): Promise<Buffer> {
  let current = urlStr;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const result = await getOnce(current, headers, timeoutMs, dest);
    if (result.location) {
      current = new URL(result.location, current).toString();
      continue;
    }
    if (result.status < 200 || result.status >= 300) {
      const snippet = result.body.toString("utf8").slice(0, 240);
      throw new Error(`GET ${current} → ${result.status}${snippet ? `: ${snippet}` : ""}`);
    }
    return result.body;
  }
  throw new Error(`Too many redirects fetching ${urlStr}`);
}

export async function httpsGetJson<T>(urlStr: string, headers: Record<string, string>, timeoutMs = 20_000): Promise<T> {
  const body = await follow(urlStr, { ...headers, Accept: "application/vnd.github+json" }, timeoutMs);
  return JSON.parse(body.toString("utf8")) as T;
}

export async function httpsDownloadFile(
  urlStr: string,
  destPath: string,
  headers: Record<string, string>,
  timeoutMs = 120_000,
): Promise<void> {
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  const dest = fs.createWriteStream(destPath);
  try {
    await follow(urlStr, headers, timeoutMs, dest);
  } catch (e) {
    dest.destroy();
    try { fs.unlinkSync(destPath); } catch { /* ignore */ }
    throw e;
  }
}
