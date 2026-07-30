import 'dotenv/config'
import { z } from 'zod'

function emptyToUndefined(v: unknown): unknown {
  if (v === '' || v === null) return undefined
  return v
}

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
  PORT: z.preprocess(emptyToUndefined, z.coerce.number().default(8788)),
  DATABASE_URL: z.string().min(1),
  ENCRYPTION_KEY: z.string().min(32),
  LEGACY_ENCRYPTION_KEY: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
  CLERK_SECRET_KEY: z.string().min(20),
  CLERK_PUBLISHABLE_KEY: z.string().min(20),
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().min(20),
  CLERK_JWT_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  CLERK_LEGACY_AGENCY_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  PUBLIC_BASE_URL: z.preprocess(emptyToUndefined, z.string().optional()),
  APP_ORIGINS: z.preprocess(emptyToUndefined, z.string().optional()),
  AGENCY_NAME: z.preprocess(emptyToUndefined, z.string().default('Mandate Agency')),
  AGENCY_TIMEZONE: z.preprocess(emptyToUndefined, z.string().default('America/Denver')),
  ALERT_EMAIL_TO: z.preprocess(emptyToUndefined, z.string().email().optional()),
  STANDALONE: z
    .string()
    .optional()
    .transform((v) => v !== '0' && v !== 'false'),
  LITELLM_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  LITELLM_MASTER_KEY: z.preprocess(emptyToUndefined, z.string().min(8).optional()),
  SMTP_HOST: z.preprocess(emptyToUndefined, z.string().default('localhost')),
  SMTP_PORT: z.preprocess(emptyToUndefined, z.coerce.number().default(1025)),
  SMTP_USER: z.preprocess(emptyToUndefined, z.string().optional()),
  SMTP_PASS: z.preprocess(emptyToUndefined, z.string().optional()),
  SMTP_FROM: z.preprocess(
    emptyToUndefined,
    z.string().default('Mandate <alerts@mandate.local>'),
  ),
  EMAIL_CONSOLE: z.preprocess(emptyToUndefined, z.string().optional()),
  PUPPETEER_EXECUTABLE_PATH: z.preprocess(emptyToUndefined, z.string().optional()),
  PLATFORM_OPENAI_API_KEY: z.preprocess(emptyToUndefined, z.string().min(10).optional()),
  PLATFORM_ANTHROPIC_API_KEY: z.preprocess(emptyToUndefined, z.string().min(10).optional()),
})

let parsed: z.infer<typeof envSchema>
try {
  parsed = envSchema.parse(process.env)
} catch (err) {
  console.error('[mandate] invalid environment configuration:')
  console.error(err)
  process.exit(1)
}

const emailConsoleExplicit =
  parsed.EMAIL_CONSOLE === '1' || parsed.EMAIL_CONSOLE === 'true'
    ? true
    : parsed.EMAIL_CONSOLE === '0' || parsed.EMAIL_CONSOLE === 'false'
      ? false
      : null

export const env = {
  ...parsed,
  PUBLIC_BASE_URL: resolvePublicBaseUrl(parsed.PUBLIC_BASE_URL),
  APP_ORIGINS: (
    parsed.APP_ORIGINS || resolvePublicBaseUrl(parsed.PUBLIC_BASE_URL)
  )
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean),
  STANDALONE: parsed.STANDALONE ?? true,
  EMAIL_CONSOLE: emailConsoleExplicit ?? parsed.NODE_ENV !== 'production',
}

export const BUDGET_ALERT_THRESHOLD = 80
export const DASHBOARD_POLL_MS = 3000
