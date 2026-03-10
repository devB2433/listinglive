import {
  getSceneTemplates,
  getUserLogos,
  type SceneTemplate,
  type SceneTemplatePropertyType,
  type UserLogo,
} from "@/lib/api";

type SceneTemplateCategory = "short" | "long_unified";

type TokenCacheEntry = {
  templates: Record<string, SceneTemplate[] | undefined>;
  templatePromises: Record<string, Promise<SceneTemplate[]> | undefined>;
  logos?: UserLogo[];
  logosPromise?: Promise<UserLogo[]>;
};

const cacheByToken = new Map<string, TokenCacheEntry>();

function getEntry(accessToken: string): TokenCacheEntry {
  let entry = cacheByToken.get(accessToken);
  if (!entry) {
    entry = {
      templates: {},
      templatePromises: {},
    };
    cacheByToken.set(accessToken, entry);
  }
  return entry;
}

export async function getCachedSceneTemplates(
  accessToken: string,
  category: SceneTemplateCategory,
  options?: { force?: boolean; propertyType?: SceneTemplatePropertyType | null },
): Promise<SceneTemplate[]> {
  const entry = getEntry(accessToken);
  const cacheKey = `${category}:${options?.propertyType ?? "all"}`;
  if (!options?.force && entry.templates[cacheKey]) {
    return entry.templates[cacheKey] ?? [];
  }
  if (!options?.force && entry.templatePromises[cacheKey]) {
    return entry.templatePromises[cacheKey] as Promise<SceneTemplate[]>;
  }

  const promise = getSceneTemplates(accessToken, { category, propertyType: options?.propertyType ?? null })
    .then((templates) => {
      entry.templates[cacheKey] = templates;
      return templates;
    })
    .finally(() => {
      delete entry.templatePromises[cacheKey];
    });
  entry.templatePromises[cacheKey] = promise;
  return promise;
}

export async function getCachedUserLogos(accessToken: string, options?: { force?: boolean }): Promise<UserLogo[]> {
  const entry = getEntry(accessToken);
  if (!options?.force && entry.logos) {
    return entry.logos;
  }
  if (!options?.force && entry.logosPromise) {
    return entry.logosPromise;
  }

  const promise = getUserLogos(accessToken)
    .then((logos) => {
      entry.logos = logos;
      return logos;
    })
    .finally(() => {
      entry.logosPromise = undefined;
    });
  entry.logosPromise = promise;
  return promise;
}

export function invalidateUserLogosCache(accessToken?: string) {
  if (!accessToken) {
    cacheByToken.clear();
    return;
  }
  const entry = cacheByToken.get(accessToken);
  if (!entry) return;
  entry.logos = undefined;
  entry.logosPromise = undefined;
}

export function invalidateVideoConfigCache(accessToken?: string) {
  if (!accessToken) {
    cacheByToken.clear();
    return;
  }
  cacheByToken.delete(accessToken);
}

export async function warmVideoConfigCache(accessToken: string): Promise<void> {
  await Promise.allSettled([
    getCachedSceneTemplates(accessToken, "short", { propertyType: "standard_home" }),
    getCachedSceneTemplates(accessToken, "long_unified", { propertyType: "standard_home" }),
    getCachedUserLogos(accessToken),
  ]);
}
