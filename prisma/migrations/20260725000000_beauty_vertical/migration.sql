-- Additive only. Postgres 12+ allows ALTER TYPE ... ADD VALUE inside a
-- transaction as long as the new value is not *used* in the same transaction,
-- and nothing here writes a BEAUTY row, so this is safe under Prisma's
-- transactional migration runner.
ALTER TYPE "Vertical" ADD VALUE 'BEAUTY';
