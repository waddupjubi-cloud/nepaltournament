-- Run this once to enable richer player profile cards.

alter table public.profiles
  add column if not exists favorite_hero text,
  add column if not exists favorite_quote text,
  add column if not exists motto text,
  add column if not exists tagline text,
  add column if not exists likes text,
  add column if not exists dislikes text;
