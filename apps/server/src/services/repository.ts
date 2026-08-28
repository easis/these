import { and, eq, inArray, sql } from "drizzle-orm";
import type { FolderCollection, ListItemStatus, MediaKind, TheseList } from "@these/shared";
import type { TheseDatabase } from "../db/index.js";
import { folderCollectionItems, folderCollections, folderMetadata, listItems, lists, settings } from "../db/schema.js";
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

  async getCollections(): Promise<FolderCollection[]> {
    const rows = (await this.db.select().from(folderCollections))
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: false }) || left.id - right.id);
    const counts = await this.db
      .select({ collectionId: folderCollectionItems.collectionId, count: sql<number>`count(*)` })
      .from(folderCollectionItems)
      .groupBy(folderCollectionItems.collectionId);
    const countByCollection = new Map(counts.map((row) => [row.collectionId, Number(row.count)]));
    return rows.map(({ nameKey: _, ...row }) => ({ ...row, folderCount: countByCollection.get(row.id) ?? 0 }));
  }

  async getCollection(id: number): Promise<FolderCollection> {
    const collection = (await this.getCollections()).find((candidate) => candidate.id === id);
    if (!collection) throw new AppError("Collection not found.", 404, "COLLECTION_NOT_FOUND");
    return collection;
  }

  async createCollection(name: string): Promise<FolderCollection> {
    const normalized = normalizeCollectionName(name);
    await this.assertCollectionNameAvailable(normalized.key);
    try {
      const [created] = await this.db.insert(folderCollections).values({ name: normalized.name, nameKey: normalized.key }).returning();
      return { ...withoutNameKey(created!), folderCount: 0 };
    } catch (error) {
      throwCollectionNameConflict(error);
    }
  }

  async renameCollection(id: number, name: string): Promise<FolderCollection> {
    const normalized = normalizeCollectionName(name);
    await this.assertCollectionNameAvailable(normalized.key, id);
    try {
      const [updated] = await this.db
        .update(folderCollections)
        .set({ name: normalized.name, nameKey: normalized.key, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(folderCollections.id, id))
        .returning();
      if (!updated) throw new AppError("Collection not found.", 404, "COLLECTION_NOT_FOUND");
      return { ...withoutNameKey(updated), folderCount: (await this.getCollection(id)).folderCount };
    } catch (error) {
      throwCollectionNameConflict(error);
    }
  }

  async deleteCollection(id: number) {
    const deleted = await this.db.delete(folderCollections).where(eq(folderCollections.id, id)).returning({ id: folderCollections.id });
    if (deleted.length === 0) throw new AppError("Collection not found.", 404, "COLLECTION_NOT_FOUND");
  }

  async getCollectionFolderPaths(id: number): Promise<string[]> {
    await this.getCollection(id);
    const rows = await this.db
      .select({ path: folderCollectionItems.folderPath })
      .from(folderCollectionItems)
      .where(eq(folderCollectionItems.collectionId, id));
    return rows.map((row) => row.path);
  }

  async getAllCollectionFolderPaths(): Promise<string[]> {
    const rows = await this.db.selectDistinct({ path: folderCollectionItems.folderPath }).from(folderCollectionItems);
    return rows.map((row) => row.path);
  }

  async getFolderCollectionIds(folderPath: string): Promise<number[]> {
    const rows = await this.db
      .select({ collectionId: folderCollectionItems.collectionId })
      .from(folderCollectionItems)
      .where(eq(folderCollectionItems.folderPath, folderPath));
    return rows.map((row) => row.collectionId);
  }

  setFolderCollections(folderPath: string, collectionIds: number[]) {
    const uniqueIds = [...new Set(collectionIds)];
    this.db.transaction((tx) => {
      const existing = uniqueIds.length === 0
        ? []
        : tx.select({ id: folderCollections.id }).from(folderCollections).where(inArray(folderCollections.id, uniqueIds)).all();
      if (existing.length !== uniqueIds.length) throw new AppError("Collection not found.", 404, "COLLECTION_NOT_FOUND");
      tx.delete(folderCollectionItems).where(eq(folderCollectionItems.folderPath, folderPath)).run();
      if (uniqueIds.length > 0) {
        tx.insert(folderCollectionItems).values(uniqueIds.map((collectionId) => ({ collectionId, folderPath }))).run();
      }
    });
  }

  async addCollectionFolder(id: number, folderPath: string) {
    await this.getCollection(id);
    await this.db.insert(folderCollectionItems).values({ collectionId: id, folderPath }).onConflictDoNothing().run();
  }

  async removeCollectionFolder(id: number, folderPath: string) {
    await this.db.delete(folderCollectionItems).where(and(eq(folderCollectionItems.collectionId, id), eq(folderCollectionItems.folderPath, folderPath)));
  }

  async deleteCollectionFoldersByPath(paths: string[]) {
    if (paths.length === 0) return;
    await this.db.delete(folderCollectionItems).where(inArray(folderCollectionItems.folderPath, paths));
  }

  private async assertCollectionNameAvailable(nameKey: string, excludedId?: number) {
    const row = await this.db.select({ id: folderCollections.id }).from(folderCollections).where(eq(folderCollections.nameKey, nameKey)).get();
    if (row && row.id !== excludedId) throw new AppError("A collection with that name already exists.", 409, "COLLECTION_NAME_TAKEN");
  }
}

function normalizeAlias(value: string | null | undefined) {
  if (value == null) return null;
  const alias = value.trim();
  if (alias.length > 160) throw new AppError("Folder alias cannot exceed 160 characters.");
  return alias || null;
}

function normalizeCollectionName(value: string) {
  const name = value.trim();
  if (!name || name.length > 100) throw new AppError("Collection name must contain 1 to 100 characters.");
  return { name, key: name.toLowerCase() };
}

function withoutNameKey<T extends { nameKey: string }>(row: T): Omit<T, "nameKey"> {
  const { nameKey: _, ...result } = row;
  return result;
}

function throwCollectionNameConflict(error: unknown): never {
  if ((error as { code?: string; message?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
    && (error as { message?: string }).message?.includes("folder_collections.name_key")) {
    throw new AppError("A collection with that name already exists.", 409, "COLLECTION_NAME_TAKEN");
  }
  throw error;
}
