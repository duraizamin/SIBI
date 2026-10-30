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

If you later want automated WhatsApp delivery, configure Meta WhatsApp Cloud
API on the backend, or use the optional OpenWA setup in
HOSTING_WHATSAPP_SETUP.txt. Never put provider credentials in Vercel frontend
code, commit Admin\.env, or expose provider keys.

VERCEL WEBSITE WITHOUT OPENWA
-----------------------------
Vercel serves the static website from Admin\public. The admin pages and enquiry
form also need the Node backend for login, data storage and API requests; the
Vercel API proxy forwards /api requests to that backend. Deploy the backend
using render.yaml (or deploy\compose.yaml on a VPS), then set the Vercel
production environment variable SIBI_API_URL to the backend's base HTTPS URL.
For Render, use its generated service URL, for example
https://your-sibi-service.onrender.com. Set the Vercel project's Root Directory
to the repository root, not Admin, so Vercel can see vercel.json and api\.

The Render configuration selects manual WhatsApp handling and does not require
OpenWA. Messages can be prepared or marked complete manually; automatic
WhatsApp sending is not available in this configuration. The backend needs a
persistent plan and disk for its SQLite database and scheduled-message worker.
Never put backend credentials in Vercel frontend code.
