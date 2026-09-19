import { lookup } from "node:dns";
import { isIP } from "node:net";
import { Agent, fetch } from "undici";
import ipaddr from "ipaddr.js";

export function isPublicAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}
function loopback(address: string) {
  try {
    return ipaddr.process(address).range() === "loopback";
  } catch {
    return false;
  }
}
function dispatcher(demo: boolean) {
  return new Agent({
    connect: {
      lookup(hostname, options, callback) {
        lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
          if (error) return callback(error, [], 0);
          if (
            !addresses.length ||
            addresses.some(
              (item) => !isPublicAddress(item.address) && !(demo && loopback(item.address)),
            )
          ) {
            return callback(new Error("La dirección del sitio no es pública."), [], 0);
          }
          if (options.all) callback(null, addresses);
          else callback(null, addresses[0].address, addresses[0].family);
        });
      },
    },
  });
}
const externalAgent = dispatcher(false);
const demoAgent = dispatcher(true);

export function allowedWebsiteUrl(raw: string, demoOrigin?: string): boolean {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return false;
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const demo =
      demoOrigin === url.origin &&
      /^\/demo-site\/[a-z0-9-]+$/.test(url.pathname) &&
      (host === "localhost" || loopback(host));
    if (demo) return true;
    if (url.port && !["80", "443"].includes(url.port)) return false;
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local"))
      return false;
    return !isIP(host) || isPublicAddress(host);
  } catch {
    return false;
  }
}

/** Validate each redirect and the actual DNS result used by the connection. */
export async function fetchWebsiteHtml(
  raw: string,
  options: { demoOrigin?: string; timeout?: number; maxBytes?: number } = {},
): Promise<string | null> {
  const signal = AbortSignal.timeout(options.timeout ?? 5000);
  let current = raw;
  try {
    for (let redirects = 0; redirects <= 4; redirects++) {
      if (!allowedWebsiteUrl(current, options.demoOrigin)) return null;
      const url = new URL(current);
      const isDemo =
        options.demoOrigin === url.origin && /^\/demo-site\/[a-z0-9-]+$/.test(url.pathname);
      const response = await fetch(url, {
        signal,
        redirect: "manual",
        dispatcher: isDemo ? demoAgent : externalAgent,
        headers: { "User-Agent": "Cantera/1.0 (business website analysis)", Accept: "text/html" },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get("location");
        if (!location) return null;
        current = new URL(location, url).href;
        continue;
      }
      if (
        !response.ok ||
        !response.headers.get("content-type")?.toLowerCase().includes("text/html")
      ) {
        await response.body?.cancel();
        return null;
      }
      const reader = response.body?.getReader();
      if (!reader) return null;
      const chunks: Uint8Array[] = [];
      let received = 0;
      const maxBytes = options.maxBytes ?? 500_000;
      try {
        while (received < maxBytes) {
          const { done, value } = await reader.read();
          if (done) break;
          const clipped = value.subarray(0, maxBytes - received);
          chunks.push(clipped);
          received += clipped.length;
        }
      } finally {
        await reader.cancel();
      }
      return Buffer.concat(chunks).toString("utf8");
    }
  } catch {
    return null;
  }
  return null;
}
