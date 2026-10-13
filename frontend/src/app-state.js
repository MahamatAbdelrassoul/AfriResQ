import { createContext, useContext } from "react";

export const AppState = createContext(null);

export function useApp() {
  return useContext(AppState);
}
