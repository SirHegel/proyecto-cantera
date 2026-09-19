/** Host checks defend local mode against DNS rebinding and accidental exposure.
 * The launcher must also bind to loopback: HTTP headers cannot prove socket IP.
 */
export function isLoopbackHost(authority: string): boolean {
  if (!authority || /[\s/@\\?#]/.test(authority)) return false;
  try {
    const hostname = new URL(`http://${authority}`).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

export function permitsLocalRequest(headers: Headers, method: string): boolean {
  const host = headers.get("host");
  if (!host || !isLoopbackHost(host)) return false;
  for (const name of ["x-forwarded-host", "x-forwarded-for", "x-real-ip"]) {
    const value = headers.get(name);
    if (
      value &&
      value.split(",").some((item) => {
        const candidate = item.trim();
        return (
          candidate !== "::1" && candidate !== "::ffff:127.0.0.1" && !isLoopbackHost(candidate)
        );
      })
    )
      return false;
  }
  // Streaming searches use GET and can spend API credits, so reject explicitly
  // cross-origin browser requests for every method, including GET.
  if (headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = headers.get("origin");
  if (origin) {
    try {
      const url = new URL(origin);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        !isLoopbackHost(url.host) ||
        url.host !== host
      )
        return false;
    } catch {
      return false;
    }
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    if (headers.get("sec-fetch-site") === "same-site" && !origin) return false;
  }
  return true;
}
