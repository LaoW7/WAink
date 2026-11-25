import type { Locale } from "./i18n";
import type { ScanReply } from "./scan";

export type ScanSource = "camera" | "photo";

export type ScanOutcome =
  | { status: "completed"; reply: ScanReply }
  | { status: "failed" | "cancelled"; message: string };

export type HistoryEntry = {
  id: string;
  createdAt: number;
  source: ScanSource;
  model: string;
  lang?: Locale;
  frame: Blob;
  outcome?: ScanOutcome;
};

const DATABASE = "ai-shuang-kui";
const STORE = "scan-history";

function openHistory(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      request.onsuccess = () => request.result.close();
      reject(new Error("浏览器历史存储被占用。"));
    };
  });
}

async function inHistoryStore<T>(
  mode: IDBTransactionMode,
  start: (store: IDBObjectStore) => () => T,
): Promise<T> {
  const db = await openHistory();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      transaction.onabort = () => reject(transaction.error ?? new Error("浏览器历史存储中断。"));
      const readResult = start(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(readResult());
    });
  } finally {
    db.close();
  }
}

export async function saveHistoryFrame(entry: Omit<HistoryEntry, "frame" | "outcome">, image: string) {
  const encoded = image.slice("data:image/jpeg;base64,".length);
  const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  const frame = new Blob([bytes], { type: "image/jpeg" });
  await inHistoryStore("readwrite", (store) => {
    store.add({ ...entry, frame } satisfies HistoryEntry);
    return () => {};
  });
}

export async function saveHistoryOutcome(id: string, outcome: ScanOutcome) {
  await inHistoryStore("readwrite", (store) => {
    const read = store.get(id);
    read.onsuccess = () => {
      const entry = read.result as HistoryEntry | undefined;
      if (entry) store.put({ ...entry, outcome } satisfies HistoryEntry);
    };
    return () => {};
  });
}

export function readScanHistory() {
  return inHistoryStore("readonly", (store) => {
    const read = store.getAll();
    return () => (read.result as HistoryEntry[]).sort((a, b) => b.createdAt - a.createdAt);
  });
}
