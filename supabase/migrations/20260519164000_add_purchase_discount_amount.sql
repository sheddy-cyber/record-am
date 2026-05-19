alter table public.purchases
add column if not exists discount_amount numeric(12,2) default 0;

update public.purchases
set discount_amount = 0
where discount_amount is null;

alter table public.purchases
alter column discount_amount set not null;
