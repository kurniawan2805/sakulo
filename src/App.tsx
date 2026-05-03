import { useEffect, useMemo, useState, type FormEvent } from 'react'
import './App.css'
import {
  db,
  getTimestamp,
  makeId,
  type Account,
  type CashflowType,
  type Category,
  type MoneyTransaction,
  type PrimaryCurrency,
  type TransactionType,
} from './db'
import { currencyOptions, formatMinorMoney, minorToMajorInput, parseMajorToMinor } from './currency'
import {
  calculateAccountBalance,
  filterTransactions,
  getReportTotals,
  getTopCategories,
  type ReportFilters,
} from './money'

type Tab = 'dashboard' | 'log' | 'accounts'

type TransactionForm = {
  type: TransactionType
  amount: string
  date: string
  accountId: string
  categoryId: string
  fromAccountId: string
  toAccountId: string
  note: string
}

type AccountForm = {
  id: string
  name: string
  type: Account['type']
  color: string
  initialBalance: string
}

type Snapshot = {
  accounts: Account[]
  categories: Category[]
  transactions: MoneyTransaction[]
}

type FormatMoney = (value: number) => string

const today = () => new Date().toISOString().slice(0, 10)
const thisMonth = () => today().slice(0, 7)

const emptyAccountForm: AccountForm = {
  id: '',
  name: '',
  type: 'bank',
  color: '#0061A4',
  initialBalance: '0',
}

function App() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [snapshot, setSnapshot] = useState<Snapshot>({ accounts: [], categories: [], transactions: [] })
  const [primaryCurrency, setPrimaryCurrency] = useState<PrimaryCurrency>('IDR')
  const [filters, setFilters] = useState<ReportFilters>({
    month: thisMonth(),
    accountId: '',
    categoryId: '',
    type: 'all',
  })
  const [transactionForm, setTransactionForm] = useState<TransactionForm>({
    type: 'expense',
    amount: '',
    date: today(),
    accountId: '',
    categoryId: '',
    fromAccountId: '',
    toAccountId: '',
    note: '',
  })
  const [accountForm, setAccountForm] = useState<AccountForm>(emptyAccountForm)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [accounts, categories, transactions] = await Promise.all([
        db.accounts.toArray(),
        db.categories.toArray(),
        db.transactions.orderBy('date').reverse().toArray(),
      ])
      const setting = await db.settings.get('primaryCurrency')
      if (cancelled) return

      const activeAccounts = accounts.filter((account) => !account.archived)
      if (setting) setPrimaryCurrency(setting.value)
      setSnapshot({ accounts, categories, transactions })
      setTransactionForm((current) => ({
        ...current,
        accountId: current.accountId || activeAccounts[0]?.id || '',
        fromAccountId: current.fromAccountId || activeAccounts[0]?.id || '',
        toAccountId: current.toAccountId || activeAccounts[1]?.id || activeAccounts[0]?.id || '',
        categoryId:
          current.categoryId ||
          categories.find((category) => category.type === current.type)?.id ||
          '',
      }))
    }

    load()
    const interval = window.setInterval(load, 400)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  const activeAccounts = useMemo(
    () => snapshot.accounts.filter((account) => !account.archived),
    [snapshot.accounts],
  )

  const cashflowCategories = useMemo(
    () => snapshot.categories.filter((category) => transactionForm.type !== 'transfer' && category.type === transactionForm.type),
    [snapshot.categories, transactionForm.type],
  )

  const accountBalances = useMemo(
    () => new Map(snapshot.accounts.map((account) => [
      account.id,
      calculateAccountBalance(account, snapshot.transactions),
    ])),
    [snapshot.accounts, snapshot.transactions],
  )

  const totalBalance = useMemo(
    () => activeAccounts.reduce((sum, account) => sum + (accountBalances.get(account.id) || 0), 0),
    [accountBalances, activeAccounts],
  )

  const filteredTransactions = useMemo(
    () => filterTransactions(snapshot.transactions, filters),
    [filters, snapshot.transactions],
  )

  const reportTotals = useMemo(() => getReportTotals(filteredTransactions), [filteredTransactions])
  const topCategories = useMemo(
    () => getTopCategories(filteredTransactions, snapshot.categories).slice(0, 5),
    [filteredTransactions, snapshot.categories],
  )
  const heroBalance = filters.accountId ? accountBalances.get(filters.accountId) || 0 : totalBalance
  const selectedAccountName = activeAccounts.find((account) => account.id === filters.accountId)?.name
  const formatMoney = (value: number) => formatMinorMoney(value, primaryCurrency)
  const isCurrencyLocked = snapshot.transactions.length > 0

  function updateTransactionType(type: TransactionType) {
    const nextCategory = type === 'transfer'
      ? ''
      : snapshot.categories.find((category) => category.type === type)?.id || ''
    setTransactionForm((current) => ({ ...current, type, categoryId: nextCategory }))
  }

  async function saveTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const amount = parseMajorToMinor(transactionForm.amount, primaryCurrency)
    if (!amount || amount <= 0) return

    const timestamp = getTimestamp()
    const base = {
      id: makeId('txn'),
      type: transactionForm.type,
      amount,
      date: transactionForm.date,
      note: transactionForm.note.trim(),
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    if (transactionForm.type === 'transfer') {
      if (!transactionForm.fromAccountId || !transactionForm.toAccountId) return
      if (transactionForm.fromAccountId === transactionForm.toAccountId) return
      await db.transactions.add({
        ...base,
        type: 'transfer',
        fromAccountId: transactionForm.fromAccountId,
        toAccountId: transactionForm.toAccountId,
      })
    } else {
      if (!transactionForm.accountId || !transactionForm.categoryId) return
      await db.transactions.add({
        ...base,
        type: transactionForm.type,
        accountId: transactionForm.accountId,
        categoryId: transactionForm.categoryId,
      })
    }

    setTransactionForm((current) => ({ ...current, amount: '', note: '' }))
  }

  async function deleteTransaction(id: string) {
    await db.transactions.delete(id)
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const timestamp = getTimestamp()
    const payload = {
      name: accountForm.name.trim(),
      type: accountForm.type,
      color: accountForm.color,
      initialBalance: parseMajorToMinor(accountForm.initialBalance, primaryCurrency),
      archived: false,
      updatedAt: timestamp,
    }
    if (!payload.name) return

    if (accountForm.id) {
      await db.accounts.update(accountForm.id, payload)
    } else {
      await db.accounts.add({ ...payload, id: makeId('acc'), createdAt: timestamp })
    }
    setAccountForm(emptyAccountForm)
  }

  function editAccount(account: Account) {
    setAccountForm({
      id: account.id,
      name: account.name,
      type: account.type,
      color: account.color,
      initialBalance: minorToMajorInput(account.initialBalance, primaryCurrency),
    })
  }

  async function updatePrimaryCurrency(value: PrimaryCurrency) {
    if (isCurrencyLocked) return
    setPrimaryCurrency(value)
    await db.settings.put({
      key: 'primaryCurrency',
      value,
      updatedAt: getTimestamp(),
    })
  }

  async function archiveAccount(account: Account) {
    await db.accounts.update(account.id, { archived: true, updatedAt: getTimestamp() })
    if (filters.accountId === account.id) setFilters((current) => ({ ...current, accountId: '' }))
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Local-first PWA</p>
          <h1>saku.lo</h1>
          <p className="subtitle">Local-only, logically organized personal finance manager.</p>
        </div>
        <div className="balance-card">
          <span>{selectedAccountName ? `Balance ${selectedAccountName}` : 'Total Balance'}</span>
          <strong>{formatMoney(heroBalance)}</strong>
        </div>
      </section>

      <nav className="tab-nav" aria-label="Main navigation">
        <TabButton active={tab === 'dashboard'} label="Dashboard" onClick={() => setTab('dashboard')} />
        <TabButton active={tab === 'log'} label="Log" onClick={() => setTab('log')} />
        <TabButton active={tab === 'accounts'} label="Akun" onClick={() => setTab('accounts')} />
      </nav>

      {tab === 'dashboard' && (
        <DashboardTab
          accounts={activeAccounts}
          categories={snapshot.categories}
          filters={filters}
          formatMoney={formatMoney}
          reportTotals={reportTotals}
          setFilters={setFilters}
          topCategories={topCategories}
          transactions={filteredTransactions.slice(0, 5)}
        />
      )}

      {tab === 'log' && (
        <LogTab
          accounts={activeAccounts}
          categories={snapshot.categories}
          cashflowCategories={cashflowCategories}
          deleteTransaction={deleteTransaction}
          filters={filters}
          formatMoney={formatMoney}
          form={transactionForm}
          saveTransaction={saveTransaction}
          setFilters={setFilters}
          setForm={setTransactionForm}
          transactions={filteredTransactions}
          updateTransactionType={updateTransactionType}
        />
      )}

      {tab === 'accounts' && (
        <AccountsTab
          accountBalances={accountBalances}
          accountForm={accountForm}
          accounts={activeAccounts}
          archiveAccount={archiveAccount}
          editAccount={editAccount}
          formatMoney={formatMoney}
          isCurrencyLocked={isCurrencyLocked}
          primaryCurrency={primaryCurrency}
          saveAccount={saveAccount}
          setAccountForm={setAccountForm}
          updatePrimaryCurrency={updatePrimaryCurrency}
        />
      )}
    </main>
  )
}

function DashboardTab({
  accounts,
  categories,
  filters,
  formatMoney,
  reportTotals,
  setFilters,
  topCategories,
  transactions,
}: {
  accounts: Account[]
  categories: Category[]
  filters: ReportFilters
  formatMoney: FormatMoney
  reportTotals: { income: number; expense: number; net: number }
  setFilters: React.Dispatch<React.SetStateAction<ReportFilters>>
  topCategories: Array<{ category: Category; amount: number }>
  transactions: MoneyTransaction[]
}) {
  return (
    <>
      <ReportFiltersPanel accounts={accounts} categories={categories} filters={filters} setFilters={setFilters} />
      <section className="metrics-grid" aria-label="Filtered summary">
        <Metric formatMoney={formatMoney} label="Income" value={reportTotals.income} tone="income" />
        <Metric formatMoney={formatMoney} label="Expense" value={reportTotals.expense} tone="expense" />
        <Metric formatMoney={formatMoney} label="Net Cashflow" value={reportTotals.net} tone={reportTotals.net >= 0 ? 'income' : 'expense'} />
      </section>
      <section className="content-grid">
        <TopCategoriesPanel expense={reportTotals.expense} formatMoney={formatMoney} topCategories={topCategories} />
        <TransactionsPanel accounts={accounts} categories={categories} formatMoney={formatMoney} onDelete={null} title="Recent Filtered Log" transactions={transactions} />
      </section>
    </>
  )
}

function LogTab({
  accounts,
  categories,
  cashflowCategories,
  deleteTransaction,
  filters,
  formatMoney,
  form,
  saveTransaction,
  setFilters,
  setForm,
  transactions,
  updateTransactionType,
}: {
  accounts: Account[]
  categories: Category[]
  cashflowCategories: Category[]
  deleteTransaction: (id: string) => void
  filters: ReportFilters
  formatMoney: FormatMoney
  form: TransactionForm
  saveTransaction: (event: FormEvent<HTMLFormElement>) => void
  setFilters: React.Dispatch<React.SetStateAction<ReportFilters>>
  setForm: React.Dispatch<React.SetStateAction<TransactionForm>>
  transactions: MoneyTransaction[]
  updateTransactionType: (type: TransactionType) => void
}) {
  return (
    <>
      <ReportFiltersPanel accounts={accounts} categories={categories} filters={filters} setFilters={setFilters} />
      <section className="content-grid">
        <TransactionFormPanel
          accounts={accounts}
          categories={cashflowCategories}
          form={form}
          saveTransaction={saveTransaction}
          setForm={setForm}
          updateTransactionType={updateTransactionType}
        />
        <TransactionsPanel accounts={accounts} categories={categories} formatMoney={formatMoney} onDelete={deleteTransaction} title="Log Bulan Berjalan" transactions={transactions} />
      </section>
    </>
  )
}

function AccountsTab({
  accountBalances,
  accountForm,
  accounts,
  archiveAccount,
  editAccount,
  formatMoney,
  isCurrencyLocked,
  primaryCurrency,
  saveAccount,
  setAccountForm,
  updatePrimaryCurrency,
}: {
  accountBalances: Map<string, number>
  accountForm: AccountForm
  accounts: Account[]
  archiveAccount: (account: Account) => void
  editAccount: (account: Account) => void
  formatMoney: FormatMoney
  isCurrencyLocked: boolean
  primaryCurrency: PrimaryCurrency
  saveAccount: (event: FormEvent<HTMLFormElement>) => void
  setAccountForm: React.Dispatch<React.SetStateAction<AccountForm>>
  updatePrimaryCurrency: (value: PrimaryCurrency) => void
}) {
  return (
    <section className="content-grid accounts-grid">
      <form className="panel transaction-form" onSubmit={saveAccount}>
        <div className="panel-heading">
          <h2>{accountForm.id ? 'Edit Akun' : 'Tambah Akun'}</h2>
          <p>Untuk bank, cash, e-wallet, atau kartu.</p>
        </div>
        <label>
          Mata Uang Utama
          <select disabled={isCurrencyLocked} value={primaryCurrency} onChange={(event) => updatePrimaryCurrency(event.target.value as PrimaryCurrency)}>
            {currencyOptions.map((option) => <option key={option.code} value={option.code}>{option.code} - {option.label}</option>)}
          </select>
          {isCurrencyLocked && <span className="helper-text">Currency dikunci setelah ada transaksi untuk mencegah saldo terbaca salah.</span>}
        </label>
        <label>
          Nama Akun
          <input required placeholder="BCA, Cash, ShopeePay" value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} />
        </label>
        <div className="form-row">
          <label>
            Tipe
            <select value={accountForm.type} onChange={(event) => setAccountForm({ ...accountForm, type: event.target.value as Account['type'] })}>
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
              <option value="ewallet">E-wallet</option>
              <option value="card">Card</option>
            </select>
          </label>
          <label>
            Warna
            <input type="color" value={accountForm.color} onChange={(event) => setAccountForm({ ...accountForm, color: event.target.value })} />
          </label>
        </div>
        <label>
          Initial Balance
          <input inputMode="decimal" type="number" value={accountForm.initialBalance} onChange={(event) => setAccountForm({ ...accountForm, initialBalance: event.target.value })} />
        </label>
        <div className="button-row">
          <button className="primary-button" type="submit">{accountForm.id ? 'Update Akun' : 'Simpan Akun'}</button>
          {accountForm.id && <button className="ghost-button" type="button" onClick={() => setAccountForm(emptyAccountForm)}>Batal</button>}
        </div>
      </form>
      <section className="panel">
        <div className="panel-heading">
          <h2>Daftar Akun</h2>
          <p>{accounts.length} akun aktif.</p>
        </div>
        <div className="account-list">
          {accounts.map((account) => (
            <article className="account-item" key={account.id}>
              <span className="account-dot" style={{ background: account.color }} />
              <div>
                <strong>{account.name}</strong>
                <small>{account.type}</small>
              </div>
              <strong>{formatMoney(accountBalances.get(account.id) || 0)}</strong>
              <div className="account-actions">
                <button className="ghost-button" type="button" onClick={() => editAccount(account)}>Edit</button>
                <button className="ghost-button danger" type="button" onClick={() => archiveAccount(account)}>Archive</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  )
}

function ReportFiltersPanel({
  accounts,
  categories,
  filters,
  setFilters,
}: {
  accounts: Account[]
  categories: Category[]
  filters: ReportFilters
  setFilters: React.Dispatch<React.SetStateAction<ReportFilters>>
}) {
  return (
    <section className="panel filter-panel">
      <label>
        Bulan
        <input type="month" value={filters.month} onChange={(event) => setFilters((current) => ({ ...current, month: event.target.value }))} />
      </label>
      <label>
        Akun
        <select value={filters.accountId} onChange={(event) => setFilters((current) => ({ ...current, accountId: event.target.value }))}>
          <option value="">Semua Akun</option>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>
      </label>
      <label>
        Kategori
        <select value={filters.categoryId} onChange={(event) => setFilters((current) => ({ ...current, categoryId: event.target.value }))}>
          <option value="">Semua Kategori</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.icon} {category.name}</option>)}
        </select>
      </label>
      <label>
        Tipe
        <select value={filters.type} onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value as ReportFilters['type'] }))}>
          <option value="all">Semua Tipe</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
          <option value="transfer">Transfer</option>
        </select>
      </label>
    </section>
  )
}

function TransactionFormPanel({
  accounts,
  categories,
  form,
  saveTransaction,
  setForm,
  updateTransactionType,
}: {
  accounts: Account[]
  categories: Category[]
  form: TransactionForm
  saveTransaction: (event: FormEvent<HTMLFormElement>) => void
  setForm: React.Dispatch<React.SetStateAction<TransactionForm>>
  updateTransactionType: (type: TransactionType) => void
}) {
  const toAccountOptions = accounts.filter((account) => account.id !== form.fromAccountId)

  function updateFromAccount(fromAccountId: string) {
    const toAccountId = form.toAccountId === fromAccountId
      ? accounts.find((account) => account.id !== fromAccountId)?.id || ''
      : form.toAccountId

    setForm({ ...form, fromAccountId, toAccountId })
  }

  return (
    <form className="panel transaction-form" onSubmit={saveTransaction}>
      <div className="panel-heading">
        <h2>Tambah Transaksi</h2>
        <p>Income, expense, atau transfer antar akun.</p>
      </div>
      <div className="segmented-control three" role="tablist" aria-label="Transaction type">
        <button type="button" className={form.type === 'expense' ? 'active expense' : ''} onClick={() => updateTransactionType('expense')}>Expense</button>
        <button type="button" className={form.type === 'income' ? 'active income' : ''} onClick={() => updateTransactionType('income')}>Income</button>
        <button type="button" className={form.type === 'transfer' ? 'active transfer' : ''} onClick={() => updateTransactionType('transfer')}>Transfer</button>
      </div>
      <label>
        Amount
        <input className={`amount-input ${form.type}`} inputMode="decimal" min="0" placeholder="50000" required type="number" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
      </label>
      <label>
        Date
        <input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
      </label>
      {form.type === 'transfer' ? (
        <div className="form-row">
          <label>
            From
            <select required value={form.fromAccountId} onChange={(event) => updateFromAccount(event.target.value)}>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </label>
          <label>
            To
            <select required value={form.toAccountId} onChange={(event) => setForm({ ...form, toAccountId: event.target.value })}>
              {toAccountOptions.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
            {toAccountOptions.length === 0 && <span className="helper-text">Buat akun kedua untuk transfer antar akun.</span>}
          </label>
        </div>
      ) : (
        <div className="form-row">
          <label>
            Account
            <select required value={form.accountId} onChange={(event) => setForm({ ...form, accountId: event.target.value })}>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </label>
          <label>
            Category
            <select required value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.icon} {category.name}</option>)}
            </select>
          </label>
        </div>
      )}
      <label>
        Note
        <input placeholder="Contoh: Makan siang / pindah saldo" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
      </label>
      <button className="primary-button" type="submit">Simpan</button>
    </form>
  )
}

function TopCategoriesPanel({
  expense,
  formatMoney,
  topCategories,
}: {
  expense: number
  formatMoney: FormatMoney
  topCategories: Array<{ category: Category; amount: number }>
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Top Categories</h2>
        <p>Expense sesuai filter report.</p>
      </div>
      <div className="category-list">
        {topCategories.length === 0 ? <p className="empty-state">Belum ada expense di filter ini.</p> : topCategories.map(({ category, amount }) => (
          <div className="category-row" key={category.id}>
            <span className="category-icon" style={{ background: category.color }}>{category.icon}</span>
            <div>
              <strong>{category.name}</strong>
              <small>{Math.round((amount / Math.max(expense, 1)) * 100)}% dari expense</small>
            </div>
            <span>{formatMoney(amount)}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function TransactionsPanel({
  accounts,
  categories,
  formatMoney,
  onDelete,
  title,
  transactions,
}: {
  accounts: Account[]
  categories: Category[]
  formatMoney: FormatMoney
  onDelete: ((id: string) => void) | null
  title: string
  transactions: MoneyTransaction[]
}) {
  return (
    <section className="panel transaction-list-panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        <p>{transactions.length} transaksi.</p>
      </div>
      <div className="transaction-list">
        {transactions.length === 0 ? <p className="empty-state">Belum ada transaksi pada filter ini.</p> : transactions.map((transaction) => (
          <TransactionItem accounts={accounts} categories={categories} formatMoney={formatMoney} key={transaction.id} onDelete={onDelete} transaction={transaction} />
        ))}
      </div>
    </section>
  )
}

function TransactionItem({
  accounts,
  categories,
  formatMoney,
  onDelete,
  transaction,
}: {
  accounts: Account[]
  categories: Category[]
  formatMoney: FormatMoney
  onDelete: ((id: string) => void) | null
  transaction: MoneyTransaction
}) {
  const isTransfer = transaction.type === 'transfer'
  const category = isTransfer ? null : categories.find((item) => item.id === transaction.categoryId)
  const account = isTransfer ? null : accounts.find((item) => item.id === transaction.accountId)
  const fromAccount = isTransfer ? accounts.find((item) => item.id === transaction.fromAccountId) : null
  const toAccount = isTransfer ? accounts.find((item) => item.id === transaction.toAccountId) : null
  const label = isTransfer ? 'Transfer' : category?.name || 'Uncategorized'
  const detail = isTransfer
    ? `${fromAccount?.name || 'Unknown'} → ${toAccount?.name || 'Unknown'}`
    : account?.name || 'No account'

  return (
    <article className="transaction-item">
      <span className="category-icon" style={{ background: isTransfer ? 'var(--color-transfer)' : category?.color || '#64748b' }}>{isTransfer ? '↔' : category?.icon || '•'}</span>
      <div className="transaction-main">
        <strong>{label}</strong>
        <small>{transaction.date} · {detail}{transaction.note ? ` · ${transaction.note}` : ''}</small>
      </div>
      <strong className={transaction.type}>{formatTransactionAmount(transaction, formatMoney)}</strong>
      {onDelete && <button aria-label="Delete transaction" className="ghost-button danger" type="button" onClick={() => onDelete(transaction.id)}>Delete</button>}
    </article>
  )
}

function Metric({ formatMoney, label, value, tone }: { formatMoney: FormatMoney; label: string; value: number; tone: CashflowType }) {
  return (
    <div className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{formatMoney(value)}</strong>
    </div>
  )
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button className={active ? 'active' : ''} type="button" onClick={onClick}>{label}</button>
}

function formatTransactionAmount(transaction: MoneyTransaction, formatMoney: FormatMoney) {
  if (transaction.type === 'income') return `+${formatMoney(transaction.amount)}`
  if (transaction.type === 'expense') return `-${formatMoney(transaction.amount)}`
  return formatMoney(transaction.amount)
}

export default App
