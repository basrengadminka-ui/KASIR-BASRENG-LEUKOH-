
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text default 'cashier'
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price integer not null,
  stock integer not null default 0
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  cashier_id uuid references auth.users(id),
  total integer not null,
  status text default 'paid',
  created_at timestamptz default now()
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references public.sales(id),
  product_id uuid references public.products(id),
  product_name text,
  qty integer,
  price integer,
  subtotal integer
);

create function public.new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id,email,role)
  values(new.id,new.email,'cashier');
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.new_user();

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;

create policy "profile read"
on public.profiles for select to authenticated
using (id = auth.uid());

create policy "product read"
on public.products for select to authenticated
using (true);

create policy "product insert"
on public.products for insert to authenticated
with check (
  exists(select 1 from public.profiles
  where id=auth.uid() and role='owner')
);

create policy "product update"
on public.products for update to authenticated
using (true) with check (true);

create policy "product delete"
on public.products for delete to authenticated
using (
  exists(select 1 from public.profiles
  where id=auth.uid() and role='owner')
);

create policy "sales read"
on public.sales for select to authenticated
using (
  cashier_id=auth.uid() or
  exists(select 1 from public.profiles
  where id=auth.uid() and role='owner')
);

create policy "sales insert"
on public.sales for insert to authenticated
with check (cashier_id=auth.uid());

create policy "items read"
on public.sale_items for select to authenticated
using (
  exists(select 1 from public.sales
  where sales.id=sale_items.sale_id
  and (sales.cashier_id=auth.uid()
  or exists(select 1 from public.profiles
  where id=auth.uid() and role='owner'))
);

create policy "items insert"
on public.sale_items for insert to authenticated
with check (
  exists(select 1 from public.sales
  where sales.id=sale_items.sale_id
  and sales.cashier_id=auth.uid())
);
