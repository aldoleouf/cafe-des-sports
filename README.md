# Café des Sports

Application de suivi partagé des achats de café et chocolat entre copains.

## Stockage

Les comptes sont dans **Upstash Redis** (plan gratuit, clé `cafe-des-sports:state`), relié au projet depuis le Marketplace Vercel (variables `KV_REST_API_URL` / `KV_REST_API_TOKEN`). Au premier appel, les données sont reprises une fois depuis l'ancien store Vercel Blob. Tant que ce store est inaccessible, l'API répond 503 pour ne pas écraser les comptes. Pour abandonner la reprise et repartir des soldes de départ : variable `SKIP_BLOB_IMPORT=1`.

## Alertes de stock

Une notification push est envoyée aux appareils abonnés (onglet Stocks → « Activer les alertes de stock ») quand il reste **moins de 6 jours** de café ou de chocolat du midi, ou **moins de 2 vendredis** de chocolat du vendredi (ou en cas de rupture). Les seuils se règlent avec `alertDays` dans `src/src/lib/stock.js`. La vérification a lieu à chaque enregistrement et chaque matin vers 7 h (Vercel Cron, `vercel.json`). Chaque produit n'est signalé qu'une fois, jusqu'à ce que son stock remonte au-dessus du seuil.

Rien à configurer : les clés de notification sont créées automatiquement et gardées dans Upstash Redis.

Sur iPhone, les notifications ne marchent que depuis l'app ajoutée à l'écran d'accueil (iOS 16.4+).

## Enregistrements simultanés

Chaque appareil envoie la version des comptes sur laquelle il a fait sa saisie (`baseUpdatedAt`). Si quelqu'un a enregistré entre-temps, le serveur répond 409 avec les comptes à jour, et l'application rejoue automatiquement la saisie dessus : aucune saisie n'est écrasée.

## Organisation du code

- `src/src/lib/ledger.js` : calcul des comptes (achat, modification, annulation, membres).
- `src/src/lib/stock.js` : stocks et seuil d'alerte unique (`alertDays`).
- `src/src/lib/recap.js` : image du récapitulatif partagé.
- `src/src/app/components/` : un composant par onglet.
