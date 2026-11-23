# Café des Sports

Application de suivi partagé des achats de café et chocolat entre copains.

## Stockage

Les comptes sont dans **Upstash Redis** (plan gratuit, clé `cafe-des-sports:state`), relié au projet depuis le Marketplace Vercel (variables `KV_REST_API_URL` / `KV_REST_API_TOKEN`). Au premier appel, les données sont reprises une fois depuis l'ancien store Vercel Blob. Tant que ce store est inaccessible, l'API répond 503 pour ne pas écraser les comptes. Pour abandonner la reprise et repartir des soldes de départ : variable `SKIP_BLOB_IMPORT=1`.

## Alertes de stock

Quand un produit n'a plus qu'**un jour de stock estimé** (ou est en rupture), une notification push est envoyée aux appareils abonnés (onglet Stocks → « Activer les alertes de stock »). La vérification a lieu à chaque enregistrement et chaque matin vers 7 h (Vercel Cron, `vercel.json`). Chaque produit n'est signalé qu'une fois, jusqu'à ce que son stock remonte.

Variables Vercel à ajouter :
- `VAPID_PUBLIC_KEY` et `VAPID_PRIVATE_KEY` : générées avec `npx web-push generate-vapid-keys`
- `CRON_SECRET` (conseillé) : n'importe quelle chaîne aléatoire, pour que seul Vercel puisse lancer la vérification
- `VAPID_SUBJECT` (facultatif) : `mailto:…` ou l'URL du site

Sur iPhone, les notifications ne marchent que depuis l'app ajoutée à l'écran d'accueil (iOS 16.4+).
