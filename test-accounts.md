# Test Accounts

Create these accounts in Supabase Auth or through the app during testing.

| Purpose | Email or Username | Password | Notes |
| --- | --- | --- | --- |
| Superadmin | `bzumaharjan2@gmail.com` or `biju1` | `#Batman007` | Create manually, confirm email, then run `seed.sql`. |
| Normal user | `user@test.com` | `ChangeMe123!` | Register through `index.html` and verify OTP. |
| Player | `player@test.com` | `ChangeMe123!` | Register, submit appeal, approve from dashboard. |
| Tournament admin | `touradmin@test.com` | `ChangeMe123!` | Assign `tournamentadmin` from Superadmin dashboard. |

Always change passwords before using real user data.

## Temp Import Accounts

These are created by `npm run import:temp`.

| Role | Email | Username | Password | Name |
| --- | --- | --- | --- | --- |
| UserAdmin | `nira.useradmin@tournament.test` | `nira1` | `NiraUserAdmin#2026` | Nira Shrestha |
| PlayerAdmin | `arjun.playeradmin@tournament.test` | `arjun1` | `ArjunPlayerAdmin#2026` | Arjun Gurung |
| TournamentAdmin | `sahana.tournamentadmin@tournament.test` | `sahana1` | `SahanaTournamentAdmin#2026` | Sahana Karki |
| UserMod | `roshan.usermod@tournament.test` | `roshan1` | `RoshanUserMod#2026` | Roshan Lama |
| PlayerMod | `meera.playermod@tournament.test` | `meera1` | `MeeraPlayerMod#2026` | Meera Rai |
| TournamentMod | `kabir.tournamentmod@tournament.test` | `kabir1` | `KabirTournamentMod#2026` | Kabir Thapa |

Team/player accounts are listed in [data/temp-users.json](data/temp-users.json).
