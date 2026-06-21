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
  branch_id text,
  branch_name text,
  branch_address text,
  branch_phone text,
  branch_label text,
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

If the `orders` table already exists, add the branch columns:

```sql
alter table orders add column if not exists branch_id text;
alter table orders add column if not exists branch_name text;
alter table orders add column if not exists branch_address text;
alter table orders add column if not exists branch_phone text;
alter table orders add column if not exists branch_label text;
```

Create a `menu_availability` table so the owner dashboard can temporarily mark existing dishes as available, sold out, or unavailable until a timing note such as lunch or evening service:

```sql
create table menu_availability (
  item_name text primary key,
  status text not null default 'available',
  note text,
  available_at text,
  updated_at timestamptz not null default now()
);
```

Branch-specific availability is stored in `item_name` as `branch_id::Dish Name`, for example `koszykowa::Samosa`. This lets one branch mark Samosa sold out without affecting other branches.

For a quick private prototype, add Row Level Security policies carefully or keep the dashboard behind a protected deployment. For production, use Supabase Auth or a real backend so staff access is secure.

Then edit `order-system.js`:

```js
window.CurryOrderConfig = {
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY',
  ordersTable: 'orders',
  availabilityTable: 'menu_availability',
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
