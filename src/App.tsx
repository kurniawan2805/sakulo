import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Bell, Languages, LayoutDashboard, List, Moon, Plus, Settings, Sun, X } from 'lucide-react'
import './App.css'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  db,
  getTimestamp,
  makeId,
  type Account,
  type Category,
  type MoneyTransaction,
  type PrimaryCurrency,
  type ThemePreference,
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
import { translations, type Language, type Translation } from './i18n'

type Tab = 'dashboard' | 'log' | 'accounts'
type QuickAddStep = 'type' | 'form'
type FilterDrawer = 'account' | 'category' | 'type' | null

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
type AppText = Translation

type ToastMessage = {
  id: string
  title: string
}

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
  const [filterDrawer, setFilterDrawer] = useState<FilterDrawer>(null)
  const [snapshot, setSnapshot] = useState<Snapshot>({ accounts: [], categories: [], transactions: [] })
  const [primaryCurrency, setPrimaryCurrency] = useState<PrimaryCurrency>('IDR')
  const [theme, setTheme] = useState<ThemePreference>('dark')
  const [language, setLanguage] = useState<Language>('id')
  const [toasts, setToasts] = useState<ToastMessage[]>([])
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
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [accounts, categories, transactions] = await Promise.all([
        db.accounts.toArray(),
        db.categories.toArray(),
        db.transactions.orderBy('date').reverse().toArray(),
      ])
      const [currencySetting, themeSetting, languageSetting] = await Promise.all([
        db.settings.get('primaryCurrency'),
        db.settings.get('theme'),
        db.settings.get('language'),
      ])
      if (cancelled) return

      const activeAccounts = accounts.filter((account) => !account.archived)
      if (currencySetting?.key === 'primaryCurrency') setPrimaryCurrency(currencySetting.value)
      if (themeSetting?.key === 'theme') setTheme(themeSetting.value)
      if (languageSetting?.key === 'language') setLanguage(languageSetting.value)
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
  const animatedHeroBalance = useAnimatedNumber(heroBalance)
  const selectedAccountName = activeAccounts.find((account) => account.id === filters.accountId)?.name
  const formatMoney = (value: number) => formatMinorMoney(value, primaryCurrency)
  const heroMoney = getMoneyParts(formatMoney(animatedHeroBalance))
  const isCurrencyLocked = snapshot.transactions.length > 0
  const t = translations[language]

  function updateTransactionType(type: TransactionType) {
    const nextCategory = type === 'transfer'
      ? ''
      : snapshot.categories.find((category) => category.type === type)?.id || ''
    setTransactionForm((current) => ({ ...current, type, categoryId: nextCategory }))
  }

  function notify(title: string) {
    const id = makeId('toast')
    setToasts((current) => [...current, { id, title }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 2600)
  }

  function subtleFeedback(title: string) {
    navigator.vibrate?.(10)
    notify(title)
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

    subtleFeedback(t.transactionSaved)
    setTransactionForm((current) => ({ ...current, amount: '', note: '' }))
    setQuickAddOpen(false)
    setQuickAddStep('type')
  }

  async function deleteTransaction(id: string) {
    await db.transactions.delete(id)
    subtleFeedback(t.transactionDeleted)
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

    const isEditing = Boolean(accountForm.id)
    if (accountForm.id) {
      await db.accounts.update(accountForm.id, payload)
    } else {
      await db.accounts.add({ ...payload, id: makeId('acc'), createdAt: timestamp })
    }
    subtleFeedback(isEditing ? t.accountUpdatedToast : t.accountSavedToast)
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

  async function updateTheme(value: ThemePreference) {
    setTheme(value)
    await db.settings.put({
      key: 'theme',
      value,
      updatedAt: getTimestamp(),
    })
  }

  async function updateLanguage(value: Language) {
    setLanguage(value)
    await db.settings.put({
      key: 'language',
      value,
      updatedAt: getTimestamp(),
    })
  }

  async function archiveAccount(account: Account) {
    await db.accounts.update(account.id, { archived: true, updatedAt: getTimestamp() })
    subtleFeedback(t.accountArchived)
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
      <header className="app-header">
        <strong>saku.lo</strong>
        <div className="header-actions">
          <Button aria-label={t.switchLanguage} className="language-toggle" size="sm" type="button" variant="ghost" onClick={() => updateLanguage(language === 'id' ? 'en' : 'id')}>
            <Languages aria-hidden="true" />
            <span>{language.toUpperCase()}</span>
          </Button>
          <Button aria-label={t.switchTheme} size="icon" type="button" variant="ghost" onClick={() => updateTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
          </Button>
          <Button aria-label={t.notifications} size="icon" type="button" variant="ghost">
            <Bell aria-hidden="true" />
          </Button>
        </div>
      </header>

      <section className="hero-card">
        <div>
          <p className="eyebrow">{t.availableBalance}</p>
          <h1>
            <span>{heroMoney.symbol}</span>
            {heroMoney.amount}
          </h1>
          <p className="subtitle">{selectedAccountName ? `${t.balancePrefix} ${selectedAccountName}` : t.acrossAccounts}</p>
        </div>
      </section>

      {tab === 'dashboard' && (
          <DashboardTab
            accounts={activeAccounts}
            categories={snapshot.categories}
            filters={filters}
            filterDrawer={filterDrawer}
            formatMoney={formatMoney}
            language={language}
            reportTotals={reportTotals}
            setFilters={setFilters}
            setFilterDrawer={setFilterDrawer}
            t={t}
            topCategories={topCategories}
            transactions={filteredTransactions.slice(0, 5)}
          />
      )}

      {tab === 'log' && (
          <LogTab
            accounts={activeAccounts}
            categories={snapshot.categories}
            deleteTransaction={deleteTransaction}
            filters={filters}
            formatMoney={formatMoney}
            t={t}
            setFilters={setFilters}
            transactions={filteredTransactions}
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
            t={t}
            updatePrimaryCurrency={updatePrimaryCurrency}
          />
      )}

      <nav className="bottom-nav" aria-label="Primary navigation">
        <Button aria-label={t.dashboard} className={tab === 'dashboard' ? 'active' : ''} size="icon" type="button" variant="ghost" onClick={() => setTab('dashboard')}>
          <LayoutDashboard aria-hidden="true" />
          <span>{t.dashboard}</span>
        </Button>
        <Button aria-label={t.log} className={tab === 'log' ? 'active' : ''} size="icon" type="button" variant="ghost" onClick={() => setTab('log')}>
          <List aria-hidden="true" />
          <span>{t.log}</span>
        </Button>
        <Button aria-label={t.addTransaction} className="bottom-fab" size="icon" type="button" variant="ghost" onClick={() => openQuickAdd()}>
          <Plus aria-hidden="true" />
        </Button>
        <Button aria-label={t.accountsNav} className={tab === 'accounts' ? 'active' : ''} size="icon" type="button" variant="ghost" onClick={() => setTab('accounts')}>
          <Settings aria-hidden="true" />
          <span>{t.accountsNav}</span>
        </Button>
      </nav>

      {quickAddOpen && (
        <QuickAddDialog
          accounts={activeAccounts}
          categories={cashflowCategories}
          form={transactionForm}
          t={t}
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
      <ToastViewport toasts={toasts} />
    </main>
  )
}

function DashboardTab({
  accounts,
  categories,
  filters,
  filterDrawer,
  formatMoney,
  language,
  reportTotals,
  setFilters,
  setFilterDrawer,
  t,
  topCategories,
  transactions,
}: {
  accounts: Account[]
  categories: Category[]
  filters: ReportFilters
  filterDrawer: FilterDrawer
  formatMoney: FormatMoney
  language: Language
  reportTotals: { income: number; expense: number; net: number }
  setFilters: React.Dispatch<React.SetStateAction<ReportFilters>>
  setFilterDrawer: React.Dispatch<React.SetStateAction<FilterDrawer>>
  t: AppText
  topCategories: Array<{ category: Category; amount: number }>
  transactions: MoneyTransaction[]
}) {
  const selectedAccount = accounts.find((account) => account.id === filters.accountId)
  const selectedCategory = categories.find((category) => category.id === filters.categoryId)

  return (
    <section className="dashboard-stack">
      <Card className="dashboard-toolbar">
        <div>
          <h2>{formatMonthLabel(filters.month, language, t)}</h2>
        </div>
        <div className="filter-chips" aria-label="Active filters">
          <button type="button" onClick={() => setFilterDrawer('account')}>{selectedAccount?.name || t.allAccounts}</button>
          <button type="button" onClick={() => setFilterDrawer('category')}>{selectedCategory ? `${selectedCategory.icon} ${selectedCategory.name}` : t.allCategories}</button>
          <button type="button" onClick={() => setFilterDrawer('type')}>{filters.type === 'all' ? t.allTypes : t[filters.type]}</button>
        </div>
      </Card>

      {filterDrawer && (
        <FilterDrawerSheet
          accounts={accounts}
          categories={categories}
          filter={filterDrawer}
          filters={filters}
          onClose={() => setFilterDrawer(null)}
          setFilters={setFilters}
          t={t}
        />
      )}

      <OverviewPanel formatMoney={formatMoney} t={t} totals={reportTotals} />

      <section className="dashboard-grid">
        <TopCategoriesPanel compact expense={reportTotals.expense} formatMoney={formatMoney} t={t} topCategories={topCategories.slice(0, 3)} />
        <TransactionsPanel compact accounts={accounts} categories={categories} formatMoney={formatMoney} onDelete={null} t={t} title={t.recentActivity} transactions={transactions.slice(0, 3)} />
      </section>
    </section>
  )
}

function FilterDrawerSheet({
  accounts,
  categories,
  filter,
  filters,
  onClose,
  setFilters,
  t,
}: {
  accounts: Account[]
  categories: Category[]
  filter: Exclude<FilterDrawer, null>
  filters: ReportFilters
  onClose: () => void
  setFilters: React.Dispatch<React.SetStateAction<ReportFilters>>
  t: AppText
}) {
  const title = filter === 'account' ? t.chooseAccount : filter === 'category' ? t.chooseCategory : t.chooseType

  function choose(update: Partial<ReportFilters>) {
    setFilters((current) => ({ ...current, ...update }))
    onClose()
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <Card className="quick-dialog filter-drawer" role="dialog" aria-modal="true" aria-labelledby="filter-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="quick-dialog-header">
          <div>
            <CardTitle id="filter-title">{title}</CardTitle>
            <CardDescription>Filter dashboard secara cepat.</CardDescription>
          </div>
          <Button aria-label="Tutup" size="icon" variant="ghost" type="button" onClick={onClose}>
            <X aria-hidden="true" />
          </Button>
        </div>

        <div className="filter-options">
          {filter === 'account' && (
            <>
              <button className={!filters.accountId ? 'active' : ''} type="button" onClick={() => choose({ accountId: '' })}>{t.allAccounts}</button>
              {accounts.map((account) => <button className={filters.accountId === account.id ? 'active' : ''} key={account.id} type="button" onClick={() => choose({ accountId: account.id })}>{account.name}</button>)}
            </>
          )}
          {filter === 'category' && (
            <>
              <button className={!filters.categoryId ? 'active' : ''} type="button" onClick={() => choose({ categoryId: '' })}>{t.allCategories}</button>
              {categories.map((category) => <button className={filters.categoryId === category.id ? 'active' : ''} key={category.id} type="button" onClick={() => choose({ categoryId: category.id })}>{category.icon} {category.name}</button>)}
            </>
          )}
          {filter === 'type' && (
            <>
              <button className={filters.type === 'all' ? 'active' : ''} type="button" onClick={() => choose({ type: 'all' })}>{t.allTypes}</button>
              <button className={filters.type === 'income' ? 'active' : ''} type="button" onClick={() => choose({ type: 'income' })}>{t.income}</button>
              <button className={filters.type === 'expense' ? 'active' : ''} type="button" onClick={() => choose({ type: 'expense' })}>{t.expense}</button>
              <button className={filters.type === 'transfer' ? 'active' : ''} type="button" onClick={() => choose({ type: 'transfer' })}>{t.transfer}</button>
            </>
          )}
        </div>
      </Card>
    </div>
  )
}

function OverviewPanel({ formatMoney, t, totals }: { formatMoney: FormatMoney; t: AppText; totals: { income: number; expense: number; net: number } }) {
  return (
    <Card className="overview-card">
      <div className="overview-heading">
        <span>{t.thisMonth}</span>
      </div>
      <div className="overview-grid">
        <div>
          <span>{t.income}</span>
          <strong className="income">{formatMoney(totals.income)}</strong>
        </div>
        <div>
          <span>{t.expense}</span>
          <strong className="expense">{formatMoney(totals.expense)}</strong>
        </div>
      </div>
      <div className="net-row">
        <span>{t.netCashflow}</span>
        <strong className={totals.net >= 0 ? 'income' : 'expense'}>{formatMoney(totals.net)}</strong>
      </div>
    </Card>
  )
}

function LogTab({
  accounts,
  categories,
  deleteTransaction,
  filters,
  formatMoney,
  setFilters,
  t,
  transactions,
}: {
  accounts: Account[]
  categories: Category[]
  deleteTransaction: (id: string) => void
  filters: ReportFilters
  formatMoney: FormatMoney
  setFilters: React.Dispatch<React.SetStateAction<ReportFilters>>
  t: AppText
  transactions: MoneyTransaction[]
}) {
  return (
    <>
      <ReportFiltersPanel accounts={accounts} categories={categories} filters={filters} setFilters={setFilters} t={t} />
      <TransactionsPanel accounts={accounts} categories={categories} formatMoney={formatMoney} onDelete={deleteTransaction} t={t} title={t.currentMonthLog} transactions={transactions} />
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
  t,
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
  t: AppText
  updateTransactionType: (type: TransactionType) => void
}) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <Card className="quick-dialog" role="dialog" aria-modal="true" aria-labelledby="quick-add-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="quick-dialog-header">
          <div>
            <CardTitle id="quick-add-title">{t.quickAdd}</CardTitle>
            <CardDescription>{step === 'type' ? t.pickTransactionType : t.fillTransactionDetails}</CardDescription>
          </div>
          <Button aria-label={t.close} size="icon" variant="ghost" type="button" onClick={onClose}>
            <X aria-hidden="true" />
          </Button>
        </div>

        {step === 'type' ? (
          <div className="quick-type-grid">
            <Button className="quick-type-button expense" variant="ghost" type="button" onClick={() => onPickType('expense')}>
              <span>↓</span>
              <strong>{t.expense}</strong>
              <small>{t.recordExpense}</small>
            </Button>
            <Button className="quick-type-button income" variant="ghost" type="button" onClick={() => onPickType('income')}>
              <span>↑</span>
              <strong>{t.income}</strong>
              <small>{t.recordIncome}</small>
            </Button>
            <Button className="quick-type-button transfer" variant="ghost" type="button" onClick={() => onPickType('transfer')}>
              <span>↔</span>
              <strong>{t.transfer}</strong>
              <small>{t.moveBetweenAccounts}</small>
            </Button>
          </div>
        ) : (
          <>
            <Button className="quick-back" size="sm" variant="ghost" type="button" onClick={onBack}>{t.pickAnotherType}</Button>
            <TransactionFormPanel
              accounts={accounts}
              categories={categories}
              form={form}
              saveTransaction={saveTransaction}
              setForm={setForm}
              t={t}
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
  t,
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
  t: AppText
  updatePrimaryCurrency: (value: PrimaryCurrency) => void
}) {
  return (
    <section className="content-grid accounts-grid">
      <form className="panel transaction-form" onSubmit={saveAccount}>
        <CardHeader className="panel-heading">
          <CardTitle>{accountForm.id ? t.editAccount : t.addAccount}</CardTitle>
          <CardDescription>{t.accountDescription}</CardDescription>
        </CardHeader>
        <Label>
          {t.primaryCurrency}
          <Select disabled={isCurrencyLocked} value={primaryCurrency} onValueChange={(value) => updatePrimaryCurrency(value as PrimaryCurrency)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {currencyOptions.map((option) => <SelectItem key={option.code} value={option.code}>{option.code} - {option.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {isCurrencyLocked && <span className="helper-text">{t.currencyLocked}</span>}
        </Label>
        <Label>
          {t.accountName}
          <Input required placeholder="BCA, Cash, ShopeePay" value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} />
        </Label>
        <div className="form-row">
          <Label>
            {t.type}
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
            {t.color}
            <Input type="color" value={accountForm.color} onChange={(event) => setAccountForm({ ...accountForm, color: event.target.value })} />
          </Label>
        </div>
        <Label>
          {t.initialBalance}
          <Input inputMode="decimal" type="number" value={accountForm.initialBalance} onChange={(event) => setAccountForm({ ...accountForm, initialBalance: event.target.value })} />
        </Label>
        <div className="button-row">
          <Button variant="income" type="submit">{accountForm.id ? t.updateAccount : t.saveAccount}</Button>
          {accountForm.id && <Button variant="ghost" type="button" onClick={() => setAccountForm(emptyAccountForm)}>{t.cancel}</Button>}
        </div>
      </form>
      <Card>
        <CardHeader className="panel-heading">
          <CardTitle>{t.accountList}</CardTitle>
          <CardDescription>{accounts.length} {t.activeAccounts}</CardDescription>
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
                <Button size="sm" variant="ghost" type="button" onClick={() => editAccount(account)}>{t.edit}</Button>
                <Button size="sm" variant="destructive" type="button" onClick={() => archiveAccount(account)}>{t.archive}</Button>
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
  compact = false,
  filters,
  setFilters,
  t,
}: {
  accounts: Account[]
  categories: Category[]
  compact?: boolean
  filters: ReportFilters
  setFilters: React.Dispatch<React.SetStateAction<ReportFilters>>
  t: AppText
}) {
  return (
    <Card className={compact ? 'filter-panel compact-filter-panel' : 'filter-panel'}>
      <Label>
        {t.month}
        <Input type="month" value={filters.month} onChange={(event) => setFilters((current) => ({ ...current, month: event.target.value }))} />
      </Label>
      <Label>
        {t.account}
        <Select value={filters.accountId || 'all-accounts'} onValueChange={(value) => setFilters((current) => ({ ...current, accountId: value === 'all-accounts' ? '' : value }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all-accounts">{t.allAccounts}</SelectItem>
            {accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Label>
      <Label>
        {t.category}
        <Select value={filters.categoryId || 'all-categories'} onValueChange={(value) => setFilters((current) => ({ ...current, categoryId: value === 'all-categories' ? '' : value }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all-categories">{t.allCategories}</SelectItem>
            {categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.icon} {category.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Label>
      <Label>
        {t.type}
        <Select value={filters.type} onValueChange={(value) => setFilters((current) => ({ ...current, type: value as ReportFilters['type'] }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.allTypes}</SelectItem>
            <SelectItem value="income">{t.income}</SelectItem>
            <SelectItem value="expense">{t.expense}</SelectItem>
            <SelectItem value="transfer">{t.transfer}</SelectItem>
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
  t,
  updateTransactionType,
}: {
  accounts: Account[]
  categories: Category[]
  form: TransactionForm
  saveTransaction: (event: FormEvent<HTMLFormElement>) => void
  setForm: React.Dispatch<React.SetStateAction<TransactionForm>>
  t: AppText
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
        <CardTitle>{t.addTransactionTitle}</CardTitle>
        <CardDescription>{t.transactionDescription}</CardDescription>
      </CardHeader>
      <div className="segmented-control three" role="tablist" aria-label="Transaction type">
        <Button variant="ghost" type="button" className={form.type === 'expense' ? 'active expense' : ''} onClick={() => updateTransactionType('expense')}>{t.expense}</Button>
        <Button variant="ghost" type="button" className={form.type === 'income' ? 'active income' : ''} onClick={() => updateTransactionType('income')}>{t.income}</Button>
        <Button variant="ghost" type="button" className={form.type === 'transfer' ? 'active transfer' : ''} onClick={() => updateTransactionType('transfer')}>{t.transfer}</Button>
      </div>
      <Label>
        {t.amount}
        <Input className={`amount-input ${form.type}`} inputMode="decimal" min="0" placeholder="50000" required type="number" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
      </Label>
      <Label>
        {t.date}
        <Input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
      </Label>
      {form.type === 'transfer' ? (
        <div className="form-row">
          <Label>
            {t.from}
            <Select required value={form.fromAccountId} onValueChange={updateFromAccount}>
              <SelectTrigger><SelectValue placeholder={t.chooseAnAccount} /></SelectTrigger>
              <SelectContent>
                {accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Label>
          <Label>
            {t.to}
            <Select required value={form.toAccountId} onValueChange={(value) => setForm({ ...form, toAccountId: value })}>
              <SelectTrigger><SelectValue placeholder={t.chooseAnAccount} /></SelectTrigger>
              <SelectContent>
                {toAccountOptions.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {toAccountOptions.length === 0 && <span className="helper-text">{t.needSecondAccount}</span>}
          </Label>
        </div>
      ) : (
        <div className="form-row">
          <Label>
            {t.account}
            <Select required value={form.accountId} onValueChange={(value) => setForm({ ...form, accountId: value })}>
              <SelectTrigger><SelectValue placeholder={t.chooseAnAccount} /></SelectTrigger>
              <SelectContent>
                {accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Label>
          <Label>
            {t.category}
            <Select required value={form.categoryId} onValueChange={(value) => setForm({ ...form, categoryId: value })}>
              <SelectTrigger><SelectValue placeholder={t.chooseACategory} /></SelectTrigger>
              <SelectContent>
                {categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.icon} {category.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Label>
        </div>
      )}
      <Label>
        {t.note}
        <Input placeholder={t.notePlaceholder} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
      </Label>
      <Button variant={form.type === 'transfer' ? 'transfer' : form.type} type="submit">{t.save}</Button>
    </form>
  )
}

function TopCategoriesPanel({
  compact = false,
  expense,
  formatMoney,
  t,
  topCategories,
}: {
  compact?: boolean
  expense: number
  formatMoney: FormatMoney
  t: AppText
  topCategories: Array<{ category: Category; amount: number }>
}) {
  return (
    <Card className={compact ? 'compact-panel' : ''}>
      <CardHeader className="panel-heading">
        <CardTitle>{compact ? t.topSpending : t.topCategories}</CardTitle>
        <CardDescription>{t.reportExpenseDescription}</CardDescription>
      </CardHeader>
      <CardContent className="category-list">
        {topCategories.length === 0 ? <FriendlyEmptyState description={t.emptySpendingDescription} tone="spending" title={t.emptySpendingTitle} /> : topCategories.map(({ category, amount }) => (
          <div className="category-row" key={category.id}>
            <span className="category-icon" style={{ background: category.color }}>{category.icon}</span>
            <div>
              <strong>{category.name}</strong>
              <small>{Math.round((amount / Math.max(expense, 1)) * 100)}% {t.ofExpense}</small>
              {compact && <span className="spending-bar"><span style={{ width: `${Math.round((amount / Math.max(expense, 1)) * 100)}%`, background: category.color }} /></span>}
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
  compact = false,
  formatMoney,
  onDelete,
  t,
  title,
  transactions,
}: {
  accounts: Account[]
  categories: Category[]
  compact?: boolean
  formatMoney: FormatMoney
  onDelete: ((id: string) => void) | null
  t: AppText
  title: string
  transactions: MoneyTransaction[]
}) {
  return (
    <Card className={compact ? 'transaction-list-panel compact-panel' : 'transaction-list-panel'}>
      <CardHeader className="panel-heading">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{transactions.length} {t.transactionsCount}</CardDescription>
      </CardHeader>
      <CardContent className={compact ? 'transaction-list compact-transaction-list' : 'transaction-list'}>
        {transactions.length === 0 ? <FriendlyEmptyState description={t.emptyMonthDescription} title={t.emptyMonthTitle} /> : transactions.map((transaction) => (
          <TransactionItem accounts={accounts} categories={categories} formatMoney={formatMoney} key={transaction.id} onDelete={onDelete} t={t} transaction={transaction} />
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
  t,
  transaction,
}: {
  accounts: Account[]
  categories: Category[]
  formatMoney: FormatMoney
  onDelete: ((id: string) => void) | null
  t: AppText
  transaction: MoneyTransaction
}) {
  const isTransfer = transaction.type === 'transfer'
  const category = isTransfer ? null : categories.find((item) => item.id === transaction.categoryId)
  const account = isTransfer ? null : accounts.find((item) => item.id === transaction.accountId)
  const fromAccount = isTransfer ? accounts.find((item) => item.id === transaction.fromAccountId) : null
  const toAccount = isTransfer ? accounts.find((item) => item.id === transaction.toAccountId) : null
  const label = isTransfer ? t.transfer : category?.name || t.uncategorized
  const detail = isTransfer
    ? `${fromAccount?.name || t.unknown} → ${toAccount?.name || t.unknown}`
    : account?.name || t.noAccount

  return (
    <article className="transaction-item">
      <span className="category-icon" style={{ background: isTransfer ? 'var(--color-transfer)' : category?.color || '#64748b' }}>{isTransfer ? '↔' : category?.icon || '•'}</span>
      <div className="transaction-main">
        <strong>{label}</strong>
        <small>{transaction.date} · {detail}{transaction.note ? ` · ${transaction.note}` : ''}</small>
      </div>
      <strong className={transaction.type}>{formatTransactionAmount(transaction, formatMoney)}</strong>
      {onDelete && <Button aria-label={t.deleteTransaction} size="sm" variant="destructive" type="button" onClick={() => onDelete(transaction.id)}>{t.delete}</Button>}
    </article>
  )
}

function FriendlyEmptyState({
  description,
  title,
  tone = 'safe',
}: {
  description: string
  title: string
  tone?: 'safe' | 'spending'
}) {
  return (
    <div className={`empty-state friendly-empty ${tone}`}>
      <div className="empty-illustration" aria-hidden="true">
        <span className="empty-orbit" />
        <span className="empty-wallet" />
        <span className="empty-coin" />
      </div>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </div>
  )
}

function ToastViewport({ toasts }: { toasts: ToastMessage[] }) {
  if (toasts.length === 0) return null

  return (
    <div className="toast-viewport" role="status" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div className="toast-card" key={toast.id}>
          <span aria-hidden="true">✓</span>
          <strong>{toast.title}</strong>
        </div>
      ))}
    </div>
  )
}

function useAnimatedNumber(value: number, duration = 500) {
  const [displayValue, setDisplayValue] = useState(value)
  const displayValueRef = useRef(value)

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      const frame = requestAnimationFrame(() => {
        displayValueRef.current = value
        setDisplayValue(value)
      })
      return () => cancelAnimationFrame(frame)
    }

    let frame = 0
    const startValue = displayValueRef.current
    const delta = value - startValue
    const start = performance.now()

    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - (1 - progress) ** 3
      const nextValue = Math.round(startValue + delta * eased)
      displayValueRef.current = nextValue
      setDisplayValue(nextValue)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [duration, value])

  return displayValue
}

function formatTransactionAmount(transaction: MoneyTransaction, formatMoney: FormatMoney) {
  if (transaction.type === 'income') return `+${formatMoney(transaction.amount)}`
  if (transaction.type === 'expense') return `-${formatMoney(transaction.amount)}`
  return formatMoney(transaction.amount)
}

function formatMonthLabel(month: string, language: Language, t: AppText) {
  if (!month) return t.allMonths
  const [year, monthIndex] = month.split('-').map(Number)
  if (!year || !monthIndex) return month

  return new Intl.DateTimeFormat(language === 'id' ? 'id-ID' : 'en-US', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, monthIndex - 1, 1))
}

function getMoneyParts(value: string) {
  const trimmed = value.trim()
  const match = trimmed.match(/^([^\d\-+]*)(.*)$/)

  return {
    symbol: match?.[1]?.trim() || '',
    amount: (match?.[2] || trimmed).trim(),
  }
}

export default App
