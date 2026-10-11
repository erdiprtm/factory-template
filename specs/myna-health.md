# Myna Health — Spec v1

## One-liner
Aplikasi gaya hidup sehat: panduan makan sehat dan pelacak kebugaran untuk gaya hidup yang lebih baik.

## Target user & problem
Orang dewasa di Indonesia yang ingin hidup lebih sehat (rutin olahraga, makan lebih teratur) tetapi bingung mulai dari mana dan sulit konsisten. Hari ini mereka mencatat di kertas atau catatan HP, atau berpindah-pindah aplikasi. v1 is a **brand landing site only** (mynahealth.id): it presents the Myna products, prices and company identity, and must pass Duitku merchant KYC. The products themselves live elsewhere (Myna Fit on fit.mynahealth.id).

## Core features (v1 — max 3)
1. Brand landing page (apps/site) that introduces Myna Health and its products: **Myna Fit** (gym tracker + calorie log, button to https://fit.mynahealth.id) and **Myna Food** (food guidance by goal: diet, high-protein, etc.; label "Segera hadir").
2. Pricing and company identity clearly visible for Duitku KYC: 6 bulan Rp149.000, 12 bulan Rp249.000; pages Tentang Kami, Kontak, Syarat & Ketentuan, Kebijakan Privasi, Kebijakan Refund; footer on every page with PT Myna Bio Teknologi, full address and erdi@mynahealth.id.
3. Contact form on /kontak/ that sends the message by email to erdi@mynahealth.id (no phone number shown).

## Paid vs free
- Free / trial: the landing site is free to read. No trial is offered on the site.
- Paid (6 or 12 months): one-time prepaid Myna Health subscription (no auto-renewal), used by the Myna apps.

## Plans & prices
- 6 bulan: Rp149.000
- 12 bulan: Rp249.000

## Data the product stores
- The site stores nothing. Contact form messages (name, email, message) are emailed to erdi@mynahealth.id and are not saved in a database.
- Not sensitive: no health data is collected by the site.

## Content & data sources
- All copy written in plain Bahasa Indonesia by the agent from this spec, reviewed by Erdi.
- Strictly no medical content anywhere (pages, meta tags, keywords, alt text): no weight-loss therapy, GLP-1, semaglutide, Ozempic, men's performance, doctor consultation, prescriptions, medicine or clinics.
- Disclaimer on every page: "Myna Health menyediakan informasi gaya hidup sehat dan bukan pengganti layanan medis atau tenaga kesehatan profesional."
- Visual design reuses the look of the original Lovable project (github.com/erdiprtm/mynahealth, archived as tag archive/telehealth-v1), never its content.

## Out of scope for v1
- The Expo app (apps/app stays the template minimum, not linked from the site).
- Sign-in, checkout and payments on mynahealth.id.
- Myna Fit itself (stays on Lovable at fit.mynahealth.id) and Myna Food features.
- SEO content pages and blog.

## Launch & distribution
- Launch date: after Erdi approves the preview and mynahealth.id is switched to the new site.
- First channel(s): direct (brand domain), Duitku merchant KYC review.
- Success metric at day 30: Duitku merchant KYC approved.
- Kill criteria at day 60: not a standalone paid product; if Duitku KYC is rejected twice, revisit the site content with Erdi.

## Open questions
- Lawyer review of the legal pages (sets legal.reviewed and removes the TEMPLATE banner).
- Resend sending domain for the contact form (mynahealth.id DNS, step 6).
