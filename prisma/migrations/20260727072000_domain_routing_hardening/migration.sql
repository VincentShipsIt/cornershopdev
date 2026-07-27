CREATE TYPE "DomainTlsStatus" AS ENUM ('PENDING', 'READY', 'ERROR');

ALTER TABLE "Domain"
ADD COLUMN "tlsStatus" "DomainTlsStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "tlsCheckedAt" TIMESTAMP(3),
ADD COLUMN "tlsFailureCode" TEXT;
