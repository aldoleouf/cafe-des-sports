# Café des Sports

Application de suivi partagé des achats de café et chocolat entre copains.

## Stockage

Les comptes sont dans **Upstash Redis** (plan gratuit, clé `cafe-des-sports:state`), relié au projet depuis le Marketplace Vercel (variables `KV_REST_API_URL` / `KV_REST_API_TOKEN`). Au premier appel, les données sont reprises une fois depuis l'ancien store Vercel Blob. Tant que ce store est inaccessible, l'API répond 503 pour ne pas écraser les comptes. Pour abandonner la reprise et repartir des soldes de départ : variable `SKIP_BLOB_IMPORT=1`.

## Alertes de stock

Quand un produit a **moins de 6 jours de consommation estimés** (ou est en rupture), une notification push est envoyée aux appareils abonnés (onglet Stocks → « Activer les alertes de stock »). Le seuil se règle avec `ALERT_DAYS` dans `src/src/lib/stock.js`. La vérification a lieu à chaque enregistrement et chaque matin vers 7 h (Vercel Cron, `vercel.json`). Chaque produit n'est signalé qu'une fois, jusqu'à ce que son stock remonte au-dessus du seuil.

Rien à configurer : les clés de notification sont créées automatiquement et gardées dans Upstash Redis.

Sur iPhone, les notifications ne marchent que depuis l'app ajoutée à l'écran d'accueil (iOS 16.4+).
