export type DocumentMasterDataType = "currency" | "payment_method"

export interface DocumentMasterDataOption {
  id: string
  type: DocumentMasterDataType
  value: string
  label: string
  isActive: boolean
  sortOrder: number
}

export const DEFAULT_CURRENCY_OPTIONS: DocumentMasterDataOption[] = [
  { id: "currency-myr", type: "currency", value: "MYR", label: "MYR", isActive: true, sortOrder: 10 },
  { id: "currency-usd", type: "currency", value: "USD", label: "USD", isActive: true, sortOrder: 20 },
  { id: "currency-sgd", type: "currency", value: "SGD", label: "SGD", isActive: true, sortOrder: 30 },
  { id: "currency-cny", type: "currency", value: "CNY", label: "CNY", isActive: true, sortOrder: 40 },
  { id: "currency-eur", type: "currency", value: "EUR", label: "EUR", isActive: true, sortOrder: 50 },
  { id: "currency-gbp", type: "currency", value: "GBP", label: "GBP", isActive: true, sortOrder: 60 },
  { id: "currency-jpy", type: "currency", value: "JPY", label: "JPY", isActive: true, sortOrder: 70 },
  { id: "currency-aud", type: "currency", value: "AUD", label: "AUD", isActive: true, sortOrder: 80 },
  { id: "currency-thb", type: "currency", value: "THB", label: "THB", isActive: true, sortOrder: 90 },
  { id: "currency-idr", type: "currency", value: "IDR", label: "IDR", isActive: true, sortOrder: 100 },
]

export const DEFAULT_PAYMENT_METHOD_OPTIONS: DocumentMasterDataOption[] = [
  { id: "payment-unpaid", type: "payment_method", value: "", label: "Unpaid / Not Set", isActive: true, sortOrder: 10 },
  { id: "payment-cash", type: "payment_method", value: "cash", label: "Cash", isActive: true, sortOrder: 20 },
  { id: "payment-bank-transfer", type: "payment_method", value: "bank_transfer", label: "Bank Transfer", isActive: true, sortOrder: 30 },
  { id: "payment-online-banking", type: "payment_method", value: "online_banking", label: "Online Banking", isActive: true, sortOrder: 40 },
  { id: "payment-credit-card", type: "payment_method", value: "credit_card", label: "Credit Card", isActive: true, sortOrder: 50 },
  { id: "payment-debit-card", type: "payment_method", value: "debit_card", label: "Debit Card", isActive: true, sortOrder: 60 },
  { id: "payment-ewallet", type: "payment_method", value: "e_wallet", label: "E-Wallet", isActive: true, sortOrder: 70 },
  { id: "payment-cheque", type: "payment_method", value: "cheque", label: "Cheque", isActive: true, sortOrder: 80 },
  { id: "payment-other", type: "payment_method", value: "other", label: "Other Paid Method", isActive: true, sortOrder: 90 },
]

export const DEFAULT_DOCUMENT_MASTER_DATA_OPTIONS = [
  ...DEFAULT_CURRENCY_OPTIONS,
  ...DEFAULT_PAYMENT_METHOD_OPTIONS,
]
