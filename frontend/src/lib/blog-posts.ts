/**
 * Blog data layer: metadata and reading .md from content/blog.
 * Data only; rendering is handled by BlogPostBody.
 * For client-safe meta only, use blog-posts-meta.ts.
 */

import fs from "fs";
import path from "path";

export type { BlogPostMeta } from "./blog-posts-meta";
export {
  BLOG_POSTS,
  getLatestPost,
  getPostBySlug,
  getPostDates,
  getPosts,
} from "./blog-posts-meta";

function resolveContentDir(): string {
  const inApp = path.join(process.cwd(), "content", "blog");
  const upOne = path.join(process.cwd(), "..", "content", "blog");
  try {
    if (fs.existsSync(inApp)) return inApp;
  } catch {
    // ignore
  }
  return upOne;
}
const CONTENT_DIR = resolveContentDir();

/**
 * Read raw markdown for a post. Call from server only (e.g. in page.tsx).
 */
export function getPostContent(meta: { sourceFile: string }): string {
  const fullPath = path.join(CONTENT_DIR, meta.sourceFile);
  return fs.readFileSync(fullPath, "utf-8");
}
