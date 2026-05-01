// Prisma 7 config — connection URL is read from here (not schema.prisma datasource block).
// Next.js loads .env automatically, so no dotenv import needed.
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
