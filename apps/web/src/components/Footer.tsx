export function Footer(): JSX.Element {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-slate-100 bg-white" data-testid="footer">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-xs font-medium text-slate-400 sm:flex-row">
        <p>&copy; {year} Papelito. All rights reserved.</p>
        <nav aria-label="Footer" className="flex gap-6">
          <a href="#features" className="hover:text-slate-900 transition-colors">
            Features
          </a>
          <a href="#pricing" className="hover:text-slate-900 transition-colors">
            Pricing
          </a>
          <a href="#faq" className="hover:text-slate-900 transition-colors">
            FAQ
          </a>
        </nav>
      </div>
    </footer>
  );
}

export default Footer;
