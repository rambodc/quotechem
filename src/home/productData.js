const PLACEHOLDER_IMAGES = [
  '/assets/chemicals/hydrochloric-acid.jpg',
  '/assets/chemicals/sodium-hydroxide.jpg',
  '/assets/chemicals/sulfuric-acid.jpg',
  '/assets/chemicals/citric-acid.jpg',
];

export const CONTACT = {
  headOffice: {
    name: 'Head Office',
    address: ['Suite 1900, 635 - 8th Avenue SW', 'Calgary, AB T2P 3M3'],
    phone: '(587) 774-2131',
  },
  blendingFacility: {
    name: 'Blending Facility',
    address: ['Building #102 57 721071 RR53', 'Grande Prairie, AB'],
    phone: '(250) 616-8592',
  },
};

export const NAV_LINKS = [
  { label: 'Home', to: '/' },
  { label: 'Operations', to: '/operations' },
  { label: 'Chemicals', to: '/chemicals' },
  { label: 'Technology', to: '/technology' },
  { label: 'Health & Safety', to: '/health-safety' },
  { label: 'Careers', to: '/careers' },
  { label: 'Locations', to: '/locations' },
  { label: 'Contact Us', to: '/contact-us' },
];

export const PRODUCTS = [
  {
    slug: 'unicide-g15',
    name: 'UniCide G15',
    category: 'Biocides',
    summary: 'Fast-acting oilfield biocide for broad-spectrum bacterial control, including sulfate-reducing bacteria.',
    description:
      'UniCide G15 is engineered for oilfield systems where bacterial control must be decisive, dependable, and easy to deploy. Its broad-spectrum activity helps protect completions, production assets, and water systems from damaging bacterial growth while avoiding a formaldehyde-based molecular backbone.',
    benefits: ['Broad-spectrum oilfield bacterial control', 'Effective across a wide temperature range', 'Formaldehyde-free molecular structure'],
    applications: ['SRB control', 'Produced-water systems', 'Completion and production operations'],
    image: PLACEHOLDER_IMAGES[0],
    accent: '#0f8b8d',
  },
  {
    slug: 'kemsol',
    name: 'Kemsol',
    category: 'Cleaners',
    summary: 'Robust solvent-based degreaser for heavy oil cleanup and demanding industrial cleaning work.',
    description:
      'Kemsol is built for heavy-duty oilfield cleaning where residues, equipment buildup, and hard-to-remove oil films need a stronger solvent response. It supports cleaner work areas, safer maintenance, and more efficient turnaround on demanding jobs.',
    benefits: ['Powerful heavy-oil residue removal', 'Useful for demanding industrial cleanup', 'Supports maintenance and site housekeeping'],
    applications: ['Heavy oil cleanup', 'Equipment degreasing', 'Industrial maintenance'],
    image: PLACEHOLDER_IMAGES[1],
    accent: '#1d4ed8',
  },
  {
    slug: 'targon',
    name: 'Targon',
    category: 'Cleaners',
    summary: 'Organically based all-round cleaner and degreaser for field-ready oilfield applications.',
    description:
      'Targon offers a safer, more environmentally considerate cleaning option for teams that need reliable grease and grime removal without relying on traditional harsh solvent-based degreasers.',
    benefits: ['Organically based cleaning chemistry', 'Versatile all-round degreasing performance', 'Designed for oilfield operating conditions'],
    applications: ['Field cleaning', 'Grease removal', 'Operational housekeeping'],
    image: PLACEHOLDER_IMAGES[2],
    accent: '#2563eb',
  },
  {
    slug: 'aphrox-syn',
    name: 'ApHrox Syn',
    category: 'Completion Chemicals',
    summary: 'Wireline-safe, low-pH organic salt for safer acid-alternative treatments and high-temperature applications.',
    description:
      'ApHrox Syn is a patented low-pH organic salt designed as a safer alternative to traditional mineral and organic acids. It is gentle on many metals, wireline-safe, phosphate-free, biodegradable, and suited to high-temperature applications exceeding 120C.',
    benefits: ['Wireline-safe acid-alternative chemistry', 'Gentle on many common metals', 'Phosphate-free and biodegradable'],
    applications: ['Completion treatments', 'High-temperature service', 'Metal-sensitive applications'],
    image: PLACEHOLDER_IMAGES[3],
    accent: '#047857',
  },
  {
    slug: 'aphrox',
    name: 'ApHrox',
    category: 'Completion Chemicals',
    summary: 'Wireline-safe inhibited HCl solution that protects metals during acid treatments.',
    description:
      'ApHrox pairs hydrochloric acid performance with a specialized inhibitor package that helps protect aluminum, polished aluminum, copper, stainless steel, and other common metals during wireline and completion operations.',
    benefits: ['Inhibited HCl performance', 'Wireline-safe formulation', 'High-temperature capability above 120C'],
    applications: ['Acid treatments', 'Wireline operations', 'Completion service fluids'],
    image: PLACEHOLDER_IMAGES[0],
    accent: '#0f766e',
  },
  {
    slug: 'sandweb-r',
    name: 'SandWeb R',
    category: 'Completion Chemicals',
    summary: 'Sand consolidation chemistry for fracturing operations and improved sand control.',
    description:
      'SandWeb R is a specialized sand consolidation product that helps stabilize sand during hydraulic fracturing. It provides a cost-effective alternative to resin-coated sand while supporting reliable fracture performance and sand management.',
    benefits: ['Supports sand consolidation', 'Alternative to resin-coated sand', 'Improves fracture treatment stability'],
    applications: ['Hydraulic fracturing', 'Sand control', 'Completion optimization'],
    image: PLACEHOLDER_IMAGES[1],
    accent: '#b45309',
  },
  {
    slug: 'usc-100',
    name: 'USC-100',
    category: 'Inhibitors',
    summary: 'Scale inhibitor for carbonate and sulfate scale control in oilfield water systems.',
    description:
      'USC-100 helps prevent the formation and deposition of carbonate and sulfate scales in oilfield water systems. It is designed to protect water handling equipment, reduce downtime, and maintain reliable system performance.',
    benefits: ['Controls carbonate and sulfate scales', 'Effective at low treatment levels', 'Helps protect water handling assets'],
    applications: ['Oilfield water systems', 'Scale control', 'Flow assurance'],
    image: PLACEHOLDER_IMAGES[2],
    accent: '#0891b2',
  },
  {
    slug: 'uniwax-t',
    name: 'UniWax-T',
    category: 'Inhibitors',
    summary: 'Paraffin wax dispersant and inhibitor for wells and transportation pipelines.',
    description:
      'UniWax-T is designed to disperse and inhibit paraffin wax buildup in waxy oil-producing wells and pipelines. Applied at the right temperature, it helps keep systems flowing and reduces blockage risk.',
    benefits: ['Disperses paraffin wax deposits', 'Helps inhibit future buildup', 'Supports well and pipeline reliability'],
    applications: ['Waxy oil wells', 'Transportation pipelines', 'Flow assurance programs'],
    image: PLACEHOLDER_IMAGES[3],
    accent: '#7c3aed',
  },
  {
    slug: 'elixir',
    name: 'Elixir',
    category: 'Lubricants',
    summary: 'Concentrated lubricant that improves lubricity in water-based fluids, including high-salt systems.',
    description:
      'Elixir increases the lubricity of water-based fluids by adsorbing to and bonding with metal surfaces. Its concentrated chemistry supports lower friction, cost-effective treatment, and durable film coverage in challenging systems.',
    benefits: ['Cost-effective lubricity improvement', 'Decreases friction factor', 'Provides tenacious film coverage'],
    applications: ['Water-based fluids', 'High-salt fluid systems', 'Drilling and completion support'],
    image: PLACEHOLDER_IMAGES[0],
    accent: '#059669',
  },
  {
    slug: 'unifraq',
    name: 'UniFRaq',
    category: 'Lubricants',
    summary: 'Anionic synthetic polymer friction reducer in slurry form with rapid hydration.',
    description:
      'UniFRaq is an anionic synthetic polymer-based friction reducer supplied as a slurry. The polymer is treated for rapid hydration, helping field teams improve friction reduction response during stimulation operations.',
    benefits: ['Synthetic polymer friction reduction', 'Slurry-state handling', 'Rapid hydration response'],
    applications: ['Stimulation treatments', 'Friction reduction', 'Hydraulic fracturing support'],
    image: PLACEHOLDER_IMAGES[1],
    accent: '#0284c7',
  },
  {
    slug: 'terminox',
    name: 'Terminox',
    category: 'Scavengers',
    summary: 'Non-sulfite oxygen scavenger blend for drilling and completion fluid corrosion protection.',
    description:
      'Terminox reduces the corrosive effect of dissolved oxygen in drilling and completion fluids. It works alongside corrosion inhibitors, scavengers, and biocides to help protect equipment integrity in demanding service conditions.',
    benefits: ['Non-sulfite oxygen scavenging', 'Reduces dissolved oxygen corrosion', 'Compatible with broader treatment programs'],
    applications: ['Drilling fluids', 'Completion fluids', 'Corrosion mitigation'],
    image: PLACEHOLDER_IMAGES[2],
    accent: '#dc2626',
  },
  {
    slug: 'u-scav',
    name: 'U-Scav',
    category: 'Scavengers',
    summary: 'H2S scavenger line for drilling, completion, stimulation, and production operations.',
    description:
      'U-Scav products help manage hydrogen sulfide in critical field operations. The line includes water-soluble triazine-based scavengers plus non-triazine and oil-soluble options for different system requirements.',
    benefits: ['Broad H2S management options', 'Water-soluble and oil-soluble choices', 'Supports personnel and equipment protection'],
    applications: ['H2S control', 'Production operations', 'Drilling and completion systems'],
    image: PLACEHOLDER_IMAGES[3],
    accent: '#334155',
  },
  {
    slug: 'unigreen',
    name: 'UniGreen',
    category: 'Scavengers',
    summary: 'Bioremediation product for hydrocarbon contamination control through rapid encapsulation.',
    description:
      'UniGreen is designed to immediately sequester hydrocarbon contamination through total encapsulation. It helps reduce risks tied to fire, vapor explosion, greasy residues, and other undesirable hydrocarbon effects in soil, water, and VOC applications.',
    benefits: ['Rapid hydrocarbon encapsulation', 'Supports environmental cleanup work', 'Compatible with common bioremediation programs'],
    applications: ['Contaminated soil', 'Water treatment', 'VOC and hydrocarbon cleanup'],
    image: PLACEHOLDER_IMAGES[0],
    accent: '#16a34a',
  },
  {
    slug: 'univive-ox',
    name: 'UniVive Ox',
    category: 'Stimulation Chemicals',
    summary: 'Treatment designed to break polymeric gel deposits around the near-wellbore area.',
    description:
      'UniVive Ox helps revive wells impacted by polymer-oil buildup near the wellbore. Its oxidative treatment approach targets stable polymeric gel deposits that are difficult to address through simple washing or typical acid treatments.',
    benefits: ['Targets polymeric gel deposits', 'Supports near-wellbore remediation', 'Designed for polymer flood challenges'],
    applications: ['Polymer flood remediation', 'Near-wellbore cleanup', 'Formation damage treatment'],
    image: PLACEHOLDER_IMAGES[1],
    accent: '#ea580c',
  },
  {
    slug: 'univive-w',
    name: 'UniVive W',
    category: 'Stimulation Chemicals',
    summary: 'Wax and scale control product for removing existing deposits and limiting future accumulation.',
    description:
      'UniVive W helps remove wax and scale deposits while inhibiting future accumulation. Its chemistry breaks down wax and scale agglomerates so operations can maintain flow, reduce maintenance pressure, and protect equipment performance.',
    benefits: ['Removes existing wax and scale deposits', 'Helps prevent reaccumulation', 'Supports flow assurance and uptime'],
    applications: ['Wax control', 'Scale control', 'Well and equipment maintenance'],
    image: PLACEHOLDER_IMAGES[2],
    accent: '#0f766e',
  },
];

export const CATEGORIES = [
  'Biocides',
  'Cleaners',
  'Completion Chemicals',
  'Inhibitors',
  'Lubricants',
  'Scavengers',
  'Stimulation Chemicals',
].map((name) => ({
  name,
  products: PRODUCTS.filter((product) => product.category === name),
}));

export function getProductBySlug(slug) {
  return PRODUCTS.find((product) => product.slug === slug) || null;
}
