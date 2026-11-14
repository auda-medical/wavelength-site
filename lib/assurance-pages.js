// NHS assurance pages (November 2026): Trust and security, Intended purpose and clinical safety, Accessibility statement.
// Every sentence must be true on the day the page goes live. Do not add certificates, tests or approvals until they
// exist; never write "NHS approved", "NHS compliant", "DTAC approved", "UK-only hosting", "GDPR certified" or
// "HIPAA compliant" (test/assurance-pages.test.mjs scans for these).
//
// The pages build as drafts (noindex, out of the sitemap and footer, with a visible draft note) until the owner
// approves the wording and sets `assuranceApproved` (YYYY-MM-DD) in data/site.json.
// Change a statement here, then update `reviewed` below and the DTAC evidence pack in the HQ folder.

const REVIEWED = { trust: '2026-11-13', clinical: '2026-11-13', accessibility: '2026-11-13' };
// The date the accessibility tests below were run, and with what.
const A11Y_TESTED = '2026-11-13';
const human = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });

function assurancePages({ site, esc, approved, mail }) {
  const company = site.company;
  const contact = `<a class="text-link" href="mailto:${site.enquiriesEmail}">${site.enquiriesEmail}</a>`;
  const approvedLine = (what) => approved
    ? `<p class="small">${what} approved by Dr Firas Abou-Auda, Director, ${company}, on ${approved.human}.</p>`
    : '';

  const trust = {
    title: 'Trust and security',
    seoTitle: 'Trust and security: how Wavelength protects data',
    description: 'How the Wavelength logbook and website handle data and security: patient information, image encryption, where data is stored, sub-processors, data protection and how to report a security issue.',
    updated: REVIEWED.trust,
    body: `<p>This page is for trainees, supervisors and NHS organisations who want to know how Wavelength handles data and security. It describes what is true today. When we add a certificate or an independent test, we will list it here with its date.</p>
<h2 id="what-wavelength-is">What Wavelength is, and what it is not</h2>
<p>Wavelength is an education and training service for point-of-care ultrasound: a logbook app with supervisor sign-off and assessments, Wavelength Academy, Pearls, guides and hands-on courses. It is not used to diagnose, treat or manage patients, it holds no patient records, and it is not a medical device. Read our <a class="text-link" href="/clinical-safety/">intended purpose and clinical safety statement</a>.</p>
<h2 id="who-we-are">Who we are</h2>
<p>Wavelength is a trading name of ${company}, registered in England and Wales, company number ${site.companyNumber}. We are registered with the Information Commissioner's Office as a data controller, registration number ${esc(site.icoNumber)}. Wavelength is an independent education provider. It is not run or endorsed by the NHS or by any college or society.</p>
<h2 id="patient-information">Patient information</h2>
<ul>
<li>The <a class="text-link" href="/app-terms/">logbook terms of use</a> forbid patient-identifiable information in entries, photos and clips.</li>
<li>When a photo or clip is saved, the app removes hidden file data (such as location) and removes sound from clips. It warns the user when typed text looks like an identifier, such as a hospital or NHS number.</li>
<li>Users must follow their employer's policies on clinical photography, personal devices and information governance. Where those policies do not allow photographs, the scan is logged without one.</li>
</ul>
<h2 id="images">Where scan images go</h2>
<ul>
<li>Photos and clips stay on the user's phone. They are not synced to our servers.</li>
<li>When a trainee chooses to include images in a sign-off request, the phone encrypts them first (AES-GCM with a 256-bit key, a new key for each request) and uploads only the encrypted files.</li>
<li>In a link the trainee sends themselves, the key travels only inside the link, so we hold files we cannot open. In a request sent to a linked supervisor's dashboard, we also hold the key, so that this supervisor, signed in, can open the images in the app. We give no one else access.</li>
<li>The encrypted files are deleted when the supervisor signs, when the request is cancelled, when the account is deleted, or after 14 days, whichever comes first.</li>
<li>The supervisor sees each image with a "Review copy" watermark and no download button.</li>
</ul>
<h2 id="where-data-is-stored">Where data is stored</h2>
<p>Our database runs on Cloudflare, with Western Europe requested as its location. Cloudflare treats this as a location hint rather than a guarantee, and the website and app are served through Cloudflare's global network. We do not claim UK-only hosting. Encrypted sign-off images are held in Cloudflare's key-value store until they are deleted as described above.</p>
<div class="table-wrap"><table class="table md-table">
<thead><tr><th scope="col">Sub-processor</th><th scope="col">What it does for us</th><th scope="col">Where</th></tr></thead>
<tbody>
<tr><td>Cloudflare</td><td>Hosts the website, app and database; holds encrypted sign-off images until deletion; protects the service from attacks; keeps request logs for at most seven days</td><td>Database: Western Europe location hint. Website and app: Cloudflare's global network</td></tr>
<tr><td>Zoho</td><td>Our email, account and certificate emails, and the newsletter for people who subscribed</td><td>Zoho's EU service</td></tr>
<tr><td>Stripe</td><td>Payments for course bookings</td><td>UK, EU, United States and other countries</td></tr>
<tr><td>Google (Firebase Cloud Messaging)</td><td>Phone notifications in the app, only if the user turns them on</td><td>Global</td></tr>
<tr><td>Apple (push notification service)</td><td>Delivers those notifications to iPhones</td><td>Global</td></tr>
</tbody></table></div>
<p>Each acts under contract as our processor. Where data leaves the UK or the European Economic Area, the safeguards are those set out in our <a class="text-link" href="/privacy/">privacy notice</a>.</p>
<h2 id="how-we-protect-it">How we protect it</h2>
<ul>
<li>HTTPS on every page and request, with HTTP Strict Transport Security.</li>
<li>Security headers on every response, including a Content Security Policy that lets the website and app run only their own scripts, and refuses to be framed by other sites.</li>
<li>Passwords are stored only as salted PBKDF2-SHA-256 hashes, never in readable form. Administrator passwords are also combined with a secret key held outside the database before hashing.</li>
<li>Sign-in is rate limited, and an account locks for 15 minutes after eight failed sign-ins in a row. Users can log out of every device at once.</li>
<li>Login cookies cannot be read by page scripts and are sent only over HTTPS.</li>
<li>Administrators each have a personal account with mandatory two-step sign-in (an authenticator app and recovery codes), a role that opens only the sections they need, and an audit log of administrative actions. Security settings need a fresh two-step code.</li>
<li>A sign-off records a fingerprint of the signed entry and its images. Editing a signed entry voids the sign-off. Anyone can check a sign-off code on our <a class="text-link" href="/verify/">verification page</a>, which never shows findings or images.</li>
<li>Technical logs hold no names, email addresses, internet addresses or logbook content, and are deleted within seven days.</li>
<li>Before every release we take an encrypted export of the database, check that it restores, and keep copies on separate storage. Cloudflare's point-in-time recovery adds a second route back.</li>
<li>Users' own backups from the app are encrypted with a passphrase they choose.</li>
</ul>
<h2 id="data-protection">Data protection</h2>
<p>Our <a class="text-link" href="/privacy/">privacy notice</a> sets out what we collect, why, our lawful bases, how long we keep it and people's rights. We have completed data protection impact assessments, each signed by our director, for:</p>
<ul>
<li>encrypted image and clip sharing for supervisor sign-off (October 2026);</li>
<li>supervisor verification, supervisor search and organisations (October 2026);</li>
<li>on-device safety copies of unsaved photos and scans (October 2026);</li>
<li>phone notifications (October 2026);</li>
<li>supervisors viewing shared images in the app (October 2026).</li>
</ul>
<p>Users can export their logbook and delete their account from the app at any time. Deleting an account deletes the logbook, sign-offs, assessments, supervisor links and verified summaries from our servers.</p>
<h2 id="clinical-safety">Clinical safety</h2>
<p>Wavelength records training evidence after the clinical episode and does not influence the care of any patient. Using NHS England's applicability test, the clinical risk management standards DCB0129 and DCB0160 do not apply. The reasons are in our <a class="text-link" href="/clinical-safety/">intended purpose and clinical safety statement</a>.</p>
<h2 id="accessibility">Accessibility</h2>
<p>We test the website and app against WCAG 2.2 level AA. Read our <a class="text-link" href="/accessibility/">accessibility statement</a> for what works, what does not yet, and how to tell us about a barrier.</p>
<h2 id="certificates">Certificates and independent testing</h2>
<p>We do not yet hold a Cyber Essentials certificate or a published Data Security and Protection Toolkit assessment, and the service has not yet had an independent penetration test. We will list each one here, with its date, once we have it.</p>
<h2 id="for-nhs-organisations">For NHS organisations</h2>
<p>On request we can provide summaries of our data protection impact assessments, and answers to supplier and information governance questionnaires. Course bookings can be paid by invoice against a purchase order. Email ${contact}.</p>
<h2 id="report-a-security-issue">Report a security issue</h2>
<p>If you think you have found a security problem in the website or app, email ${contact} with "Security" in the subject line, and tell us what you found and how to reproduce it. Please do not access, change or keep anyone else's data, and give us reasonable time to fix the problem before you share it. We aim to acknowledge reports within five working days. Our <a class="text-link" href="/.well-known/security.txt">security.txt</a> file gives the same contact.</p>
<h2 id="review">Review</h2>
<p>We review this page whenever a release changes how data flows, and at least once a year.</p>
${approvedLine('This page was')}`,
  };

  const clinical = {
    title: 'Intended purpose and clinical safety',
    seoTitle: 'Intended purpose and clinical safety',
    description: 'What the Wavelength logbook and Academy are for, why Wavelength is not a medical device, and why the NHS clinical risk management standards DCB0129 and DCB0160 do not apply.',
    updated: REVIEWED.clinical,
    body: `<p>This statement sets out what Wavelength is for, why it is not a medical device, and why the NHS clinical risk management standards DCB0129 and DCB0160 do not apply to it. It covers the Wavelength app and logbook (on the web, Android and iPhone), supervisor sign-off and assessments, the verification pages, Wavelength Academy, Pearls and guides.</p>
<h2 id="intended-purpose">Intended purpose</h2>
<p>Wavelength is for the education and training of clinicians in point-of-care ultrasound. It lets a clinician:</p>
<ul>
<li>record ultrasound scans they have already performed, as a training logbook;</li>
<li>see their progress against targets drawn from published training curricula;</li>
<li>ask a supervisor to sign off scans and record structured assessments of their competence, as training evidence;</li>
<li>learn from Wavelength Academy modules, Pearls and guides, and earn Wavelength certificates.</li>
</ul>
<p>Its users are clinicians in training, their supervisors and assessors, and educators.</p>
<h2 id="what-it-is-not">What Wavelength is not for</h2>
<ul>
<li>It is not used to diagnose, treat, monitor, predict or manage the care of any patient.</li>
<li>It does not measure or calculate anything from images, and it does not interpret images. Its image tools crop, rotate, label and black out areas, so trainees can remove identifiers and illustrate teaching points.</li>
<li>It is not a patient record. It does not connect to any clinical system, and it does not use NHS numbers. Its terms forbid patient-identifiable information.</li>
<li>A supervisor's review of a logbook entry or image judges the trainee's technique and image quality for training sign-off. It is not a second opinion on the patient.</li>
</ul>
<p>If anyone using Wavelength becomes concerned about a patient, including a supervisor reviewing an image, they must act through the normal clinical route in their own organisation, for example by speaking to the clinician responsible. Wavelength is not a route for clinical concerns, and Wavelength staff do not review logbook entries or images for clinical content.</p>
<h2 id="medical-device">Not a medical device</h2>
<p>Under the UK Medical Devices Regulations 2002, software is a medical device only if its manufacturer intends it for a medical purpose, such as the diagnosis, prevention, monitoring or treatment of disease in a person. The Medicines and Healthcare products Regulatory Agency's guidance on stand-alone software and apps decides this from the intended purpose stated in the product's labelling, instructions and promotion.</p>
<p>Wavelength's intended purpose is education and training records, as set out above. It has no medical purpose for any individual patient. It is therefore not a medical device, it carries no UKCA or CE marking as one, and it needs none.</p>
<p>We would reassess this before making any change that could give Wavelength a medical purpose, for example a measurement or calculation that could inform a clinical decision, automated interpretation of images, or wording that suggests Wavelength helps to diagnose or manage a patient. We do not describe Wavelength in those terms.</p>
<h2 id="dcb0129-dcb0160">Clinical risk management: DCB0129 and DCB0160</h2>
<p>DCB0129 applies to manufacturers of health IT systems, and DCB0160 to the health organisations that deploy them. NHS England's guidance on their applicability asks a series of questions. If the answer to any of the first three is no, the standards do not apply.</p>
<div class="table-wrap"><table class="table md-table">
<thead><tr><th scope="col">NHS England's question</th><th scope="col">Answer for Wavelength</th></tr></thead>
<tbody>
<tr><td>1. Is development or deployment publicly funded for use in England?</td><td>Wavelength is developed by a private company without public funding. An NHS organisation could pay for it in future, so we do not rely on this answer.</td></tr>
<tr><td>2. Does it support health or adult social care services?</td><td>Indirectly: it supports the education and training of health professionals.</td></tr>
<tr><td>3. Is it used to influence, support or manage real-time or near-real-time direct patient care?</td><td><b>No.</b> Scans are logged after the clinical episode, as training evidence. Nothing in Wavelength feeds a patient record, a clinical decision or a treatment. Supervisor review is for training sign-off.</td></tr>
<tr><td>4. Is it a medical device?</td><td>No, as set out above.</td></tr>
</tbody></table></div>
<p>Because the answer to question 3 is no, DCB0129 does not apply to Wavelength. An organisation's duties under DCB0160 follow from deploying a health IT system within scope, so DCB0160 does not apply to an organisation's use of Wavelength either.</p>
<h2 id="training-risks">Training risks we manage</h2>
<p>Although the standards do not apply, we manage the risks that come with a training record:</p>
<ul>
<li><b>Patient identifiers in images or text.</b> A strict rule in the terms; hidden file data and clip sound removed on saving; warnings on text that looks like an identifier; images kept on the phone, encrypted when shared, and deleted within 14 days.</li>
<li><b>A sign-off or assessment that is false or out of date.</b> Sign-offs are tied to a fingerprint of the entry and its images, and editing voids them; every sign-off, assessment and certificate has a code anyone can check; supervisors' approval status is recorded at the moment they sign.</li>
<li><b>Training targets that drift from the curriculum.</b> Each pathway shows its source and the date it was checked, and users are told to confirm requirements with their supervisor and the accrediting body.</li>
<li><b>Teaching content that is wrong or out of date.</b> Pearls show when they were reviewed and when they are next due; guides show the date they were checked against their sources and list those sources.</li>
</ul>
<p>We record these risks and their controls in a training risk log, and review it at each release that changes how the logbook, sign-off or images work.</p>
<h2 id="review">Review</h2>
<p>We review this statement at each release that could change Wavelength's intended purpose, at least once a year, and when NHS England publishes revised versions of DCB0129 and DCB0160.</p>
${approvedLine('This statement was')}
<p>Questions: ${contact}.</p>`,
  };

  const tested = human(A11Y_TESTED);
  const accessibility = {
    title: 'Accessibility statement',
    seoTitle: 'Accessibility statement',
    description: 'How accessible the Wavelength website, app and sign-off pages are, what does not work yet, how we tested against WCAG 2.2 AA, and how to report a barrier.',
    updated: REVIEWED.accessibility,
    body: `<p>This statement applies to the Wavelength website at thewavelength.co.uk, the Wavelength app and logbook (on the web, and the Android and iPhone apps, which use the same screens), the pages supervisors and assessors open from a sign-off or assessment link, the verification pages and Wavelength Academy. It is run by ${company}, trading as Wavelength.</p>
<p>We want as many people as possible to be able to use Wavelength. You should be able to:</p>
<ul>
<li>zoom in up to 400% without text spilling off the screen or needing to scroll sideways;</li>
<li>use most of the website and app with a keyboard alone, and see where you are on the page as you move;</li>
<li>use the app in a light or dark theme, or let it follow your phone;</li>
<li>turn off moving effects on the website by setting your device to reduce motion;</li>
<li>watch our films with captions, or read them as text;</li>
<li>use the app in English, French, Spanish, German, Italian, Polish, Arabic (right to left), Russian or Chinese.</li>
</ul>
<p>AbilityNet has <a class="text-link" href="https://mcmw.abilitynet.org.uk/" rel="noopener">advice on making your device easier to use</a> if you have a disability.</p>
<h2 id="how-accessible">How accessible this service is</h2>
<p>We know some parts are not fully accessible:</p>
<ul>
<li>In the image editor, drawing arrows, circles and boxes, cropping, covering an identifier and moving a label all need you to drag on the image with a finger or mouse. There is no keyboard or single-tap way to do these yet.</li>
<li>On a phone, zooming into a scan image needs a two-finger pinch. On a computer you can zoom with the mouse wheel or trackpad.</li>
<li>PDF files we produce (certificates, logbook and case exports, sign-off registers and one-page guide summaries) are not tagged for screen readers.</li>
<li>We have not yet tested the service with screen readers, speech recognition software or disabled users.</li>
</ul>
<h2 id="feedback">Feedback and contact information</h2>
<p>If you find a barrier, or need information in a different format such as large print, plain text or an accessible document, email ${contact}. Tell us the page or screen, what you were trying to do, and the device and any assistive technology you use. We aim to reply within five working days.</p>
<h2 id="other-formats">Other formats</h2>
<p>Your logbook can be exported as an Excel spreadsheet or a CSV file as well as a PDF, and every certificate and sign-off can be checked as a web page on our <a class="text-link" href="/verify/">verification page</a>. Each guide is a web page as well as a one-page PDF.</p>
<h2 id="enforcement">If you are not happy with our response</h2>
<p>If you are not happy with how we respond to your complaint, you can contact the <a class="text-link" href="https://www.equalityadvisoryservice.com/" rel="noopener">Equality Advisory and Support Service (EASS)</a>.</p>
<h2 id="technical-information">Technical information about this service's accessibility</h2>
<p>${company} is committed to making its website and apps accessible. We are a private company, not a public sector body, so the Public Sector Bodies Accessibility Regulations 2018 do not apply to us; we follow the same standard because many of our users work in the NHS.</p>
<h3>Compliance status</h3>
<p>This service is partially compliant with the <a class="text-link" href="https://www.w3.org/TR/WCAG22/" rel="noopener">Web Content Accessibility Guidelines version 2.2</a> AA standard, because of the non-compliances listed below.</p>
<h2 id="non-accessible-content">Non-accessible content</h2>
<h3>Non-compliance with the accessibility regulations</h3>
<ul>
<li>Drawing, cropping, covering identifiers and moving labels in the image editor need a dragging movement and a pointer. This fails WCAG 2.2 success criteria 2.1.1 (keyboard) and 2.5.7 (dragging movements). Typing a description of the scan, rotating and flipping, and removing an image work without dragging. We plan to add buttons to place, size and move these items.</li>
<li>Zooming into a scan image on a touch screen needs a pinch with two fingers. This fails success criterion 2.5.1 (pointer gestures). We plan to add zoom buttons.</li>
<li>Our PDF files are not tagged, so screen readers may read them out of order or miss their structure. This fails success criteria 1.3.1 (info and relationships) and 1.3.2 (meaningful sequence). The same information is available as web pages or spreadsheets, as described under "Other formats". We plan to tag the certificate and logbook PDFs.</li>
</ul>
<h3>Disproportionate burden</h3>
<p>We are not claiming disproportionate burden for any of these issues.</p>
<h3>Content that is not within the scope of this statement</h3>
<p>The administration area used by Wavelength staff is not covered. Course payment pages are run by Stripe and are not covered.</p>
<h2 id="how-we-tested">How we tested this service</h2>
<p>We last tested the service on ${tested}, ourselves; it has not yet been audited by an independent organisation. We tested:</p>
<ul>
<li>every page in our sitemap, plus the verification, Pearl test, sign-in and error pages, with the axe-core accessibility engine (version 4.10) using its WCAG 2.0, 2.1 and 2.2 level A and AA rules;</li>
<li>every main screen of the app (sign-in, home, logbook, a scan, new scan, progress, targets, export, verified summaries, backup, assessments, supervisors, supervising, outstanding items, guides, settings and account) in both the light and dark themes, and a supervisor's sign-off link page, with the same rules;</li>
<li>each of those pages and screens for scrolling sideways at a width of 320 pixels, for a visible change on every element as it receives keyboard focus, and for focused elements hidden behind other content;</li>
<li>by reviewing the code of the image editor, image zoom, signature pad and PDF exports, which automated tools cannot judge.</li>
</ul>
<p>Automated tools find only some accessibility problems, so there may be others we do not yet know about.</p>
<h2 id="improving">What we are doing to improve accessibility</h2>
<p>We fixed the problems our tests found in text contrast, focus visibility and labelling before publishing this statement. Next we plan to make the image editor and zoom work without dragging or pinching, tag our PDFs, and test with screen readers on Android, iPhone and a computer. We will update this statement as each item is done.</p>
<h2 id="preparation">Preparation of this statement</h2>
<p>This statement was prepared on ${tested}. It was last reviewed on ${human(REVIEWED.accessibility)}.</p>
${approvedLine('This statement was')}`,
  };

  return { '/trust/': trust, '/clinical-safety/': clinical, '/accessibility/': accessibility };
}

module.exports = { assurancePages, REVIEWED, A11Y_TESTED };
