-- AlterTable
ALTER TABLE "website_projects" ADD COLUMN     "slug" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "website_projects_slug_key" ON "website_projects"("slug");
