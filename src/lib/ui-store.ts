import { create } from "zustand";

interface UIState {
  personFilter: string | null;
  projectFilter: string | null;
  selectedTaskId: string | null;
  drawerOpen: boolean;
  sidebarOpen: boolean;
  setPersonFilter: (id: string | null) => void;
  setProjectFilter: (id: string | null) => void;
  openTask: (id: string) => void;
  closeTask: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  personFilter: null,
  projectFilter: null,
  selectedTaskId: null,
  drawerOpen: false,
  sidebarOpen: false,
  setPersonFilter: (id) => set({ personFilter: id }),
  setProjectFilter: (id) => set({ projectFilter: id }),
  openTask: (id) => set({ selectedTaskId: id, drawerOpen: true }),
  closeTask: () => set({ drawerOpen: false, selectedTaskId: null }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
