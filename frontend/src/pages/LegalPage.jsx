import { Link } from "react-router-dom";
import Header from "../components/Header";
import LegalFooter from "../components/LegalFooter";
import { legalDocuments, legalIdentity, LEGAL_EFFECTIVE_DATE } from "../legal/legalDocuments";
import "./LegalPage.css";

export default function LegalPage({ type }) {
  const document = legalDocuments[type];
  if (!document) return null;
  return <div className="hx-page legal-page">
    <Header right={<Link to="/" className="btn btn-ghost">Back to Voxora</Link>} />
    <main className="container legal-page__main">
      <div className="legal-page__top">
        <span className="legal-page__category">{document.category}</span>
        <h1>{document.title}</h1>
        <p className="legal-page__intro">{document.intro}</p>
        <p className="legal-page__date">Effective {LEGAL_EFFECTIVE_DATE} · Version 1</p>
      </div>
      <div className="legal-page__layout">
        <aside className="legal-page__toc" aria-label="Policy sections">
          <p>IN THIS DOCUMENT</p>
          {document.sections.map((section, index) =>
            <a key={section.title} href={`#section-${index + 1}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>{section.title}
            </a>
          )}
        </aside>
        <article className="legal-page__content">
          {document.sections.map((section,index)=><section id={`section-${index + 1}`} className="legal-page__section" key={section.title}>
            <span className="legal-page__section-number">{String(index + 1).padStart(2, "0")} /</span>
            <h2>{section.title}</h2>
            {section.paragraphs?.map((p,i)=><p key={i}>{p}</p>)}
            {section.bullets && <ul>{section.bullets.map((p,i)=><li key={i}>{p}</li>)}</ul>}
            {section.links && <div className="legal-page__links">{section.links.map(link=><a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">{link.label} ↗</a>)}</div>}
          </section>)}
          <section className="legal-page__contact" id="contact">
            <p className="legal-page__section-number">CONTACT</p>
            <h2>Questions or privacy requests?</h2>
            <p>Service operator: <strong>{legalIdentity.operator}</strong></p>
            {legalIdentity.address && <p>Business address: {legalIdentity.address}</p>}
            {legalIdentity.email
              ? <p>Contact: <a href={`mailto:${legalIdentity.email}`}>{legalIdentity.email}</a></p>
              : <p>Contact Voxora by replying to a transactional email you received from our support mailbox. We are preparing a dedicated publicly listed privacy contact.</p>}
            <p className="legal-page__note">For privacy requests, do not attach password reset links, payment-card details or voice samples. We may ask you to verify account ownership.</p>
          </section>
          <div className="legal-page__related"><span>MORE INFORMATION</span>
            <div><Link to="/privacy">Privacy Policy ↗</Link><Link to="/terms">Terms &amp; Conditions ↗</Link><Link to="/refund-policy">Refund Policy ↗</Link></div>
          </div>
        </article>
      </div>
    </main>
    <LegalFooter/>
  </div>;
}
