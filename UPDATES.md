# Tournament Players Update Log

## June 8, 2026

### Performance, SEO, and brand

- Added the TP favicon, web manifest, crawler rules, metadata, social cards, and structured data.
- Added preconnect hints, lazy-loaded media/team logos, lighter mobile effects, and reduced-motion support.
- Replaced timeout-based page startup with an authenticated-ready event.
- Added project validation through `npm run check`.
- Pinned the Supabase browser and Edge Function SDK to `2.107.0`.
- Removed unused chart and bracket downloads from staff module pages.

### Staff dashboard

- Added separate staff pages for Overview, Broadcasts, User Management, Player Management, Tournament Management, and Audit Logs.
- Kept every staff page permission-aware based on Superadmin, Admin, and Moderator department roles.
- Added bulk user verification, player approval, player-role assignment/removal, staff-role assignment/removal, and Superadmin-only bulk Auth deletion.
- Added bulk player-appeal approval/rejection.
- Added bulk team-request approval/rejection, team status changes, and team deletion.
- Added bulk broadcast unpin/delete.
- Added bulk tournament status/delete and registration approval/rejection.
- Made Activity Pulse entries open detailed actor, role, timestamp, target, and payload information for Superadmin or the related department Admin.

### User experience

- Moved alerts from Profile into `alerts.html`.
- Moved direct messaging from Profile into `messages.html`.
- Added a global right-side chat dock with live incoming-message notifications and compact chat.
- Kept team chat on individual team pages.

### User cleanup

- Temporary seed data now keeps staff accounts only and contains no temporary player teams.
- Added `supabase/remove-nonstaff-users.sql` for the deliberate one-time removal of live non-staff Auth users and dependent data.
