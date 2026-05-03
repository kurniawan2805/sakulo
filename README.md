# saku.lo

Local-only, logically organized personal finance manager.

saku.lo is a local-first PWA for tracking personal income, expenses, account balances, and transfers between accounts. Data is stored locally in IndexedDB through Dexie, so the app works offline without a backend.

## Features

- Dashboard with filtered income, expense, net cashflow, and top categories
- Transaction log for income, expense, and account transfers
- Account management for cash, bank, e-wallet, and card balances
- Primary currency setting for IDR, SAR, and USD
- Minor-unit money storage to avoid floating point errors
- PWA manifest and service worker for installable/offline app shell
- Tailwind CSS with shadcn-style local UI components

## Development

```bash
npm install
npm run dev
```

Expose on local network:

```bash
npm run dev -- --host 0.0.0.0
```

Verify production build:

```bash
npm run lint
npm run build
```

## Notes

- Data is local-only and can be lost if browser storage is cleared.
- Export/backup is planned as a near-term feature.
- Primary currency is locked after transactions exist to avoid misleading existing balances.
