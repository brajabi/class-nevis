import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";
import { env } from "./env.ts";

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

export { Prisma } from "./generated/prisma/client.ts";
export type { Recording, Segment, Note, NoteRecording } from "./generated/prisma/client.ts";
