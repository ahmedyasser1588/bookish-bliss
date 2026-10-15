import { openDB } from "idb";

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
};

const dbp = () =>
  openDB("maktaba", 1, {
    upgrade(db) {
      db.createObjectStore("books", { keyPath: "id" });
    },
  });

export const getBooks = async () => ((await (await dbp()).getAll("books")) as Book[]);
export const getBook = async (id: string) => (await (await dbp()).get("books", id)) as Book | undefined;
export const putBook = async (b: Book) => (await dbp()).put("books", b);
export const deleteBook = async (id: string) => (await dbp()).delete("books", id);
export const updateBook = async (id: string, patch: Partial<Book>) => {
  const b = await getBook(id);
  if (b) await putBook({ ...b, ...patch });
};
