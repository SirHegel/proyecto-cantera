import { notFound } from "next/navigation";

/**
 * Webs ficticias de los negocios demo. Existen para que el extractor de la
 * fase 4 corra contra HTML de verdad —con mailto, teléfonos, formularios y
 * CTAs reales— sin salir a internet ni gastar una sola llamada.
 *
 * Deliberadamente desiguales: unas tienen reserva online y otras solo
 * teléfono. Si todas fueran iguales, el scoring no se podría probar.
 */
const SITES: Record<
  string,
  { name: string; tagline: string; booking: boolean; email?: string; phone: string; body: string[] }
> = {
  "smile-harbor": {
    name: "Smile Harbor Dental",
    tagline: "Family and cosmetic dentistry in downtown Miami since 1998.",
    booking: false,
    phone: "(305) 555-0101",
    body: [
      "Call our front desk to schedule your first visit. Our team answers Monday through Friday, 9am to 5pm.",
      "We handle cleanings, whitening, implants and emergency care. New patients are welcome.",
      "Most insurance plans accepted. Ask us about payment options when you call.",
    ],
  },
  "coral-family": {
    name: "Coral Family Dentistry",
    tagline: "Gentle care for the whole family.",
    booking: false,
    email: "frontdesk@coralfamily.example",
    phone: "(305) 555-0102",
    body: [
      "To request an appointment, send us an email or give us a call and we will get back to you within two business days.",
      "Pediatric, general and preventive dentistry under one roof.",
    ],
  },
  "bayside-ortho": {
    name: "Bayside Orthodontics",
    tagline: "Braces and clear aligners for teens and adults.",
    booking: true,
    email: "hello@baysideortho.example",
    phone: "(305) 555-0103",
    body: [
      "Book your free consultation online and pick the time that works for you.",
      "Over 500 smiles finished in the last three years.",
    ],
  },
  "brickell-smiles": {
    name: "Brickell Smiles Studio",
    tagline: "Cosmetic dentistry in the heart of Brickell.",
    booking: false,
    phone: "(305) 555-0104",
    body: [
      "Call to reserve your consultation. We answer during business hours.",
      "Veneers, whitening and full smile design.",
    ],
  },
  "sunset-dental-group": {
    name: "Sunset Dental Group",
    tagline: "Comprehensive dental care since 2006.",
    booking: false,
    email: "info@sunsetdental.example",
    phone: "(305) 555-0105",
    body: [
      "Fill out the contact form below and our coordinator will reach out to schedule.",
      "Two locations, extended Saturday hours.",
    ],
  },
  "little-havana-dental": {
    name: "Little Havana Dental Care",
    tagline: "Su sonrisa, nuestra prioridad.",
    booking: false,
    phone: "(305) 555-0106",
    body: [
      "Llámenos para agendar su cita. Atendemos de lunes a viernes.",
      "Limpiezas, coronas, ortodoncia y urgencias.",
    ],
  },
  "wynwood-implants": {
    name: "Wynwood Implant Center",
    tagline: "Implant dentistry and full-arch restoration.",
    booking: true,
    email: "care@wynwoodimplants.example",
    phone: "(305) 555-0107",
    body: [
      "Schedule your scan online in under a minute.",
      "Same-day provisional teeth available for qualifying cases.",
    ],
  },
  "aventura-kids-dental": {
    name: "Aventura Kids Dental",
    tagline: "Where kids actually like the dentist.",
    booking: false,
    phone: "(305) 555-0108",
    body: [
      "Call us to book. We keep same-week openings for new families.",
      "Sedation options available for anxious little ones.",
    ],
  },
  "downtown-perio": {
    name: "Downtown Perio Clinic",
    tagline: "Periodontics and gum health.",
    booking: false,
    phone: "(305) 555-0109",
    body: ["Referrals accepted by phone.", "Specialist care for gum disease and grafting."],
  },
  "palmetto-dental-arts": {
    name: "Palmetto Dental Arts",
    tagline: "Restorative and preventive dentistry.",
    booking: false,
    email: "hello@palmettodentalarts.example",
    phone: "(305) 555-0110",
    body: [
      "Send us a message and we will call you back to confirm a time.",
      "Digital x-rays, crowns and night guards.",
    ],
  },
};

export default async function DemoSite({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = SITES[slug];
  if (!site) notFound();

  return (
    <div style={{ background: "#fff", color: "#111", minHeight: "100dvh", padding: "48px 24px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", fontFamily: "Georgia, serif" }}>
        <p style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#b00" }}>
          Sitio ficticio · demo de La Cantera
        </p>
        <h1 style={{ fontSize: 34, margin: "16px 0 8px" }}>{site.name}</h1>
        <p style={{ fontSize: 17, color: "#444" }}>{site.tagline}</p>

        {site.body.map((p, i) => (
          <p key={i} style={{ marginTop: 20, lineHeight: 1.7 }}>
            {p}
          </p>
        ))}

        <div style={{ marginTop: 32 }}>
          {site.booking ? (
            <a href="/demo-site/book" style={{ color: "#0645ad" }}>
              Book an appointment online
            </a>
          ) : (
            <a href={`tel:${site.phone.replace(/\D/g, "")}`} style={{ color: "#0645ad" }}>
              Call {site.phone}
            </a>
          )}
        </div>

        <hr style={{ margin: "40px 0", border: 0, borderTop: "1px solid #ddd" }} />

        <p style={{ fontSize: 14 }}>
          {site.email && (
            <>
              Email: <a href={`mailto:${site.email}`}>{site.email}</a>
              <br />
            </>
          )}
          Phone: {site.phone}
        </p>

        {!site.booking && !site.email && (
          <form style={{ marginTop: 24 }}>
            <input placeholder="Your name" />
            <input placeholder="Your phone" />
            <button type="button">Request a call</button>
          </form>
        )}
      </div>
    </div>
  );
}
