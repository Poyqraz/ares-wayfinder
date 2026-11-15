// Published context for the hypothetical landing zone and base. Every row was read in the cited source
// (docs/research/BASE_SITE_SOURCES.md records how). None of it is a measurement at our sites.
export interface EvidenceRow { topic: string; statement: string; source: string; scope: "published criterion" | "historical measurement" | "study assumption" }

export const SITE_EVIDENCE: EvidenceRow[] = [
  { topic: "Exploration zone", scope: "published criterion",
    statement: "NASA's 2015 human landing-site workshop used preliminary limits of latitude within ±50° and elevation no higher than +2 km, with science regions within about 100 km of the landing site. Jezero (18.4° N, about −2.6 km) was one of the proposed zones.",
    source: "Bussey & Hoffman 2016 (NTRS 20160002370); Mustard et al., workshop abstract 1034" },
  { topic: "Lander to habitat distance", scope: "study assumption",
    statement: "A NASA study deck shows a plume-ejecta hazard zone of about 1 km around a landing site (its figures are not fully consistent). Our rule keeps the landing zone 1.0–2.5 km from the base.",
    source: "Bussey & Hoffman 2016 (NTRS 20160002370)" },
  { topic: "Three Forks ground", scope: "published criterion",
    statement: "The sample depot needed level, rock-free ground, and its use as a possible Sample Retrieval Lander site was being assessed in 2022. The base sits beside it, at least 120 m from every tube drop position.",
    source: "NTRS 20220014347" },
  { topic: "Robotic landing precedent", scope: "historical measurement",
    statement: "Perseverance's landing ellipse was 7.7 × 6.6 km and its hazard-avoidance system could divert up to 600 m. Our landing zone lies 82 m from its touchdown point.",
    source: "NASA PIA24349; USGS Mars 2020 TRN products" },
  { topic: "Radiation", scope: "historical measurement",
    statement: "Curiosity measured about 0.67 mSv per day on the surface at Gale crater (2012–2013). No radiation measurement or map exists for Jezero, so radiation is not part of the site choice or of any route.",
    source: "Hassler et al. 2014, via the SwRI summary" },
  { topic: "Pressure, wind, dust", scope: "historical measurement",
    statement: "Perseverance's MEDA recorded daily-mean pressure between about 625 and 761 Pa in its first Mars year, average daytime wind near 4 m/s (peaks to 32 m/s in a vortex) and several dust vortices per sol. These are rover-local records, not site forecasts.",
    source: "Sánchez-Lavega et al. 2023; Newman et al. 2022" },
  { topic: "Power", scope: "study assumption",
    statement: "A NASA crewed-surface power study used Jezero at 18° N as its example and sized solar power to survive a 120-day dust storm. Power and illumination were not evaluated for our sites.",
    source: "Rucker et al. 2016" },
  { topic: "Slope limits", scope: "published criterion",
    statement: "No numeric slope or rock limit for a human landing zone was found in the sources we could open. The Apollo rover was designed for 20–25° slopes. Our flatness rule is our own, stated in the scenario file.",
    source: "docs/research/BASE_SITE_SOURCES.md" },
];
