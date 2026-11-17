-- AlterTable
ALTER TABLE "StaffUser" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totpRecoveryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];

