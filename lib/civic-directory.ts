// Published contacts of the five city corporations of the Greater Bengaluru Authority, their officers
// and the area's MLAs, as listed by the official sources on the date below. Loaded into the database by
// scripts/seed-wards.ts. Officers move; re-check the sources before relying on a name or address.

export const AS_OF = "2026-10-18";

const site = (c: string) => `https://bengaluru${c}.karnataka.gov.in/home`;

export type Office = {
  corporationId: "central" | "east" | "north" | "south" | "west";
  address: string;
  phones: string[];
  helpline: string;
  website: string;
  budgetCrore: number | null;
  wardGrantNote: string | null;
  sources: string[];
};

export const OFFICES: Office[] = [
  {
    corporationId: "central",
    address: "Commissioner Office, 10th Floor, Public Utility Building, M.G. Road, Bengaluru 560001",
    phones: ["9480685702 (toll free)", "080-22975803"],
    helpline: "1533",
    website: site("central"),
    budgetCrore: null,
    wardGrantNote: "Rs 2.25 crore per ward for ward development in the 2026-27 budget (as reported)",
    sources: [site("central"), "https://newsfirstprime.com/bengaluru/1760-crore-push-for-roads-footpaths-urban-infrastructure-in-bengaluru-central-budget-11364362"],
  },
  {
    corporationId: "east",
    address: "Commissioner Office, opp. Phoenix Mall, RHB Colony, Mahadevapura, Bengaluru 560048",
    phones: ["9480685706 (toll free)", "080-28512300", "080-28512301"],
    helpline: "1533",
    website: site("east"),
    budgetCrore: 3889.98,
    wardGrantNote: null,
    sources: [site("east"), "https://swarajyamag.com/amp/story/news-brief/bengaluru-east-corporation-unveils-first-ever-budget-of-rs-3890-crore-with-push-on-roads-health-and-ai-based-tax-reforms"],
  },
  {
    corporationId: "north",
    address: "Office of the Bengaluru North City Corporation, Bellary Road, Amruthahalli Main Road, Byatarayanapura, Bengaluru 560092",
    phones: ["9480685705 (toll free)", "080-28636671", "080-22975936"],
    helpline: "1533",
    website: site("north"),
    budgetCrore: 4341,
    wardGrantNote: null,
    sources: [site("north"), "https://opencity.in/analysis-gba-budgets-2026-27/"],
  },
  {
    corporationId: "south",
    address: "Commissioner Office, Bengaluru South City Corporation, 2nd Block, 9th Cross, Jayanagara, Bengaluru 560011",
    phones: ["9480685704 (toll free)", "080-26566362", "080-22975703"],
    helpline: "1533",
    website: site("south"),
    budgetCrore: null,
    wardGrantNote: "Rs 3 crore per ward in the 2026-27 budget: Rs 2.25 crore for development works and Rs 75 lakh for maintenance (as reported)",
    sources: [site("south"), "https://thebengalurulive.com/%E2%82%B93-crore-per-ward-boost-bengaluru-south-corporation-unveils-major-local-development-push/"],
  },
  {
    corporationId: "west",
    address: "BWCC Commissioner Office, 16th Cross Road, Vyalikaval, Kodandarampura, Malleshwaram, Bengaluru",
    phones: ["9480685703 (toll free)", "080-23561692", "080-23463366"],
    helpline: "1533",
    website: site("west"),
    budgetCrore: 4732,
    wardGrantNote: null,
    sources: [site("west"), "https://opencity.in/analysis-gba-budgets-2026-27/"],
  },
];

export type Officer = { corporationId: Office["corporationId"]; zone: "Zone1" | "Zone2" | null; role: string; name: string; email: string | null };

// From the "City Corporation Officers" list on each corporation's home page. The South site lists the
// commissioner's address as "comm.south.gba@gmail.comm"; the trailing "m" is a typo and is dropped here.
// Two North addresses are shown with a space inside them on the site; the space is removed.
export const OFFICERS: Officer[] = [
  { corporationId: "south", zone: null, role: "Commissioner", name: "Sri Ramesh K N, IAS", email: "comm.south.gba@gmail.com" },
  { corporationId: "south", zone: null, role: "Additional Commissioner (Development)", name: "Sri Naveen Kumar Raju S, IAS", email: "gbaadditionalcommissionersouth@gmail.com" },
  { corporationId: "south", zone: null, role: "Additional Commissioner (Revenue)", name: "Sri Rachappa, KAS", email: "comm.south.gba@gmail.com" },
  { corporationId: "south", zone: "Zone1", role: "Joint Commissioner", name: "Smt Madhu N N, KAS", email: "bbmpacs@gmail.com" },
  { corporationId: "south", zone: "Zone1", role: "Deputy Commissioner", name: "Smt Gagana", email: "dcsouth.bbmp@gmail.com" },
  { corporationId: "south", zone: "Zone2", role: "Joint Commissioner", name: "Sri Satish Babu, KAS", email: "report.jcbom@rediffmail.com" },

  { corporationId: "north", zone: null, role: "Commissioner", name: "Sri Pommala Sunil Kumar, IAS", email: "bengalurunorthcitycorporation@gmail.com" },
  { corporationId: "north", zone: null, role: "Additional Commissioner (Development)", name: "Smt Latha R, IAS", email: "additionalcommissionerbncc@gmail.com" },
  { corporationId: "north", zone: null, role: "Additional Commissioner (Revenue), in charge", name: "Smt K R Pallavi, KMAS", email: "jcdasarahalli1@gmail.com" },
  { corporationId: "north", zone: "Zone1", role: "Joint Commissioner", name: "Sri Mohammed Naeem Momin, KAS", email: "jcyel.bbmp@gmail.com" },
  { corporationId: "north", zone: "Zone1", role: "Deputy Commissioner", name: "Sri Amaregowda Patil", email: "dcyel.bbmp@gmail.com" },
  { corporationId: "north", zone: "Zone2", role: "Joint Commissioner", name: "Smt K R Pallavi, KMAS", email: "jcdasarahalli1@gmail.com" },
  { corporationId: "north", zone: "Zone2", role: "Deputy Commissioner", name: "Smt Mangala Gowri", email: "dcdasarahalli1@gmail.com" },

  { corporationId: "east", zone: null, role: "Commissioner", name: "Sri Ramesh D S, IAS", email: "commissioner.becc@gmail.com" },
  { corporationId: "east", zone: null, role: "Additional Commissioner (Development)", name: "Sri Lokhande Snehal Sudhakar, IAS", email: "acdbecc@gmail.com" },
  { corporationId: "east", zone: null, role: "Additional Commissioner (Revenue)", name: "Sri Pragna Ammembala, KAS", email: "adcrbecc@gmail.com" },
  { corporationId: "east", zone: "Zone1", role: "Joint Commissioner", name: "Dr Dakshayini, KAS", email: "bbmpjcmahadevapura@gmail.com" },
  { corporationId: "east", zone: "Zone1", role: "Deputy Commissioner", name: "Sri Shashikumar", email: "bbmp.dcmdpura@gmail.com" },
  { corporationId: "east", zone: "Zone2", role: "Joint Commissioner", name: "Smt Sudha, KAS", email: "jckrpuram@gmail.com" },
  { corporationId: "east", zone: "Zone2", role: "Deputy Commissioner", name: "Sri Muralidhara C", email: "dckrpuram.becc@gmail.com" },

  { corporationId: "west", zone: null, role: "Commissioner", name: "Dr Rajendra K V, IAS", email: "commissioner.bwcc@gmail.com" },
  { corporationId: "west", zone: null, role: "Additional Commissioner (Development), in charge", name: "Smt Kavitha Rajaram, KAS", email: "addtlcom.development@gmail.com" },
  { corporationId: "west", zone: null, role: "Additional Commissioner (Revenue)", name: "Smt Kavitha Rajaram, KAS", email: "addl.commbwcc2025@gmail.com" },
  { corporationId: "west", zone: "Zone1", role: "Joint Commissioner", name: "Smt Arathi Anand, KAS", email: "jcrrnagar@gmail.com" },
  { corporationId: "west", zone: "Zone1", role: "Deputy Commissioner", name: "Sri Shankarappa Vanikyala", email: "dcrrnagarzone01@gmail.com" },
  { corporationId: "west", zone: "Zone2", role: "Joint Commissioner", name: "Sri Sangappa, KAS", email: "report.jcwest@gmail.com" },
  { corporationId: "west", zone: "Zone2", role: "Deputy Commissioner", name: "Sri Manjunath Swamy L", email: "bbmp.dcwest@gmail.com" },

  { corporationId: "central", zone: null, role: "Commissioner", name: "Sri Rajendra Cholan P, IAS", email: "commissionerbccc@gmail.com" },
  { corporationId: "central", zone: null, role: "Additional Commissioner (Development)", name: "Sri Venkatachalapathy R, IAS", email: "adcdevelopmentbccc@gmail.com" },
  { corporationId: "central", zone: null, role: "Additional Commissioner (Revenue), in charge", name: "Sri Ranganath K, KAS", email: "adcrevenuebccc@gmail.com" },
  { corporationId: "central", zone: "Zone1", role: "Joint Commissioner", name: "Sri Ranganath K, KAS", email: "bcccjccvr@gmail.com" },
  { corporationId: "central", zone: "Zone1", role: "Deputy Commissioner", name: "Sri Abdul Rub", email: "dceastbbmp@gmail.com" },
  { corporationId: "central", zone: "Zone2", role: "Joint Commissioner", name: "Sri Hemanth Sharan, KAS", email: "bcccjcgdn@gmail.com" },
  { corporationId: "central", zone: "Zone2", role: "Deputy Commissioner", name: "Sri Shrinivas", email: "dceastbbmp@gmail.com" },
];

export type Mla = { assemblyNo: number; constituency: string; name: string; party: string };

// Members of the 16th Karnataka Legislative Assembly (elected 2023) for the constituencies in the
// GBA area. Source: https://en.wikipedia.org/wiki/16th_Karnataka_Assembly
export const MLA_SOURCE = "https://en.wikipedia.org/wiki/16th_Karnataka_Assembly";
export const MLAS: Mla[] = [
  { assemblyNo: 150, constituency: "Yelahanka", name: "S. R. Vishwanath", party: "BJP" },
  { assemblyNo: 151, constituency: "Krishnarajapuram", name: "B. A. Basavaraja", party: "BJP" },
  { assemblyNo: 152, constituency: "Byatarayanapura", name: "Krishna Byregowda", party: "INC" },
  { assemblyNo: 153, constituency: "Yeshwantpur", name: "S. T. Somashekar", party: "IND" },
  { assemblyNo: 154, constituency: "Rajarajeshwarinagar", name: "Munirathna", party: "BJP" },
  { assemblyNo: 155, constituency: "Dasarahalli", name: "S. Muniraju", party: "BJP" },
  { assemblyNo: 156, constituency: "Mahalakshmi Layout", name: "K. Gopalaiah", party: "BJP" },
  { assemblyNo: 157, constituency: "Malleshwaram", name: "C. N. Ashwath Narayan", party: "BJP" },
  { assemblyNo: 158, constituency: "Hebbal", name: "Suresha B. S.", party: "INC" },
  { assemblyNo: 159, constituency: "Pulakeshinagar", name: "A. C. Srinivasa", party: "INC" },
  { assemblyNo: 160, constituency: "Sarvagnanagar", name: "K. J. George", party: "INC" },
  { assemblyNo: 161, constituency: "C. V. Raman Nagar", name: "S. Raghu", party: "BJP" },
  { assemblyNo: 162, constituency: "Shivajinagar", name: "Rizwan Arshad", party: "INC" },
  { assemblyNo: 163, constituency: "Shanti Nagar", name: "N. A. Haris", party: "INC" },
  { assemblyNo: 164, constituency: "Gandhi Nagar", name: "Dinesh Gundu Rao", party: "INC" },
  { assemblyNo: 165, constituency: "Rajaji Nagar", name: "S. Suresh Kumar", party: "BJP" },
  { assemblyNo: 166, constituency: "Govindraj Nagar", name: "Priya Krishna", party: "INC" },
  { assemblyNo: 167, constituency: "Vijay Nagar", name: "M. Krishnappa", party: "INC" },
  { assemblyNo: 168, constituency: "Chamrajpet", name: "B. Z. Zameer Ahmed Khan", party: "INC" },
  { assemblyNo: 169, constituency: "Chickpet", name: "Uday B. Garudachar", party: "BJP" },
  { assemblyNo: 170, constituency: "Basavanagudi", name: "Ravi Subramanya L. A.", party: "BJP" },
  { assemblyNo: 171, constituency: "Padmanabhanagar", name: "R. Ashoka", party: "BJP" },
  { assemblyNo: 172, constituency: "B.T.M. Layout", name: "Ramalinga Reddy", party: "INC" },
  { assemblyNo: 173, constituency: "Jayanagar", name: "C. K. Ramamurthy", party: "BJP" },
  { assemblyNo: 174, constituency: "Mahadevapura", name: "Manjula S.", party: "BJP" },
  { assemblyNo: 175, constituency: "Bommanahalli", name: "Satish Reddy M.", party: "BJP" },
  { assemblyNo: 176, constituency: "Bangalore South", name: "M. Krishnappa", party: "BJP" },
  { assemblyNo: 177, constituency: "Anekal", name: "B. Shivanna", party: "INC" },
];

/** The ward boundaries and facts: GBA ward delimitation 2025, final 369 wards with population (public domain). */
export const WARDS_KML_URL =
  "https://data.opencity.in/dataset/863209cb-4ced-4f51-b5c5-156939c50922/resource/9013d656-8051-4e2d-9648-46efd0d86d3d/download/gba-369-wards-december-2025.kml";
export const WARDS_SOURCE = "https://data.opencity.in/dataset/gba-wards-delimitation-2025";
