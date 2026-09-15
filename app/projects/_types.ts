export type PublicContact = {
  type: "club" | "email" | "url" | "none";
  value: string | null;
};

export type PublicProjectView = {
  slug: string;
  name: string;
  ownerName: string;
  summary: string;
  description: string;
  stage: string;
  focus: string;
  collaborationNeeds: string;
  demoUrl: string;
  coverUrl: string | null;
  featured: boolean;
  publicContact: PublicContact;
  publishedAt: string | null;
  updatedAt: string;
};

export type PublicProjectListView = {
  data: PublicProjectView[];
  total: number;
  page: number;
  totalPages: number;
};
