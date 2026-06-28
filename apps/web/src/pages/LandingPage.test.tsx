import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LandingPage from './LandingPage';
import { AuthProvider } from '../context/AuthContext';

// The Header now reads auth state, so the landing page must be rendered
// inside an AuthProvider. Stub `fetch` so the provider's /api/auth/me call
// resolves cleanly (treat as unauthenticated, which is the landing-page default).
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ message: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderLandingPage() {
  const result = render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <LandingPage />
      </AuthProvider>
    </MemoryRouter>,
  );
  // Wait for AuthProvider's /api/auth/me fetch to settle so subsequent
  // assertions run inside React's act() boundary.
  await waitFor(() => {
    expect(screen.getByTestId('header')).toBeInTheDocument();
  });
  return result;
}

describe('LandingPage', () => {
  it('renders the headline and subhead', async () => {
    await renderLandingPage();

    expect(screen.getByTestId('hero-headline')).toHaveTextContent(/write more/i);
    expect(
      screen.getByText(/distraction-free writing app that saves your work/i),
    ).toBeInTheDocument();
  });

  it('renders the three benefit cards', async () => {
    await renderLandingPage();

    const benefits = screen.getByTestId('benefits-section');
    const items = within(benefits).getAllByTestId('benefit-item');
    expect(items).toHaveLength(3);
  });

  it('renders the pricing card with the 5,99 €/mo plan and Subscribe CTA', async () => {
    await renderLandingPage();

    const pricing = screen.getByTestId('pricing-section');
    expect(within(pricing).getByTestId('pricing-amount')).toHaveTextContent('5,99 €');
    expect(within(pricing).getByText('/month')).toBeInTheDocument();
    expect(within(pricing).getByTestId('subscribe-button')).toHaveTextContent(/subscribe/i);
  });

  it('renders at least three FAQ items', async () => {
    await renderLandingPage();

    const faq = screen.getByTestId('faq-section');
    const items = within(faq).getAllByTestId('faq-item');
    expect(items.length).toBeGreaterThanOrEqual(3);
  });

  it('renders the header and footer', async () => {
    await renderLandingPage();

    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
  });

  it('Subscribe CTA links unauthenticated visitors to the register page', async () => {
    await renderLandingPage();

    const subscribeCta = screen.getByTestId('subscribe-button');
    // For unauthenticated users (the landing-page default in this test),
    // the CTA is a link to register with a `next` query so the user
    // returns here after signing in.
    expect(subscribeCta.tagName).toBe('A');
    expect(subscribeCta).toHaveAttribute('href', expect.stringMatching(/^\/register\?next=/));
  });
});
