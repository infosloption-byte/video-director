export const LEGAL_VERSION = "2026-10-24";
export const LEGAL_EFFECTIVE_DATE = "24 October 2026";

// Set these public Vite build variables in the Lightsail Compose build args.
// The company name, monitored privacy mailbox, and official address must be
// verified by the operator before a full commercial launch.
export const legalIdentity = {
  operator: String(import.meta.env.VITE_LEGAL_ENTITY_NAME || "Voxora").trim(),
  email: String(import.meta.env.VITE_LEGAL_CONTACT_EMAIL || "").trim(),
  address: String(import.meta.env.VITE_LEGAL_BUSINESS_ADDRESS || "").trim(),
};

export const legalDocuments = {
  privacy: {
    title:"Privacy Policy", category:"YOUR DATA & YOUR VOICE",
    intro:"This notice explains how Voxora handles account details, research and video projects, recordings supplied for voice cloning, generated narration, billing information, and related technical data. We treat voice recordings and cloned-voice reference material as particularly sensitive.",
    sections:[
      {title:"Who operates Voxora", paragraphs:[
        "Voxora is the AI-assisted research, narration and video-creation service operated by the entity identified in the contact section below. The operator is responsible for the personal information it controls; individual infrastructure and payment providers may have their own responsibilities.",
        "This notice applies to the Voxora website, workspace, account services and optional voice-profile features. Additional notices may be shown before features involving sensitive information are used."
      ]},
      {title:"Information we collect", bullets:[
        "Account details: email address, optional display name, password hash, email verification records and login sessions.",
        "Creative materials: research prompts, source references, scripts, scenes, uploaded images or video, generated voice audio, drafts, renders and exports.",
        "Voice information: the guided audio samples you record, associated transcript text, combined reference audio, clone configuration, voice identifiers and consent timestamp. Voices can identify or reveal information about individuals, so they require heightened care.",
        "Technical and security data: request identifiers, IP address, browser/device information, session and abuse-prevention logs where recorded.",
        "Billing data: plan, subscription status, transaction identifiers and related records supplied by our payment provider. Complete payment-card details are processed by the payment provider, not entered into Voxora's own billing forms."
      ]},
      {title:"Why we use this information", bullets:[
        "To register and verify accounts, authenticate sessions and provide support.",
        "To save research projects, create or edit videos, render requested output and generate narration.",
        "When you actively choose voice cloning, to receive samples and create a reusable reference for narration using your selected voice engine.",
        "To maintain platform security, prevent impersonation, investigate abuse and protect other users.",
        "To measure plan entitlements, administer subscriptions and send essential billing or security notifications.",
        "To comply with applicable legal requirements, respond to valid requests and resolve disputes."
      ]},
      {title:"Your voice samples and cloned voices", paragraphs:[
        "Voice cloning is optional. It requires a separate affirmative confirmation in the voice-profile workflow. At launch, this feature is intended only for adults recording their own voice. Do not upload anyone else's voice, including a public figure, family member, colleague or client.",
        "Voxora stores uploaded samples in application storage and, when you request a clone, sends a prepared reference recording to the configured text-to-speech service. The TTS service may retain the reference required to synthesize later narration. Generating audio can also create temporary processing files and finished audio.",
        "Voice material is used to supply the features you request, not for marketing or for training a general-purpose, shared voice model as part of the current Voxora workflow. If that practice changes, we will provide a new notice and obtain any consent required before the new use.",
        "Voice-derived material is not used by Voxora as a speaker-identification or identity-verification service. Depending on the processing and jurisdiction, certain voice characteristics or voiceprints may be regulated as biometric or other sensitive personal data.",
        "Deleting a voice profile initiates removal of its associated records and files from the services Voxora controls. Where a connected TTS system or storage backup is unavailable, deletion may require follow-up; contact us if a deletion cannot be completed. We do not promise immediate removal from every backup."
      ]},
      {title:"Legal grounds and consent", paragraphs:[
        "Where applicable data-protection law requires a legal basis, core account, rendering and billing operations are generally needed to provide the service you request; security processing may be needed for legitimate interests or legal obligations.",
        "We request affirmative consent for voice cloning and its specific processing purpose. You may withdraw your permission by deleting a voice profile and requesting any additional data removal through the contact channel below, subject to applicable legal and technical limitations.",
        "Where applicable law classifies certain voice processing as special-category or sensitive data, further conditions may be required. Legal bases and additional safeguards should be reviewed for the jurisdictions in which Voxora is offered."
      ]},
      {title:"Service providers and international processing", paragraphs:[
        "We use hosting and infrastructure suppliers to run the website, databases, rendering and optional GPU-based text-to-speech. Research or AI services may receive the prompts and content necessary to fulfil a requested task. Gmail SMTP is used to deliver transactional account messages.",
        "If you purchase a subscription, Paddle processes checkout, taxes, billing and related payment activities under its own buyer and privacy terms; Voxora receives the transaction and subscription details needed to grant access.",
        "Some providers may process or store data in countries other than your own. We assess cross-border processing and suitable contractual and technical safeguards as required by the laws that apply to our operations. We do not sell voice samples or cloned-voice reference files."
      ]},
      {title:"Security", paragraphs:[
        "The service uses authenticated accounts, ownership checks on voice-profile routes, protected application endpoints and authenticated TTS service requests. We continue to assess safeguards for voice material, including encryption at rest, restricted administrator access, secret management, audit trails and verification of deletion across systems.",
        "No internet service can guarantee absolute security. Do not submit material that you lack permission to process, and notify us promptly of any suspected account or voice-profile compromise."
      ]},
      {title:"Retention and deletion", paragraphs:[
        "Account information, projects and stored voice samples are generally retained to provide the requested service until you delete them, request account closure or applicable operational rules require removal. Security, payment and dispute records may need to be retained longer where law or legitimate protection obligations require it.",
        "Backups, logs, completed renders and copies held by configured processing services may have distinct lifecycles. The exact schedules and automated erasure controls are under review; we will publish specific retention periods when validated rather than inventing deletion guarantees.",
        "Users can delete individual voice profiles in the voice library. For access, correction, export, account closure, or follow-up removal of associated voice material, use the privacy contact in the contact section."
      ]},
      {title:"Cookies and session information", paragraphs:[
        "Voxora uses cookies needed for authenticated sessions and account security. We do not describe optional analytics or advertising cookies here unless such tools are actually deployed; any future non-essential tracking will be disclosed and handled as applicable law requires."
      ]},
      {title:"Your rights", paragraphs:[
        "Depending on your location, you may have rights to request access to, correction of, export of or deletion of your personal data; object to certain processing; withdraw consent; or contact a supervisory authority. We may need to confirm your identity before sharing sensitive information.",
        "Send privacy requests through the contact details below. We will assess and respond in accordance with applicable law and may explain where legal retention obligations prevent immediate deletion."
      ]},
      {title:"Children", paragraphs:[
        "Voxora is intended for adults aged 18 or older. Our self-voice cloning workflow is not offered for children's voices. If you believe a minor's voice has been uploaded, please contact us to request review and removal."
      ]},
      {title:"Updates to this policy", paragraphs:[
        "We may revise this notice as infrastructure, providers, legal obligations or product features change. Material changes affecting voice data will be communicated in a proportionate manner and, where necessary, require renewed consent."
      ]}
    ]
  },
  terms: {
    title:"Terms & Conditions", category:"USING VOXORA RESPONSIBLY",
    intro:"These Terms govern your use of Voxora's research-to-video workspace, optional AI-generated narration and voice cloning, video editing, and subscription services. By creating an account, you agree to these Terms and acknowledge the Privacy Policy.",
    sections:[
      {title:"Service and eligibility", paragraphs:[
        "Voxora provides tools for researching topics, preparing scripts and storyboards, generating narration, editing and rendering short videos. Features may depend on external AI and media services and may vary by subscription.",
        "You must be at least 18 years old, have the legal capacity to enter into this agreement, and provide accurate account information. Keep your password and account access secure; you are responsible for activity under your account, subject to applicable law."
      ]},
      {title:"Voice cloning: your own voice only", paragraphs:[
        "At launch, Voxora permits voice-profile creation only from recordings of your own natural speaking voice. You must personally record the required samples, confirm this ownership in the consent step and understand that the service will create a reusable synthetic-voice reference.",
        "You may not upload, imitate or clone a third party's voice—even if found online—including celebrities, public officials, coworkers, customers, family members or minors. Separate verified-consent and rights-management processes would be required before Voxora could consider supporting third-party voices.",
        "You may withdraw voice-processing consent by deleting the relevant profile and contacting us about any incomplete deletion. The Privacy Policy explains current storage, processing and deletion limitations."
      ]},
      {title:"Prohibited use", bullets:[
        "Impersonation, deception, identity theft, phishing, financial fraud, fraudulent endorsements, fabricated emergency calls or misleading representations that an actual person said something they did not say.",
        "Non-consensual synthetic intimate material, threats, harassment, defamatory impersonation, unlawful discrimination or other abuse of a person's likeness, voice or reputation.",
        "Disinformation or manipulation presented as authentic, including deceptive political or public-interest media, or evasion of required synthetic-media disclosures.",
        "Uploading materials you do not have rights or permission to use, malware, attempts to bypass subscription limits or unauthorised access to another user's files or account.",
        "Misuse of the platform in violation of applicable laws, intellectual-property rights, privacy rights or another provider's policies."
      ]},
      {title:"Synthetic media and transparency", paragraphs:[
        "You must review AI-assisted scripts, audio and rendered media for accuracy, rights clearance and suitability before publication. Where disclosure is required by law or platform policy, clearly identify synthetic or AI-manipulated narration and other artificial media. Do not remove or falsify any applicable provenance markers.",
        "Voxora may include technical indications that content was created or altered by AI. The existence or absence of a marker does not relieve you of your responsibility to disclose synthetic media where appropriate."
      ]},
      {title:"Content ownership and processing permission", paragraphs:[
        "You retain the rights you legally hold in materials you submit and in generated output to the extent those rights exist under applicable law. By using the service, you grant Voxora only the limited permission reasonably needed to host, process, convert and render your submitted materials for your requested workflows.",
        "You represent that you have appropriate rights to use media, research content, voices and other input, and that publishing your result will comply with applicable law and the terms of relevant third-party platforms. Generated content may be similar to content created for other users; exclusive ownership is not guaranteed."
      ]},
      {title:"AI quality and availability", paragraphs:[
        "AI output can be incomplete or inaccurate and may contain errors, bias, hallucinations or rights issues. Voxora does not guarantee factual accuracy, uninterrupted access, successful inference, or compatibility with every output destination. The user remains the editor and publisher responsible for final review.",
        "Features may be restricted or temporarily unavailable during maintenance, GPU capacity constraints, provider outages or security investigations."
      ]},
      {title:"Plans, renewals and usage limits", paragraphs:[
        "Free and paid plans have usage limits displayed in the application. Monthly render allowances and maximum video duration are enforced by the service; plans and advertised pricing may change prospectively with appropriate notice.",
        "Paid subscriptions, when enabled, are recurring and continue until cancelled. Checkout shows the actual price, currency, billing cadence and applicable taxes before you pay. Billing and receipts are processed by Paddle as merchant of record, subject to Paddle's buyer terms. Subscription changes may be subject to Paddle's proration and billing rules.",
        "Cancelling stops future renewals and ordinarily takes effect at the end of the current paid period, except where law or Paddle's terms provide otherwise. Our Refund Policy explains refund requests and mandatory consumer rights."
      ]},
      {title:"Account restrictions and removal", paragraphs:[
        "We may limit or suspend features, investigate reports or remove content or voice profiles when reasonably necessary to prevent impersonation, fraud, rights violations, security risks or misuse. Where feasible and lawful, we will provide notice and a way to contest mistaken enforcement.",
        "You may stop using Voxora at any time. Subscription cancellation and personal-data deletion are separate processes: cancelling payments does not automatically erase saved projects or voice samples."
      ]},
      {title:"Liability and legal rights", paragraphs:[
        "We provide the platform with reasonable care but cannot guarantee error-free AI output or continuous availability. To the extent permitted by applicable law, Voxora is not responsible for unlawful use of generated content or third-party services outside its control.",
        "Nothing in these Terms excludes any liability or consumer right that the law does not permit us to exclude. Applicable law, jurisdiction and formal dispute terms must be confirmed with the operator's legal adviser before commercial release."
      ]},
      {title:"Contact and amendments", paragraphs:[
        "Questions about accounts, content, privacy or billing may be directed to the contact information below. We may revise these Terms when required for product or regulatory changes, with appropriate notice of material amendments."
      ]}
    ]
  },
  refund: {
    title:"Refund Policy", category:"BILLING, CANCELLATION & REFUNDS",
    intro:"This policy explains Voxora subscription cancellations and how refund requests are handled when paid plans are available. Purchases processed through Paddle are also subject to Paddle's Buyer Terms and Refund Policy, and mandatory consumer-protection rights always take priority.",
    sections:[
      {title:"Subscription billing", paragraphs:[
        "The Free plan does not require payment. Paid plans, once enabled, renew according to the subscription period shown at checkout. The checkout total, currency, taxes and renewal information will be provided before payment. Paddle acts as the merchant of record for purchases completed through its checkout.",
        "A payment does not guarantee immediate rendering when an external TTS, AI or rendering provider is temporarily unavailable. Contact support about an unresolved service problem."
      ]},
      {title:"Cancel a subscription", paragraphs:[
        "You may cancel through Account → Subscription & billing → Cancel subscription, through the management link in Paddle emails, or through Paddle buyer support. Cancellation normally takes effect at the end of the current billing period and prevents the next renewal.",
        "Cancelling does not by itself delete your account, saved projects, voice samples or already-produced media. Use the voice library deletion controls or a privacy request for data removal."
      ]},
      {title:"Refunds and statutory rights", paragraphs:[
        "Refunds, withdrawal rights and exceptions are determined by applicable consumer law and Paddle's buyer terms and refund policy. Some countries provide statutory withdrawal rights for eligible digital subscriptions; these rights may depend on whether you expressly agreed to immediate performance.",
        "Except as required by law or expressly offered at checkout, payments are not automatically refundable or prorated solely because you cancel or do not use all available render credits. Paddle may grant a discretionary refund based on the circumstances.",
        "If the purchased service has a serious technical defect, fails materially to match its description or cannot be provided as agreed, please report it promptly. You may be entitled to a refund or other remedy under applicable law."
      ]},
      {title:"How to request a refund", paragraphs:[
        "Use the refund or support link in your Paddle receipt, visit paddle.net, or use the contact information at the bottom of this page. Include the account email, approximate payment date, transaction or invoice ID, and a description of the issue; never send full card numbers or authentication secrets.",
        "Paddle may request further information and processes eligible refunds through the original payment route where possible. Timing depends on the method, relevant law and payment provider."
      ]},
      {title:"Failed payments, disputes and chargebacks", paragraphs:[
        "If payment cannot be collected, the subscription may enter a past-due or restricted state until resolved. You can normally update your payment method through the Paddle customer portal.",
        "You may exercise lawful dispute or chargeback rights. Please first contact Paddle or Voxora support where practicable so the matter can be investigated; nothing here limits rights granted by law."
      ]},
      {title:"Where to read the Paddle rules", paragraphs:[
        "For transactions sold by Paddle, its current Buyer Terms and Refund Policy set out the specific country rules, statutory withdrawal rights and supported refund routes. We link those terms below so you can check the rules that apply to your purchase."
      ], links:[
        {label:"Paddle Refund Policy",url:"https://www.paddle.com/legal/refund-policy"},
        {label:"Paddle Buyer Terms",url:"https://www.paddle.com/legal/buyer-terms"},
        {label:"Paddle Buyer Support",url:"https://paddle.net"}
      ]}
    ]
  }
};
