import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

export function paginationMeta(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, pageCount: Math.ceil(total / pageSize) };
}
