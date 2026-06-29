import { useEffect, useState } from 'react';
import SubscribeButton, { type Plan } from './SubscribeButton';
import { api } from '../lib/api';

const features: string[] = [
  'Unlimited documents',
  'Auto-save & sync across devices',
  'Beautiful, distraction-free editor',
  'Export to Markdown and PDF',
  'Email support',
];

const DEFAULT_PLAN: Plan = {
  id: 0,
  stripePriceId: 'price_default',
  displayName: 'Papelito Pro',
  interval: 'month',
  amountCents: 599,
  currency: 'eur',
  active: true,
};

function formatPrice(amountCents: number, currency: string): string {
  const amount = amountCents / 100;
  if (currency.toLowerCase() === 'eur') {
    const formatted = amount.toFixed(2).replace('.', ',');
    return formatted.endsWith(',00') ? `${formatted.slice(0, -3)} €` : `${formatted} €`;
  }
  return `${amount} ${currency.toUpperCase()}`;
}

export function PricingSection(): JSX.Element {
  const [plans, setPlans] = useState<Plan[]>([DEFAULT_PLAN]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await api<{ plans: Plan[] }>('/api/billing/plans');
        if (!active) return;
        const activePlans = data.plans.filter((p) => p.active);
        if (activePlans.length > 0) {
          setPlans(activePlans);
        }
      } catch (err: unknown) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Could not load pricing plans.');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <section
      id="pricing"
      className="bg-white py-20 sm:py-24 border-t border-slate-100"
      data-testid="pricing-section"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="mt-4 text-base text-slate-500">
            Choose the plan that fits your writing pace. Cancel anytime.
          </p>
        </div>

        <div className="mx-auto mt-12 flex flex-row overflow-x-auto gap-8 pb-6 snap-x snap-mandatory scrollbar-none scroll-smooth justify-start md:justify-center md:flex-wrap max-w-5xl">
          {plans.map((plan) => {
            const isPopular = plan.interval === 'month';
            const isBestValue = plan.interval === 'year';

            return (
              <div
                key={plan.id}
                className="relative flex flex-col rounded-3xl border border-slate-200/80 bg-white p-8 shadow-xl shadow-slate-100/50 hover:shadow-2xl hover:shadow-indigo-50/30 transition-all duration-300 snap-center shrink-0 w-80 sm:w-96"
                data-testid="pricing-card"
              >
                {/* Top highlight bar */}
                {isPopular && (
                  <div className="absolute top-0 inset-x-0 h-1.5 rounded-t-3xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-indigo-700" />
                )}
                {isBestValue && (
                  <div className="absolute top-0 inset-x-0 h-1.5 rounded-t-3xl bg-gradient-to-r from-emerald-500 via-emerald-600 to-emerald-700" />
                )}

                <div className="flex items-center justify-between">
                  {isPopular && (
                    <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                      Most Popular
                    </span>
                  )}
                  {isBestValue && (
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                      Best Value
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  For writers who want a quiet place to work.
                </p>

                <div className="mt-6 flex items-baseline gap-1.5">
                  <span
                    className="text-5xl font-extrabold tracking-tight text-slate-900"
                    data-testid="pricing-amount"
                  >
                    {formatPrice(plan.amountCents, plan.currency)}
                  </span>
                  <span className="text-sm font-semibold text-slate-400 font-medium">
                    /{plan.interval}
                  </span>
                </div>

                <ul className="mt-8 space-y-3.5 text-sm text-slate-600">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          className="h-3 w-3"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                      <span className="font-medium text-slate-600">{feature}</span>
                    </li>
                  ))}
                </ul>

                <SubscribeButton
                  variant="solid"
                  label="Subscribe"
                  returnTo="/editor"
                  planId={plan.id > 0 ? String(plan.id) : undefined}
                  className="mt-8 w-full rounded-xl bg-slate-900 py-3.5 text-sm font-bold text-white shadow-sm hover:bg-slate-800 transition-all hover:shadow-md hover:scale-[1.01]"
                />

                <p className="mt-3.5 text-center text-xs text-slate-400 font-medium">
                  Secure checkout. Cancel anytime.
                </p>
              </div>
            );
          })}
        </div>

        {error && <p className="mt-6 text-center text-xs text-red-500 font-medium">{error}</p>}
      </div>
    </section>
  );
}

export default PricingSection;
