import { createContext, type ReactNode, useContext } from "react";
import { useStore } from "zustand";
import type { EditorDocState, EditorStore } from "./store";

const EditorStoreContext = createContext<EditorStore | null>(null);

export function EditorStoreProvider({
  store,
  children,
}: {
  store: EditorStore;
  children: ReactNode;
}) {
  return <EditorStoreContext.Provider value={store}>{children}</EditorStoreContext.Provider>;
}

export function useDocStoreApi(): EditorStore {
  const store = useContext(EditorStoreContext);
  if (!store) throw new Error("useDocStore must be used inside <EditorStoreProvider>");
  return store;
}

/** Subscribe to a slice of the editor document store. */
export function useDocStore<T>(selector: (s: EditorDocState) => T): T {
  return useStore(useDocStoreApi(), selector);
}
