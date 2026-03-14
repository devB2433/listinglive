import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ListingLive — Real Estate Listing Videos, Made Simple",
  description:
    "Turn listing photos into dynamic showcase content with an AI workflow built for real estate teams. Canada's own AI tool for realtors. Create polished motion content in minutes.",
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return children;
}
