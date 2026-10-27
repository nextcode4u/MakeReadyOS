// Device-local protection, not protection from a compromised signed-in app.
async function accountKey(owner: string): Promise<CryptoKey> {
  if (!owner || !crypto.subtle) throw new Error("Protected device storage is unavailable.");
  const candidate = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("makereadyos-pending-save-keys", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("keys");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<CryptoKey>((resolve, reject) => {
      const tx = db.transaction("keys", "readwrite");
      const store = tx.objectStore("keys");
      const request = store.get(owner);
      let key: CryptoKey;
      request.onsuccess = () => { key = request.result ?? candidate; if (!request.result) store.put(key, owner); };
      tx.oncomplete = () => resolve(key);
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("Could not save the device key."));
    });
  } finally { db.close(); }
}
const aad = (owner: string, item: string) => new TextEncoder().encode(JSON.stringify([location.origin, owner, item]));
export async function protectPendingSave(owner: string, item: string, input: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(owner, item) }, await accountKey(owner), new TextEncoder().encode(JSON.stringify(input)));
  return { iv: Array.from(iv), encrypted };
}
export async function openPendingSave(owner: string, item: string, payload: Awaited<ReturnType<typeof protectPendingSave>>) {
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(payload.iv), additionalData: aad(owner, item) }, await accountKey(owner), payload.encrypted);
  return JSON.parse(new TextDecoder().decode(clear));
}
