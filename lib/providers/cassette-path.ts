import path from "node:path";

/** Desktop recordings belong to its persistent profile, outside bundled resources. */
export function cassetteDirectory(provider: "ai" | "places"): string {
  const root = path.resolve(
    /* turbopackIgnore: true */ process.env.CANTERA_DATA_DIR || process.cwd(),
  );
  return path.join(root, ".cassettes", provider);
}
