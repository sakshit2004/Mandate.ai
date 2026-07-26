process.env.NODE_ENV = 'test'
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://mandate:mandate@127.0.0.1:5432/mandate_test'
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || 'test-encryption-key-at-least-32-characters'
process.env.CLERK_SECRET_KEY =
  process.env.CLERK_SECRET_KEY || 'sk_test_000000000000000000000000000000000000'
process.env.CLERK_PUBLISHABLE_KEY =
  process.env.CLERK_PUBLISHABLE_KEY || 'pk_test_Y2xlcmsudGVzdCQ='
process.env.CLERK_WEBHOOK_SIGNING_SECRET =
  process.env.CLERK_WEBHOOK_SIGNING_SECRET || 'whsec_000000000000000000000000000000000000'
process.env.STANDALONE = '1'
process.env.EMAIL_CONSOLE = '1'
process.env.PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:8788'
