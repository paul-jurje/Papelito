export interface User {
  id: number;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
}

export const EMPTY_PROSEMIRROR_DOC = '{"type":"doc","content":[]}';
export const DEFAULT_DOCUMENT_TITLE = 'Untitled document';

export interface Document {
  id: string;
  userId: number;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDocumentInput {
  userId: number;
  title?: string;
  content?: string;
}

export interface UpdateDocumentInput {
  title?: string;
  content?: string;
}

export interface Subscription {
  id: number;
  userId: number;
  planId: number | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: string;
  currentPeriodEnd: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrUpdateSubscriptionInput {
  userId: number;
  planId?: number | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  status?: string;
  currentPeriodEnd?: Date | null;
}

export interface Plan {
  id: number;
  stripePriceId: string;
  displayName: string;
  interval: string;
  amountCents: number;
  currency: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertPlanInput {
  stripePriceId: string;
  displayName: string;
  interval: string;
  amountCents: number;
  currency: string;
  active: boolean;
}
