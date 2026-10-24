# Voxora Legal, Voice Privacy & Compliance Review

**Document owner:** Voxora service operator · **Policy version:** 2026-10-24  
**Status:** Draft for legal review and technical acceptance. Publishing a policy does not itself establish regulatory compliance.

## Published pages

- Public privacy notice: `/privacy`.
- Terms & Conditions: `/terms`.
- Refund and cancellation notice: `/refund-policy`.
- Sign-up collects adult confirmation and Terms acknowledgement and records timestamp/version in the database.
- Voice profile creation collects separately affirmative consent and records the voice policy version and timestamp.
- Links are available in the landing, signup, sign-in, account and billing flows.

### Legal operator — SL Options

Voxora is a **software product developed and operated by SL Options**. SL Options is registered as a business in Sri Lanka; Voxora is not a separately registered company. These details were checked against the SL Options corporate-site source (`infosloption-byte/sl-options/src/data.ts` and `src/legal.ts`), which supplies its published registration details and distinguishes product-specific legal policies.

| Item | Company information |
| --- | --- |
| Business | SL Options |
| Registration number | 261006017 |
| Registration date | 6 October 2026 |
| Registered business address | 119, Regency Park, Ranapanadeniya, Rathgama, Sri Lanka |
| Main contact email | info.sloptions@gmail.com |
| Phone | +94 758054772 |
| Corporate website | https://sloptions.xyz |
| Product | Voxora — https://usevoxora.online |

The legal policy pages display this identity and the common SL Options contact address. The separate company-site privacy policy covers `sloptions.xyz`; Voxora's own policy addresses AI scripts, voice recordings, model/reference audio, rendering and Paddle subscriptions in more detail.

You can optionally override **public** contact details through `.env.lightsail` if they change:

```ini
LEGAL_ENTITY_NAME="SL Options"
LEGAL_CONTACT_EMAIL=info.sloptions@gmail.com
LEGAL_BUSINESS_ADDRESS="119, Regency Park, Ranapanadeniya, Rathgama, Sri Lanka"
```

These fields are compiled into frontend assets during the Docker build; rebuild the frontend after any change. Use a mailbox with an established support/privacy-request response process. Do not use these fields for private API credentials.

**Still requires legal sign-off:** confirm the registered business capacity/contracting party, governing-law and dispute terms, payment obligations, refund wording, statutory rights, privacy controller notices and whether any additional official business identification must be displayed in customer invoices or terms.


## Evidence-based security snapshot (current repository)

1. Voice profiles are checked against `req.user.id` in `server/src/routes/voiceProfiles.js` and authenticated at router mount.
2. Each voice sample is a file in the **Voxora API's persisted application storage** (`storage/voice-profiles`). The API also creates a temporary combined-reference WAV from samples.
3. Cloning sends reference audio to a separate authenticated TTS gateway. That gateway stores a `reference.wav` and metadata in its configured voice directory, so **deleting only an API database row does not erase the TTS copy**.
4. The delete route was hardened in this change to return a **retryable 503**, not successful 204, if the TTS copy cannot be removed. Local file deletion failure is no longer silently ignored. Other paths and backups still need systematic deletion reconciliation.
5. The UI and API currently accept a user affirmation that the samples are their own voice. This is **not independent identity or liveness verification**. Voice-cloning abuse remains possible without stronger checks.
6. We have not verified at-rest encryption across every Docker volume, backup, hosting provider and TTS instance, nor end-to-end TLS to the remote TTS gateway. Do not claim encryption, SOC 2 or ISO 27001 certification without evidence.
7. Legacy raw TTS voice passthrough APIs (`/api/tts/voices` and `/api/tts/voices/:voiceId`) previously allowed a signed-in user to list or act on unowned TTS voice IDs. These are now disabled with HTTP 410; the storyboard narration path no longer trusts a browser-supplied raw voice ID.
8. Account deletion, recorded-consent withdrawal across all processors, key rotation, video/audio retention, account data export and full data-subject request workflow are not yet complete.

## Prioritized voice security controls

### P0 — Before opening voice cloning to untrusted public users

- [ ] Limit cloning to **adults' own voices**; implement proof of control/liveness via a server-generated, time-limited challenge phrase recorded live and a human abuse-review path. Checkbox consent alone is insufficient against impersonation.
- [ ] Decide and record the lawful basis for voice processing with counsel and complete a documented privacy/biometric risk assessment (DPIA where required).
- [ ] Ensure voice references and derived artifacts are encrypted at rest in API volumes, TTS volumes and backups; use managed keys with restricted access, rotation and offsite escrow/availability procedures.
- [ ] Restrict the TTS API to an authenticated private tunnel/VPN or tightly scoped mTLS service connection; do not expose an unauthenticated raw GPU inference gateway.
- [ ] Use user-scoped/tenant-scoped voice profile authorization for **every** operation (upload, preview, clone, synthesize and delete), including indirect voice IDs supplied through projects.
- [ ] Make voice deletion an auditable operation with retry queue, **remote deletion acknowledgement**, local file erasure, backups/retention treatment, and status shown to the user. Investigate any orphaned copies created before this fix.
- [ ] Implement rate limits and anomaly detection on voice cloning and narration volume, and moderation for fraud, impersonation and other disallowed uses.
- [ ] Maintain on-call breach response and a procedure for user notification/regulator notification when law requires it.
- [ ] Adopt a **documented** source-sample, temporary-reference, finished audio, logs and backup retention schedule with automatic deletion tests before publishing numeric retention claims.

### P1 — Before commercial / international expansion

- [ ] Record versioned and revocable voice consent, and require re-consent for materially changed use. Preserve tamper-evident evidence of policy/version, actor and time without storing unnecessary sensitive data.
- [ ] Support authenticated export/access, correction, account deletion and verified data-subject rights requests; reconcile data on all storage tiers and subcontractors.
- [ ] Review contracts / data-processing agreements and geographic hosting with AWS, the GPU provider, Paddle, SMTP and AI/model service suppliers.
- [ ] Document where sensitive content crosses borders; assess SCCs or other applicable transfer protections rather than assuming transfers are permitted.
- [ ] Create a privacy contact, public support process and request-response tracking.
- [ ] Implement synthetic-voice/video disclosure and provenance controls; consider durable C2PA content credentials, metadata, user-facing labels and audit trails that survive export.
- [ ] Verify restrictions on content involving children and third-party voices; block prohibited synthetic likeness and impersonation uses.
- [ ] Align subscription entitlements with the customer disclosures, Paddle's merchant-of-record contracts, cancellation rights, chargebacks, payment reconciliation and local tax treatment.

### P2 — Governance and assurance

- [ ] Schedule vulnerability scans, SAST, dependency updates, least-privilege IAM review, encrypted backups and restoration drills, key-rotation drills and penetration testing.
- [ ] Maintain a documented data inventory, record of processing activities, breach register and incident runbooks.
- [ ] Review whether an appointed DPO, EU/UK representative or other jurisdiction-specific officer is required, rather than assuming every startup requires one.
- [ ] Set review cadence on the legal policies and run a change-control step when AI providers, regions or storage practices change.

## Legal regimes to assess (not an assertion that every rule applies)

- **Sri Lanka:** Personal Data Protection Act No. 9 of 2022, as amended by Act No. 22 of 2025. Extraordinary Gazette 2498/16 appoints **1 January 2027** for key processing and controller/processor provisions. Review scope, DPO/DPIA triggers, breach notification and transfer obligations with Sri Lankan counsel.
- **EU/EEA/UK:** GDPR/UK GDPR when territorial scope applies. A recording is personal data if a person can be identified from it; biometric/special category status depends on purpose and processing, notably unique identification. Obtain a legal assessment of specific voice processing and consent.
- **EU AI Act:** Article 50 synthetic audio/video labelling and deepfake disclosures, where applicable, with 2 August 2026 applicability and qualifying transition arrangements for older systems. Do not claim exported videos currently carry compliant machine-readable marks.
- **Paddle:** When enabled, Paddle is merchant of record for checkout. Paddle's [buyer terms](https://www.paddle.com/legal/buyer-terms) and [refund policy](https://www.paddle.com/legal/refund-policy) contain country-specific mandatory rights. A blanket 'no refunds' claim would be misleading.
- **Other places:** Privacy, biometric, publicity, consumer-protection, electronic communication and child-protection laws may apply wherever Voxora targets users. Launch geography and age policies need explicit decisions.

Sources for counsel:
- Sri Lanka DPA: https://www.dpa.gov.lk/guidelines.php
- Sri Lanka gazette index: https://www.documents.gov.lk/view/egz/egz_2026.html
- European Commission personal data guidance: https://commission.europa.eu/law/law-topic/data-protection/information-individuals_en
- EU AI Act Article 50: https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50
- Paddle Refund Policy: https://www.paddle.com/legal/refund-policy

## Lightsail release verification

1. Backup Voxora MySQL and confirm active Git branch.
2. Set public legal contact fields in `.env.lightsail` and keep real SMTP secrets in `server/.env` only.
3. Run `docker compose ... build api frontend` and the corrected `npm test` script (`node --test`).
4. Deploy only after successful tests and backups; the API automatically applies the additive migration for consent fields.
5. Visit `/privacy`, `/terms`, `/refund-policy` logged out; check mobile layout and all footer links.
6. Submit signup without Terms/adult confirmation (expect 400), then confirm acceptance (expect account and audit fields).
7. Create a new voice profile without self-voice consent (expect 400), then with consent; check stored notice version.
8. Test voice deletion success; simulate TTS unavailable and confirm **503**, not a misleading successful deletion. Confirm raw `GET/POST/DELETE /api/tts/voices` return 410, and a supplied unowned voice ID cannot be used in storyboard narration.
9. Confirm that Paddle refund links and production legal contact information are correct.
10. Request lawyer sign-off before activating paid subscriptions and public voice cloning.
