/**
 * Blog post metadata only. Safe to import from client components (no fs).
 */

export type BlogPostMeta = {
  slug: string;
  title: string;
  date: string; // YYYY-MM-DD
  sourceFile: string;
};

export const BLOG_POSTS: BlogPostMeta[] = [
  {
    slug: "who-i-am",
    title: "Who I Am",
    date: "2026-03-01",
    sourceFile: "who-i-am.md",
  },
  {
    slug: "listinglive-is-live",
    title: "ListingLive Is Live: Your Listing Photos, Ready to Move",
    date: "2026-03-03",
    sourceFile: "listinglive-is-live.md",
  },
  {
    slug: "making-creation-smoother",
    title: "What's New: Three Steps, No Lost Work, and a Smarter Finish",
    date: "2026-03-06",
    sourceFile: "making-creation-smoother.md",
  },
].sort((a, b) => b.date.localeCompare(a.date));

export function getPosts(): BlogPostMeta[] {
  return BLOG_POSTS;
}

export function getPostBySlug(slug: string): BlogPostMeta | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

export function getLatestPost(): BlogPostMeta {
  const first = BLOG_POSTS[0];
  if (!first) throw new Error("No blog posts");
  return first;
}

export function getPostDates(): string[] {
  return BLOG_POSTS.map((p) => p.date);
}
