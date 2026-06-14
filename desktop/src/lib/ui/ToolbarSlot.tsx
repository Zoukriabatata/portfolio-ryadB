// Toolbar slot — lets the footprint connectors teleport their compact
// control row INTO the single top bar (AppNavbar), so the whole app
// renders one merged bar instead of stacking navbar + status + toolbar.
//
// AppNavbar renders the slot <div> and publishes its element here;
// connectors read it via `useToolbarSlot()` and `createPortal` their
// controls into it. Because the navbar and the footprint pane are
// siblings in the same React tree (mounted by Layout), the portal
// target is guaranteed to live in the same document.

import { createContext, useContext } from "react";

/** The DOM node controls portal into, or null before the navbar mounts. */
export const ToolbarSlotContext = createContext<HTMLElement | null>(null);

export function useToolbarSlot(): HTMLElement | null {
  return useContext(ToolbarSlotContext);
}
