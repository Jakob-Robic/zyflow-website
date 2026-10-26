# Data processing for business customers

<!-- DRAFT for Jakob's approval. Have a lawyer review the agreement text before it is signed with anyone. -->
<!-- Sub-processor list mirrors the Privacy Policy (section 5) as of 2026-10-26. Keep both in sync. If map tiles move to self-hosted servers (embed M4), add that host here. -->

**Version:** 1.0 · **Last updated:** 26 October 2026

This page explains when Zyflow processes personal data for you as a business customer of Zyflow for Businesses, and contains our standard data processing agreement under Article 28 of the GDPR.

## 1. The short answer

**For Zyflow for Businesses as it works today, Zyflow does not process personal data on your behalf, so a data processing agreement is not required.**

- **The widget on your website.** The widget sets no cookies and stores nothing on your visitors' devices. Delivering it necessarily involves your visitors' IP addresses, which Zyflow and its hosting provider process for Zyflow's own purposes (delivering and securing the service). The usage statistics are anonymous: they contain no IP addresses, names or identifiers that persist across visits, and you only receive totals. Zyflow decides how this works and is the controller for it. You can describe it to your visitors with our [privacy text for your website](https://www.zyflow.eu/legal-pages/business-privacy).
- **Your account and billing.** The details of you and your colleagues who use the partner portal, and your billing details, are processed by Zyflow as controller under the [Zyflow Privacy Policy](https://www.zyflow.eu/legal-pages/privacy-policy).
- **Your content.** Photos and texts you upload are covered by the content licence in section 15.3 of our [Terms](https://www.zyflow.eu/legal-pages/terms). Please do not upload photos of identifiable people unless they have agreed.

**If you need a signed agreement anyway**, for example because your own data protection officer asks for one or you send us guest data for a custom setup, write to [legal@zyflow.eu](mailto:legal@zyflow.eu). We will sign the agreement below, completed with the details of the processing, or agree a joint-controller arrangement where that fits better.

## 2. Standard data processing agreement

This agreement applies only where, and only to the extent that, HERKO d.o.o. processes personal data on behalf of a business customer in connection with Zyflow for Businesses. It forms part of the contract between the customer and HERKO d.o.o. under the Zyflow Terms of Service (section 15).

### 2.1 Parties and roles

- **Controller:** the business customer named in the partner portal or in the signed copy of this agreement ("**you**").
- **Processor:** HERKO d.o.o., Pševska cesta 10, 4000 Kranj, Slovenia, registration number 8830045000, VAT ID SI56613555 ("**Zyflow**", "**we**"). Contact for data protection: [legal@zyflow.eu](mailto:legal@zyflow.eu).

### 2.2 Subject matter, duration, nature and purpose

| | |
|---|---|
| Subject matter | The processing described in Annex 1 of the signed copy. |
| Duration | For as long as Zyflow provides the relevant service to you, plus the deletion period in section 2.10. |
| Nature | Storing, organising, displaying and transmitting data as part of Zyflow for Businesses. |
| Purpose | Providing Zyflow for Businesses to you under the Terms of Service. |
| Types of personal data | As listed in Annex 1 of the signed copy. |
| Categories of data subjects | As listed in Annex 1 of the signed copy (for example your guests or staff). |

Special categories of personal data (Art. 9 GDPR) are not processed under this agreement.

### 2.3 Your instructions

We process the personal data only on your documented instructions, including with regard to transfers outside the EU/EEA, unless EU or Slovenian law requires otherwise; in that case we will tell you before processing, unless the law forbids it. The Terms of Service, this agreement and your use of the partner portal are your instructions. We will tell you without delay if we believe an instruction infringes data protection law.

### 2.4 Confidentiality

Everyone at Zyflow who is authorised to process the personal data is bound by confidentiality.

### 2.5 Security

We take the technical and organisational measures required by Art. 32 GDPR. They are summarised in Annex 2 and may be improved over time, but not reduced below the level described there.

### 2.6 Sub-processors

You give us general authorisation to use sub-processors. The current sub-processors are listed in Annex 3. We will tell you at least 30 days before adding or replacing a sub-processor; you may object on reasonable data protection grounds within that period, and if we cannot address your objection, you may end the affected service. We impose on each sub-processor data protection obligations that are no less protective than this agreement, and we remain responsible to you for their performance.

### 2.7 Transfers outside the EU/EEA

We transfer personal data outside the EU/EEA only where an adequate level of protection is ensured under Chapter V GDPR, in particular by an adequacy decision (including the EU-US Data Privacy Framework) or the European Commission's Standard Contractual Clauses.

### 2.8 Helping you

Taking into account the nature of the processing, we help you:

- respond to requests from data subjects exercising their rights (Articles 12 to 23 GDPR). If a data subject contacts us directly about processing under this agreement, we forward the request to you;
- meet your obligations under Articles 32 to 36 GDPR (security, breach notification, data protection impact assessments and prior consultation).

### 2.9 Personal data breaches

We will notify you without undue delay, and where possible within 48 hours, after becoming aware of a personal data breach affecting personal data processed under this agreement. The notification will include the information required by Art. 33(3) GDPR as far as it is available, and we will provide further information as it becomes available.

### 2.10 Deletion and return

When the service ends, we will, at your choice, delete or return the personal data within 30 days and delete existing copies, unless EU or Slovenian law requires us to keep them. Copies in backups are deleted in the normal backup cycle (at most 30 days later) and are not used in the meantime.

### 2.11 Information and audits

We make available the information needed to demonstrate compliance with Art. 28 GDPR and allow for and contribute to audits, including inspections, by you or an auditor you appoint who is bound by confidentiality. Audits take place on at least 30 days' notice, during business hours, not more than once a year unless a breach or a supervisory authority requires it, and each party bears its own costs.

### 2.12 Liability and order of precedence

Liability is governed by Art. 82 GDPR and section 15.4 of the Terms of Service, as far as the law allows. If this agreement conflicts with the Terms of Service on data protection, this agreement prevails.

### 2.13 Law and jurisdiction

This agreement is governed by the law of the Republic of Slovenia. The courts in Kranj, Slovenia have jurisdiction.

## Annex 1: Details of the processing

To be completed in the signed copy for the specific processing (types of personal data, categories of data subjects, retention). There is no standard processing for Zyflow for Businesses today (see section 1).

## Annex 2: Technical and organisational measures (summary)

<!-- Jakob: confirm each measure is true today (MFA on Supabase/Vercel/GitHub, admin access logging, backup cycle) before publishing. -->

- Data stored in the EU (Ireland) with our database provider; encryption in transit (TLS) and at rest.
- Access to production systems limited to authorised Zyflow staff, with individual accounts and multi-factor authentication where available.
- Database row-level security: business users can only read and change data of their own organisation.
- Separation of test and production environments; secrets are not stored in source code.
- Logging of administrative access; error monitoring with data scrubbing.
- Regular backups, deleted in a rolling cycle.
- Data minimisation by design: the widget uses no cookies, device storage or persistent identifiers.

## Annex 3: Sub-processors

| Sub-processor | Service | Location |
|---|---|---|
| Supabase, Inc. | Database, authentication, file storage, backend functions | EU (Ireland); US parent company |
| Vercel, Inc. | Hosting of the partner portal, widget and websites | Global network incl. USA |
| Brevo (Sendinblue SAS) | Email delivery | France (EU) |
| Sentry (Functional Software, Inc.) | Error monitoring | EU data region; US company |
| Contabo GmbH | Server hosting for our own map and routing services | Germany (EU) |

Payments are processed by Stripe as an independent controller under its own terms; Stripe is not our sub-processor for your data.
