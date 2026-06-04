# Test Accounts

Create these accounts in Supabase Auth or through the app during testing.

| Purpose | Email | Password | Notes |
| --- | --- | --- | --- |
| Superadmin | `bzumarhajn2@gmail.com` | `#Batman007` | Create manually, confirm email, then run `seed.sql`. |
| Normal user | `user@test.com` | `ChangeMe123!` | Register through `index.html` and verify OTP. |
| Player | `player@test.com` | `ChangeMe123!` | Register, submit appeal, approve from dashboard. |
| Tournament admin | `touradmin@test.com` | `ChangeMe123!` | Assign `tournamentadmin` from Superadmin dashboard. |

Always change passwords before using real user data.

## Demo Import Accounts

These are created by `npm run import:demo`.

| Role | Email | Password | Name |
| --- | --- | --- | --- |
| UserAdmin | `nira.useradmin@tournament.test` | `NiraUserAdmin#2026` | Nira Shrestha |
| PlayerAdmin | `arjun.playeradmin@tournament.test` | `ArjunPlayerAdmin#2026` | Arjun Gurung |
| TournamentAdmin | `sahana.tournamentadmin@tournament.test` | `SahanaTournamentAdmin#2026` | Sahana Karki |
| UserMod | `roshan.usermod@tournament.test` | `RoshanUserMod#2026` | Roshan Lama |
| PlayerMod | `meera.playermod@tournament.test` | `MeeraPlayerMod#2026` | Meera Rai |
| TournamentMod | `kabir.tournamentmod@tournament.test` | `KabirTournamentMod#2026` | Kabir Thapa |

Team/player accounts are listed in [data/demo-users.json](data/demo-users.json).
