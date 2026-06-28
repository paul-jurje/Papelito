import SubscribeButton from './SubscribeButton';

const features: string[] = [
  'Unlimited documents',
  'Auto-save & sync across devices',
  'Beautiful, distraction-free editor',
  'Export to Markdown and PDF',
  'Email support',
];

export function PricingSection(): JSX.Element {
  return (
    <section id="pricing" className="bg-white py-20 sm:py-24 border-t border-slate-100" data-testid="pricing-section">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            One simple plan
          </h2>
          <p className="mt-4 text-base text-slate-500">
            No tiers, no surprises. Pay monthly, cancel anytime.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-md">
          <div
            className="relative flex flex-col rounded-3xl border border-slate-200/80 bg-white p-8 shadow-xl shadow-slate-100/50 hover:shadow-2xl hover:shadow-indigo-50/30 transition-all duration-300"
            data-testid="pricing-card"
          >
            {/* Top highlight bar */}
            <div className="absolute top-0 inset-x-0 h-1.5 rounded-t-3xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-indigo-700" />

            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Papelito Pro</h3>
              <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                Most Popular
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-400">For writers who want a quiet place to work.</p>

            <div className="mt-6 flex items-baseline gap-1.5">
              <span
                className="text-5xl font-extrabold tracking-tight text-slate-900"
                data-testid="pricing-amount"
              >
                5,99 €
              </span>
              <span className="text-sm font-semibold text-slate-400">/month</span>
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
              className="mt-8 w-full rounded-xl bg-slate-900 py-3.5 text-sm font-bold text-white shadow-sm hover:bg-slate-800 transition-all hover:shadow-md hover:scale-[1.01]"
            />

            <p className="mt-3.5 text-center text-xs text-slate-400 font-medium">
              Secure checkout. Cancel anytime.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default PricingSection;
