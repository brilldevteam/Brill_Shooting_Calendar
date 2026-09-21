import { z } from "zod";
export const bookingSchema = z
  .object({
    organization_id: z.uuid(),
    contract_id: z.uuid(),
    start_at: z.iso.datetime({ offset: true }),
    duration_minutes: z.coerce.number<number>().int().min(30).max(720),
    location: z.string().trim().min(2).max(500),
    subject: z.string().trim().min(2).max(300),
    expected_reels: z.coerce.number<number>().int().min(1).max(500),
    topics: z.string().trim().min(3).max(5000),
    script_ready: z.boolean(),
    content_plan_ready: z.boolean(),
    equipment_requirements: z.string().max(2000),
    additional_notes: z.string().max(5000),
    shoot_type: z.string().min(1).max(100),
    resource_id: z.uuid().nullable(),
    urgent: z.boolean(),
    draft: z.boolean(),
    idempotency_key: z.uuid(),
  })
  .strict();
export type BookingInput = z.infer<typeof bookingSchema>;
export const allowedMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;
export const maxFileSize = 10 * 1024 * 1024;
export const maxFiles = 20;
export function validateFile(file: {
  size: number;
  type: string;
  name: string;
}) {
  if (file.size < 1 || file.size > maxFileSize)
    throw new Error("Each file must be between 1 byte and 10 MB.");
  if (!(allowedMimeTypes as readonly string[]).includes(file.type))
    throw new Error("Allowed files: PDF, JPG, PNG, WebP, TXT, DOCX and PPTX.");
  if (!/\.(pdf|jpe?g|png|webp|txt|docx|pptx)$/i.test(file.name))
    throw new Error("Unsupported file extension.");
}
