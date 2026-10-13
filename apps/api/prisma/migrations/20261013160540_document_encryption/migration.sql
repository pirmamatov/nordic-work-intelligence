/*
  Warnings:

  - Added the required column `encKeyWrapped` to the `DocumentVersion` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "DocumentVersion" ADD COLUMN     "encKeyWrapped" TEXT NOT NULL;
