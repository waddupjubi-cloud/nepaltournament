# Test Accounts

Create these accounts in Supabase Auth or through the app during testing.

| Purpose | Email | Password | Notes |
| --- | --- | --- | --- |
| Superadmin | `super@tournament.com` | `ChangeMe123!` | Create manually, confirm email, then run `seed.sql`. |
| Normal user | `user@test.com` | `ChangeMe123!` | Register through `index.html` and verify OTP. |
| Player | `player@test.com` | `ChangeMe123!` | Register, submit appeal, approve from dashboard. |
| Tournament admin | `touradmin@test.com` | `ChangeMe123!` | Assign `tournamentadmin` from Superadmin dashboard. |

Always change passwords before using real user data.
