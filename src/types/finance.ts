export type AccountType = 'cash' | 'bank' | 'credit_card' | 'ewallet' | 'other';
export type TransactionType = 'expense' | 'income' | 'transfer' | 'credit_card_payment' | 'refund';
export type FinancialEffect = 'expense' | 'income' | 'internal_transfer' | 'adjustment';
export type PaymentRail = 'bank_transfer' | 'instapay' | 'pesonet' | 'gcash' | 'maya' | 'cash' | 'debit_card' | 'credit_card' | 'other' | 'unknown';
export type OwnershipStatus = 'owned' | 'external' | 'unknown';
export type CounterpartyType = 'person' | 'merchant' | 'vendor' | 'own_account' | 'unknown';
export type MoneyYapIntent = 'record_transaction' | 'query_finances' | 'edit_transaction' | 'delete_transaction' | 'manage_account' | 'manage_category' | 'manage_space' | 'general_conversation' | 'clarification_response';
export type ClarificationRequest =
  | { type: 'amount'; question: string }
  | { type: 'account'; question: string; accountIds: string[] }
  | { type: 'space'; question: string; spaceIds: string[] }
  | { type: 'category'; question: string; categoryIds: string[] }
  | { type: 'ownership'; question: string };
export type CategoryType = 'expense' | 'income';
export type MemberRole = 'owner' | 'admin' | 'member';

export interface WorkspaceMember {
  id: string;
  fullName: string;
  initials: string;
  role: MemberRole;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  role: MemberRole;
  createdAt: string;
}

export type HouseholdMember = WorkspaceMember;

export interface Space {
  id: string;
  name: string;
  icon: string;
  color: string;
  sortOrder: number;
  isArchived: boolean;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  institution: string | null;
  currency: string;
  openingBalance: number;
  balance: number;
  ownerUserId: string | null;
  spaceId: string | null;
  accent: string;
  isActive: boolean;
}

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  spaceId: string | null;
  parentId: string | null;
  sortOrder: number;
  isSystem: boolean;
  isArchived: boolean;
}

export interface Counterparty {
  id: string;
  name: string;
  type: CounterpartyType;
  defaultCategoryId: string | null;
  defaultClassification: FinancialEffect | null;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  financialEffect: FinancialEffect;
  paymentRail: PaymentRail;
  amount: number;
  currency: string;
  merchant: string | null;
  counterpartyId: string | null;
  counterpartyName: string | null;
  ownershipStatus: OwnershipStatus;
  spaceId: string;
  categoryId: string | null;
  tagIds: string[];
  accountFromId: string | null;
  accountToId: string | null;
  paidByUserId: string | null;
  transactionDate: string;
  notes: string | null;
  originalMessage: string | null;
  bankTransactionLabel: string | null;
  referenceNumber: string | null;
  rawExtraction: Record<string, unknown> | null;
  classificationReviewRequired: boolean;
  aiParsed: boolean;
  aiConfidence: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ParsedTransactionDraft {
  transactionType: TransactionType;
  financialEffect?: FinancialEffect;
  paymentRail?: PaymentRail;
  amount: number;
  currency: string;
  merchant: string | null;
  counterpartyId?: string | null;
  counterpartyName?: string | null;
  counterpartyType?: CounterpartyType;
  counterpartyIdentifiers?: Record<string, string>;
  ownershipStatus?: OwnershipStatus;
  spaceId: string | null;
  categoryId: string | null;
  tagIds: string[];
  accountFromId: string | null;
  accountToId: string | null;
  paidByUserId: string | null;
  transactionDate: string;
  notes: string | null;
  originalMessage: string;
  confidence: number;
  needsConfirmation: boolean;
  classificationReviewRequired?: boolean;
  confirmationQuestion?: string;
  candidateAccountIds?: string[];
  candidateCategoryIds?: string[];
  candidateSpaceIds?: string[];
  sourceKind?: 'text' | 'image';
  referenceNumber?: string | null;
  bankTransactionLabel?: string | null;
  rawExtraction?: Record<string, unknown> | null;
  evidence?: string[];
  possibleDuplicate?: boolean;
  clarification?: ClarificationRequest | null;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  messageType: 'text' | 'finance_answer' | 'transaction_draft' | 'clarification' | 'management_action' | 'error';
  intent: MoneyYapIntent | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ChatTurnResponse {
  conversationId: string;
  intent: { type: MoneyYapIntent; confidence: number };
  reply: string;
  draft: ParsedTransactionDraft | null;
  drafts: ParsedTransactionDraft[];
  clarification: ClarificationRequest | null;
  queryContext: Record<string, unknown> | null;
  queryResult: Record<string, unknown> | null;
  suggestedActions: string[];
  messages: ConversationMessage[];
}

export interface TransactionImageAttachment {
  uri: string;
  base64: string;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
  fileName: string | null;
}

export interface ImageTransactionAnalysis {
  documentKind: 'receipt' | 'bank_confirmation' | 'ewallet_confirmation' | 'bank_statement' | 'card_statement' | 'unknown';
  sourceSummary: string;
  warnings: string[];
  drafts: ParsedTransactionDraft[];
  conversationId?: string | null;
  messages?: ConversationMessage[];
}

export interface MonthlyPoint {
  label: string;
  income: number;
  expense: number;
  showLabel?: boolean;
}
