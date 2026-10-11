import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { SortKey, TreeSort } from "@/lib/tree";

const SORT_LABEL: Readonly<Record<SortKey, string>> = {
  name: "Name",
  modified: "Date modified",
  type: "Type",
};

/**
 * The tree's sort order: a key and a direction. Folders stay on top whatever
 * is picked, so the menu only ever reorders inside the two groups.
 *
 * Date needs the times only a walk of this Mac collects; for another machine's
 * listing the item stays visible but disabled, with the reason under it, so
 * the choice does not silently vanish from the menu.
 *
 * Radix's dropdown is one of the portalling families BB shims to its own copy,
 * so it shares the host's focus and dismiss stack, like the Recent menu does.
 */
export function SortMenu({
  sort,
  onChange,
  dateSupported,
}: {
  sort: TreeSort;
  onChange: (next: TreeSort) => void;
  dateSupported: boolean;
}) {
  // What the tree is actually sorted by here: a remembered "date" falls back
  // to the name where there are no dates.
  const effectiveKey: SortKey = sort.key === "modified" && !dateSupported ? "name" : sort.key;
  const label = `Sort by ${SORT_LABEL[effectiveKey].toLowerCase()}${sort.reverse ? ", reversed" : ""}`;
  const isDefault = effectiveKey === "name" && !sort.reverse;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className={cn(
            "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md",
            "text-muted-foreground transition-colors hover:bg-state-hover hover:text-foreground",
            "focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
            !isDefault && "text-foreground",
          )}
        >
          <Icon name="Sort" aria-hidden className="size-3.5" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className={cn(
            "z-50 min-w-52 max-w-[min(20rem,90vw)] rounded-md border border-border",
            "bg-popover p-1 text-popover-foreground shadow-md",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          )}
        >
          <DropdownMenu.Label className="px-2 pt-1 pb-0.5 text-[11px] text-muted-foreground">
            Sort by · folders on top
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={effectiveKey}
            onValueChange={(value) => {
              const key = (Object.keys(SORT_LABEL) as SortKey[]).find(
                (candidate) => candidate === value,
              );
              if (key !== undefined) onChange({ ...sort, key });
            }}
          >
            <SortItem value="name" label={SORT_LABEL.name} />
            <SortItem
              value="modified"
              label={SORT_LABEL.modified}
              hint={
                dateSupported
                  ? "Newest first"
                  : "Not available: this workspace is on another machine"
              }
              isDisabled={!dateSupported}
            />
            <SortItem value="type" label={SORT_LABEL.type} hint="By extension, then name" />
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.CheckboxItem
            checked={sort.reverse}
            onCheckedChange={(checked) => onChange({ ...sort, reverse: checked })}
            className={ITEM_CLASS}
          >
            <Indicator />
            <span className="text-[13px]">Reverse order</span>
          </DropdownMenu.CheckboxItem>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

const ITEM_CLASS = cn(
  "flex cursor-pointer items-start gap-2 rounded-sm py-1.5 pr-2 pl-1.5 outline-none select-none",
  "focus:bg-state-hover focus:text-foreground",
  "data-[disabled]:cursor-default data-[disabled]:opacity-50",
);

function SortItem({
  value,
  label,
  hint,
  isDisabled,
}: {
  value: SortKey;
  label: string;
  hint?: string;
  isDisabled?: boolean;
}) {
  return (
    <DropdownMenu.RadioItem value={value} disabled={isDisabled} className={ITEM_CLASS}>
      <Indicator />
      <span className="flex min-w-0 flex-col">
        <span className="text-[13px]">{label}</span>
        {hint === undefined ? null : (
          <span className="text-[11px] text-muted-foreground">{hint}</span>
        )}
      </span>
    </DropdownMenu.RadioItem>
  );
}

/** A fixed-width slot, so the labels line up whether or not the check shows. */
function Indicator() {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center pt-0.5">
      <DropdownMenu.ItemIndicator>
        <Icon name="Check" aria-hidden className="size-3.5" />
      </DropdownMenu.ItemIndicator>
    </span>
  );
}
