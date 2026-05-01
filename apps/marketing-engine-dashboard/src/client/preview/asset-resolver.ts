import type { BrandJSON } from "../../shared/types.ts";

export interface ClientResolverDeps {
  brands: Record<string, BrandJSON>;
  assetUrl: (name: string) => string;
}

export type ClientResolver = (value: unknown) => Promise<unknown>;

export function createClientResolver(deps: ClientResolverDeps): ClientResolver {
  return async (value) => {
    if (typeof value !== "string") return value;

    if (value.startsWith("@brand/")) {
      const rest = value.slice("@brand/".length);
      const dash = rest.indexOf("-");
      if (dash < 0) return value;
      const brand = rest.slice(0, dash);
      const key = rest.slice(dash + 1);
      const b = deps.brands[brand];
      if (!b) return value;

      if (b.colors[key] !== undefined) return b.colors[key];
      if (b.fonts[key] !== undefined) return b.fonts[key];
      if (key === "cta" && b.cta?.default !== undefined) return b.cta.default;
      return value;
    }

    if (value.startsWith("@asset/")) {
      const name = value.slice("@asset/".length);
      return deps.assetUrl(name);
    }

    if (value.startsWith("@font/")) {
      // Parity with engine: throws on @font/ — but client preview should
      // tolerate, since templates use @brand/<brand>-<font-key>.
      return value;
    }

    return value;
  };
}
