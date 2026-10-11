// Tiny external stores for the two surfaces.
//
// Things outside React drive them: the sidebar footer button (host-rendered, no
// component) and bb's Ctrl+` command. Both call these singletons; the React
// trees subscribe via useSyncExternalStore. Module-level state is safe here
// because the content script and the panel component share one app bundle,
// instantiated once per bb window, tab, or remote client.

type Listener = () => void;

let open = false;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

export const windowController = {
  isOpen: (): boolean => open,
  show(): void {
    if (open) return;
    open = true;
    emit();
  },
  hide(): void {
    if (!open) return;
    open = false;
    emit();
  },
  toggle(): void {
    open = !open;
    emit();
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

let panelFocus = 0;
const panelListeners = new Set<Listener>();

/**
 * Focus requests for the side-panel tab. bb's openPanel only focuses the tab,
 * not the terminal inside it, so the Ctrl+` command bumps this and a mounted
 * panel puts the caret back at the prompt.
 */
export const panelController = {
  focusRequests: (): number => panelFocus,
  requestFocus(): void {
    panelFocus += 1;
    for (const listener of panelListeners) listener();
  },
  subscribe(listener: Listener): () => void {
    panelListeners.add(listener);
    return () => panelListeners.delete(listener);
  },
};
