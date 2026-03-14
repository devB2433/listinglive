"use client";

import ReactMarkdown from "react-markdown";

type BlogPostBodyProps = {
  content: string;
};

export function BlogPostBody({ content }: BlogPostBodyProps) {
  return (
    <article className="prose prose-slate max-w-none prose-headings:font-semibold prose-a:text-blue-700 prose-a:no-underline hover:prose-a:underline">
      <ReactMarkdown>{content}</ReactMarkdown>
    </article>
  );
}
