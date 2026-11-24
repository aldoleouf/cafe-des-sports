// Accès à Upstash Redis par son API REST (aucune dépendance).
// L'intégration Upstash du Marketplace Vercel crée KV_REST_API_URL / KV_REST_API_TOKEN ;
// une base créée sur upstash.com utilise UPSTASH_REDIS_REST_URL / _TOKEN.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export async function redis(...command) {
  if (!URL_ || !TOKEN) throw Object.assign(new Error('Base Upstash Redis non reliée au projet.'), { status: 503 });
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw new Error(`Upstash : ${data.error || r.status}`);
  return data.result;
}

export async function getJson(key) {
  const raw = await redis('GET', key);
  return raw == null ? null : JSON.parse(raw);
}

export const setJson = (key, value) => redis('SET', key, JSON.stringify(value));

// Lit une clé ; si elle n'existe pas encore, tente une seule fois de reprendre
// les données de l'ancien store Vercel Blob (importFn).
// - importFn renvoie les données, ou null s'il n'y avait rien dans Blob.
// - Si Blob est inaccessible (store suspendu…), on renvoie une erreur 503 au lieu
//   d'une liste vide, pour que personne n'écrase les anciennes données par erreur.
// - SKIP_BLOB_IMPORT=1 dans Vercel : on abandonne la reprise et on repart de zéro.
export async function loadOrImport(key, importFn) {
  const current = await getJson(key);
  if (current != null) return current;
  if (process.env.SKIP_BLOB_IMPORT === '1' || !process.env.BLOB_READ_WRITE_TOKEN) return null;
  let imported;
  try {
    imported = await importFn();
  } catch (e) {
    console.error('Reprise Blob impossible :', e && e.message);
    throw Object.assign(
      new Error('Les données sont en cours de transfert vers le nouveau stockage. Réessaie un peu plus tard.'),
      { status: 503 },
    );
  }
  if (imported != null) await setJson(key, imported);
  return imported;
}

// Verrou court pour que deux enregistrements simultanés ne se croisent pas
// entre la vérification de version et l'écriture.
export async function withLock(key, fn, { ttlMs = 5000, waitMs = 4000 } = {}) {
  const token = Math.random().toString(36).slice(2);
  const deadline = Date.now() + waitMs;
  while ((await redis('SET', key, token, 'NX', 'PX', ttlMs)) !== 'OK') {
    if (Date.now() > deadline) throw Object.assign(new Error('Enregistrement en cours ailleurs, réessaie.'), { status: 503 });
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  try {
    return await fn();
  } finally {
    if ((await redis('GET', key).catch(() => null)) === token) await redis('DEL', key).catch(() => {});
  }
}
