import type { MetadataRoute } from "next";
import { prisma } from "@/lib/site/prisma";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Match the public detail routes, without list-page limits or private fields.
  // Database failures deliberately return an error instead of a partial sitemap.
  const [projects, activities] = await Promise.all([
    prisma.project.findMany({
      where: { status: "published", reviewedAt: { not: null } },
      select: { slug: true, updatedAt: true },
      orderBy: { slug: "asc" },
    }),
    prisma.clubActivity.findMany({
      where: { status: { in: ["published", "cancelled"] }, deletedAt: null },
      select: { id: true, status: true, endsAt: true, updatedAt: true, recapPublishedAt: true, recapContent: true },
      orderBy: { id: "asc" },
    }),
  ]);
  const now = new Date();
  return [
    { url: absoluteUrl("/"), changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/projects/"), changeFrequency: "weekly", priority: 0.8 },
    { url: absoluteUrl("/events/"), changeFrequency: "weekly", priority: 0.8 },
    { url: absoluteUrl("/ebao-studio/"), changeFrequency: "monthly", priority: 0.8 },
    ...projects.map(project => ({
      url: absoluteUrl(`/projects/${encodeURIComponent(project.slug)}/`), lastModified: project.updatedAt,
    })),
    ...activities.flatMap(activity => {
      const entries: MetadataRoute.Sitemap = [{
        url: absoluteUrl(`/activities/${encodeURIComponent(activity.id)}/`), lastModified: activity.updatedAt,
      }];
      if (activity.status === "published" && activity.endsAt <= now && activity.recapPublishedAt && activity.recapContent?.trim()) {
        entries.push({
          url: absoluteUrl(`/events/recaps/${encodeURIComponent(activity.id)}/`), lastModified: activity.updatedAt,
        });
      }
      return entries;
    }),
  ];
}
