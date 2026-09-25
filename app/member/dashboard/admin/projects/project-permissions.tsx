"use client";

import { createContext, useContext, type ReactNode } from "react";

const ProjectPublishPermissionContext = createContext(false);

export function ProjectPublishPermissionProvider({
  canPublish,
  children,
}: {
  canPublish: boolean;
  children: ReactNode;
}) {
  return (
    <ProjectPublishPermissionContext.Provider value={canPublish}>
      {children}
    </ProjectPublishPermissionContext.Provider>
  );
}

export function useProjectPublishPermission(): boolean {
  return useContext(ProjectPublishPermissionContext);
}
