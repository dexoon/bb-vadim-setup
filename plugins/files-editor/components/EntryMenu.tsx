import * as ContextMenu from "@radix-ui/react-context-menu";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Fragment, useRef } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { EntryAction, EntryMenuItem } from "@/lib/entry-menu";

/**
 * The menu of a tree row, two ways in: a right click — which Radix also opens
 * on a long press of a touch screen — and the row's "⋯" button, because a
 * phone has no right click and a long press is not something people find.
 *
 * Both Radix families are among the portalling ones BB shims to its own copy,
 * so they share the host's focus and dismiss stack, like the tab menu does.
 */

/**
 * Actions that put focus somewhere new — a name field in the tree, a dialog.
 * Radix hands focus back to the menu's trigger a tick after it closes, which
 * would pull it straight out of that field, so for these it is told not to.
 */
const TAKES_FOCUS: ReadonlySet<EntryAction> = new Set([
  "rename",
  "newFile",
  "newFolder",
  "moveTo",
  "deleteForever",
]);

function useFocusHandOff(onAction: (action: EntryAction) => void) {
  const keepFocus = useRef(false);
  return {
    onAction: (action: EntryAction) => {
      keepFocus.current = TAKES_FOCUS.has(action);
      onAction(action);
    },
    onCloseAutoFocus: (event: Event) => {
      if (!keepFocus.current) return;
      keepFocus.current = false;
      event.preventDefault();
    },
  };
}

const CONTENT_CLASS = cn(
  "z-50 min-w-48 overflow-hidden rounded-md border border-border bg-popover p-1",
  "text-popover-foreground shadow-md",
  "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
);

const ITEM_CLASS = cn(
  "flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-[13px] outline-none select-none",
  "pointer-coarse:py-2.5 pointer-coarse:text-sm",
  "focus:bg-state-hover focus:text-foreground",
);

/** The same item and separator shapes in both Radix families. */
type ItemComponent = React.ComponentType<{
  onSelect?: (event: Event) => void;
  className?: string;
  children?: React.ReactNode;
}>;
type SeparatorComponent = React.ComponentType<{ className?: string }>;

function MenuGroups({
  groups,
  onAction,
  Item,
  Separator,
}: {
  groups: readonly EntryMenuItem[][];
  onAction: (action: EntryAction) => void;
  Item: ItemComponent;
  Separator: SeparatorComponent;
}) {
  return (
    <>
      {groups.map((group, index) => (
        <Fragment key={group.map((item) => item.action).join(",")}>
          {index > 0 ? <Separator className="my-1 h-px bg-border" /> : null}
          {group.map((item) => (
            <Item
              key={item.action}
              onSelect={() => onAction(item.action)}
              className={cn(
                ITEM_CLASS,
                item.isDestructive === true && "text-destructive-text focus:text-destructive-text",
              )}
            >
              {item.label}
            </Item>
          ))}
        </Fragment>
      ))}
    </>
  );
}

export function EntryContextMenu({
  groups,
  onAction,
  onOpenChange,
  children,
}: {
  groups: readonly EntryMenuItem[][];
  onAction: (action: EntryAction) => void;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const focus = useFocusHandOff(onAction);
  return (
    <ContextMenu.Root onOpenChange={onOpenChange}>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={CONTENT_CLASS} onCloseAutoFocus={focus.onCloseAutoFocus}>
          <MenuGroups
            groups={groups}
            onAction={focus.onAction}
            Item={ContextMenu.Item}
            Separator={ContextMenu.Separator}
          />
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

export function EntryMenuButton({
  label,
  groups,
  onAction,
  className,
}: {
  label: string;
  groups: readonly EntryMenuItem[][];
  onAction: (action: EntryAction) => void;
  className?: string;
}) {
  const focus = useFocusHandOff(onAction);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          // The row underneath opens files on click; this must not.
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "flex shrink-0 cursor-pointer items-center justify-center rounded-md",
            "text-muted-foreground hover:bg-state-hover hover:text-foreground",
            "focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
            "data-[state=open]:bg-state-active data-[state=open]:text-foreground",
            className,
          )}
        >
          <Icon name="MoreHorizontal" aria-hidden className="size-3.5" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className={CONTENT_CLASS}
          onCloseAutoFocus={focus.onCloseAutoFocus}
        >
          <MenuGroups
            groups={groups}
            onAction={focus.onAction}
            Item={DropdownMenu.Item}
            Separator={DropdownMenu.Separator}
          />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
