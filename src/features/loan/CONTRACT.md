# T3.9 contract

- Route: `/tinh-vay?customerId=<id>` resolves the current account's customer and prefills project, building, apartment code/type/area, matching v1. No customer data is modified.
- `loanPath({ customerId, projectName?, building?, code?, aptType?, area?, pricePerM2?, netOverride? })` from `./model` builds an encoded route. Explicit nonempty fields override the customer prefill. No phone/name belongs in URL parameters.
- `LoanCalculator` accepts the same `prefill` prop for embedding in a customer panel. Parent must mount existing RepositorySession/ToastProvider; calculator alone works without login.
- Quote payload: original v1 `inputs: { unit, dates, loan }` plus any unknown saved keys retained; `summary` retains v1 keys. New quote inserts only, never update/delete existing quotes.
- Quote save requires network and current owner. Reads use an account-scoped cache offline. There is no offline quote queue, matching `loan-module.md` §4.
- Print export uses browser **Print → Save as PDF**, preserving all v1 report sections and exact engine amounts; no CDN requirement. A popup blocker produces an explicit error.
- Zod/customer data, shared app/router, queue and database schema unchanged.
