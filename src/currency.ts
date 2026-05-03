import type { PrimaryCurrency } from './db'

export const currencyOptions: Array<{ code: PrimaryCurrency; label: string; locale: string }> = [
  { code: 'IDR', label: 'Indonesian Rupiah', locale: 'id-ID' },
  { code: 'SAR', label: 'Saudi Riyal', locale: 'ar-SA' },
  { code: 'USD', label: 'US Dollar', locale: 'en-US' },
]

export function getCurrencyMeta(currency: PrimaryCurrency) {
  return currencyOptions.find((option) => option.code === currency) || currencyOptions[0]
}

export function getMinorUnitDigits(currency: PrimaryCurrency) {
  if (currency === 'IDR') return 0
  if (currency === 'SAR' || currency === 'USD') return 2

  return new Intl.NumberFormat(getCurrencyMeta(currency).locale, {
    style: 'currency',
    currency,
  }).resolvedOptions().maximumFractionDigits ?? 2
}

export function parseMajorToMinor(value: string, currency: PrimaryCurrency) {
  const normalized = value.trim().replace(/,/g, '.')
  const major = Number(normalized)
  if (!Number.isFinite(major)) return 0

  return Math.round(major * 10 ** getMinorUnitDigits(currency))
}

export function minorToMajorInput(value: number, currency: PrimaryCurrency) {
  const digits = getMinorUnitDigits(currency)
  const major = value / 10 ** digits
  return digits === 0 ? String(Math.round(major)) : major.toFixed(digits)
}

export function formatMinorMoney(value: number, currency: PrimaryCurrency) {
  const meta = getCurrencyMeta(currency)
  const digits = getMinorUnitDigits(currency)

  return new Intl.NumberFormat(meta.locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value / 10 ** digits)
}
