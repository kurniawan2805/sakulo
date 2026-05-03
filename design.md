# saku.lo Design

## Product Goal

saku.lo adalah PWA local-first untuk mencatat keuangan personal secara cepat, offline, dan sederhana. Tagline: "saku.lo — Local-only, logically organized personal finance manager." Inspirasi utama adalah kesederhanaan Ivy Wallet: user harus bisa menjawab tiga pertanyaan inti tanpa membuka spreadsheet manual.

- Berapa total uang saya sekarang?
- Berapa income, expense, dan net cashflow bulan ini?
- Uang paling banyak keluar untuk kategori atau akun apa?

Tahap awal fokus pada penggunaan lokal di satu device. Cloud sync, Google Sheets, Supabase, auth, dan multi-device conflict handling ditunda sampai flow dasar terasa enak.

## Current Stack

- Frontend: Vite, React, TypeScript
- Local database: Dexie.js di atas IndexedDB
- PWA: manual `manifest.webmanifest` dan `sw.js`
- Styling: CSS custom, mobile-first
- Backend: belum ada
- Auth: belum ada
- Sync: belum ada

## Architecture

```text
React PWA
  -> src/App.tsx       UI, forms, tabs
  -> src/db.ts         Dexie schema, seed data, ID/timestamp helpers
  -> src/money.ts      balance, filter, report calculations
  -> IndexedDB         persistent local storage
```

Prinsip arsitektur:

- Local-first: semua data tersimpan di browser user melalui IndexedDB.
- Offline-ready: app shell bisa dibuka offline melalui service worker.
- Sync-ready: setiap entity punya `id`, `createdAt`, dan `updatedAt` agar nanti bisa disinkronkan.
- Minimal abstraction: UI masih di `App.tsx` supaya MVP cepat, logic kalkulasi dipisah ke `money.ts` agar tidak tercampur dengan rendering.

## Main Screens

### Dashboard

Dashboard adalah layar report ringkas.

Komponen utama:

- Total balance atau balance akun terpilih
- Filter report
- Income sesuai filter
- Expense sesuai filter
- Net cashflow sesuai filter
- Top expense categories
- Recent filtered log

Filter dashboard:

- Month
- Account
- Category
- Transaction type: all, income, expense, transfer

Catatan behavior:

- Transfer tidak dihitung sebagai income/expense/net cashflow.
- Jika filter akun aktif, hero balance menampilkan balance akun tersebut.
- Jika filter akun kosong, hero balance menampilkan total balance semua akun aktif.

### Log

Log adalah layar operasional untuk input dan review transaksi.

Fitur:

- Tambah income
- Tambah expense
- Tambah transfer antar akun
- Filter log berdasarkan bulan, akun, kategori, dan tipe
- Delete transaksi
- List transaksi urut terbaru

Validasi transaksi:

- Amount wajib lebih dari 0.
- Income/expense wajib punya `accountId` dan `categoryId`.
- Transfer wajib punya `fromAccountId` dan `toAccountId`.
- Transfer tidak boleh dari dan ke akun yang sama.

### Akun

Akun adalah layar untuk mengelola bank/dompet.

Fitur:

- Tambah akun
- Edit akun
- Archive akun
- Set initial balance
- Set primary currency: IDR, SAR, or USD
- Pilih tipe akun: cash, bank, ewallet, card
- Pilih warna akun
- Lihat current balance per akun

Catatan behavior:

- Akun tidak di-hard-delete, tapi di-archive.
- Archive lebih aman karena transaksi lama tetap bisa merujuk ke akun tersebut.

## Data Model

### Account

```ts
type PrimaryCurrency = 'IDR' | 'SAR' | 'USD'

type Account = {
  id: string
  name: string
  type: 'cash' | 'bank' | 'ewallet' | 'card'
  color: string
  initialBalance: number // minor units for the primary currency
  archived?: boolean
  createdAt: string
  updatedAt: string
}
```

### Category

```ts
type Category = {
  id: string
  name: string
  type: 'income' | 'expense'
  color: string
  icon: string
  createdAt: string
  updatedAt: string
}
```

### Transaction

```ts
type BaseTransaction = {
  id: string
  amount: number // minor units for the primary currency
  date: string
  note: string
  createdAt: string
  updatedAt: string
}

type TransactionType = 'income' | 'expense' | 'transfer'

type IncomeExpenseTransaction = BaseTransaction & {
  type: 'income' | 'expense'
  accountId: string
  categoryId: string
}

type TransferTransaction = BaseTransaction & {
  type: 'transfer'
  fromAccountId: string
  toAccountId: string
}

type MoneyTransaction = IncomeExpenseTransaction | TransferTransaction
```

Rules:

- `income`: uses `accountId` and `categoryId`.
- `expense`: uses `accountId` and `categoryId`.
- `transfer`: uses `fromAccountId` and `toAccountId`, no category.
- Discriminated unions make invalid transaction shapes fail at TypeScript compile time.

### Settings

```ts
type AppSetting = {
  key: 'primaryCurrency'
  value: PrimaryCurrency
  updatedAt: string
}
```

Amount storage:

- Money values are stored as integers in the minor unit of the primary currency.
- IDR has 0 fraction digits, so `50000` means Rp50,000.
- USD and SAR have 2 fraction digits, so `1234` means 12.34.
- This avoids JavaScript floating point errors in financial calculations.

Primary currency behavior:

- Primary currency is intended to be chosen before meaningful data entry.
- Once transactions exist, the UI locks primary currency changes.
- Changing primary currency after transactions exist is destructive for existing data visibility unless a full database migration/conversion is performed.

## Balance Calculation

Balance akun dihitung, bukan disimpan sebagai nilai final.

Formula per akun:

```text
balance = initialBalance
  + income assigned to account
  - expense assigned to account
  - transfer where account is fromAccount
  + transfer where account is toAccount
```

Total balance:

```text
totalBalance = sum(balance of all active accounts)
```

Report cashflow:

```text
income = sum(income transactions matching filters)
expense = sum(expense transactions matching filters)
net = income - expense
```

Transfer excluded dari report cashflow karena transfer hanya memindahkan uang antar akun, bukan pemasukan/pengeluaran aktual.

Transfer integrity rules:

- A transfer is a single atomic transaction record.
- The same `amount` is debited from `fromAccountId` and credited to `toAccountId` using the same `createdAt`/`updatedAt` timestamp.
- UI must prevent selecting the same account for `fromAccountId` and `toAccountId`.
- Save logic must still validate `fromAccountId !== toAccountId` as a data-integrity guard.

## IndexedDB Schema

Dexie database name:

```text
money-manager-local
```

Tables:

```ts
accounts: 'id, name, type, archived, createdAt, updatedAt'
categories: 'id, name, type, createdAt, updatedAt'
transactions: 'id, type, date, amount, accountId, categoryId, [fromAccountId+toAccountId], createdAt, updatedAt'
settings: 'key, updatedAt'
```

Performance notes:

- `date` is indexed for month/date-range queries.
- `amount` is indexed for future amount-range filtering.
- `[fromAccountId+toAccountId]` supports transfer lookups.

Default seed:

- Account: Cash
- Setting: primaryCurrency = IDR
- Expense categories: Food, Transport, Shopping, Bills, Health, Other
- Income categories: Salary, Gift, Other

## PWA Design

PWA files:

- `public/manifest.webmanifest`
- `public/sw.js`
- service worker registration in `src/main.tsx`

Current service worker strategy:

- Cache app shell during install.
- Runtime cache GET requests.
- Fallback to cached request or `/` when offline.

Known limitation:

- Current manual service worker is basic. For production, consider Serwist or Workbox-style caching to handle asset revisioning more safely.
- `body` uses `overscroll-behavior-y: contain` to reduce browser pull-to-refresh interference in PWA mode.

## UI Direction

Visual direction:

- Mobile-first
- Warm Professional light mode: `#FDFCF7` background, `#FFFFFF` surfaces, `#1A1C1E` hero/text primary
- Deep Charcoal dark mode: `#111318` background, `#1A1C1E` surfaces, `#D1E4FF` text primary
- Dark high-contrast hero
- Rounded cards
- Strong financial colors: green for income, red for expense, blue for transfer
- Simple tab navigation

Interaction priorities:

- Adding a transaction should be fast.
- Filters should be visible and predictable.
- Account balances should be understandable without manual recalculation.
- Transfer should feel separate from income/expense.

Technical UI rules:

- All money inputs must use `<input type="number" inputmode="decimal" />` to trigger numeric keypads on mobile.
- Amount input should provide semantic focus feedback: red for expense, green for income, blue for transfer.
- Do not rely on color alone: income uses `+`, expense uses `-`, and transfer uses `↔`.

Styling direction:

- Current MVP uses CSS variables and custom CSS.
- Near-term UI migration target is shadcn/ui with Tailwind, starting from `button`, `card`, `input`, `select`, `tabs`, and `label`.
- Date picker can be introduced after shadcn base components are in place.

## Current Limitations

- No cloud sync.
- No auth.
- No import/export yet.
- No recurring transactions.
- No budget feature yet.
- No custom categories UI yet.
- No edit transaction yet.
- Primary currency exists, but per-transaction multi-currency does not exist yet.
- No encryption at rest beyond browser storage.
- Local data can be lost if browser storage is cleared.

## Roadmap

### Near Term

- Export JSON/CSV for local data backup
- Edit transaction
- Manage categories
- Budget per category/month
- Better month navigation
- Migrate base UI components to shadcn/ui
- Empty-state onboarding

### Medium Term

- Charts with Recharts or Chart.js
- Recurring transactions
- Search transactions
- Account archive visibility toggle
- Soft delete transactions
- Data validation layer
- Balance snapshots for large datasets. If transactions exceed 5,000, store monthly starting balances to avoid recalculating the full historical ledger on every app load.

### Sync Options

Option A: Google Sheets sync

- Good for personal spreadsheet-friendly workflow.
- Needs backend/serverless function to protect credentials.
- Best as export/sync layer, not long-term relational database.

Option B: Supabase sync

- Better for multi-user and relational finance data.
- Provides auth, Postgres, RLS, and API.
- More scalable than Google Sheets.

Option C: Local-only plus manual backup

- Simplest and privacy-friendly.
- User exports/imports JSON or CSV manually.

Recommended path:

```text
Local-only MVP
  -> JSON/CSV backup
  -> optional Google Sheets sync for personal use
  -> Supabase if app becomes multi-user
```

## Security Notes

- Do not put Google service account keys in frontend code.
- Do not store secrets in `.env` committed to git.
- For future cloud sync, use server-side credentials and per-user authorization.
- For sensitive data, consider client-side encryption with Web Crypto before cloud sync.

## Development Commands

```bash
npm run dev
npm run lint
npm run build
```

Expose local network during development:

```bash
npm run dev -- --host 0.0.0.0
```
