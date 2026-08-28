import { Ellipsis, Eye, EyeOff, FolderPlus, Pencil, Star } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef } from "react";
import type { FolderEntry } from "@these/shared";
import { cx } from "../lib/cx";

const folderMenuOpenEvent = "these:folder-menu-open";

export type FolderPatch = { alias?: string | null; favorite?: boolean; hidden?: boolean };

export interface FolderActionMenuClasses {
  control: string | undefined;
  controlOpen: string | undefined;
  trigger: string | undefined;
  open: string | undefined;
  menu: string | undefined;
  above: string | undefined;
}

interface FolderActionMenuProps {
  folder: FolderEntry;
  pending: boolean;
  open: boolean;
  classes: FolderActionMenuClasses;
  boundarySelector: string;
  canHide?: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (folder: FolderEntry, patch: FolderPatch) => Promise<boolean>;
  onEditAlias: (folder: FolderEntry) => void;
  onEditCollections: (folder: FolderEntry) => void;
}

export function FolderActionMenu({ folder, pending, open, classes, boundarySelector, canHide = true, onOpenChange, onUpdate, onEditAlias, onEditCollections }: FolderActionMenuProps) {
  const instanceId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const focusLastOnOpen = useRef(false);
  const openAbove = useRef(false);

  useLayoutEffect(() => {
    if (!open) return;
    const triggerElement = trigger.current;
    const menuElement = menu.current;
    const boundary = triggerElement?.closest<HTMLElement>(boundarySelector);
    if (triggerElement && menuElement && boundary) {
      const triggerRect = triggerElement.getBoundingClientRect();
      const boundaryRect = boundary.getBoundingClientRect();
      const spaceBelow = boundaryRect.bottom - triggerRect.bottom;
      const spaceAbove = triggerRect.top - boundaryRect.top;
      openAbove.current = spaceBelow < menuElement.offsetHeight + 8 && spaceAbove > spaceBelow;
      if (classes.above) menuElement.classList.toggle(classes.above, openAbove.current);
    }
    const animationFrame = requestAnimationFrame(() => {
      const items = getEnabledMenuItems(menu.current);
      (focusLastOnOpen.current ? items.at(-1) : items[0])?.focus();
      focusLastOnOpen.current = false;
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [boundarySelector, classes.above, open]);

  useEffect(() => {
    if (!open) return;
    const closeForOtherMenu = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== instanceId) onOpenChange(false);
    };
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (trigger.current?.contains(target) || menu.current?.contains(target)) return;
      const closingMenu = menu.current;
      onOpenChange(false);
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (!active || active === document.body || !active.isConnected || closingMenu?.contains(active)) trigger.current?.focus();
      });
    };
    const navigateMenu = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        trigger.current?.focus();
        return;
      }
      if (!menu.current?.contains(document.activeElement) || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const items = getEnabledMenuItems(menu.current);
      if (!items.length) return;
      event.preventDefault();
      const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === "Home") items[0]?.focus();
      else if (event.key === "End") items.at(-1)?.focus();
      else if (event.key === "ArrowDown") items[(currentIndex + 1 + items.length) % items.length]?.focus();
      else items[(currentIndex - 1 + items.length) % items.length]?.focus();
    };
    document.addEventListener(folderMenuOpenEvent, closeForOtherMenu);
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", navigateMenu);
    document.dispatchEvent(new CustomEvent(folderMenuOpenEvent, { detail: instanceId }));
    return () => {
      document.removeEventListener(folderMenuOpenEvent, closeForOtherMenu);
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", navigateMenu);
    };
  }, [instanceId, onOpenChange, open]);

  const runAction = (action: () => void) => {
    trigger.current?.focus();
    onOpenChange(false);
    action();
  };
  const aliasLabel = folder.displayName === folder.name ? "Create alias" : "Edit alias";
  return (
    <span className={cx(classes.control, open && classes.controlOpen)}>
      <button
        ref={trigger}
        type="button"
        className={cx(classes.trigger, open && classes.open)}
        disabled={pending}
        aria-label={`Folder actions for ${folder.displayName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Folder actions"
        onClick={() => onOpenChange(!open)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          focusLastOnOpen.current = event.key === "ArrowUp";
          onOpenChange(true);
        }}
      ><Ellipsis size={17} /></button>
      {open ? <div ref={menu} className={classes.menu} role="menu" aria-label={`${folder.displayName} actions`}>
        <button disabled={pending} type="button" role="menuitemcheckbox" aria-checked={folder.favorite} onClick={() => runAction(() => void onUpdate(folder, { favorite: !folder.favorite }))}><Star size={14} fill={folder.favorite ? "currentColor" : "none"} /><span>{folder.favorite ? "Remove favorite" : "Favorite"}</span></button>
        <button disabled={pending} type="button" role="menuitem" onClick={() => runAction(() => onEditAlias(folder))}><Pencil size={14} /><span>{aliasLabel}</span></button>
        <button disabled={pending} type="button" role="menuitem" onClick={() => runAction(() => onEditCollections(folder))}><FolderPlus size={14} /><span>Add to collections</span></button>
        <button disabled={pending || (!canHide && !folder.hidden)} type="button" role="menuitemcheckbox" aria-checked={folder.hidden} onClick={() => runAction(() => void onUpdate(folder, { hidden: !folder.hidden }))}>{folder.hidden ? <Eye size={14} /> : <EyeOff size={14} />}<span>{folder.hidden ? "Unhide folder" : "Hide folder"}</span></button>
      </div> : null}
    </span>
  );
}

export function applyFolderPatch(folder: FolderEntry, patch: FolderPatch): FolderEntry {
  return {
    ...folder,
    ...(patch.alias === undefined ? {} : { displayName: patch.alias?.trim() || folder.name }),
    ...(patch.favorite === undefined ? {} : { favorite: patch.favorite }),
    ...(patch.hidden === undefined ? {} : { hidden: patch.hidden }),
  };
}

function getEnabledMenuItems(menu: HTMLDivElement | null) {
  return menu ? Array.from(menu.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)')) : [];
}
