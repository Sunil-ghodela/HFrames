import { z } from "zod";

export const JobSpecSchema = z.object({
  template: z.string().min(1),
  app: z.enum(["craftlee", "reelvoice"]),
  aspect: z.enum(["9:16", "1:1", "16:9"]),
  duration: z.number().positive().optional(),
  output: z.object({
    name: z.string().min(1),
    formats: z.array(z.enum(["mp4", "gif", "png"])).min(1),
  }),
  vars: z.record(z.string(), z.unknown()),
  audio: z
    .object({
      music: z.string().optional(),
      musicVolume: z.number().min(0).max(1).optional(),
      tts: z
        .object({
          text: z.string(),
          voice: z.string(),
          volume: z.number().min(0).max(1).optional(),
        })
        .optional(),
    })
    .optional(),
});

export type JobSpec = z.infer<typeof JobSpecSchema>;

export function parseJobSpec(raw: unknown): JobSpec {
  const result = JobSpecSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid JobSpec:\n${issues}`);
  }
  return result.data;
}
