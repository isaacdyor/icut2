import type { RouterClient } from "@orpc/server";
import { publicProcedure } from "../index";
import { assetRouter } from "./asset";
import { clipRouter } from "./clip";
import { projectRouter } from "./project";
import { trackRouter } from "./track";

export const appRouter = {
  health: publicProcedure
    .route({ method: "GET", path: "/health" })
    .handler(() => "OK"),
  project: projectRouter,
  asset: assetRouter,
  track: trackRouter,
  clip: clipRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
