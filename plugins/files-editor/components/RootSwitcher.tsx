import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Home01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { PanelRoot } from "@/lib/panel-state";
import type { ResolvedScope } from "../server.js";

/**
 * "⌂ Project ▾" over the tree of a thread's tab: the thread's own checkout,
 * or the home folder of this Mac. A dropdown rather than the Files page's two
 * selects — a thread tab has exactly these two roots.
 */
export function RootSwitcher({
  root,
  resolved,
  onChange,
}: {
  root: PanelRoot;
  /** What is shown now; its label names the project while the project is shown. */
  resolved: ResolvedScope | null;
  onChange: (next: PanelRoot) => void;
}) {
  const isHome = root === "home";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={isHome ? "Root: Home. Switch to the project" : "Root: Project. Switch to Home"}
          title="Show the project or the home folder of this Mac"
          className={cn(
            "flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md px-1 text-xs",
            "hover:bg-state-hover focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
            "data-[state=open]:bg-state-active",
          )}
        >
          {isHome ? (
            <HugeiconsIcon icon={Home01Icon} aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <Icon
              name={resolved?.environmentId === null ? "Folder" : "GitBranch"}
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground"
            />
          )}
          <span className="truncate font-medium text-foreground">
            {isHome ? "Home" : (resolved?.label ?? "Project")}
          </span>
          <span className="truncate text-muted-foreground">
            {isHome ? "~" : (resolved?.sublabel ?? "")}
          </span>
          <Icon name="ChevronDown" aria-hidden className="size-3 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className={cn(
            "z-50 min-w-48 overflow-hidden rounded-md border border-border bg-popover p-1",
            "text-popover-foreground shadow-md",
          )}
        >
          <DropdownMenu.RadioGroup value={root} onValueChange={(value) => onChange(value === "home" ? "home" : "project")}>
            <RootItem value="project" label="Project" hint="this thread's checkout" isSelected={!isHome} />
            <RootItem value="home" label="Home" hint="the home folder of this Mac" isSelected={isHome} />
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function RootItem({
  value,
  label,
  hint,
  isSelected,
}: {
  value: PanelRoot;
  label: string;
  hint: string;
  isSelected: boolean;
}) {
  return (
    <DropdownMenu.RadioItem
      value={value}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] outline-none select-none",
        "pointer-coarse:py-2.5 pointer-coarse:text-sm focus:bg-state-hover focus:text-foreground",
      )}
    >
      <span className="flex w-3 shrink-0 justify-center">
        {isSelected ? <Icon name="Check" aria-hidden className="size-3" /> : null}
      </span>
      <span className="font-medium">{label}</span>
      <span className="text-muted-foreground">{hint}</span>
    </DropdownMenu.RadioItem>
  );
}
