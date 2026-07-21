import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(60),
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters").max(100),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const monitorSchema = z.object({
  name: z.string().trim().min(1, "Monitor name is required").max(100),
  url: z.string().trim().url("A valid HTTP or HTTPS URL is required"),
  method: z.enum(["GET", "POST", "HEAD", "PUT"]).default("GET"),
  intervalSeconds: z.coerce
    .number()
    .int()
    .min(10, "Minimum interval is 10 seconds")
    .max(86400, "Maximum interval is 24 hours")
    .default(60),
  timeoutMs: z.coerce
    .number()
    .int()
    .min(500, "Minimum timeout is 500ms")
    .max(15000, "Maximum timeout is 15,000ms")
    .default(5000),
  expectedStatusCode: z.coerce.number().int().min(100).max(599).default(200),
  failureThreshold: z.coerce.number().int().min(1).max(10).default(3),
  recoveryThreshold: z.coerce.number().int().min(1).max(10).default(3),
  isActive: z.boolean().default(true),
});

export const updateMonitorSchema = monitorSchema.partial();

export const statusPageSchema = z.object({
  title: z.string().trim().min(2, "Title is required").max(100),
  description: z.string().trim().max(300).optional().default(""),
  slug: z
    .string()
    .trim()
    .min(3, "Slug must be at least 3 characters")
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Slug must only contain lowercase letters, numbers, and dashes"),
  isPublished: z.boolean().default(true),
  selectedMonitorIds: z.array(z.string().uuid()).default([]),
});

export const updateStatusPageSchema = statusPageSchema.partial();

export const analyticsQuerySchema = z.object({
  range: z.enum(["24h", "7d", "30d"]).default("24h"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type MonitorInput = z.infer<typeof monitorSchema>;
export type UpdateMonitorInput = z.infer<typeof updateMonitorSchema>;
export type StatusPageInput = z.infer<typeof statusPageSchema>;
export type UpdateStatusPageInput = z.infer<typeof updateStatusPageSchema>;
