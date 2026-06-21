-- Liga/desliga o disparo do pixel+script por propriedade (workspace).
-- default true => todas as propriedades existentes continuam rastreando normalmente.
alter table public.properties
  add column if not exists tracking_enabled boolean not null default true;
