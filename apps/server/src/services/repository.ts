import { and, eq, inArray, sql } from "drizzle-orm";
import type { ListItemStatus, MediaKind, TheseList } from "@these/shared";
import type { TheseDatabase } from "../db/index.js";
import { folderMetadata, listItems, lists, settings } from "../db/schema.js";
import { AppError } from "../lib/errors.js";

export class Repository {
  constructor(readonly db: TheseDatabase) {}

  async getLists(): Promise<TheseList[]> {
    const listRows = await this.db.select().from(lists).orderBy(lists.createdAt);
    const counts = await this.db
      .select({ listId: listItems.listId, status: listItems.status, count: sql<number>`count(*)` })
      .from(listItems)
      .groupBy(listItems.listId, listItems.status);
    const countMap = new Map(counts.map((row) => [`${row.listId}:${row.status}`, Number(row.count)]));
    return listRows.map((row) => ({
      ...row,
      selectedCount: countMap.get(`${row.id}:selected`) ?? 0,
      maybeCount: countMap.get(`${row.id}:maybe`) ?? 0,
    }));
  }

  async createList(name: string) {
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 100) throw new AppError("List name must contain 1 to 100 characters.");
    const [created] = await this.db.insert(lists).values({ name: cleanName }).returning();
    return created!;
  }

  async renameList(id: number, name: string) {
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 100) throw new AppError("List name must contain 1 to 100 characters.");
    const [updated] = await this.db.update(lists).set({ name: cleanName, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(lists.id, id)).returning();
    if (!updated) throw new AppError("List not found.", 404, "LIST_NOT_FOUND");
    return updated;
  }

  async deleteList(id: number) {
    const deleted = await this.db.delete(lists).where(eq(lists.id, id)).returning({ id: lists.id });
    if (deleted.length === 0) throw new AppError("List not found.", 404, "LIST_NOT_FOUND");
    const activeId = await this.getActiveListId();
    if (activeId === id) await this.setActiveListId(null);
  }

  async setListItem(listId: number, mediaPath: string, mediaKind: MediaKind, status: ListItemStatus) {
    const list = await this.db.select({ id: lists.id }).from(lists).where(eq(lists.id, listId)).get();
    if (!list) throw new AppError("List not found.", 404, "LIST_NOT_FOUND");
    const [item] = await this.db
      .insert(listItems)
      .values({ listId, mediaPath, mediaKind, status })
      .onConflictDoUpdate({
        target: [listItems.listId, listItems.mediaPath],
        set: { status, mediaKind, updatedAt: sql`CURRENT_TIMESTAMP` },
      })
      .returning();
    return item!;
  }

  async removeListItem(listId: number, mediaPath: string) {
    await this.db.delete(listItems).where(and(eq(listItems.listId, listId), eq(listItems.mediaPath, mediaPath)));
  }

  async getStatuses(listId: number | null, paths: string[]) {
    if (!listId || paths.length === 0) return new Map<string, ListItemStatus>();
    const rows = await this.db
      .select({ path: listItems.mediaPath, status: listItems.status })
      .from(listItems)
      .where(and(eq(listItems.listId, listId), inArray(listItems.mediaPath, paths)));
    return new Map(rows.map((row) => [row.path, row.status]));
  }

  async getListItems(listId: number, status?: ListItemStatus, limit = 500, offset = 0) {
    const condition = status ? and(eq(listItems.listId, listId), eq(listItems.status, status)) : eq(listItems.listId, listId);
    return this.db.select().from(listItems).where(condition).orderBy(listItems.id).limit(limit).offset(offset);
  }

  async getSetting(key: string) {
    return (await this.db.select().from(settings).where(eq(settings.key, key)).get())?.value ?? null;
  }

  async setSetting(key: string, value: string) {
    await this.db.insert(settings).values({ key, value }).onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: sql`CURRENT_TIMESTAMP` },
    });
  }

  async getActiveListId(): Promise<number | null> {
    const raw = await this.getSetting("active_list_id");
    if (!raw) return null;
    const id = Number(raw);
    return Number.isInteger(id) ? id : null;
  }

  async setActiveListId(id: number | null) {
    if (id !== null) {
      const list = await this.db.select({ id: lists.id }).from(lists).where(eq(lists.id, id)).get();
      if (!list) throw new AppError("List not found.", 404, "LIST_NOT_FOUND");
    }
    await this.setSetting("active_list_id", id === null ? "" : String(id));
  }

  async getFolderMetadata() {
    return this.db.select().from(folderMetadata).orderBy(folderMetadata.path);
  }

  async createFolderMetadata(values: { path: string; alias?: string | null; favorite?: boolean; hidden?: boolean }) {
    const alias = normalizeAlias(values.alias);
    const [record] = await this.db
      .insert(folderMetadata)
      .values({ path: values.path, alias, favorite: values.favorite ?? false, hidden: values.hidden ?? false })
      .onConflictDoUpdate({
        target: folderMetadata.path,
        set: {
          ...(values.alias === undefined ? {} : { alias }),
          ...(values.favorite === undefined ? {} : { favorite: values.favorite }),
          ...(values.hidden === undefined ? {} : { hidden: values.hidden }),
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      })
      .returning();
    return record!;
  }

  async updateFolderMetadata(id: number, values: { path?: string; alias?: string | null; favorite?: boolean; hidden?: boolean }) {
    const [record] = await this.db
      .update(folderMetadata)
      .set({
        ...(values.path === undefined ? {} : { path: values.path }),
        ...(values.alias === undefined ? {} : { alias: normalizeAlias(values.alias) }),
        ...(values.favorite === undefined ? {} : { favorite: values.favorite }),
        ...(values.hidden === undefined ? {} : { hidden: values.hidden }),
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(folderMetadata.id, id))
      .returning();
    if (!record) throw new AppError("Folder metadata not found.", 404, "FOLDER_METADATA_NOT_FOUND");
    return record;
  }

  async deleteFolderMetadata(id: number) {
    await this.db.delete(folderMetadata).where(eq(folderMetadata.id, id));
  }
}

function normalizeAlias(value: string | null | undefined) {
  if (value == null) return null;
  const alias = value.trim();
  if (alias.length > 160) throw new AppError("Folder alias cannot exceed 160 characters.");
  return alias || null;
}
