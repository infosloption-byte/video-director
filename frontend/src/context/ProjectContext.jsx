import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext";

const ProjectContext = createContext(null);

export function ProjectProvider({ children }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestVersionRef = useRef(0);

  const clearProjects = useCallback(() => {
    requestVersionRef.current += 1;
    setProjects([]);
    setLoading(false);
    setError("");
  }, []);

  const refreshProjects = useCallback(async () => {
    if (!user) {
      clearProjects();
      return [];
    }

    const requestVersion = ++requestVersionRef.current;
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/projects", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Request failed with ${response.status}`);

      const nextProjects = Array.isArray(data.projects) ? data.projects : [];
      if (requestVersion !== requestVersionRef.current) return nextProjects;
      setProjects(nextProjects);
      return nextProjects;
    } catch (err) {
      if (requestVersion === requestVersionRef.current) setError(err.message || "Failed to load research history.");
      return [];
    } finally {
      if (requestVersion === requestVersionRef.current) setLoading(false);
    }
  }, [clearProjects, user]);

  const addProject = useCallback((project) => {
    if (!project?.id) return;
    requestVersionRef.current += 1;
    setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
  }, []);

  const removeProject = useCallback((projectId) => {
    if (!projectId) return;
    requestVersionRef.current += 1;
    setProjects((current) => current.filter((project) => project.id !== projectId));
  }, []);

  useEffect(() => {
    if (!user) {
      clearProjects();
      return undefined;
    }
    void refreshProjects();
    return undefined;
  }, [clearProjects, refreshProjects, user]);

  const value = useMemo(() => ({ projects, loading, error, refreshProjects, addProject, removeProject }), [projects, loading, error, refreshProjects, addProject, removeProject]);
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

// oxlint-disable-next-line react(only-export-components)
export function useProjects() {
  const value = useContext(ProjectContext);
  if (!value) throw new Error("useProjects must be used inside ProjectProvider");
  return value;
}
