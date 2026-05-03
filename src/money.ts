import type { Account, Category, MoneyTransaction, TransactionType } from './db'

export type ReportFilters = {
  month: string
  accountId: string
  categoryId: string
  type: 'all' | TransactionType
}

export function signedAmount(transaction: MoneyTransaction) {
  if (transaction.type === 'income') return transaction.amount
  if (transaction.type === 'expense') return -transaction.amount
  return 0
}

export function transactionTouchesAccount(transaction: MoneyTransaction, accountId: string) {
  if (!accountId) return true
  if (transaction.type === 'transfer') {
    return transaction.fromAccountId === accountId || transaction.toAccountId === accountId
  }
  return transaction.accountId === accountId
}

/**
 * Account balance is computed from the immutable transaction ledger:
 *
 * $$
 * \text{Balance}_{\text{final}} = \text{Balance}_{\text{init}} + \sum \text{Income} - \sum \text{Expense} + (\sum \text{Transfer}_{\text{in}} - \sum \text{Transfer}_{\text{out}})
 * $$
 */
export function calculateAccountBalance(account: Account, transactions: MoneyTransaction[]) {
  return transactions.reduce((balance, transaction) => {
    if (transaction.type === 'income' && transaction.accountId === account.id) {
      return balance + transaction.amount
    }

    if (transaction.type === 'expense' && transaction.accountId === account.id) {
      return balance - transaction.amount
    }

    if (transaction.type === 'transfer' && transaction.fromAccountId === account.id) {
      return balance - transaction.amount
    }

    if (transaction.type === 'transfer' && transaction.toAccountId === account.id) {
      return balance + transaction.amount
    }

    return balance
  }, account.initialBalance)
}

export function filterTransactions(transactions: MoneyTransaction[], filters: ReportFilters) {
  return transactions.filter((transaction) => {
    const matchesMonth = !filters.month || transaction.date.startsWith(filters.month)
    const matchesAccount = transactionTouchesAccount(transaction, filters.accountId)
    const matchesCategory =
      !filters.categoryId ||
      (transaction.type !== 'transfer' && transaction.categoryId === filters.categoryId)
    const matchesType = filters.type === 'all' || transaction.type === filters.type

    return matchesMonth && matchesAccount && matchesCategory && matchesType
  })
}

export function getReportTotals(transactions: MoneyTransaction[]) {
  const income = transactions
    .filter((transaction) => transaction.type === 'income')
    .reduce((sum, transaction) => sum + transaction.amount, 0)
  const expense = transactions
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + transaction.amount, 0)

  return {
    income,
    expense,
    net: income - expense,
  }
}

export function getTopCategories(transactions: MoneyTransaction[], categories: Category[]) {
  const totalsByCategory = new Map<string, number>()

  for (const transaction of transactions) {
    if (transaction.type !== 'expense') continue
    totalsByCategory.set(
      transaction.categoryId,
      (totalsByCategory.get(transaction.categoryId) || 0) + transaction.amount,
    )
  }

  return [...totalsByCategory.entries()]
    .map(([categoryId, amount]) => ({
      category: categories.find((category) => category.id === categoryId),
      amount,
    }))
    .filter((item): item is { category: Category; amount: number } => Boolean(item.category))
    .sort((a, b) => b.amount - a.amount)
}
