import type { InferRouterOutputs } from "@orpc/server";
import type { AppRouter } from "@t-example/api/routers/index";

type RouterOutputs = InferRouterOutputs<AppRouter>;

export type Project = RouterOutputs["project"]["getById"];
export type Asset = RouterOutputs["asset"]["getById"];
export type Track = Project["tracks"][number];
export type Clip = Track["clips"][number];
