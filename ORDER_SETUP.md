# Curry Leaves Order System Setup

The frontend order flow and staff dashboard are built.

- Customer site: `index.html`
- Staff dashboard: `owner-orders.html`
- Shared order adapter: `order-system.js`

## Current Mode

The system works in demo mode using `localStorage` until Supabase credentials are added. Demo mode is useful for UI testing in the same browser, but it is not a real production backend.

## Production Backend: Supabase

Create a Supabase project, then create an `orders` table with these columns:

```sql
create table orders (
  id text primary key,
  customer_name text not null,
  phone text not null,
  notes text,
  order_type text not null,
  payment_method text not null,
  payment_status text not null,
  items jsonb not null,
  total numeric not null,
  status text not null default 'sent',
  prep_minutes integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

For a quick private prototype, add Row Level Security policies carefully or keep the dashboard behind a protected deployment. For production, use Supabase Auth or a real backend so staff access is secure.

Then edit `order-system.js`:

```js
window.CurryOrderConfig = {
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY',
  ordersTable: 'orders',
  staffPasscode: 'CHANGE_THIS_PASSCODE'
};
```

## Payments

COD works as an order method immediately.

Apple Pay, Google Pay, and BLIK need a verified payment provider before real payments can be accepted.

Recommended providers:

- Stripe: Apple Pay, Google Pay, cards
- PayU / Przelewy24 / Tpay: BLIK and Polish payment methods

Do not put secret payment keys in GitHub Pages. Payment confirmation must go through a secure backend or provider-hosted checkout.
