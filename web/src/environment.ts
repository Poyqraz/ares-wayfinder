// Environmental context for mission planning: dust, weather, radiation. Four kinds of statement are kept apart:
//   measured  a historical observation, at one place and time (never a map of this region)
//   model     a climatology or model product (named, not bundled, so no numbers are drawn from it)
//   scenario  part of the fictional ARES-1 expedition story
//   unknown   what this build does not have
// Nothing here is gridded over Jezero, so nothing is drawn as an area on a map and nothing enters a route cost.
export type EnvLayer = "dust" | "weather" | "radiation";
export type EnvCategory = "measured" | "model" | "scenario" | "unknown";

export const ENV_LAYER: Record<EnvLayer, string> = { dust: "Dust and storms", weather: "Atmosphere and weather", radiation: "Radiation" };
export const ENV_CATEGORY: Record<EnvCategory, { label: string; note: string }> = {
  measured: { label: "Measured", note: "a past observation at one place and time" },
  model: { label: "Modelled", note: "from a climate or transport model, not an observation" },
  scenario: { label: "ARES-1 scenario", note: "fiction written for this expedition story" },
  unknown: { label: "Not available", note: "no data of this kind in the build" },
};

export interface EnvEntry {
  id: string;
  layer: EnvLayer;
  category: EnvCategory;
  title: string;
  value: string;
  where: string;
  when: string;
  source: string; // citation; empty for scenario and unknown
  url?: string;
  limits: string;
  spatial: false; // no entry is a map of the region; kept explicit so a future gridded product has to change this on purpose
}

export const ENVIRONMENT: EnvEntry[] = [
  { id: "dust-storm-2022", layer: "dust", category: "measured", spatial: false, title: "Regional dust storm at Jezero",
    value: "Peak visible optical depth about 2; visibility across the crater briefly reduced",
    where: "Perseverance's position in Jezero crater (one site)", when: "5–11 January 2022, Ls 153°–156°",
    source: "Lemmon et al. 2022, Geophysical Research Letters, doi:10.1029/2022GL100126", url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9540647/",
    limits: "A past event seen from the rover. It is not a dust map of this area and says nothing about any other day." },
  { id: "dust-season", layer: "dust", category: "model", spatial: false, title: "Seasonal dust climatology",
    value: "Climate models and multi-year records describe a dustier half of the Mars year; no values from them are bundled here",
    where: "Planet-wide and regional, at tens of kilometres per cell or coarser", when: "Climatological, by season (Ls)",
    source: "Mars Climate Database (LMD / ESA); MRO MARCI daily global imaging and weather reports (MSSS)",
    limits: "Named for reference only. No MARCI or climate-model product is included or georeferenced in this build, so none is drawn." },
  { id: "dust-now", layer: "dust", category: "unknown", spatial: false, title: "Dust and visibility along a route",
    value: "No gridded dust or opacity data for this terrain", where: "Planning area", when: "Any time", source: "",
    limits: "There is no forecast and no live data. Dust does not enter any route cost." },

  { id: "pressure-sol516", layer: "weather", category: "measured", spatial: false, title: "Surface pressure, one sol",
    value: "770–804 Pa over the sol (7,440 valid readings)", where: "Perseverance at the Wildcat Ridge workspace (position attributed, medium confidence)",
    when: "Sol 516, 2–3 August 2022, Ls 277.6°–278.2°", source: "Mars 2020 MEDA pressure sensor, PDS derived product (in this build, hash-checked)",
    limits: "One sol at one place. Not a weather map, not a forecast, not an EVA condition." },
  { id: "temperature-250", layer: "weather", category: "measured", spatial: false, title: "Air temperature, first 250 sols",
    value: "Mean near −55 °C, with day-to-night swings of 50–60 °C (as reported for the paper)", where: "Perseverance's positions on the Jezero crater floor",
    when: "Sols 0–250, Ls 6°–121° (northern spring to early summer), 2021", source: "Rodríguez-Manfredi et al. 2023, Nature Geoscience 16, 19–28, doi:10.1038/s41561-022-01084-0",
    url: "https://link.springer.com/article/10.1038/s41561-022-01084-0",
    limits: "Rounded figures taken from summaries of the paper, not re-derived from PDS data here. A different season from sol 516." },
  { id: "weather-model", layer: "weather", category: "model", spatial: false, title: "Climate-model fields (wind, temperature, pressure)",
    value: "Available from Mars climate models; none is bundled here", where: "Regional, far coarser than this terrain", when: "Climatological",
    source: "Mars Climate Database (LMD / ESA)", limits: "Named for reference only. No model field is shown or used." },
  { id: "weather-now", layer: "weather", category: "unknown", spatial: false, title: "Wind, temperature and pressure along a route",
    value: "No spatial weather data for this terrain", where: "Planning area", when: "Any time", source: "",
    limits: "MEDA is a point record at the rover. Weather does not enter any route cost." },

  { id: "rad-gale", layer: "radiation", category: "measured", spatial: false, title: "Surface radiation dose rate (another site)",
    value: "Galactic cosmic rays: 0.21 ± 0.04 mGy per day; dose equivalent reported as about 0.67 mSv per day",
    where: "Gale crater (Curiosity RAD), thousands of kilometres from Jezero", when: "August 2012 – June 2013, near the maximum of solar cycle 24",
    source: "Hassler et al. 2014, Science 343, 1244797; SwRI release of the same results", url: "https://swri.org/node/9079",
    limits: "Not measured at Jezero. It varies with the solar cycle, season and surface pressure, and excludes solar particle events. Not a crew dose estimate." },
  { id: "rad-jezero", layer: "radiation", category: "unknown", spatial: false, title: "Radiation at Jezero and along a route",
    value: "No surface radiation measurement at Jezero in this build, and no terrain-shielding model", where: "Planning area", when: "Any time", source: "",
    limits: "Perseverance carries no instrument like Curiosity's RAD. Radiation does not enter any route cost." },
];

/** The fictional weather event of the ARES-1 EVA story. Its clock is the scenario's, fixed for the preview. */
export const SCENARIO_STORM = {
  category: "scenario" as const,
  message: "Dust storm expected in 2 hours.",
  label: "Scenario simulation",
  disclaimer: "A planned event in the fictional ARES-1 scenario. It is not a verified NASA weather forecast: this build holds no forecast and no live atmospheric data.",
  clock: "Scenario clock: the EVA starts at T+0 and the storm is set for T+2 h. The clock is part of the story and does not run with the walk playback, which is only a viewing speed.",
  context: "Real reference: a regional dust storm did reach Jezero on 5–11 January 2022 (Lemmon et al. 2022), with visible optical depth near 2.",
  effect: "It changes nothing in the route: no storm, visibility or wind model is applied to the terrain or to any cost.",
};
