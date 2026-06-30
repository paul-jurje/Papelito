import { Link } from 'react-router-dom';

export function HeroSection(): JSX.Element {
  return (
    <section
      className="relative overflow-hidden bg-gradient-to-b from-indigo-50/40 via-white to-slate-50/50"
      data-testid="hero-section"
    >
      {/* Visual background decorators */}
      <div className="absolute top-0 left-1/2 -z-10 h-[600px] w-[1000px] -translate-x-1/2 [mask-image:radial-gradient(100%_100%_at_top_center,white,transparent)]">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 opacity-30 blur-3xl" />
      </div>

      <div className="mx-auto max-w-6xl px-6 pt-20 pb-16 text-center sm:pt-28 lg:pt-32">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-widest text-indigo-700">
          ✨ A focused writing workspace
        </p>
        <h1
          className="mt-6 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl text-wrap"
          data-testid="hero-headline"
        >
          Write more.
          <span className="block mt-1 bg-gradient-to-r from-indigo-600 via-indigo-900 to-indigo-600 bg-clip-text text-transparent pb-2">Worry less.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base text-slate-600 sm:text-lg">
          Papelito is a distraction-free writing app that saves your work as you type. No clutter,
          no setup — just a beautiful, quiet place for your words.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3.5 sm:flex-row">
          <Link
            to="/register?next=/editor"
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition-all hover:shadow-md hover:scale-[1.01]"
            data-testid="hero-cta"
          >
            Start writing for 4,59 €/mo
          </Link>
          <a
            href="#features"
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-600 shadow-xs hover:bg-slate-50 transition-colors"
          >
            See features
          </a>
        </div>
        <p className="mt-4 text-xs font-medium text-slate-400">
          Cancel anytime. 30-day money-back guarantee.
        </p>

        {/* Mock Editor Preview Canvas */}
        <div className="mx-auto mt-16 max-w-4xl rounded-2xl border border-slate-200/80 bg-white p-2.5 shadow-xl shadow-slate-100 sm:mt-20">
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-6 sm:p-10 text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-slate-200" />
                <span className="h-3 w-3 rounded-full bg-slate-200" />
                <span className="h-3 w-3 rounded-full bg-slate-200" />
                <span className="ml-3 text-xs font-medium text-slate-400 select-none">
                  The Great Novel.txt
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[11px] font-semibold text-emerald-700 tracking-wide uppercase">
                  Autosaved
                </span>
              </div>
            </div>
            <div className="writing-font space-y-4 text-slate-800">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 border-none outline-none">
                Chapter One: The Quiet Shore
              </h2>
              <p className="text-sm leading-relaxed sm:text-base">
                The sea was flat and calm, reflecting the pale silver of the morning sky. In the
                small cabin atop the dunes, nothing could be heard but the soft click of the keys
                and the rhythmic wash of the tides below. For the first time in months, the words
                flowed without hesitation...
              </p>
              <p className="text-sm leading-relaxed sm:text-base opacity-40 select-none border-l-2 border-indigo-600 pl-1 animate-pulse">
                Type your thoughts here, without distractions|
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default HeroSection;
