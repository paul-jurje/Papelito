import { useState } from 'react';

type FAQItem = {
  question: string;
  answer: string;
};

const faqs: FAQItem[] = [
  {
    question: 'Can I cancel my subscription anytime?',
    answer:
      'Yes. You can cancel from your account settings at any time. You will keep access through the end of your current billing period.',
  },
  {
    question: 'Where is my writing stored?',
    answer:
      'Your documents are saved to our encrypted database and synced across devices. You can also export any document as Markdown or PDF whenever you want.',
  },
  {
    question: 'Do you offer a student discount?',
    answer:
      'Yes — students with a valid .edu email get 50% off. Email us at support@papelito.example and we will set you up.',
  },
];

export function FAQSection(): JSX.Element {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section
      id="faq"
      className="bg-slate-50/50 py-20 sm:py-24 border-t border-slate-100"
      data-testid="faq-section"
    >
      <div className="mx-auto max-w-3xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Frequently asked questions
          </h2>
          <p className="mt-4 text-base text-slate-500">
            Everything you need to know before you start writing.
          </p>
        </div>

        <ul className="mt-12 divide-y divide-slate-150 border-t border-b border-slate-200">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            const panelId = `faq-panel-${index}`;
            const buttonId = `faq-button-${index}`;
            return (
              <li key={faq.question} data-testid="faq-item" className="transition-all">
                <h3>
                  <button
                    id={buttonId}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    className="flex w-full items-center justify-between gap-6 py-5 text-left text-sm sm:text-base font-bold text-slate-900 hover:text-indigo-600 transition-colors focus:outline-none"
                  >
                    <span>{faq.question}</span>
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform duration-300 ${
                        isOpen ? 'rotate-180 text-indigo-600' : ''
                      }`}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                </h3>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  hidden={!isOpen}
                  className="pb-5 pr-12 text-sm leading-relaxed text-slate-500 transition-all"
                >
                  {faq.answer}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export default FAQSection;
