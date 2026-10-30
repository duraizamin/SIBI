SIBI SPORTS CLUB — FINAL CLIENT UPDATE
======================================

This package contains the updated Sibi Sports Club website + admin workspace.

WHAT IS INCLUDED
----------------
- Sibi Sports Club branding and supplied 3D circular logo
- Workout background in the hero
- Sticky public navigation
- Hero shimmer animation
- Slow, contained services carousel (no page-wide horizontal movement)
- Corrected membership/package pricing from the latest client package images
- Membership/package CTAs route to the internal enquiry form
- Personal Training and Cardio kept as separate packages
- Trainer grid with Transform + Opacity animation
- 9 review cards with 3 visible per desktop page
- Contact hover/flash interaction
- Responsive layouts with horizontal overflow prevented
- Admin members, payments, enquiries, trainers and messaging workflows
- Scrollable recipients list for large audiences
- Recipient removal controls
- Fresh Add Member form every time it opens
- Payment save + member refresh
- Template library with a balanced professional layout
- Styled file uploads
- Admin login integrated into the Sibi website shell

WINDOWS START
-------------
Before the first launch, copy Admin\.env.example to Admin\.env and set a unique admin email, password, and session secret. Keep Admin\.env private; it is excluded from Git.

Double-click START_WINDOWS.cmd in the main Sibi_Sports_Club_FINAL folder. It checks for Node.js and Admin\.env, prepares dependencies, starts the server, and opens the website in your browser. Keep the black command window open while using the site.

If Node.js is missing, the launcher opens https://nodejs.org/ so you can install the LTS version.

Website address: http://localhost:3000

IMPORTANT
---------
Never publish Admin\.env, admin credentials, or session secrets. Configure unique values in your hosting provider's protected environment settings for deployment.

WHATSAPP MESSAGE DELIVERY SETUP
-------------------------------
The default deployment uses manual WhatsApp handling and does not need OpenWA.
Messages can be prepared or marked complete manually; automatic sending is
disabled. The Vercel website uses the persistent backend described below.

The Vercel deployment does not configure OpenWA or Meta WhatsApp credentials.
The separate WhatsApp guide is for local or legacy deployments only. Never put
provider credentials in Vercel frontend code, commit Admin\.env, or expose
provider keys.

VERCEL FRONTEND + NEON DATABASE
--------------------------------
The Vercel deployment uses Vercel Functions for the API and Neon Postgres for
persistent members, enquiries, trainers, payments, message history and login
sessions. It starts with a fresh database; the local SQLite database is not
automatically imported.

To configure a fresh deployment:
1. Create a Neon Postgres project and copy its pooled connection string.
2. In Vercel, open Project Settings > Environment Variables and add:
   - DATABASE_URL: the Neon connection string
   - ADMIN_NAME: Sibi Administrator (optional)
   - ADMIN_EMAIL: the administrator login email
   - ADMIN_PASSWORD: a unique password of at least 12 characters
   - SESSION_SECRET: a unique random secret of at least 32 characters
3. Keep these values private, apply them to Production (and Preview if needed),
   then redeploy. The database schema and initial admin account are created
   automatically when the API is first used.
4. Verify https://YOUR-DOMAIN/api/health reports database connected, then sign
   in with the configured admin email and password.

OpenWA, Meta WhatsApp delivery, webhook handling and automatic scheduled
WhatsApp sending are disabled on Vercel. Admin/member sign-in and the rest of
the application remain enabled. Messages can be prepared for manual sending;
scheduled items remain saved but paused and are never marked sent automatically.
Local Windows use continues to run the existing SQLite Express server.

For the public domain, point the GoDaddy DNS records to the values shown under
Vercel > Project Settings > Domains. Do not set SIBI_API_URL: Vercel serves
the API directly and uses DATABASE_URL for Neon.
