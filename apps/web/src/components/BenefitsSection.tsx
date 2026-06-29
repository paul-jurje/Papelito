type Benefit = {
  title: string;
  description: string;
  icon: JSX.Element;
};

const benefits: Benefit[] = [
  {
    title: 'Distraction-free writing',
    description:
      'A clean, minimal editor that gets out of the way so you can focus on the words that matter.',
    icon: (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="h-6 w-6"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h16" />
      </svg>
    ),
  },
  {
    title: 'Auto-save & sync',
    description:
      'Your drafts save automatically and stay in sync across every device. No more "I lost my work" moments.',
    icon: (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="h-6 w-6"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v16h16V8l-4-4H4zM4 14h16M9 8h6" />
      </svg>
    ),
  },
  {
    title: 'Yours forever',
    description:
      'Export your documents any time as Markdown or PDF. Your words stay yours — no lock-in, ever.',
    icon: (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="h-6 w-6"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"
        />
      </svg>
    ),
  },
];

export function BenefitsSection(): JSX.Element {
  return (
    <section
      id="features"
      className="bg-slate-50/50 py-20 sm:py-24 border-t border-slate-100"
      data-testid="benefits-section"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Built for writers, not feature checklists
          </h2>
          <p className="mt-4 text-base text-slate-500">
            Everything you need to get words on the page. Nothing you don&rsquo;t.
          </p>
        </div>

        <ul className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((benefit) => (
            <li
              key={benefit.title}
              className="group rounded-2xl border border-slate-200/60 bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-indigo-100"
              data-testid="benefit-item"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm transition-colors group-hover:bg-indigo-600">
                {benefit.icon}
              </div>
              <h3 className="mt-6 text-lg font-bold text-slate-900 group-hover:text-indigo-950 transition-colors">
                {benefit.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-500">{benefit.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default BenefitsSection;
