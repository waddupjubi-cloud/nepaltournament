# Tournament Players

Tournament Players is a static HTML, CSS, and vanilla JavaScript esports platform backed by Supabase Auth, PostgreSQL, Realtime, and Storage.

## What Is Included

- User login, registration, email OTP verification, and session handling.
- Separate staff login for Superadmin, Admin, and Moderator roles.
- User feed, profile editing, player appeals, teams, team chat, tournaments, live brackets, and staff dashboard.
- Supabase schema with RLS policies for profiles, teams, tournaments, matches, notifications, messages, support tickets, and audit logs.
- Light theme and dark theme with `localStorage` persistence.

## 1. Create Supabase Project

1. Go to Supabase and create a free project.
2. Open SQL Editor.
3. Run [supabase/schema.sql](supabase/schema.sql).
4. In Authentication settings, enable email confirmations.
5. In Storage, create a public bucket named `team-logos`.
6. Create the first Auth user manually:
   - Email: `super@tournament.com`
   - Password: `ChangeMe123!`
   - Mark email as confirmed.
7. Run [supabase/seed.sql](supabase/seed.sql).

## 2. Configure Frontend

Edit [js/config.js](js/config.js):

```js
window.TP_CONFIG = {
  SUPABASE_URL: "https://your-project.supabase.co",
  SUPABASE_ANON_KEY: "your-anon-key",
  SITE_URL: window.location.origin
};
```

You can find both values in Supabase Project Settings > API.

## 3. Run Locally

Because this is a static site, you can open [index.html](index.html) directly. For smoother auth redirects, run a tiny local static server:

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080`.

## 4. Login Flow

- Normal users use [index.html](index.html).
- Staff users use [staff.html](staff.html).
- The same account can have a user role and a staff role.
- Staff can open the dashboard from [dashboard.html](dashboard.html), then switch to user view.

## 5. Important Limitations

This project intentionally has no custom backend. That keeps hosting simple, but it means password resets, changing Auth email, and setting Auth custom claims must be done through Supabase’s dashboard or Edge Functions if you add them later. The app uses `profiles.staff_role` and RLS helper functions for authorization.

## File Map

- `index.html`, `staff.html`: auth interfaces.
- `feed.html`, `profile.html`: user experience.
- `teams.html`, `create-team.html`, `team.html`: team workflows.
- `tournaments.html`, `tournament.html`: tournament browsing and brackets.
- `dashboard.html`: role-based staff dashboard.
- `css/styles.css`, `css/bracket.css`: themes, responsive layout, bracket UI.
- `js/*.js`: Supabase client, auth, pages, notifications, messages, bracket generation.
- `supabase/schema.sql`, `supabase/seed.sql`: database setup.
