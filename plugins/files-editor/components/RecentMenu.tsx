import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * The files opened before the one on screen. The panel shows one file at a
 * time, so this is how you go back — most recent first.
 *
 * Radix's dropdown is one of the portalling families BB shims to its own copy,
 * so it shares the host's focus and dismiss stack, like the tab menu does.
 */
export function RecentMenu({
  recent,
  onOpen,
}: {
  recent: readonly string[];
  onOpen: (path: string) => void;
}) {
  const isEmpty = recent.length === 0;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={isEmpty}
          aria-label="Recent files"
          title={isEmpty ? "No recent files yet" : "Recent files"}
          className={cn(
            "flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium",
            "text-muted-foreground transition-colors",
            "focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
            isEmpty
              ? "cursor-default opacity-40"
              : "cursor-pointer hover:bg-state-hover hover:text-foreground",
          )}
        >
          <Icon name="Clock" aria-hidden className="size-3.5" />
          <span className="hidden @[40rem]:inline">Recent</span>
          <Icon name="ChevronDown" aria-hidden className="size-3" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className={cn(
            "z-50 max-h-80 min-w-56 max-w-[min(28rem,90vw)] overflow-y-auto rounded-md border border-border",
            "bg-popover p-1 text-popover-foreground shadow-md",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          )}
        >
          {recent.map((path) => (
            <DropdownMenu.Item
              key={path}
              onSelect={() => onOpen(path)}
              title={path}
              className={cn(
                "flex cursor-pointer flex-col items-start rounded-sm px-2 py-1.5 outline-none select-none",
                "focus:bg-state-hover focus:text-foreground",
              )}
            >
              <span className="max-w-full truncate text-[13px]">{nameOf(path)}</span>
              <span className="max-w-full truncate text-[11px] text-muted-foreground">
                {parentOf(path)}
              </span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function parentOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "./" : path.slice(0, slash);
}
