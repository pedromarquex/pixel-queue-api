// test environment setup: set required env vars for unit tests
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://mock:mock@localhost:5432/mock';
// add other env defaults if needed
