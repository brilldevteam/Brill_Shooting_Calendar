import { z } from "zod";
export const rulesSchema = z
  .object({
    timezone: z.string().min(1).max(100),
    working_days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    lead_time_days: z.number().int().min(0).max(90),
    cancellation_window_hours: z.number().int().min(0).max(720),
    pending_blocks: z.boolean(),
    day_start: z.number().int().min(0).max(23),
    day_end: z.number().int().min(1).max(23),
    allow_future_usage: z.boolean(),
    allow_carry_forward: z.boolean(),
    max_advance_sessions: z.number().int().min(0).max(1000).nullable(),
    advance_policy: z.enum(["numeric", "unlimited", "approval"]),
    carry_forward_expiry_months: z.number().int().min(1).max(24),
  })
  .strict()
  .refine((v) => v.day_end > v.day_start, "Day end must be after start");
