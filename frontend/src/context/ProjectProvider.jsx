import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { ProjectContext } from "./ProjectContext.jsx";

export function ProjectProvider({ children }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestVersionRef = useRef(0);

  const clearProjects = useCallback(async () => {
    await Promise.resolve();
    requestVersionRef.current += 1;
    setProjects([]);
    setLoading(false);
    setError("");
  }, []);

  const refreshProjects = useCallback(async () => {
    if (!user) {
      await clearProjects();
      return [];
    }

    const requestVersion = ++requestVersionRef.current;
    await Promise.resolve();
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

  // Schedule the initial refresh after the effect commits so the compiler does not
  // treat its state updates as synchronous work performed by the effect itself.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshProjects();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshProjects]);

  const value = useMemo(() => ({ projects, loading, error, refreshProjects, addProject, removeProject }), [projects, loading, error, refreshProjects, addProject, removeProject]);
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}
