import { openDB } from "idb";
import { supabase } from "@/integrations/supabase/client";
import { getScope } from "./account";
import type { Json } from "@/integrations/supabase/types";

export type Highlight = { id: string; text: string; color: string; note?: string | undefined; createdAt: number };
export type Bookmark = { id: string; pos: number; label: string; createdAt: number };
export type Book = {
  id: string;
  title: string;
  author: string;
  format: string;
  size: number;
  cover?: string | undefined;
  html: string;
  /** original file, kept for PDFs so pages can be shown exactly as printed */
  file?: Blob | undefined;
  pages?: number | undefined;
  dir: "rtl" | "ltr";
  wordCount: number;
  progress: number;
  favorite: boolean;
  category?: string | undefined;
  addedAt: number;
  lastOpened?: number | undefined;
  highlights: Highlight[];
  bookmarks?: Bookmark[] | undefined;
  /** PDF page drawings as PNG data URLs, keyed by page number */
  drawings?: Record<number, string> | undefined;
  /** PDF page text notes keyed by page number */
  pageNotes?: Record<number, string> | undefined;
  pending?: boolean;
  cloudFile?: boolean;
};

const dbp = (scope = getScope()) =>
  openDB(scope === "guest" ? "maktaba" : `maktaba:${scope}`, 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("books")) db.createObjectStore("books", { keyPath: "id" });
      if (!db.objectStoreNames.contains("deleted")) db.createObjectStore("deleted");
    },
  });

export const getBooks = async () => ((await (await dbp()).getAll("books")) as Book[]);
export const getBook = async (id: string) => {
  const scope = getScope(); const db = await dbp(scope);
  let book = await db.get("books", id) as Book | undefined;
  if (book?.cloudFile && !book.file && scope !== "guest") {
    const { data, error } = await supabase.storage.from("books").download(`${scope}/${id}.pdf`);
    if (error) throw new Error("تعذر تحميل الكتاب؛ اتصل بالإنترنت وحاول تاني.");
    book = { ...book, file: data }; await db.put("books", book);
  }
  return book;
};
export const putBook = async (b: Book) => {
  const scope = getScope();
  await (await dbp(scope)).put("books", { ...b, pending: scope !== "guest" }); scheduleSync(scope);
};
export const deleteBook = async (id: string) => {
  const scope = getScope(); const db = await dbp(scope);
  const tx = db.transaction(["books", "deleted"], "readwrite");
  await tx.objectStore("books").delete(id);
  if (scope !== "guest") await tx.objectStore("deleted").put(true, id);
  await tx.done; scheduleSync(scope);
};
export const updateBook = async (id: string, patch: Partial<Book>) => {
  const scope = getScope(); const db = await dbp(scope);
  const tx = db.transaction("books", "readwrite");
  const b = await tx.store.get(id) as Book | undefined;
  if (b) await tx.store.put({ ...b, ...patch, pending: scope !== "guest" });
  await tx.done; scheduleSync(scope);
};

let timer: ReturnType<typeof setTimeout> | undefined;
let syncing: Promise<void> | undefined;
const announce = (status: string) => window.dispatchEvent(new CustomEvent("library-sync", { detail: status }));
function scheduleSync(scope: string) {
  if (scope === "guest") return;
  announce("pending"); clearTimeout(timer);
  timer = setTimeout(() => { void syncLibrary().catch(() => {}); }, 1000);
}
export async function syncLibrary(): Promise<void> {
  if (syncing) { await syncing; return syncLibrary(); }
  const scope = getScope(); if (scope === "guest") return;
  syncing = syncScope(scope);
  try { await syncing; } finally { syncing = undefined; }
}
async function syncScope(scope: string) {
  announce("saving");
  try {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || auth.user?.id !== scope) throw new Error("سجّل الدخول لحفظ الكتب.");
    const db = await dbp(scope);
    for (const key of await db.getAllKeys("deleted")) {
      if (getScope() !== scope) throw new Error("Account changed");
      const id = String(key);
      const { error } = await supabase.from("books").delete().eq("user_id", scope).eq("id", id);
      if (error) throw error;
      const removed = await supabase.storage.from("books").remove([`${scope}/${id}.pdf`]);
      if (removed.error) throw removed.error;
      await db.delete("deleted", key);
    }
    for (const book of await db.getAll("books") as Book[]) {
      if (getScope() !== scope) throw new Error("Account changed");
      if (!book.pending) continue;
      const { file, pending: _pending, cloudFile: _cloudFile, ...metadata } = book;
      const path = file || book.cloudFile ? `${scope}/${book.id}.pdf` : null;
      if (file && !book.cloudFile) {
        const { error } = await supabase.storage.from("books").upload(path || "", file, { upsert: true, contentType: "application/pdf" });
        if (error) throw error;
      }
      const { error } = await supabase.from("books").upsert({ id: book.id, user_id: scope, metadata: metadata as unknown as Json, file_path: path, updated_at: new Date().toISOString() });
      if (error) throw error;
      const tx = db.transaction("books", "readwrite");
      const current = await tx.store.get(book.id) as Book | undefined;
      if (current) {
        const { file: _file, pending: _p, cloudFile: _c, ...currentMeta } = current;
        await tx.store.put({ ...current, cloudFile: !!path, pending: JSON.stringify(currentMeta) !== JSON.stringify(metadata) });
      }
      await tx.done;
    }
    for (let start = 0; ; start += 1000) {
      if (getScope() !== scope) throw new Error("Account changed");
      const { data, error } = await supabase.from("books").select("id, metadata, file_path").eq("user_id", scope).order("id").range(start, start + 999);
      if (error) throw error;
      for (const row of data) {
        const tx = db.transaction(["books", "deleted"], "readwrite");
        const local = await tx.objectStore("books").get(row.id) as Book | undefined;
        const tombstone = await tx.objectStore("deleted").get(row.id);
        if (!local?.pending && !tombstone) await tx.objectStore("books").put({ ...row.metadata as unknown as Book, id: row.id, file: local?.file, cloudFile: !!row.file_path, pending: false });
        await tx.done;
      }
      if (data.length < 1000) break;
    }
    announce("saved");
    if ((await db.getAll("books") as Book[]).some(b => b.pending)) scheduleSync(scope);
  } catch (e) { announce("error"); throw e; }
}
export const legacyCount = async () => (await dbp("guest")).count("books");
export async function importLegacyBooks() {
  if (getScope() === "guest") return;
  for (const book of await (await dbp("guest")).getAll("books") as Book[]) await putBook({ ...book, cloudFile: false });
  await syncLibrary();
}
