export const PRODUCTS = [
  {
    slug: 'sodium-hydroxide',
    name: 'Sodium Hydroxide',
    eyebrow: 'Caustic alkali supply',
    subtitle: 'Reliable bulk sourcing for pH control, cleaning, pulp, water treatment, and process chemistry.',
    image: '/assets/chemicals/sodium-hydroxide.jpg',
    accent: '#0ea5e9',
    description:
      'Sodium hydroxide is a foundational industrial chemical used wherever dependable alkalinity, neutralization, and cleaning performance matter. QuoteChem helps buyers move from rough requirement to supplier-ready RFQ with cleaner product details, packaging expectations, and delivery constraints captured up front.',
    applications: ['Water treatment', 'Industrial cleaning', 'Pulp and paper', 'Process pH control'],
    specs: ['Liquid, flake, pearl, or custom grade examples', 'Drums, totes, bulk, and bagged options', 'Buyer-ready documentation and delivery notes'],
  },
  {
    slug: 'hydrochloric-acid',
    name: 'Hydrochloric Acid',
    eyebrow: 'Acid supply programs',
    subtitle: 'Structured sourcing support for pH adjustment, metal processing, regeneration, and industrial treatment.',
    image: '/assets/chemicals/hydrochloric-acid.jpg',
    accent: '#14b8a6',
    description:
      'Hydrochloric acid demand often depends on concentration, packaging, route, and safety documentation. QuoteChem turns scattered purchasing notes into a sharper request so suppliers can respond with less back-and-forth and more comparable commercial detail.',
    applications: ['Metal treatment', 'pH adjustment', 'Ion exchange regeneration', 'Industrial processing'],
    specs: ['Common concentration examples supported', 'Drums, carboys, totes, and bulk options', 'Handling, route, and compliance details captured'],
  },
  {
    slug: 'sulfuric-acid',
    name: 'Sulfuric Acid',
    eyebrow: 'High-volume industrial acid',
    subtitle: 'RFQ-ready detail capture for manufacturing, treatment, battery, mining, and process applications.',
    image: '/assets/chemicals/sulfuric-acid.jpg',
    accent: '#2563eb',
    description:
      'Sulfuric acid sourcing benefits from precision around grade, concentration, delivery site constraints, and consumption pattern. QuoteChem helps organize those details into a clean request that is practical for qualified suppliers to evaluate.',
    applications: ['Industrial manufacturing', 'Mining processes', 'Battery supply chain', 'Water and wastewater treatment'],
    specs: ['Bulk and packaged supply examples', 'Grade, concentration, and volume details', 'Delivery constraints and site requirements'],
  },
  {
    slug: 'citric-acid',
    name: 'Citric Acid',
    eyebrow: 'Food and pharma ingredient',
    subtitle: 'Sourcing support for ingredient, cleaning, chelation, and formulation requirements.',
    image: '/assets/chemicals/citric-acid.jpg',
    accent: '#16a34a',
    description:
      'Citric acid is used across formulation, ingredient, and industrial cleaning workflows where grade, particle format, packaging, and documentation shape the quote. QuoteChem helps buyers clarify those details before supplier outreach begins.',
    applications: ['Food and beverage', 'Pharma and personal care', 'Chelation', 'Cleaning formulations'],
    specs: ['Food, technical, and specialty grade examples', 'Bags, drums, and palletized supply', 'Documentation and packaging preferences'],
  },
];

export function getProductBySlug(slug) {
  return PRODUCTS.find((product) => product.slug === slug) || null;
}
