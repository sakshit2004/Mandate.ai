import 'dotenv/config'
import { z } from 'zod'

function resolvePublicBaseUrl(explicit?: string): string {
  const cleaned = explicit?.replace(/\/$/, '')
  if (cleaned) return cleaned
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  }
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '')
  }
  return 'http://localhost:8788'
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8788),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  PUBLIC_BASE_URL: z.string().optional(),
  AGENCY_NAME: z.string().default('Mandate Agency'),
  AGENCY_TIMEZONE: z.string().default('America/Denver'),
  ALERT_EMAIL_TO: z.string().email().optional(),
  /** When true (default), Mandate proxies providers itself — no Docker/LiteLLM. */
  STANDALONE: z
    .string()
    .optional()
    .transform((v) => v !== '0' && v !== 'false'),
  LITELLM_BASE_URL: z.string().url().optional(),
  LITELLM_MASTER_KEY: z.string().min(8).optional(),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('Mandate <alerts@mandate.local>'),
  /** Log budget emails to console instead of SMTP. Defaults on in non-production. */
  EMAIL_CONSOLE: z.string().optional(),
  PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
})

const parsed = envSchema.parse(process.env)

const emailConsoleExplicit =
  parsed.EMAIL_CONSOLE === '1' || parsed.EMAIL_CONSOLE === 'true'
    ? true
    : parsed.EMAIL_CONSOLE === '0' || parsed.EMAIL_CONSOLE === 'false'
      ? false
      : null

export const env = {
  ...parsed,
  PUBLIC_BASE_URL: resolvePublicBaseUrl(parsed.PUBLIC_BASE_URL),
  STANDALONE: parsed.STANDALONE ?? true,
  EMAIL_CONSOLE: emailConsoleExplicit ?? parsed.NODE_ENV !== 'production',
}

export const BUDGET_ALERT_THRESHOLD = 80
export const DASHBOARD_POLL_MS = 3000
