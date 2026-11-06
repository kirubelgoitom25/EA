# Course marketplace: launch checklist

The code is built and tested locally. These are the steps that need your accounts, in order.

**Public signup must stay off until the last step.** It also controls new Google users.

Google is how new students join. Email sign-up doesn't block launch: "Create account" and "Forgot
password?" stay hidden until step 10. Existing students can log in with their password throughout.

## 1. Get the code ready

- [ ] Merge the two commits to `main`. If Render deploys from `main`, this deploys the backend, so
      do it only when you're ready for step 5.
- [ ] Remove the demo data first. Deploying makes every published owned course visible to all
      students. Run `supabase/pending/demo_data_cleanup.sql` in the SQL editor. As written it only
      reports what it would remove. Check the counts, change its last line to `commit`, and run it
      again. It refuses to run if a real student has history in a demo course.

## 2. Google

In Google Cloud Console:

- [ ] Create a project and set up the OAuth consent screen with the app name EA. Use only the basic
      scopes: `openid`, email and profile. Publish it, or only listed test users can sign in.
- [ ] Create one **Web application** OAuth client. No Android or iOS client is needed.
- [ ] Add the callback URL from Supabase (Authentication > Providers > Google) as an
      **Authorized redirect URI**.

In Supabase:

- [ ] Authentication > Providers > Google: turn it on and paste the client ID and secret.
- [ ] Authentication > URL Configuration: add exactly `ea-student://auth-callback` to the redirect
      URLs. Don't use a wildcard.

## 3. Keep email confirmation on

- [ ] Authentication > Providers > Email: leave **Confirm email** on, even with no email provider
      yet. Turning it off allows the account takeover described in the architecture review.

## 4. Database

- [ ] Apply `supabase/pending/20261106000000_course_marketplace.sql`. It keeps every course free
      and creates the private `payment-proofs` bucket.
- [ ] Check the bucket shows as **private** and has **no policies**.
- [ ] Set the main admin, once. That account must be a teacher:
      `update public.profiles set is_admin = true where id = '<your profile id>';`

## 5. Backend (Render), after step 4, never before

- [ ] Add `SUPABASE_SERVICE_ROLE_KEY`. Treat it like the database password, and never put it in an
      Expo or Vite variable.
- [ ] Add `CORS_ORIGINS` with your hosted dashboard's address.
- [ ] Deploy, then check `/teacher/courses` answers 401 rather than 404.

## 6. Teacher dashboard

- [ ] Deploy it with `VITE_API_URL` set to the production backend.

## 7. Student app

- [ ] Build and release a new app. The new features need native code, so an over-the-air update
      can't deliver them.
- [ ] Build with `EXPO_PUBLIC_API_URL=` (empty) in front of the command. The local `.env` points at a
      development address and would otherwise be built into the app.
- [ ] Use your own signing key. The project currently signs release builds with the debug key,
      which Google Play won't accept.

## 8. Check on a real phone before opening signup

To try new-user sign-up without touching live, create a free test Supabase project, repeat step 2
on it, and start the app with `EXPO_PUBLIC_TEST_SUPABASE_URL` and `EXPO_PUBLIC_TEST_SUPABASE_ANON_KEY`.
Unset, the app uses the live project.

- [ ] Continue with Google signs in, and closing the sheet goes back with no error.
- [ ] Google with the same email as an existing account keeps that account's progress.
- [ ] Existing email and password login still works.
- [ ] A turned-off account is refused, by both Google and email.
- [ ] Upload a screenshot, then approve it on the dashboard. The course opens.

## 9. Open signup

- [ ] Authentication > Sign In / Providers: allow new users.
- [ ] Make one small real purchase, end to end, on a course you own.

## 10. Later: email sign-up

Not needed for launch. Do this when you have a domain.

- [ ] Create a [Resend](https://resend.com) account and verify your domain by adding its DNS records.
      The free plan covers 3,000 emails a month, 100 a day.
- [ ] Connect it with Resend's Supabase integration, which fills in the SMTP settings for you.
- [ ] Authentication > Email Templates: "Confirm signup" and "Reset password" must show the code,
      `{{ .Token }}`. The app has students type it in. A template with only a link won't work.
- [ ] Set the email code length to 6, and the minimum password length to 8.
- [ ] Set `EMAIL_SIGNUP_OPEN = true` in `Frontend/student-app/services/authModel.js`, and test on a
      real phone: the code arrives and works, and Forgot password works.

## After launch

- Teachers can't register themselves yet. Until step 10, create each teacher's password account in
  the Supabase dashboard (Authentication > Users > Add user), then promote them on the People page.
  The dashboard only has password sign-in, so a Google-only account can't use it.
- Decide how long to keep payment screenshots before the number of students grows. They can show
  names, phone numbers and account numbers.
