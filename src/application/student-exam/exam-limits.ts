/** Limits shared by the server validation and the start form (a plain module so client code can import it). */
export const EXAM_LIMITS = { minCount: 1, maxCount: 20, minMinutes: 10, maxMinutes: 240 } as const;
