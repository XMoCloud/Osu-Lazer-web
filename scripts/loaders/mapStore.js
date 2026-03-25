(function () {
  const DB_NAME = 'osuMaps';
  const DB_VERSION = 1;
  const STORE_NAME = 'maps';

  if (window.osuMapStore) return;

  let dbInstance = null;

  function openDB() {
    if (dbInstance) {
      return Promise.resolve(dbInstance);
    }
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = function () {
        dbInstance = req.result;
        dbInstance.onversionchange = function() {
          dbInstance.close();
          dbInstance = null;
        };
        resolve(dbInstance);
      };
      req.onerror = function () { reject(req.error); };
      req.onblocked = function() {};
    });
  }

  async function saveMap(map) {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.oncomplete = () => {
          resolve(true);
        };
        tx.onerror = (event) => { reject(event.target.error); };
        const store = tx.objectStore(STORE_NAME);
        store.put(map);
      });
    } catch (err) {
      return Promise.reject(err);
    }
  }

  async function getAllMaps() {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => { reject(req.error); };
      });
    } catch (err) {
      return Promise.reject(err);
    }
  }

  async function getMap(id) {
    if (!id) return null;
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => { reject(req.error); };
      });
    } catch (err) {
      return Promise.reject(err);
    }
  }

  window.osuMapStore = {
    openDB,
    saveMap,
    getAllMaps,
    getMap
  };
})();

