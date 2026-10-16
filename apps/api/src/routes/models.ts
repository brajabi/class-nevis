import { Elysia } from "elysia";
import { listModels } from "../openrouter.ts";
import { HttpError } from "../errors.ts";

export const modelsRoutes = new Elysia().get("/models", async () => {
  try {
    return await listModels();
  } catch (e) {
    throw new HttpError(502, (e as Error).message);
  }
});
