import type { ChatMessage } from "./chatTypes.ts"
import { CHAT_HISTORY_MAX_MESSAGES_PER_PEER } from "./chatConfig.ts"
import { pruneHistoryForStorage } from "./messageDelivery.ts"

export const CHAT_HISTORY_DB_NAME = "chat_history_db"
export const CHAT_HISTORY_STORE_NAME = "histories"

export function openHistoryDb(
  dbName: string = CHAT_HISTORY_DB_NAME,
  storeName: string = CHAT_HISTORY_STORE_NAME,
): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB is not available"))
      return
    }

    const request = window.indexedDB.open(dbName, 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: "userId" })
      }
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open IndexedDB"))
    }
  })
}

export async function readHistory(
  currentUserId: string,
  storeName: string = CHAT_HISTORY_STORE_NAME,
  dbName: string = CHAT_HISTORY_DB_NAME,
): Promise<Record<string, ChatMessage[]> | null> {
  const db = await openHistoryDb(dbName, storeName)

  return await new Promise<Record<string, ChatMessage[]> | null>((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly")
    const store = tx.objectStore(storeName)
    const request = store.get(currentUserId)

    request.onsuccess = () => {
      const record = request.result as { userId: string, messagesByPeer: Record<string, ChatMessage[]> } | undefined
      resolve(record?.messagesByPeer ?? null)
    }

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to read history"))
    }

    tx.oncomplete = () => {
      db.close()
    }

    tx.onabort = () => {
      reject(tx.error ?? new Error("Read transaction aborted"))
      db.close()
    }
  })
}

export async function writeHistory(
  currentUserId: string,
  nextMessagesByPeer: Record<string, ChatMessage[]>,
  storeName: string = CHAT_HISTORY_STORE_NAME,
  dbName: string = CHAT_HISTORY_DB_NAME,
  maxPerPeer: number = CHAT_HISTORY_MAX_MESSAGES_PER_PEER,
): Promise<void> {
  const db = await openHistoryDb(dbName, storeName)
  const messagesByPeer = pruneHistoryForStorage(nextMessagesByPeer, maxPerPeer)

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite")
    const store = tx.objectStore(storeName)
    store.put({
      userId: currentUserId,
      messagesByPeer,
      updatedAt: Date.now(),
    })

    tx.oncomplete = () => {
      db.close()
      resolve()
    }

    tx.onerror = () => {
      reject(tx.error ?? new Error("Failed to persist history"))
      db.close()
    }

    tx.onabort = () => {
      reject(tx.error ?? new Error("Write transaction aborted"))
      db.close()
    }
  })
}
