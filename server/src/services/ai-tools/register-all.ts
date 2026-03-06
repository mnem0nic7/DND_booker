import { ToolRegistry } from './registry.js';

// CRUD tools
import { listProjects } from './crud/list-projects.js';
import { getProject } from './crud/get-project.js';
import { getProjectContent } from './crud/get-project-content.js';
import { createProject } from './crud/create-project.js';
import { updateProject } from './crud/update-project.js';
import { deleteProject } from './crud/delete-project.js';
import { updateProjectContent } from './crud/update-project-content.js';

// Memory tools
import { updateWorkingMemory } from './memory/update-working-memory.js';
import { rememberFact } from './memory/remember-fact.js';
import { updateTaskPlan } from './memory/update-task-plan.js';

// Content tools
import { editDocument } from './content/edit-document.js';
import { evaluateDocument } from './content/evaluate-document.js';
import { generateAdventure } from './content/generate-adventure.js';
import { generateImages } from './content/generate-images.js';
import { startGenerationRun } from './content/start-generation-run.js';

/** Singleton registry with all tools registered. */
export function createRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  // CRUD
  registry.register(listProjects);
  registry.register(getProject);
  registry.register(getProjectContent);
  registry.register(createProject);
  registry.register(updateProject);
  registry.register(deleteProject);
  registry.register(updateProjectContent);

  // Memory
  registry.register(updateWorkingMemory);
  registry.register(rememberFact);
  registry.register(updateTaskPlan);

  // Content
  registry.register(editDocument);
  registry.register(evaluateDocument);
  registry.register(generateAdventure);
  registry.register(generateImages);
  registry.register(startGenerationRun);

  return registry;
}

/** Global registry instance. */
export const globalRegistry = createRegistry();
