import Dexie, { type Table } from 'dexie'

export type CashflowType = 'income' | 'expense'
export type TransactionType = CashflowType | 'transfer'
export type PrimaryCurrency = 'IDR' | 'SAR' | 'USD'
export type ThemePreference = 'light' | 'dark'
export type LanguagePreference = 'id' | 'en'

export type Account = {
  id: string
  name: string
  type: 'cash' | 'bank' | 'ewallet' | 'card'
  color: string
  initialBalance: number
  archived?: boolean
  createdAt: string
  updatedAt: string
}

export type Category = {
  id: string
  name: string
  type: CashflowType
  color: string
  icon: string
  createdAt: string
  updatedAt: string
}

type BaseTransaction = {
  id: string
  amount: number
  date: string
  note: string
  createdAt: string
  updatedAt: string
}

export type IncomeExpenseTransaction = BaseTransaction & {
  type: CashflowType
  accountId: string
  categoryId: string
}

export type TransferTransaction = BaseTransaction & {
  type: 'transfer'
  fromAccountId: string
  toAccountId: string
}

export type MoneyTransaction = IncomeExpenseTransaction | TransferTransaction

export type AppSetting =
  | { key: 'primaryCurrency'; value: PrimaryCurrency; updatedAt: string }
  | { key: 'theme'; value: ThemePreference; updatedAt: string }
  | { key: 'language'; value: LanguagePreference; updatedAt: string }

class MoneyManagerDb extends Dexie {
  accounts!: Table<Account, string>
  categories!: Table<Category, string>
  transactions!: Table<MoneyTransaction, string>
  settings!: Table<AppSetting, string>

  constructor() {
    super('money-manager-local')

    this.version(1).stores({
      accounts: 'id, name, type, createdAt, updatedAt',
      categories: 'id, name, type, createdAt, updatedAt',
      transactions: 'id, type, date, accountId, categoryId, createdAt, updatedAt',
    })

    this.version(2).stores({
      accounts: 'id, name, type, archived, createdAt, updatedAt',
      categories: 'id, name, type, createdAt, updatedAt',
      transactions:
        'id, type, date, accountId, categoryId, fromAccountId, toAccountId, createdAt, updatedAt',
    })

    this.version(3).stores({
      accounts: 'id, name, type, archived, createdAt, updatedAt',
      categories: 'id, name, type, createdAt, updatedAt',
      transactions:
        'id, type, date, amount, accountId, categoryId, [fromAccountId+toAccountId], createdAt, updatedAt',
      settings: 'key, updatedAt',
    })
  }
}

export const db = new MoneyManagerDb()

const now = () => new Date().toISOString()

const categorySeed: Array<Omit<Category, 'createdAt' | 'updatedAt'>> = [
  { id: 'cat-food', name: 'Food', type: 'expense', color: '#f97316', icon: '🍜' },
  { id: 'cat-transport', name: 'Transport', type: 'expense', color: '#06b6d4', icon: '🚌' },
  { id: 'cat-shopping', name: 'Shopping', type: 'expense', color: '#a855f7', icon: '🛍️' },
  { id: 'cat-bills', name: 'Bills', type: 'expense', color: '#ef4444', icon: '💡' },
  { id: 'cat-health', name: 'Health', type: 'expense', color: '#22c55e', icon: '🩺' },
  { id: 'cat-other-expense', name: 'Other', type: 'expense', color: '#64748b', icon: '📦' },
  { id: 'cat-salary', name: 'Salary', type: 'income', color: '#16a34a', icon: '💼' },
  { id: 'cat-gift', name: 'Gift', type: 'income', color: '#ec4899', icon: '🎁' },
  { id: 'cat-other-income', name: 'Other', type: 'income', color: '#0f766e', icon: '✨' },
]

export async function ensureSeedData() {
  const [accountCount, categoryCount, primaryCurrency, theme, language] = await Promise.all([
    db.accounts.count(),
    db.categories.count(),
    db.settings.get('primaryCurrency'),
    db.settings.get('theme'),
    db.settings.get('language'),
  ])

  const timestamp = now()

  if (accountCount === 0) {
    await db.accounts.add({
      id: 'acc-cash',
      name: 'Cash',
      type: 'cash',
      color: '#1A1C1E',
      initialBalance: 0,
      archived: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  }

  if (categoryCount === 0) {
    await db.categories.bulkAdd(
      categorySeed.map((category) => ({
        ...category,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    )
  }

  if (!primaryCurrency) {
    await db.settings.put({
      key: 'primaryCurrency',
      value: 'IDR',
      updatedAt: timestamp,
    })
  }

  if (!theme) {
    await db.settings.put({
      key: 'theme',
      value: 'dark',
      updatedAt: timestamp,
    })
  }

  if (!language) {
    await db.settings.put({
      key: 'language',
      value: 'id',
      updatedAt: timestamp,
    })
  }
}

export function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

export function getTimestamp() {
  return now()
}
