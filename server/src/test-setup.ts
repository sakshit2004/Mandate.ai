process.env.NODE_ENV = 'test'
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://mandate:mandate@127.0.0.1:5432/mandate_test'
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-32chars-min'
process.env.STANDALONE = '1'
process.env.EMAIL_CONSOLE = '1'
process.env.PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:8788'
