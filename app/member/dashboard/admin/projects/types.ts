export type ProjectStatus = "draft" | "pending_review" | "published" | "unpublished";

export type PublicContactType = "club" | "email" | "url" | "none";

export type AdminProject = {
  id: string;
  sourceSubmissionId: string | null;
  slug: string;
  slugLocked: boolean;
  status: ProjectStatus;
  name: string;
  ownerName: string;
  summary: string;
  description: string;
  stage: string;
  focus: string;
  collaborationNeeds: string;
  demoUrl: string;
  internalContact: string;
  publicContactType: PublicContactType;
  publicContactValue: string;
  coverUrl: string | null;
  coverOriginalName: string | null;
  coverMimeType: string | null;
  coverSize: number | null;
  featured: boolean;
  featuredOrder: number | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
};

export const projectStatusLabels: Record<ProjectStatus, string> = {
  draft: "草稿",
  pending_review: "待终审",
  published: "已发布",
  unpublished: "已下架",
};

export const projectStageLabels: Record<string, string> = {
  idea: "构想验证",
  build: "开发中",
  pilot: "试运行",
  live: "正式上线",
};
