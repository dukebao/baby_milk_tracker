# GitHub Pages deployment

Site: https://dukebao.github.io/baby_milk_tracker/
Repository: https://github.com/dukebao/baby_milk_tracker

## One-time GitHub configuration

1. Open [Settings > Actions > General](https://github.com/dukebao/baby_milk_tracker/settings/actions).
   Under **Actions permissions**, ensure actions are allowed. This workflow uses
   GitHub's official `actions/*` actions. **Allow all actions and reusable workflows**
   works for this repository; click **Save** if you change the selection.
   Leave the default workflow token permissions as **Read repository contents and
   packages permissions**. The workflow explicitly requests the Pages deployment
   permissions it needs; it does not need permission to create pull requests.
2. Open [Settings > Pages](https://github.com/dukebao/baby_milk_tracker/settings/pages).
   Under **Build and deployment**, change **Source** to **GitHub Actions**.
   The prepared workflow handles the build: no additional template or `gh-pages`
   branch is needed. Leave the custom domain blank unless you are adding one.
3. Open [Settings > Secrets and variables > Actions](https://github.com/dukebao/baby_milk_tracker/settings/variables/actions)
   and select the **Variables** tab, rather than **Secrets**.
4. Click **New repository variable**. Enter the exact name and paste its value,
   then click **Add variable**. Repeat for the second variable, using the values
   from your ignored `frontend/.env.local` file:

| Variable | Value |
| --- | --- |
| `REACT_APP_SUPABASE_URL` | Your HTTPS Supabase project URL |
| `REACT_APP_SUPABASE_PUBLISHABLE_KEY` | Your `sb_publishable_...` key |

Paste only each value, without quotes, spaces or the `NAME=` portion of the local
environment line. Create **repository** variables rather than environment
variables: the build job reads the repository variables through `vars`.

There is no need to add `REACT_APP_GOOGLE_LOGIN` (the workflow sets it to `true`),
`PUBLIC_URL` (derived from Pages), or any backend API URL. GitHub does not read your
local `.env.local`; these two saved variables configure its production build.

Google login is enabled in the workflow. The Google client secret remains in
Supabase; neither it nor a database password is needed in GitHub. Local environment
files and downloaded Google credentials are ignored by Git.

## Authentication configuration

In Supabase **Authentication > URL Configuration**:

- Site URL: `https://dukebao.github.io/baby_milk_tracker/`
- Allowed redirects: `https://dukebao.github.io/baby_milk_tracker/**` and
  `http://localhost:3000/**` for local development.

In Google OAuth client settings:

- Authorized JavaScript origin: `https://dukebao.github.io`.
- Authorized redirect URI: the Supabase callback shown in its Google provider
  settings (`https://YOUR-PROJECT.supabase.co/auth/v1/callback`).

All migrations in `supabase/migrations/` must already be applied. Existing
installations need `202611090001_log_times.sql` to enable saving corrected log
times. No SQL runs during deployment.

## Publish and verify

Commit the reviewed application, migration, lockfile and workflow changes, then
push to `main`. The **Deploy tracker to GitHub Pages** workflow runs tests, builds
the frontend for the Pages base path, and deploys the static build. It can also
be started manually from **Actions**.

The workflow appears in GitHub only after `.github/workflows/pages.yml` is pushed
to `main`. Open [Actions](https://github.com/dukebao/baby_milk_tracker/actions), select
**Deploy tracker to GitHub Pages**, and open the latest run. Both **build** and
**deploy** should finish successfully. The deployment URL is shown on the run and
in **Settings > Pages**. To deploy manually, select **Run workflow**, choose `main`,
and click **Run workflow**.

If **Check browser configuration** fails, verify the two variable names and values
in the Variables tab. If Pages configuration fails, verify the Pages source is
GitHub Actions. After fixing settings or variables, start a new workflow run so
the app rebuilds with the current configuration.

The workflow uses the Pages-configured base path. Router links, assets and new
invite URLs include that path. A generated `404.html` contains the app so direct
tracker/invite links and authentication returns render on GitHub's static host.
Old localhost invitations should be replaced with new links from the hosted app.

After the workflow succeeds, test the published URL on your phone:

1. Google login and return to the tracker.
2. New-user household/baby setup.
3. Record a feed/diaper and refresh its date page.
4. Create an invite from the hosted Settings panel and open it in another browser.
5. Accept as the intended caregiver and confirm shared records.

For a local production preview with all Supabase operations intercepted:

```powershell
cd frontend
$env:PUBLIC_URL='/baby_milk_tracker'
npm run build
node scripts/review-ui.cjs --pages
```

References:
- [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Repository Actions variables](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables)
- [Actions repository settings](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository)
- [Supabase redirects](https://supabase.com/docs/guides/auth/redirect-urls)
