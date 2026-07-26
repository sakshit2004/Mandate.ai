export type MandateErrorCode =
  | 'CLIENT_KEY_KILLED'
  | 'CLIENT_BUDGET_EXCEEDED'
  | 'INVALID_MANDATE_KEY'
  | 'INVALID_MANDATE_TAG'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'ORGANIZATION_REQUIRED'
  | 'SETUP_REQUIRED'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'INTERNAL_ERROR'
  | 'UPSTREAM_ERROR'

export function mandateErrorBody(
  code: MandateErrorCode,
  message: string,
  extra: Record<string, unknown> = {},
) {
  return {
    error: {
      type: 'mandate_error',
      code,
      message,
      ...extra,
    },
  }
}

export function mapLiteLLMGateError(
  status: number,
  bodyText: string,
  clientName?: string,
): { status: number; body: ReturnType<typeof mandateErrorBody> } | null {
  const lower = bodyText.toLowerCase()
  const name = clientName ? `Client ${clientName}` : 'This client key'

  if (
    status === 401 ||
    status === 403 ||
    lower.includes('blocked') ||
    lower.includes('key is disabled') ||
    lower.includes('key has been disabled')
  ) {
    if (
      lower.includes('budget') ||
      lower.includes('max budget') ||
      lower.includes('spend limit') ||
      lower.includes('exceeded')
    ) {
      return {
        status: 429,
        body: mandateErrorBody(
          'CLIENT_BUDGET_EXCEEDED',
          `${name} is over budget. Raise the cap or wait for the next period.`,
          { client: clientName },
        ),
      }
    }
    if (
      lower.includes('blocked') ||
      lower.includes('disabled') ||
      lower.includes('inactive') ||
      status === 403
    ) {
      return {
        status: 403,
        body: mandateErrorBody(
          'CLIENT_KEY_KILLED',
          `${name} is killed. Re-enable the key in Mandate to resume.`,
          { client: clientName },
        ),
      }
    }
  }

  if (
    status === 429 ||
    lower.includes('budget') ||
    lower.includes('max_budget') ||
    lower.includes('exceeded budget')
  ) {
    return {
      status: 429,
      body: mandateErrorBody(
        'CLIENT_BUDGET_EXCEEDED',
        `${name} is over budget. Raise the cap or wait for the next period.`,
        { client: clientName },
      ),
    }
  }

  return null
}
