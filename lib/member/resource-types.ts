export interface MemberResourceItem {
  id: string;
  description: string;
  externalUrl: string;
  imageUrl: string;
  published: boolean;
  updatedAt: string;
}
export interface MemberResourcePage {
  data: MemberResourceItem[];
  page: number;
  totalPages: number;
  total: number;
}
