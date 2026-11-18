export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 100;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export function normalizePagination(page?: number, pageSize?: number): { page: number; pageSize: number; skip: number; take: number } {
  const p = Math.max(1, Math.floor(page ?? 1));
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(pageSize ?? DEFAULT_PAGE_SIZE)));
  return { page: p, pageSize: size, skip: (p - 1) * size, take: size };
}

export function paginate<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return {
    items,
    total,
    page,
    pageSize,
    pages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}
