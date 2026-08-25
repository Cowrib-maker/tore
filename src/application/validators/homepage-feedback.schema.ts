import { z } from "zod";

export const HOMEPAGE_FEEDBACK_KINDS = [
  "feedback",
  "suggestion",
  "bug",
] as const;

export const homepageFeedbackSchema = z.object({
  kind: z.enum(HOMEPAGE_FEEDBACK_KINDS),
  message: z
    .string()
    .trim()
    .min(10, "Write at least 10 characters.")
    .max(2000, "Message is too long."),
  email: z
    .string()
    .trim()
    .max(254)
    .refine(
      (value) => value.length === 0 || z.string().email().safeParse(value).success,
      "Enter a valid email.",
    ),
});

export type HomepageFeedbackInput = z.infer<typeof homepageFeedbackSchema>;
