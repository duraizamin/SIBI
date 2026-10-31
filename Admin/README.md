# Sibi Sports Club — Complete Client Update

## Windows quick start

1. Extract the ZIP completely.
2. Double-click `START_WINDOWS.cmd` in the extracted root folder.
3. Open `http://localhost:3000`.

The packaged build already contains the tested dependencies. No `npm install` is required.

## Completed functional scope

- User Details replaces Members in admin navigation.
- No separate Payments, Reminders or Announcements admin tabs.
- Compact centered clickable KPI dashboard with live filtered destinations.
- Administrator-created member accounts with optional email, plan, membership status, height, weight, renewal date, profile photo, generated member ID and temporary password; public self-registration is disabled.
- A shared sign-in page routes administrators to the admin workspace and members to their personal dashboard using email/member ID and password.
- Member dashboards display account, membership, payment, contact and personal fitness details.
- Members and administrators can edit age, gender, fitness goals and emergency contact information; members can change their password after verifying the current password.
- Reliable member refresh/create/edit workflows.
- Payment recording inside User Details with payment-mode filters and completed/pending/failed status.
- Member Edit can update member information and the latest payment status.
- Member Payment action records the completed payment mode and pre-fills the plan amount.
- Member Message action opens WhatsApp for the member's phone number.
- Enquiry status auto-saves; closing an enquiry converts it to a member without duplicates.
- Message templates for Festival, Maintenance, Welcome, Renewal, Offers & Packages and Custom.
- Template library save/update/delete/use workflows.
- Message Center audience filters for status, plan and search.
- Manual recipients use removable checkbox selections rather than a native multi-select.
- Manual sending and automatic bulk sending.
- Automatic send-now and scheduled delivery with audience filters.
- Optional message image support and delivery history.
- Home contact email is optional and Place / Area is captured.
- Premium service/review carousels without browser scrollbars, review glow effects and membership flip cards.
- Admin navigation, KPI, panel and button transitions.
- Responsive desktop/mobile layouts.
- Cache-busting/no-cache handling prevents stale JavaScript from breaking workflows after updates.


## CSV import in Message Center

The Message Center now accepts a CSV exported from User Details. Upload the CSV in the "Import members from Admin CSV" panel. Rows are matched against existing members by phone number; rows with a pending payment/member status are selected for manual review. Matching members are selected in the existing recipient picker, so you can choose a predefined template and use the existing sending workflow.

This import does not itself configure WhatsApp credentials. Automatic delivery requires a configured provider; Meta Cloud API templates may be required for business-initiated sends. Test with one consenting recipient first. CSV rows that do not match an existing member are shown as unmatched and are not sent.

## OpenWA sending

The message center can send immediate messages and scheduled reminders through an OpenWA gateway. OpenWA is a separate service; set `WHATSAPP_PROVIDER=openwa`, `OPENWA_API_URL`, `OPENWA_API_KEY`, and `OPENWA_SESSION_ID` in the server environment. Use `http://localhost:2785/api` locally. For Sibi hosted on Render, OpenWA can run locally behind a Cloudflare Quick Tunnel; set `OPENWA_API_URL` to the tunnel's current HTTPS URL ending in `/api`. The local computer and tunnel must stay online, and the temporary URL changes when restarted. Never expose the API key in frontend code.

When OpenWA is connected, scheduled messages are sent automatically at their due time. If no provider is configured, the app keeps its manual-send fallback. A send accepted by OpenWA is not proof of delivery. OpenWA uses an unofficial WhatsApp Web client and can carry account or policy risk; send only to opted-in recipients and pace sends. See [HOSTING_WHATSAPP_SETUP.txt](../HOSTING_WHATSAPP_SETUP.txt) for local and hosted instructions. Meta Cloud API remains available with `WHATSAPP_PROVIDER=cloud_api`.


Dashboard renewal count now includes all members whose renewal date is past due or falls within the next 7 days. The KPI label is 'Renewals due / overdue'.


Combined update: CSV importer normalizes Indian 10-digit and 91-prefixed phone numbers, does not treat generic active membership status as payment status, and excludes only rows explicitly marked paid in a payment-specific column. Dashboard renewal count includes past-due renewals and renewals due within the next 7 days; label: 'Renewals due / overdue'.


CSV export format update: User Details → Export CSV now exports WhatsApp contact columns `WhatsApp Number (with country code)`, `First Name`, `Last Name`, `Other`. Indian 10-digit phone numbers are prefixed with +91; existing country-coded numbers retain their digits with a leading +. The `Other` field is blank.
