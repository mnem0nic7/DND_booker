export interface Asset {
  id: string;
  userId: string;
  projectId: string | null;
  filename: string;
  mimeType: string;
  url: string;
  sizeBytes: number;
  createdAt: string;
}
