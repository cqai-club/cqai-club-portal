import { cache } from "react";

import {
  getPublicProjectBySlug,
  listPublicProjects,
} from "@/lib/project-market";

import type { PublicProjectListView, PublicProjectView } from "./_types";

export const getPublishedProjects = cache(
  async (page: number, limit: number): Promise<PublicProjectListView> =>
    listPublicProjects({ page, limit })
);

export const getPublishedProject = cache(
  async (slug: string): Promise<PublicProjectView | null> =>
    getPublicProjectBySlug(slug)
);
