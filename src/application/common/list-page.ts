/** Default page size for previously unbounded inbox/list queries (MVP). */
export const DEFAULT_LIST_PAGE_SIZE = 50;

/** Keyset / cursor list options (id of the last item from the previous page). */
export type ListPageOptions = {
  take?: number;
  /** Opaque cursor = last seen entity id (exclusive). */
  cursor?: string;
};

export type ListPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export function resolveTake(options?: ListPageOptions, fallback = DEFAULT_LIST_PAGE_SIZE): number {
  const take = options?.take ?? fallback;
  return Math.min(Math.max(1, take), 100);
}
