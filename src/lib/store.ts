import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FrameworkId, Project, Topic } from "./types";
import { SEED_TOPICS } from "./topics";
import { SAMPLE_PROJECT } from "./sample-project";
import { uid } from "./utils";
import { attachVisuals, fallbackDirect } from "./director";
import type { DirectedScript } from "./types";

type HelixState = {
  topics: Topic[];
  topicsGeneratedAt: string | null;
  projects: Project[];
  applyScript: (
    projectId: string,
    script: DirectedScript,
    status?: Project["status"],
    error?: string,
  ) => void;
  createFromTopic: (topic: Topic) => Project;
  upsertSample: () => Project;
  setVoice: (projectId: string, voiceId: string) => void;
  swapVisual: (projectId: string, sceneOrder: number, index: number) => void;
  setFramework: (projectId: string, framework: FrameworkId) => void;
  markDirecting: (projectId: string) => void;
  markError: (projectId: string, error: string) => void;
  removeProject: (projectId: string) => void;
  replaceTopics: (topics: Topic[]) => void;
  resetTopics: () => void;
};

function projectFromScript(
  topic: Topic,
  script: DirectedScript,
  id?: string,
): Project {
  return {
    id: id ?? uid(),
    createdAt: new Date().toISOString(),
    status: "ready",
    topic,
    framework: script.selectedFramework,
    frameworkReasoning: script.frameworkReasoning,
    title: script.suggestedTitle,
    hookType: script.hookType,
    hookReasoning: script.hookReasoning,
    seoCaption: script.seoCaption,
    firstComment: script.firstComment,
    debateQuestion: script.debateQuestion,
    keywords: script.keywords,
    voiceDirection: script.voiceDirection,
    voiceId: "helix",
    scenes: attachVisuals(script.scenes),
  };
}

export const useHelix = create<HelixState>()(
  persist(
    (set, get) => ({
      topics: SEED_TOPICS,
      topicsGeneratedAt: null,
      projects: [SAMPLE_PROJECT],

      applyScript: (projectId, script, status = "ready", error) => {
        set({
          projects: get().projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  ...projectFromScript(p.topic, script, p.id),
                  createdAt: p.createdAt,
                  status,
                  error,
                  voiceId: p.voiceId,
                }
              : p,
          ),
        });
      },

      createFromTopic: (topic) => {
        const draft: Project = {
          ...projectFromScript(topic, fallbackDirect(topic)),
          status: "directing",
        };
        set({ projects: [draft, ...get().projects] });
        return draft;
      },

      upsertSample: () => {
        const existing = get().projects.find((p) => p.id === SAMPLE_PROJECT.id);
        if (existing) return existing;
        set({ projects: [SAMPLE_PROJECT, ...get().projects] });
        return SAMPLE_PROJECT;
      },

      setVoice: (projectId, voiceId) => {
        set({
          projects: get().projects.map((p) =>
            p.id === projectId ? { ...p, voiceId } : p,
          ),
        });
      },

      swapVisual: (projectId, sceneOrder, index) => {
        set({
          projects: get().projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  scenes: p.scenes.map((s) =>
                    s.sceneOrder === sceneOrder
                      ? { ...s, selectedIndex: index }
                      : s,
                  ),
                }
              : p,
          ),
        });
      },

      setFramework: (projectId, framework) => {
        set({
          projects: get().projects.map((p) =>
            p.id === projectId ? { ...p, framework, status: "directing" } : p,
          ),
        });
      },

      markDirecting: (projectId) => {
        set({
          projects: get().projects.map((p) =>
            p.id === projectId
              ? { ...p, status: "directing", error: undefined }
              : p,
          ),
        });
      },

      markError: (projectId, error) => {
        set({
          projects: get().projects.map((p) =>
            p.id === projectId ? { ...p, status: "error", error } : p,
          ),
        });
      },

      removeProject: (projectId) => {
        set({
          projects: get().projects.filter((p) => p.id !== projectId),
        });
      },

      replaceTopics: (topics) => {
        set({
          topics,
          topicsGeneratedAt: new Date().toISOString(),
        });
      },

      resetTopics: () => {
        set({ topics: SEED_TOPICS, topicsGeneratedAt: null });
      },
    }),
    {
      name: "helix-studio",
      partialize: (state) => ({
        topics: state.topics,
        topicsGeneratedAt: state.topicsGeneratedAt,
        projects: state.projects,
      }),
    },
  ),
);

export function useProject(id: string | undefined) {
  return useHelix((s) => s.projects.find((p) => p.id === id));
}
