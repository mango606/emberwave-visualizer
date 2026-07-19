/**
 * 재생목록 영속화(IndexedDB)
 * -------------------------------------------------------------
 * objectURL 은 세션이 끝나면 무효가 되므로, 새로고침 후에도 재생목록을
 * 유지하려면 파일 원본(Blob)을 저장해야 한다. localStorage 는 문자열
 * 전용 + 용량 제한(~5MB)이라 불가능하고, IndexedDB 는 Blob 을 구조화
 * 복제로 그대로 담을 수 있어 이 용도에 적합하다.
 *
 * 저장 구조
 *  - 'tracks' 스토어: uid → { name, blob }  (곡 1개당 1레코드)
 *  - 'meta'   스토어: 'order' → uid[]        (재생 순서)
 * 순서 변경·셔플 시에는 order 배열만 다시 쓰므로, 수백 MB 짜리 목록을
 * 통째로 재기록하는 낭비가 없다.
 *
 * 모든 함수는 실패해도 앱 동작을 막지 않도록 호출부에서 catch 한다
 * (시크릿 모드 등 저장 불가 환경 대비).
 */

const DB_NAME = 'emberwave-tracks';
const VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB unsupported'));
      return;
    }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('tracks')) db.createObjectStore('tracks');
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 단일 스토어 트랜잭션 헬퍼 */
async function tx(storeName, mode, run) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    run(t.objectStore(storeName));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/** 곡 1개 저장(같은 uid 면 덮어쓰기) */
export function saveTrack(uid, record) {
  return tx('tracks', 'readwrite', (s) => s.put(record, uid));
}

/** 곡 1개 삭제 */
export function deleteTrack(uid) {
  return tx('tracks', 'readwrite', (s) => s.delete(uid));
}

/** 재생 순서 저장 */
export function saveOrder(uids) {
  return tx('meta', 'readwrite', (s) => s.put(uids, 'order'));
}

/** 저장된 순서와 곡 레코드 전체 로드 */
export async function loadAllTracks() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(['tracks', 'meta'], 'readonly');
    const store = t.objectStore('tracks');
    const keysReq = store.getAllKeys();
    const valsReq = store.getAll();
    const orderReq = t.objectStore('meta').get('order');
    t.oncomplete = () => {
      const records = new Map();
      keysReq.result.forEach((k, i) => records.set(k, valsReq.result[i]));
      resolve({ order: orderReq.result || [], records });
    };
    t.onerror = () => reject(t.error);
  });
}

/** 저장된 곡·순서 데이터를 모두 삭제(전체 비우기) */
export function clearAllStored() {
  return Promise.all([
    tx('tracks', 'readwrite', (s) => s.clear()),
    tx('meta', 'readwrite', (s) => s.clear()),
  ]);
}
