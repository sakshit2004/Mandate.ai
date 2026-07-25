const TAG_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:/@-]{0,63}$/

export function normalizeMandateTag(raw: string | undefined | null): string | null {
  if (raw == null) return null
  const tag = raw.trim()
  if (!tag) return null
  if (!TAG_RE.test(tag)) {
    throw new Error('INVALID_MANDATE_TAG')
  }
  return tag
}

export function primaryTag(requestTags: unknown): string | null {
  if (!Array.isArray(requestTags) || requestTags.length === 0) return null
  const first = requestTags.find((t) => typeof t === 'string' && t.trim())
  return typeof first === 'string' ? first : null
}
