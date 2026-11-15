// B Amalik / Enchanted Lake: the records behind the mission, each with the document it was read from.
// Mageik is in the frozen ARES-1 catalog 572fba1ce61f (it is one of the ten depot tubes). Shuyak is not: the catalog
// was built for the depot, for A and for Bright Angel. Its record is transcribed here from the same PDS volume and was
// compared with the PDF (sha256 914a4baa...b9f123) on 15 Nov 2026. Positions are ROVER positions during sampling.
const PDS_IR2 = "https://pds-geosciences.wustl.edu/missions/mars2020/Mars%202020%20Initial%20Reports%20Volume%202%20Release%202.pdf";

export const SHUYAK = {
  id: "sample:M2020-00575-16", designation: "M2020-575-16", name: "Shuyak", nasa_sample_no: 14,
  coring_sol: 575, coring_date: "2 Oct 2022", sealing: "19:40 LMST on sol 575 (Ls 314.59°)",
  lat: 18.45068954, lon: 77.40143171, elev_m: -2526.322706,
  core_length_mm: 55.5, now: "on the rover",
  source: "PDS Mars 2020 Initial Reports, Volume 2, sheet 16-1", url: PDS_IR2,
} as const;

/** Mageik facts that the catalog does not carry; its position, sols and depot drop come from the catalog at run time. */
export const MAGEIK_EXTRA = { designation: "M2020-00579-17", core_length_mm: 73.6, sealing_delay: "sealed 40 sols after coring, after faults during tube sealing", source: "PDS Mars 2020 Initial Reports, Volume 2, sheets 16-1 and 17-1" } as const;

/** What the science team reported about the outcrop (PDS Initial Report, sheet 16-1), kept close to its wording. */
export const AMALIK = {
  id: "outcrop:amalik", name: "Amalik",
  setting: "an outcrop of the Enchanted Lake member at Cape Nukshak, near the base of the exposed delta rocks, about 4 m below the rim of Cape Nukshak",
  rock: "horizontally layered, fine-grained, well-sorted sedimentary rock: an olivine-bearing coarse mudstone",
  minerals: "detrital olivine, its aqueous alteration products (for example serpentine), phyllosilicates, dolomite and some silica; little, if any, sulfate",
  abrasion: "Novarupta abrasion patch, 8 mm deep (a ground patch for the instruments, not a sample)",
  fluorescence: "Weak fluorescence was seen; it may come from organic compounds in low abundance. Its origin is not established",
  interpretation: "likely deposited on the floor of a lake; the team describes the setting as formerly habitable and the rock as having potential for biosignature preservation",
  source: "PDS Mars 2020 Initial Reports, Volume 2, sheet 16-1 (summary description)", url: PDS_IR2,
} as const;

/** Metres from the west edge of the frozen M0-A grid f8de9017164a to the Shuyak sampling position (analysis/s14/b_coverage.ts; unit-tested). The wider grid m0ab holds it. */
export const B_OUTSIDE_M0A_M = 81;

export const B_UNCERTAINTY = [
  "The coordinates are the rover's position during each sampling activity. They are not the drill holes, not the rock and not a surveyed astronaut waypoint. The two sheets differ by 0.3 m.",
  "Deposition on a lake floor is the science team's likely interpretation, not a settled result.",
  "The fluorescence signal is weak and not tied to specific minerals. No organic compound has been identified and no biological origin is claimed. No evidence of life has been established.",
  "Which core went to the depot: NASA's sample list and the PDS Three Forks records agree that Mageik was placed at Three Forks and Shuyak stayed on the rover. The research hand-off notes that Table 1 of Bosak et al. (2024) appears to show the reverse; that table was not re-read here, and the NASA and PDS records are followed.",
  `Terrain: Amalik is ${B_OUTSIDE_M0A_M} m west of the frozen M0–A grid. Routes to it use a wider grid from the same HiRISE source; its automated gates pass and the owner approved for prototype analysis on 15 Nov 2026, which does not verify the vertical datum or the registration to the CTX frame. Rocks and anything smaller than a few metres are not in it.`,
] as const;

export const B_SOURCES = [
  { title: "PDS Mars 2020 Initial Reports, Volume 2 (sheets 16-1 Shuyak, 17-1 Mageik)", url: PDS_IR2, checked: "Read for this build: positions, sols, lithology, abrasion patch." },
  { title: "NASA: Mars Rock Samples (sample list)", url: "https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples/", checked: "Read for this build: Shuyak is Sample 14, sealed sol 575, on the rover; Mageik is Sample 15, sealed sol 619, in the sample depot." },
  { title: "NASA Analyst's Notebook: Three Forks Depot", url: "https://an.rsl.wustl.edu/help/Content/About%20the%20mission/M20/Return%20sample%20science/Three%20Forks%20Depot.htm", checked: "Read for the catalog: Mageik dropped on sol 655." },
  { title: "Bosak et al. (2024), AGU Advances, doi:10.1029/2024AV001241", url: "https://doi.org/10.1029/2024AV001241", checked: "Cited by the research hand-off for the comparison with A. Not re-read here." },
  { title: "NASA: Perseverance Activities at Amalik Outcrop (4 Nov 2022)", url: "https://science.nasa.gov/blog/perseverance-activities-at-amalik-outcrop/", checked: "Cited by the research hand-off. Not re-read here." },
] as const;

/** Historical NASA imagery of the site. Links only: no image is bundled, so they need a connection. */
export const B_IMAGERY = [
  { title: "Enchanted View of Jezero Rocks (PIA25325)", sol: "424", what: "Layered rocks at Enchanted Lake, before any core was drilled here", credit: "NASA/JPL-Caltech", url: "https://www.jpl.nasa.gov/images/pia25325-enchanted-view-of-jezero-rocks/" },
  { title: "Rock surface after the Shuyak core", sol: "575", what: "Drill hole and abrasion patch at Amalik (Navcam)", credit: "NASA/JPL-Caltech", url: "https://science.nasa.gov/image-detail/mars-sample-14-nlf-0575-0717997335-774ecm-n0290000ncam00709-01-095j/" },
  { title: "Meet the Mars Samples: Shuyak and Mageik", sol: "575 / 579", what: "NASA scientists on the two cores and Mageik's place in the depot (video)", credit: "NASA/JPL-Caltech", url: "https://science.nasa.gov/resource/meet-the-mars-samples-shuyak-and-mageik-samples-14-and-15/" },
  { title: "Perseverance's Portrait of the Sample Depot", sol: "693", what: "Panorama of the Three Forks depot where Mageik lies", credit: "NASA/JPL-Caltech/ASU/MSSS", url: "https://science.nasa.gov/resource/perseverances-portrait-of-the-sample-depot/" },
] as const;
