import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import './App.css'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
type QuickAddStep = 'type' | 'form'

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
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAddStep, setQuickAddStep] = useState<QuickAddStep>('type')
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
    setQuickAddOpen(false)
    setQuickAddStep('type')
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

  function openQuickAdd(type?: TransactionType) {
    setQuickAddOpen(true)
    if (type) {
      updateTransactionType(type)
      setQuickAddStep('form')
    } else {
      setQuickAddStep('type')
    }
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

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList className="tab-nav" aria-label="Main navigation">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="log">Log</TabsTrigger>
          <TabsTrigger value="accounts">Akun</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
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
        </TabsContent>

        <TabsContent value="log">
          <LogTab
            accounts={activeAccounts}
            categories={snapshot.categories}
            deleteTransaction={deleteTransaction}
            filters={filters}
            formatMoney={formatMoney}
            setFilters={setFilters}
            transactions={filteredTransactions}
          />
        </TabsContent>

        <TabsContent value="accounts">
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
        </TabsContent>
      </Tabs>

      <Button aria-label="Tambah transaksi" className="fab" size="icon" type="button" variant="income" onClick={() => openQuickAdd()}>
        <Plus aria-hidden="true" />
      </Button>

      {quickAddOpen && (
        <QuickAddDialog
          accounts={activeAccounts}
          categories={cashflowCategories}
          form={transactionForm}
          onClose={() => {
            setQuickAddOpen(false)
            setQuickAddStep('type')
          }}
          onPickType={(type) => openQuickAdd(type)}
          onBack={() => setQuickAddStep('type')}
          saveTransaction={saveTransaction}
          setForm={setTransactionForm}
          step={quickAddStep}
          updateTransactionType={updateTransactionType}
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
  deleteTransaction,
  filters,
  formatMoney,
  setFilters,
  transactions,
}: {
  accounts: Account[]
  categories: Category[]
  deleteTransaction: (id: string) => void
  filters: ReportFilters
  formatMoney: FormatMoney
  setFilters: React.Dispatch<React.SetStateAction<ReportFilters>>
  transactions: MoneyTransaction[]
}) {
  return (
    <>
      <ReportFiltersPanel accounts={accounts} categories={categories} filters={filters} setFilters={setFilters} />
      <TransactionsPanel accounts={accounts} categories={categories} formatMoney={formatMoney} onDelete={deleteTransaction} title="Log Bulan Berjalan" transactions={transactions} />
    </>
  )
}

function QuickAddDialog({
  accounts,
  categories,
  form,
  onBack,
  onClose,
  onPickType,
  saveTransaction,
  setForm,
  step,
  updateTransactionType,
}: {
  accounts: Account[]
  categories: Category[]
  form: TransactionForm
  onBack: () => void
  onClose: () => void
  onPickType: (type: TransactionType) => void
  saveTransaction: (event: FormEvent<HTMLFormElement>) => void
  setForm: React.Dispatch<React.SetStateAction<TransactionForm>>
  step: QuickAddStep
  updateTransactionType: (type: TransactionType) => void
}) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <Card className="quick-dialog" role="dialog" aria-modal="true" aria-labelledby="quick-add-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="quick-dialog-header">
          <div>
            <CardTitle id="quick-add-title">Quick Add</CardTitle>
            <CardDescription>{step === 'type' ? 'Pilih jenis transaksi.' : 'Isi detail transaksi.'}</CardDescription>
          </div>
          <Button aria-label="Tutup" size="icon" variant="ghost" type="button" onClick={onClose}>
            <X aria-hidden="true" />
          </Button>
        </div>

        {step === 'type' ? (
          <div className="quick-type-grid">
            <Button className="quick-type-button expense" variant="ghost" type="button" onClick={() => onPickType('expense')}>
              <span>↓</span>
              <strong>Expense</strong>
              <small>Catat pengeluaran</small>
            </Button>
            <Button className="quick-type-button income" variant="ghost" type="button" onClick={() => onPickType('income')}>
              <span>↑</span>
              <strong>Income</strong>
              <small>Catat pemasukan</small>
            </Button>
            <Button className="quick-type-button transfer" variant="ghost" type="button" onClick={() => onPickType('transfer')}>
              <span>↔</span>
              <strong>Transfer</strong>
              <small>Pindah antar akun</small>
            </Button>
          </div>
        ) : (
          <>
            <Button className="quick-back" size="sm" variant="ghost" type="button" onClick={onBack}>← Pilih tipe lain</Button>
            <TransactionFormPanel
              accounts={accounts}
              categories={categories}
              form={form}
              saveTransaction={saveTransaction}
              setForm={setForm}
              updateTransactionType={updateTransactionType}
            />
          </>
        )}
      </Card>
    </div>
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
        <CardHeader className="panel-heading">
          <CardTitle>{accountForm.id ? 'Edit Akun' : 'Tambah Akun'}</CardTitle>
          <CardDescription>Untuk bank, cash, e-wallet, atau kartu.</CardDescription>
        </CardHeader>
        <Label>
          Mata Uang Utama
          <Select disabled={isCurrencyLocked} value={primaryCurrency} onValueChange={(value) => updatePrimaryCurrency(value as PrimaryCurrency)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {currencyOptions.map((option) => <SelectItem key={option.code} value={option.code}>{option.code} - {option.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {isCurrencyLocked && <span className="helper-text">Currency dikunci setelah ada transaksi untuk mencegah saldo terbaca salah.</span>}
        </Label>
        <Label>
          Nama Akun
          <Input required placeholder="BCA, Cash, ShopeePay" value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} />
        </Label>
        <div className="form-row">
          <Label>
            Tipe
            <Select value={accountForm.type} onValueChange={(value) => setAccountForm({ ...accountForm, type: value as Account['type'] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank">Bank</SelectItem>
                <SelectItem value="ewallet">E-wallet</SelectItem>
                <SelectItem value="card">Card</SelectItem>
              </SelectContent>
            </Select>
          </Label>
          <Label>
            Warna
            <Input type="color" value={accountForm.color} onChange={(event) => setAccountForm({ ...accountForm, color: event.target.value })} />
          </Label>
        </div>
        <Label>
          Initial Balance
          <Input inputMode="decimal" type="number" value={accountForm.initialBalance} onChange={(event) => setAccountForm({ ...accountForm, initialBalance: event.target.value })} />
        </Label>
        <div className="button-row">
          <Button variant="income" type="submit">{accountForm.id ? 'Update Akun' : 'Simpan Akun'}</Button>
          {accountForm.id && <Button variant="ghost" type="button" onClick={() => setAccountForm(emptyAccountForm)}>Batal</Button>}
        </div>
      </form>
      <Card>
        <CardHeader className="panel-heading">
          <CardTitle>Daftar Akun</CardTitle>
          <CardDescription>{accounts.length} akun aktif.</CardDescription>
        </CardHeader>
        <CardContent className="account-list">
          {accounts.map((account) => (
            <article className="account-item" key={account.id}>
              <span className="account-dot" style={{ background: account.color }} />
              <div>
                <strong>{account.name}</strong>
                <small>{account.type}</small>
              </div>
              <strong>{formatMoney(accountBalances.get(account.id) || 0)}</strong>
              <div className="account-actions">
                <Button size="sm" variant="ghost" type="button" onClick={() => editAccount(account)}>Edit</Button>
                <Button size="sm" variant="destructive" type="button" onClick={() => archiveAccount(account)}>Archive</Button>
              </div>
            </article>
          ))}
        </CardContent>
      </Card>
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
    <Card className="filter-panel">
      <Label>
        Bulan
        <Input type="month" value={filters.month} onChange={(event) => setFilters((current) => ({ ...current, month: event.target.value }))} />
      </Label>
      <Label>
        Akun
        <Select value={filters.accountId || 'all-accounts'} onValueChange={(value) => setFilters((current) => ({ ...current, accountId: value === 'all-accounts' ? '' : value }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all-accounts">Semua Akun</SelectItem>
            {accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Label>
      <Label>
        Kategori
        <Select value={filters.categoryId || 'all-categories'} onValueChange={(value) => setFilters((current) => ({ ...current, categoryId: value === 'all-categories' ? '' : value }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all-categories">Semua Kategori</SelectItem>
            {categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.icon} {category.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Label>
      <Label>
        Tipe
        <Select value={filters.type} onValueChange={(value) => setFilters((current) => ({ ...current, type: value as ReportFilters['type'] }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Tipe</SelectItem>
            <SelectItem value="income">Income</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
          </SelectContent>
        </Select>
      </Label>
    </Card>
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
      <CardHeader className="panel-heading">
        <CardTitle>Tambah Transaksi</CardTitle>
        <CardDescription>Income, expense, atau transfer antar akun.</CardDescription>
      </CardHeader>
      <div className="segmented-control three" role="tablist" aria-label="Transaction type">
        <Button variant="ghost" type="button" className={form.type === 'expense' ? 'active expense' : ''} onClick={() => updateTransactionType('expense')}>Expense</Button>
        <Button variant="ghost" type="button" className={form.type === 'income' ? 'active income' : ''} onClick={() => updateTransactionType('income')}>Income</Button>
        <Button variant="ghost" type="button" className={form.type === 'transfer' ? 'active transfer' : ''} onClick={() => updateTransactionType('transfer')}>Transfer</Button>
      </div>
      <Label>
        Amount
        <Input className={`amount-input ${form.type}`} inputMode="decimal" min="0" placeholder="50000" required type="number" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
      </Label>
      <Label>
        Date
        <Input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
      </Label>
      {form.type === 'transfer' ? (
        <div className="form-row">
          <Label>
            From
            <Select required value={form.fromAccountId} onValueChange={updateFromAccount}>
              <SelectTrigger><SelectValue placeholder="Pilih akun" /></SelectTrigger>
              <SelectContent>
                {accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Label>
          <Label>
            To
            <Select required value={form.toAccountId} onValueChange={(value) => setForm({ ...form, toAccountId: value })}>
              <SelectTrigger><SelectValue placeholder="Pilih akun" /></SelectTrigger>
              <SelectContent>
                {toAccountOptions.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {toAccountOptions.length === 0 && <span className="helper-text">Buat akun kedua untuk transfer antar akun.</span>}
          </Label>
        </div>
      ) : (
        <div className="form-row">
          <Label>
            Account
            <Select required value={form.accountId} onValueChange={(value) => setForm({ ...form, accountId: value })}>
              <SelectTrigger><SelectValue placeholder="Pilih akun" /></SelectTrigger>
              <SelectContent>
                {accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Label>
          <Label>
            Category
            <Select required value={form.categoryId} onValueChange={(value) => setForm({ ...form, categoryId: value })}>
              <SelectTrigger><SelectValue placeholder="Pilih kategori" /></SelectTrigger>
              <SelectContent>
                {categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.icon} {category.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Label>
        </div>
      )}
      <Label>
        Note
        <Input placeholder="Contoh: Makan siang / pindah saldo" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
      </Label>
      <Button variant={form.type === 'transfer' ? 'transfer' : form.type} type="submit">Simpan</Button>
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
    <Card>
      <CardHeader className="panel-heading">
        <CardTitle>Top Categories</CardTitle>
        <CardDescription>Expense sesuai filter report.</CardDescription>
      </CardHeader>
      <CardContent className="category-list">
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
      </CardContent>
    </Card>
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
    <Card className="transaction-list-panel">
      <CardHeader className="panel-heading">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{transactions.length} transaksi.</CardDescription>
      </CardHeader>
      <CardContent className="transaction-list">
        {transactions.length === 0 ? <p className="empty-state">Belum ada transaksi pada filter ini.</p> : transactions.map((transaction) => (
          <TransactionItem accounts={accounts} categories={categories} formatMoney={formatMoney} key={transaction.id} onDelete={onDelete} transaction={transaction} />
        ))}
      </CardContent>
    </Card>
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
      {onDelete && <Button aria-label="Delete transaction" size="sm" variant="destructive" type="button" onClick={() => onDelete(transaction.id)}>Delete</Button>}
    </article>
  )
}

function Metric({ formatMoney, label, value, tone }: { formatMoney: FormatMoney; label: string; value: number; tone: CashflowType }) {
  return (
    <Card className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{formatMoney(value)}</strong>
    </Card>
  )
}

function formatTransactionAmount(transaction: MoneyTransaction, formatMoney: FormatMoney) {
  if (transaction.type === 'income') return `+${formatMoney(transaction.amount)}`
  if (transaction.type === 'expense') return `-${formatMoney(transaction.amount)}`
  return formatMoney(transaction.amount)
}

export default App
