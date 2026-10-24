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
OpenWA integration supports immediate messages and automatic scheduled reminders.
OpenWA runs as a separate service and links to WhatsApp using a QR code. See
HOSTING_WHATSAPP_SETUP.txt for local Windows and hosted setup steps.

For local use, run OpenWA separately (for example with Docker Desktop), set
OPENWA_API_URL=http://localhost:2785/api, OPENWA_API_KEY, and
OPENWA_SESSION_ID in Admin\.env, then restart Sibi Sports Club.

For a no-hosting-cost setup with Sibi on Render, run OpenWA on your computer and
use a Cloudflare Quick Tunnel. Set its HTTPS URL, the session-scoped operator
key, and session ID in Sibi's Render environment. Your computer and tunnel must
stay online, and the temporary URL changes when restarted. See
HOSTING_WHATSAPP_SETUP.txt for steps and limitations.

OpenWA is an unofficial WhatsApp Web gateway and may carry account restrictions
or delivery risk. Send only to opted-in recipients, test first, and review
HOSTING_WHATSAPP_SETUP.txt. Meta WhatsApp Cloud API remains available as an
alternative provider. Never commit Admin\.env or expose provider keys.
