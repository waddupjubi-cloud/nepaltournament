# Deployment Instructions

## GitHub Pages

1. Push this repository to GitHub.
2. In the GitHub repository, open Settings > Pages.
3. Choose the branch that contains the files, usually `main`.
4. Choose `/root` as the publishing folder.
5. Save.
6. Copy the GitHub Pages URL.

## Supabase Auth Redirect URLs

In Supabase, open Authentication > URL Configuration.

Set:

- Site URL: your GitHub Pages URL.
- Redirect URLs:
  - `http://localhost:8080`
  - your GitHub Pages URL
  - your GitHub Pages URL with `/*` if Supabase allows wildcard entries.

## Storage Policies

Create a public bucket named `team-logos`.

Suggested read policy:

```sql
bucket_id = 'team-logos'
```

Suggested insert policy:

```sql
bucket_id = 'team-logos' and auth.role() = 'authenticated'
```

## Going Live Checklist

- Replace placeholders in `js/config.js`.
- Run `supabase/schema.sql`.
- If this is an existing database, run `supabase/dashboard-crud-policies.sql`.
- If this is an existing database, run `supabase/enable-realtime.sql`.
- Deploy the `admin-users` Edge Function for Superadmin Auth CRUD.
- Create and seed the first superadmin.
- Confirm email OTP works.
- Test `index.html`, `staff.html`, and `dashboard.html`.
- Change the seeded superadmin password before going public.

## Deploy Edge Function

The Superadmin dashboard can create users with passwords only after this function is deployed:

```powershell
supabase login
supabase functions deploy admin-users --project-ref zxrqfnrfshnvrnvuujmz
```

For GitHub Actions deployment, create a repository secret named `SUPABASE_ACCESS_TOKEN`.

## Automatic Demo Data Import

To import JSON demo data automatically after a push, create repository secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The workflow only runs when those secrets exist.
