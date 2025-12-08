import { createCollection } from "@tanstack/react-db";
import { projectCollectionOptions } from "./collections/project";

export const projectCollection = createCollection(projectCollectionOptions);

export const db = {
  projects: projectCollection,
};
