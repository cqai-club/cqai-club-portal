export interface MemberProjectSubmission {
  id: string;
  name: string;
  summary: string;
  coverUrl: string | null;
  stage: string;
  reviewStatus: string;
  editable: boolean;
  publicationStatus: string | null;
  publicUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemberProjectSubmissionDetail {
  id: string;
  updatedAt: string;
  fields: Record<"projectName" | "owner" | "oneLine" | "stage" | "projectFocus" | "demoUrl" | "projectContact" | "projectBio" | "needs", string>;
  consent: boolean;
  coverUrl: string | null;
  coverName: string | null;
}
