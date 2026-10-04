# Free hosting with Cloudflare Pages and Supabase

Only the React frontend is deployed to Cloudflare Pages. Supabase provides Auth,
database access and household functions; no FastAPI/Render deployment is needed.

1. Complete [Supabase setup](../supabase/README.md).
2. Connect this repository to Cloudflare Pages.
3. Use root directory `frontend`, build command `npm run build`, output directory
   `build`, and Node.js 22 (`NODE_VERSION=22`).
4. Add build environment variables `REACT_APP_SUPABASE_URL` and
   `REACT_APP_SUPABASE_PUBLISHABLE_KEY`. Optionally set
   `REACT_APP_GOOGLE_LOGIN=true` after configuring the Google provider.
5. In Supabase Auth URL Configuration, set Site URL to your Pages HTTPS address
   and add `https://YOUR-SITE.pages.dev/**` to allowed redirects. Add any custom
   domain and trusted preview addresses separately.
6. Test sign-up/confirmation, login, invite acceptance, logging and exports on
   your phone. Deep links are supported by `frontend/public/_redirects`.

These are build-time environment variables: redeploy after changing them.
There are no backend database passwords or service-role keys in Pages.

Free Supabase projects can pause after inactivity and do not include automatic
database backups. Keep periodic all-record JSON exports from Settings.

Official references:
- [Cloudflare React deployments](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/)
- [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase free plan](https://supabase.com/pricing)
