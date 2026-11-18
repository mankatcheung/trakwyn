import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
}));

// The quota hint is covered by QuotaHint.test.tsx; here it would need a query client of its own.
vi.mock('#/features/quota/lib/contentQuota', () => ({ useQuotaState: () => null }));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({ useParams: () => ({ applicationId: 'app-1' }) }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import { gqlText } from '#/__tests__/helpers/gqlText';
import { mockGql, respond, respondError, respondWith } from '#/__tests__/helpers/gqlMock';
import type { ResultOf } from '@graphql-typed-document-node/core';
import type { GqlResponse } from '#/__tests__/helpers/gqlMock';
import {
  CREATE_OFFER_MUTATION,
  DELETE_OFFER_MUTATION,
  OFFERS_QUERY,
  UPDATE_OFFER_MUTATION,
} from '#/features/offers/graphql/applicationOffersQueries';
import { ApplicationOffersPage } from '../ApplicationOffersPage';

const offer = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'offer-1',
  applicationId: 'app-1',
  baseSalary: 150000,
  bonus: 10000,
  equity: '1000 RSUs',
  benefits: 'Health, 401k',
  costOfLivingAdjustment: null,
  currency: 'USD',
  period: 'yearly',
  notes: 'Great offer',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

const cardFor = (text: string) =>
  screen.getByText(text).closest('div[class*="bg-white"]') as HTMLElement;

const planRequired = {
  response: {
    errors: [{ message: 'Offers are a Pro feature.', extensions: { code: 'PLAN_REQUIRED' } }],
  },
};

let client: QueryClient;

function renderPage() {
  return render(
    <QueryClientProvider client={client}>
      <ApplicationOffersPage />
    </QueryClientProvider>,
  );
}

const callsTo = (name: string) =>
  mockGqlRequest.mock.calls.filter(([query]) => gqlText(query).includes(name));

/** Answers the list query from `list()` and every other operation from `others`. */
function serve(list: () => ResultOf<typeof OFFERS_QUERY>['offers'], others: GqlResponse[] = []) {
  mockGql(mockGqlRequest, [respond(OFFERS_QUERY, () => ({ offers: list() })), ...others]);
}

function fillSalary(value: string) {
  const salaryInput = screen
    .getByText('Base Salary *')
    .parentElement?.querySelector('input') as HTMLInputElement;
  fireEvent.change(salaryInput, { target: { value } });
}

describe('OffersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it('shows an empty state when there are no offers', async () => {
    serve(() => []);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/no offers yet/i)).toBeInTheDocument();
    });
  });

  it('renders an offer with formatted salary, bonus, equity, benefits, and notes', async () => {
    serve(() => [offer()]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('$150,000/yr')).toBeInTheDocument();
    });
    expect(screen.getByText('+ $10,000/yr bonus')).toBeInTheDocument();
    expect(screen.getByText('Equity: 1000 RSUs')).toBeInTheDocument();
    expect(screen.getByText('Benefits: Health, 401k')).toBeInTheDocument();
    expect(screen.getByText('Great offer')).toBeInTheDocument();
  });

  it('shows the upgrade prompt when reading the offers needs Pro', async () => {
    mockGqlRequest.mockRejectedValue(planRequired);
    renderPage();

    expect(await screen.findByText(/offers are a pro feature/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /pro includes/i })).toBeInTheDocument();
  });

  describe('create', () => {
    it('saves the offer and shows it from the refetched list, closing the form', async () => {
      let saved = false;
      serve(
        () => (saved ? [offer({ id: 'offer-2', baseSalary: 120000 })] : []),
        [respond(CREATE_OFFER_MUTATION, { createOffer: { id: 'offer-2' } })],
      );
      renderPage();
      await screen.findByText(/no offers yet/i);

      fireEvent.click(screen.getByRole('button', { name: /add offer/i }));
      fillSalary('120000');
      saved = true;
      fireEvent.click(screen.getByRole('button', { name: /save offer/i }));

      expect(await screen.findByText('$120,000/yr', {}, { timeout: 3000 })).toBeInTheDocument();
      expect(callsTo('CreateOffer')[0][1]).toEqual({
        input: expect.objectContaining({ applicationId: 'app-1', baseSalary: 120000 }),
      });
      expect(screen.queryByText('Base Salary *')).toBeNull();
    });

    it('refreshes /offers and the tab badge too', async () => {
      serve(() => [], [respond(CREATE_OFFER_MUTATION, { createOffer: { id: 'offer-2' } })]);
      const invalidate = vi.spyOn(client, 'invalidateQueries');
      renderPage();
      await screen.findByText(/no offers yet/i);

      fireEvent.click(screen.getByRole('button', { name: /add offer/i }));
      fillSalary('120000');
      fireEvent.click(screen.getByRole('button', { name: /save offer/i }));

      await waitFor(() => {
        const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
        expect(keys).toContainEqual(['offers', 'app-1']);
        expect(keys).toContainEqual(['myOffers']);
        expect(keys).toContainEqual(['sectionCounts', 'app-1']);
      });
    });

    it('creates once on a double click', async () => {
      let release: (value: ResultOf<typeof CREATE_OFFER_MUTATION>) => void = () => {};
      mockGql(mockGqlRequest, [
        respondWith(
          CREATE_OFFER_MUTATION,
          () =>
            new Promise((resolve) => {
              release = resolve;
            }),
        ),
        respond(OFFERS_QUERY, { offers: [] }),
      ]);
      renderPage();
      await screen.findByText(/no offers yet/i);
      fireEvent.click(screen.getByRole('button', { name: /add offer/i }));
      fillSalary('120000');

      const save = screen.getByRole('button', { name: /save offer/i });
      fireEvent.click(save);
      await waitFor(() => expect(callsTo('CreateOffer')).toHaveLength(1));
      fireEvent.click(save);
      release({ createOffer: { id: 'offer-2' } });

      await waitFor(() => expect(screen.queryByText('Base Salary *')).toBeNull());
      expect(callsTo('CreateOffer')).toHaveLength(1);
    });

    it('shows the API message under the form and keeps it open when the save fails', async () => {
      serve(
        () => [],
        [
          respondError(CREATE_OFFER_MUTATION, {
            response: {
              errors: [{ message: 'Offer limit reached', extensions: { code: 'VALIDATION' } }],
            },
          }),
        ],
      );
      renderPage();
      await screen.findByText(/no offers yet/i);
      fireEvent.click(screen.getByRole('button', { name: /add offer/i }));
      fillSalary('120000');

      fireEvent.click(screen.getByRole('button', { name: /save offer/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Offer limit reached');
      expect(screen.getByText('Base Salary *')).toBeInTheDocument();
    });

    it('shows the upgrade prompt, not an alert, when the plan has no offers', async () => {
      serve(() => [], [respondError(CREATE_OFFER_MUTATION, planRequired)]);
      renderPage();
      await screen.findByText(/no offers yet/i);
      fireEvent.click(screen.getByRole('button', { name: /add offer/i }));
      fillSalary('120000');

      fireEvent.click(screen.getByRole('button', { name: /save offer/i }));

      expect(await screen.findByText(/offers are a pro feature/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /pro includes/i })).toBeInTheDocument();
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  describe('update', () => {
    it('opens the edit form pre-filled when the edit icon is clicked', async () => {
      serve(() => [offer()]);
      renderPage();
      await screen.findByText('$150,000/yr');

      fireEvent.click(within(cardFor('$150,000/yr')).getAllByRole('button')[0]);

      expect(screen.getByText('Edit Offer')).toBeInTheDocument();
      expect(screen.getByDisplayValue('1000 RSUs')).toBeInTheDocument();
    });

    it('saves the change with the offer id and shows the refetched list', async () => {
      let salary = 150000;
      serve(
        () => [offer({ baseSalary: salary })],
        [respond(UPDATE_OFFER_MUTATION, { updateOffer: { id: 'offer-1' } })],
      );
      renderPage();
      await screen.findByText('$150,000/yr');
      fireEvent.click(within(cardFor('$150,000/yr')).getAllByRole('button')[0]);

      fillSalary('175000');
      salary = 175000;
      fireEvent.click(screen.getByRole('button', { name: /save offer/i }));

      expect(await screen.findByText('$175,000/yr', {}, { timeout: 3000 })).toBeInTheDocument();
      expect(callsTo('UpdateOffer')[0][1]).toEqual({
        input: expect.objectContaining({ offerId: 'offer-1', baseSalary: 175000 }),
      });
      expect(screen.queryByText('Edit Offer')).toBeNull();
    });

    it('shows a failed update under the form instead of only logging it', async () => {
      serve(() => [offer()], [respondError(UPDATE_OFFER_MUTATION, planRequired)]);
      renderPage();
      await screen.findByText('$150,000/yr');
      fireEvent.click(within(cardFor('$150,000/yr')).getAllByRole('button')[0]);

      fireEvent.click(screen.getByRole('button', { name: /save offer/i }));

      expect(await screen.findByText(/offers are a pro feature/i)).toBeInTheDocument();
      expect(screen.getByText('Edit Offer')).toBeInTheDocument();
    });

    it('updates once on a double click', async () => {
      let release: (value: ResultOf<typeof UPDATE_OFFER_MUTATION>) => void = () => {};
      mockGql(mockGqlRequest, [
        respondWith(
          UPDATE_OFFER_MUTATION,
          () =>
            new Promise((resolve) => {
              release = resolve;
            }),
        ),
        respond(OFFERS_QUERY, { offers: [offer()] }),
      ]);
      renderPage();
      await screen.findByText('$150,000/yr');
      fireEvent.click(within(cardFor('$150,000/yr')).getAllByRole('button')[0]);

      const save = screen.getByRole('button', { name: /save offer/i });
      fireEvent.click(save);
      await waitFor(() => expect(callsTo('UpdateOffer')).toHaveLength(1));
      fireEvent.click(save);
      release({ updateOffer: { id: 'offer-1' } });

      await waitFor(() => expect(screen.queryByText('Edit Offer')).toBeNull());
      expect(callsTo('UpdateOffer')).toHaveLength(1);
    });
  });

  describe('delete', () => {
    it('deletes an offer after confirming and shows the refetched list', async () => {
      let offers = [offer()];
      serve(() => offers, [respond(DELETE_OFFER_MUTATION, { deleteOffer: true })]);
      vi.stubGlobal(
        'confirm',
        vi.fn(() => true),
      );
      renderPage();
      await screen.findByText('$150,000/yr');

      offers = [];
      fireEvent.click(within(cardFor('$150,000/yr')).getAllByRole('button')[1]);

      await waitFor(() => {
        expect(callsTo('DeleteOffer')[0][1]).toEqual({ id: 'offer-1' });
      });
      // The API's `deleteOffer(id:)` is a `String!`; declaring `$id: ID!` made it
      // answer 400 (JEF-637), so the document's variable type is pinned here.
      const [document] = callsTo('DeleteOffer')[0];
      const variable = (
        document as {
          definitions: { variableDefinitions: { type: { type: { name: { value: string } } } }[] }[];
        }
      ).definitions[0].variableDefinitions[0];
      expect(variable.type.type.name.value).toBe('String');
      expect(await screen.findByText(/no offers yet/i)).toBeInTheDocument();

      vi.unstubAllGlobals();
    });

    it('does not delete when the confirmation is dismissed', async () => {
      serve(() => [offer()]);
      vi.stubGlobal(
        'confirm',
        vi.fn(() => false),
      );
      renderPage();
      await screen.findByText('$150,000/yr');

      fireEvent.click(within(cardFor('$150,000/yr')).getAllByRole('button')[1]);

      expect(callsTo('DeleteOffer')).toHaveLength(0);

      vi.unstubAllGlobals();
    });

    it('shows a failed delete and keeps the offer', async () => {
      serve(() => [offer()], [respondError(DELETE_OFFER_MUTATION, planRequired)]);
      vi.stubGlobal(
        'confirm',
        vi.fn(() => true),
      );
      renderPage();
      await screen.findByText('$150,000/yr');

      fireEvent.click(within(cardFor('$150,000/yr')).getAllByRole('button')[1]);

      expect(await screen.findByText(/offers are a pro feature/i)).toBeInTheDocument();
      expect(screen.getByText('$150,000/yr')).toBeInTheDocument();

      vi.unstubAllGlobals();
    });
  });
});
