/**
 * Blog post metadata only. Safe to import from client components (no fs).
 */

export type BlogPostMeta = {
  slug: string;
  title: string;
  date: string; // YYYY-MM-DD
  sourceFile: string;
  /** Short summary for meta description and SEO (optional). */
  summary?: string;
  /** Author name for structured data (optional, defaults to ListingLive). */
  author?: string;
};

export const BLOG_POSTS: BlogPostMeta[] = [
  {
    slug: "one-video-one-brand-system",
    title: "One Video, One Brand: Build a Consistent Personal IP That Clients Remember",
    date: "2026-03-16",
    sourceFile: "one-video-one-brand-system.md",
    summary:
      "A practical guide to personal-brand consistency in real estate videos: combine avatar, logo, profile card, and listing visuals into one coherent output, while keeping room for high customization.",
  },
  {
    slug: "who-i-am",
    title: "Who I Am",
    date: "2026-03-01",
    sourceFile: "who-i-am.md",
    summary:
      "One developer, one country, and a belief that we can do better—together. Why ListingLive exists and who builds it for Canadian real estate.",
  },
  {
    slug: "listinglive-is-live",
    title: "ListingLive Is Live: Your Listing Photos, Ready to Move",
    date: "2026-03-03",
    sourceFile: "listinglive-is-live.md",
    summary:
      "We built something for agents who want their listings to stand out—without a film crew. Turn photos into videos, add your brand, and publish in minutes.",
  },
  {
    slug: "making-creation-smoother",
    title: "What's New: Three Steps, No Lost Work, and a Smarter Finish",
    date: "2026-03-06",
    sourceFile: "making-creation-smoother.md",
    summary:
      "Our latest update: a clear three-step creation flow, drafts that stay put when you leave, and clearer error messages so you know what went wrong.",
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
