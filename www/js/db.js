// db.js — Capa de persistencia offline (IndexedDB)
// Todo el almacenamiento vive en el propio dispositivo. No requiere internet.

const DB_NAME = 'pipeline_supervisor_db';
const DB_VERSION = 1;
const STORES = ['tramos', 'inspecciones', 'eventos'];

let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('tramos')) {
        const s = db.createObjectStore('tramos', { keyPath: 'id' });
        s.createIndex('facilidad', 'facilidad');
        s.createIndex('tipo', 'tipo');
      }
      if (!db.objectStoreNames.contains('inspecciones')) {
        const s = db.createObjectStore('inspecciones', { keyPath: 'id' });
        s.createIndex('tramoId', 'tramoId');
        s.createIndex('fecha', 'fecha');
        s.createIndex('resultado', 'resultado');
      }
      if (!db.objectStoreNames.contains('eventos')) {
        const s = db.createObjectStore('eventos', { keyPath: 'id' });
        s.createIndex('tramoId', 'tramoId');
        s.createIndex('fecha', 'fecha');
        s.createIndex('estado', 'estado');
        s.createIndex('severidad', 'severidad');
      }
    };

    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = (e) => reject(e.target.error);
  });
}

function uid() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

async function put(store, obj) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(obj);
    tx.oncomplete = () => resolve(obj);
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function getAll(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function getOne(store, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function remove(store, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function exportAll() {
  const data = {};
  for (const s of STORES) data[s] = await getAll(s);
  data._meta = { exportedAt: new Date().toISOString(), version: DB_VERSION };
  return data;
}

async function importAll(data) {
  const db = await openDB();
  for (const s of STORES) {
    if (!Array.isArray(data[s])) continue;
    const tx = db.transaction(s, 'readwrite');
    const store = tx.objectStore(s);
    for (const item of data[s]) store.put(item);
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
  }
  return true;
}

const DB = { openDB, uid, put, getAll, getOne, remove, exportAll, importAll, STORES };
window.DB = DB;
