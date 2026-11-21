# Café des Sports

Application de suivi partagé des achats de café et chocolat entre copains.

## Stockage

Les comptes sont dans **Upstash Redis** (plan gratuit, clé `cafe-des-sports:state`), relié au projet depuis le Marketplace Vercel (variables `KV_REST_API_URL` / `KV_REST_API_TOKEN`). Au premier appel, les données sont reprises une fois depuis l'ancien store Vercel Blob. Tant que ce store est inaccessible, l'API répond 503 pour ne pas écraser les comptes. Pour abandonner la reprise et repartir des soldes de départ : variable `SKIP_BLOB_IMPORT=1`.
