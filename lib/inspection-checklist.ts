export type CheckItem = { name: string; result: "pass" | "fail" | "na"; notes?: string };

export type CheckCategory = { category: string; items: CheckItem[] };

export const INSPECTION_CHECKLIST: { category: string; items: string[] }[] = [
  {
    category: "Engine & Drivetrain",
    items: [
      "Engine starts smoothly (cold start)",
      "Engine starts smoothly (hot start)",
      "Idle is stable, no fluctuation",
      "No abnormal engine noise (knock, tick, rattle)",
      "No excessive smoke from exhaust",
      "No fluid leaks (oil, coolant, fuel)",
      "Oil level and condition acceptable",
      "Coolant level and condition acceptable",
      "Timing belt/chain — no excessive wear or noise",
      "Engine mounts — no excessive vibration",
      "Radiator and hoses — no leaks or cracks",
      "Battery terminals clean and secure",
      "Battery voltage within spec (12.4V+ resting)",
      "Alternator charging correctly (13.8–14.4V)",
    ],
  },
  {
    category: "Transmission",
    items: [
      "Clutch engagement smooth (manual)",
      "No clutch slippage under load",
      "Gear shifts smooth — forward gears",
      "Gear shifts smooth — reverse",
      "No transmission fluid leaks",
      "No grinding or whining from gearbox",
      "CV boots intact, no grease leakage",
      "Differential — no excessive noise",
      "Transfer case operates correctly (4WD/AWD)",
    ],
  },
  {
    category: "Brakes",
    items: [
      "Brake pedal feel firm and consistent",
      "No brake squeal or grinding",
      "Front brake pads — sufficient thickness",
      "Rear brake pads/shoes — sufficient thickness",
      "Front discs/drums — no scoring or warping",
      "Rear discs/drums — no scoring or warping",
      "Brake fluid level and condition acceptable",
      "No brake fluid leaks (master cylinder, lines, calipers)",
      "Parking brake holds on incline",
      "ABS light functions (self-check on start, no warning)",
    ],
  },
  {
    category: "Suspension & Steering",
    items: [
      "No clunks or rattles over bumps",
      "Shock absorbers — no excessive bounce",
      "Front strut mounts — no noise or play",
      "Ball joints — no excessive play",
      "Tie rod ends — no excessive play",
      "Control arm bushings — no cracks or play",
      "Stabilizer links — no play or broken boots",
      "Steering effort consistent, no dead spots",
      "Power steering fluid level acceptable",
      "No power steering leaks",
      "Wheel alignment — vehicle tracks straight",
      "Steering wheel centered when driving straight",
    ],
  },
  {
    category: "Electrical & Electronics",
    items: [
      "All exterior lights functional (head, tail, brake, turn, fog)",
      "High beam functional",
      "Horn functional",
      "Windshield wipers and washers functional",
      "Power windows — all functional",
      "Central locking — all doors",
      "Side mirrors — power adjust functional",
      "Infotainment system functional",
      "Air conditioning — cooling effective",
      "Heater functional",
      "Instrument cluster — all gauges work",
      "No warning lights on dash (while running)",
      "OBD scan — no stored fault codes",
      "Remote key / keyless entry functional",
    ],
  },
  {
    category: "Exterior",
    items: [
      "Body panels — no major dents",
      "Paint condition — no major scratches or fading",
      "No visible rust or corrosion",
      "Panel gaps consistent (no accident repair signs)",
      "Windshield — no cracks or large chips",
      "All door seals intact, no water ingress",
      "All doors open and close smoothly",
      "Bonnet latch and safety catch functional",
      "Boot/tailgate opens and closes smoothly",
      "Underbody — no damage or excessive rust",
      "Frame/chassis — no bending or welding signs",
      "ORVMs — both intact and adjustable",
    ],
  },
  {
    category: "Interior",
    items: [
      "Seats — no tears, burns, or excessive wear",
      "Seat adjustments functional (driver)",
      "All seatbelts retract and latch correctly",
      "Steering wheel — no excessive wear",
      "Dashboard — no cracks or warping",
      "Roof lining — no sagging or stains",
      "Floor carpets — no excessive wear or dampness",
      "Spare wheel present and in good condition",
      "Tool kit and jack present",
      "Sunroof operates correctly (if equipped)",
      "No musty or fuel smell inside cabin",
      "Cabin air filter condition acceptable",
    ],
  },
  {
    category: "Tires & Wheels",
    items: [
      "Tire tread depth — all 4/5 within legal limit",
      "Tire wear even across tread (no cupping or feathering)",
      "No sidewall damage or bulges",
      "All lug nuts present and tight",
      "Wheel rims — no cracks or major bends",
      "Spare tire present and inflated",
      "TPMS sensors functional (if equipped)",
    ],
  },
  {
    category: "Documents & History",
    items: [
      "Registration Certificate (RC) verified",
      "Insurance valid and matches vehicle",
      "Pollution Under Control (PUC) certificate valid",
      "Service history available and consistent",
      "Owner count verified (not more than declared)",
      "No hypothecation/finance outstanding",
      "VIN matches RC and insurance documents",
      "Engine number matches RC",
      "Chassis number matches RC",
      "Road tax paid up to date",
      "No challan/e-challan pending",
    ],
  },
  {
    category: "Test Drive Assessment",
    items: [
      "Engine pulls smoothly through rev range",
      "No hesitation or misfire under acceleration",
      "Braking straight, no pulling to one side",
      "No vibration through steering wheel",
      "Suspension settles quickly after bumps",
      "Turning circle as expected, no CV joint noise",
      "Highway speed stability acceptable",
      "No wind noise from doors/windows at speed",
      "Gearbox operates correctly under load",
      "Clutch take-up point appropriate (manual)",
    ],
  },
];

export function createEmptyChecklist(): CheckCategory[] {
  return INSPECTION_CHECKLIST.map((cat) => ({
    category: cat.category,
    items: cat.items.map((name) => ({ name, result: "na" as const })),
  }));
}

export function computeChecklistStats(checklist: CheckCategory[]) {
  let total = 0;
  let passed = 0;
  let failed = 0;

  for (const cat of checklist) {
    for (const item of cat.items) {
      if (item.result === "na") continue;
      total++;
      if (item.result === "pass") passed++;
      if (item.result === "fail") failed++;
    }
  }

  const score = total > 0 ? Math.round((passed / total) * 100) : null;
  return { total, passed, failed, score };
}
