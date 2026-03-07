import { getSceneTemplates, getUserLogos, type SceneTemplate, type UserLogo } from "@/lib/api";

type SceneTemplateCategory = "short" | "long_unified";

type TokenCacheEntry = {
  templates: Partial<Record<SceneTemplateCategory, SceneTemplate[]>>;
  templatePromises: Partial<Record<SceneTemplateCategory, Promise<SceneTemplate[]>>>;
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
  options?: { force?: boolean },
): Promise<SceneTemplate[]> {
  const entry = getEntry(accessToken);
  if (!options?.force && entry.templates[category]) {
    return entry.templates[category] ?? [];
  }
  if (!options?.force && entry.templatePromises[category]) {
    return entry.templatePromises[category] as Promise<SceneTemplate[]>;
  }

  const promise = getSceneTemplates(accessToken, { category })
    .then((templates) => {
      entry.templates[category] = templates;
      return templates;
    })
    .finally(() => {
      delete entry.templatePromises[category];
    });
  entry.templatePromises[category] = promise;
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
    getCachedSceneTemplates(accessToken, "short"),
    getCachedSceneTemplates(accessToken, "long_unified"),
    getCachedUserLogos(accessToken),
  ]);
}
