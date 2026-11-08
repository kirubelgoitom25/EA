# Accounts and EA Pro: launch checklist

Phone + username sign-up, EA Pro, and Free / Paid / Pro courses. Code is built and tested locally;
nothing is applied, deployed or pushed. Work top to bottom. Steps 1 to 3 happen on a **test**
Supabase project, never the live one.

## 0. The internal email domain (nothing to buy)

Every student account has a hidden address `s.<random>@students.ea.invalid`. `.invalid` is reserved
by RFC 2606 and RFC 6761: it can never be registered or resolve, so mail to it can never reach
anyone. Supabase's admin "create user" checks only the address format (supabase/auth
`validateEmail`: length and `checkmail.ValidateFormat`, no DNS), and creating a user sends no mail.
It is the backend's default (`STUDENT_EMAIL_DOMAIN`); set it empty to close registration. Never
change it once students exist: their logins use it.

## 1. Test project setup

1. Create (or reuse) a test Supabase project. Keep **public sign-up off** (Auth settings).
2. Apply, in order: the existing pending SQL the test project lacks, then
   `supabase/pending/20261108000000_accounts_and_pro.sql`.
3. Run the backend locally against it with `STUDENT_EMAIL_DOMAIN=<domain>`,
   `SUPABASE_SERVICE_ROLE_KEY=<test key>` and a random `LOGIN_LOOKUP_SECRET`.
4. Point the student app at it (`EXPO_PUBLIC_TEST_SUPABASE_URL` / `_ANON_KEY`, plus
   `EXPO_PUBLIC_API_URL` for the local backend).

## 2. Hidden-email tests (go / no-go)

If any of these fails, stop. The fallback is Supabase's own phone login with an SMS provider
(costs per message, adds a code step); nothing else in the plan changes.

**Account creation**

| # | Test | Pass means |
|---|---|---|
| A1 | Register while public sign-up is off | Account created; `POST /auth/v1/signup` with the anon key still refuses |
| A1b | Right after registering, read `profiles` and `student_profiles` for the new id | Username, phone and school are there, written by the `on_auth_user_app_metadata` trigger (Supabase applies app_metadata in an UPDATE after the INSERT). Backend log has **no** "details missing after create" line; if it has, the trigger didn't fire and the backend filled them in |
| A2 | The internal address on your domain | Accepted; Supabase sends no email (check Auth logs) |
| A3 | Register a taken username, then a taken phone | 409 each time; no new row in `auth.users` |
| A4 | Two registrations with one phone at the same moment | One 201, one 409 |
| A5 | Kill the network after sending Register, then retry | The retry says the phone is taken; logging in works; one account |
| A6 | Create a user in the Supabase dashboard (no metadata) | Works as before: a student profile with no username or phone |

**Login and sessions**

| # | Test | Pass means |
|---|---|---|
| L1 | Log in with phone (several written forms), with username, then restart the app | All work; still logged in after restart |
| L2 | Leave the app past the 1-hour token life | Still logged in (refresh works) |
| L3 | Unknown phone or username | Same "Incorrect phone number, username or password" as a wrong password |
| L4 | An existing email student and a teacher on the dashboard | Unchanged |
| L5 | Admin sets a temporary password (People) | Old password fails, new one works |
| L6 | Turn the account off | Refused with the usual "turned off" message |
| L7 | About 40 logins from one network | No lockout. If Supabase's per-IP sign-in limit trips, raise it in Auth rate limits |

**No leaks or stray mail**

| # | Test | Pass means |
|---|---|---|
| M1 | Call Supabase password reset / magic link for an internal address | Nothing delivered (null MX) |
| M2 | Payments review, People list, People search, Paid students | Phone and username shown, never an internal address |
| M3 | Add a real phone to an existing user with the admin API | Works: the way out if SMS or email comes later |

## 3. Pro tests on the test project

1. Admin: add a plan on **EA Pro** (dashboard), e.g. "Pro, 1 month", 150 ETB, 30 days.
2. Teacher: set one course to **Pro** in Course Studio; leave one **Paid**; make a third **Paid**
   with **Also include in EA Pro** ticked (Pro members open it, others can buy it).
3. Student A buys the paid course (approve it). Student B has nothing.
4. Both open the Pro course: locked, "Get EA Pro". Send a Pro payment as A; approve it as admin
   (a teacher must not see it on Payments).
5. A opens the Pro course. Admin revokes A's Pro: the Pro course closes, **the paid course stays
   open**. Give Pro again, then end it in SQL (`update memberships set expires_at = now()`): same.
6. Rankings show the Pro badge beside A while Pro runs.

## 4. Live rollout (after 2 and 3 pass, with your go-ahead)

1. Backup, then apply `20261108000000_accounts_and_pro.sql` to live.
2. Render backend env: `STUDENT_EMAIL_DOMAIN`, `LOGIN_LOOKUP_SECRET`. Deploy the backend
   (after step 1, never before: the models read the new columns).
3. Dashboard deploys with the backend (no new env).
4. Build the APK (`EXPO_PUBLIC_API_URL=` empty, `--rerun-tasks`). Older APKs keep working: they see
   Pro courses as locked with no buy button.
5. Add the real Pro plans. Tell teachers about the Pro option.

## Open business decision

How teachers are paid for Pro courses (Pro money goes to EA). Decide before telling teachers about
the Pro option. Lesson and activity progress per course already records who used what.

## Later

- SMS password reset and phone verification (Supabase Send SMS hook + an Ethiopian provider).
- More student attributes: one nullable column each on `student_profiles`, one optional field on
  `PATCH /me/profile`.
- Re-open Google: set `GOOGLE_SIGNIN_OPEN = true` in `services/authModel.js` once the Supabase
  code-exchange error is fixed.
