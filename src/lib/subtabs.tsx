"use client";

// Lets a page put its own views (Today / Week / Year…) into the top bar's single row of pills,
// instead of stacking a second row of tabs under it.
//   useSubTabs(TABS, tab, setTab)   // TABS = [{ key, label }]

import { createContext, useContext, useEffect, useState } from "react";

export type SubTab = { key: string; label: string };
type Sub = { tabs: SubTab[]; active: string; pick: (key: string) => void } | null;

const Ctx = createContext<{ sub: Sub; set: (s: Sub) => void }>({ sub: null, set: () => {} });

export function SubTabsProvider({ children }: { children: React.ReactNode }) {
  const [sub, set] = useState<Sub>(null);
  return <Ctx.Provider value={{ sub, set }}>{children}</Ctx.Provider>;
}

export const useActiveSubTabs = () => useContext(Ctx).sub;

export function useSubTabs<K extends string>(tabs: readonly { key: K; label: string }[], active: K, pick: (key: K) => void) {
  const { set } = useContext(Ctx);
  const keys = tabs.map((t) => `${t.key}:${t.label}`).join("|");
  useEffect(() => {
    set({ tabs: tabs as unknown as SubTab[], active, pick: pick as (k: string) => void });
    // tabs is compared by its keys so an inline array doesn't loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, active, pick, set]);
  useEffect(() => () => set(null), [set]);
}
