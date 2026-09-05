import type { PluginListenerHandle } from '@capacitor/core';

export interface RunluSubscriptionProduct {
  available: boolean;
  productId: string;
  displayName?: string;
  description?: string;
  displayPrice?: string;
  periodValue?: number;
  periodUnit?: string;
  introEligible?: boolean;
  introAvailable?: boolean;
  introPeriodValue?: number;
  introPeriodUnit?: string;
  introPaymentMode?: string;
}

export interface RunluSubscriptionEntitlement {
  productId: string;
  entitled: boolean;
  state: string;
  expirationDate?: string;
  originalPurchaseDate?: string;
  environment?: string;
}

export interface RunluSubscriptionPlugin {
  getProduct(): Promise<RunluSubscriptionProduct>;
  getEntitlement(): Promise<RunluSubscriptionEntitlement>;
  purchase(): Promise<RunluSubscriptionEntitlement & { purchaseResult: string }>;
  restore(): Promise<RunluSubscriptionEntitlement & { restored: boolean }>;
  manageSubscriptions(): Promise<{ presented: boolean }>;
  addListener(eventName: 'entitlementChanged', listenerFunc: (state: RunluSubscriptionEntitlement) => void): Promise<PluginListenerHandle>;
}

export declare const RunluSubscription: RunluSubscriptionPlugin;
