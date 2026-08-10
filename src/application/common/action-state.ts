/** Shared result shape for Next.js server actions bound to forms. */
export type ActionState = {
  error?: string;
  success?: boolean;
  message?: string;
};
