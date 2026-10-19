import type { HostelInfo } from "@/lib/types";
import { demoRef } from "./demo-source";

// PLACEHOLDER — residential / hostel information from Aspire's demo site
// (docs/demo-data-import.md). Per-campus blocks come from each campus page.
// NOT imported: hostel fees and room prices, "100%" security/food claims,
// ISO 22000 / RO "certified" claims, hospital tie-up claims (IGMC, Zonal
// Hospital), "68% of parents" and "filling fast" marketing.
export const hostelInfo: HostelInfo = {
  id: "hostels",
  headline: "Hostel Charter: Safe, Disciplined, Nourishing",
  audience:
    "For outstation students from Chamba, Mandi, Bilaspur, Una, and Kinnaur. Designed to feel like home while maintaining an uncompromised competitive study regime.",
  charter: [
    { name: "Monitored Study Pods" },
    { name: "Dietitian Dining" },
    { name: "24/7 Biometric", detail: "CCTV & Female Wardens" },
    { name: "4-Meal Nutrition", detail: "Dietitian Curated Menu" },
    { name: "Night Study Pods", detail: "8:00 – 11:30 PM Monitored" },
    // Source detail "IGMC & Zonal Doctor Link" omitted (hospital tie-up claim).
    { name: "Medical SOS" },
  ],
  features: [
    {
      // Source title "100% Bio-Secure Geofence"; the "100%" claim is not imported.
      name: "Bio-Secure Geofence",
      detail: "Biometric turnstiles, 360° CCTV monitoring, and strictly verified warden-supervised access.",
    },
    {
      name: "Resident IITian Study Vaults",
      detail: "Mentors sleep on the same campus; live night clearing desks open till 11:15 PM every day.",
    },
    {
      name: "Pediatric Dietitian Menus",
      detail: "4 wholesome Pahadi & North Indian fresh meals, almond milk night-caps, and RO lab tests.",
    },
    // Source detail "Formal institutional ties with IGMC Shimla, Zonal Hospital
    // Dharamshala & Hamirpur" omitted (hospital tie-up claim).
    { name: "24/7 Medical Emergency Desk" },
  ],
  girlsResidency: {
    summary: "Dedicated independent towers with perimeter isolation in Shimla BCS & Hamirpur.",
    centreSlugs: ["shimla", "hamirpur"],
    features: [
      {
        name: "Resident Senior Female Wardens & Caretakers",
        detail: "Motherly care and strict discipline. Wardens reside on the same floor with open-door student counseling.",
      },
      {
        name: "Two-Factor Parental Permission for Campus Exit",
        detail:
          "No student may leave campus grounds without registered parent SMS/call confirmation directly received on the Warden terminal.",
      },
      {
        name: "Round-The-Clock Female Guard Deployment",
        detail:
          "Physical female security teams on perimeter shifts 24/7. Zero unauthorized male presence on residential floors.",
      },
      {
        name: "On-Campus Doctor-on-Call & Infirmary",
        // Source continues "…and ambulance liaison with IGMC Shimla & regional civil hospitals" (omitted).
        detail: "Dedicated first-aid infirmary and regular health checkups.",
      },
      {
        name: "Dedicated Study Hall with In-Wing IITian Mentors",
        detail:
          "Girls do not need to commute to main academy buildings for night doubt clearing; senior women faculty sit right in their residential wing.",
      },
    ],
  },
  roomTypes: [
    {
      name: "Single Deluxe Studio",
      tagline: "Dropper prime choice",
      description: "Maximum quietude for droppers & final year JEE Advanced / NEET aspirants.",
      features: ["En-Suite Geyser Bath", "South Valley View", "100 Mbps LAN Pod"],
    },
    {
      name: "Twin Sharing Deluxe Pod",
      tagline: "Dual peer synergy",
      description: "Twin orthopedic pine beds, acoustically partitioned central study corridor.",
      features: ["Peer Doubt Support", "Solar + Electric Geyser", "Laundry Included"],
    },
    {
      name: "Triple Economical Suite",
      tagline: "Budget-friendly",
      description: "High-ceiling spacious layout with dedicated 3-corner study desks and large closets.",
      features: ["High Ceiling Airy", "3-Tier Wardrobe", "Full 4 Meals & Library"],
    },
  ],
  roomTypesNote: "Shown on the source for the Shimla BCS boys & girls wing.",
  roomFeatures: [
    { name: "Fresh Alpine Cross-Ventilation" },
    { name: "Orthopedic Workstation", detail: "High-back lumbar support" },
    { name: "Sub-Zero Winter Radiator", detail: "Oil radiators in high-altitude" },
    { name: "Personal Vault Locker", detail: "Digital RFID keycard access" },
  ],
  dailyRoutine: [
    {
      time: "06:00 AM",
      label: "Awakening",
      title: "Himalayan Oxygen Walk & Pranayama",
      description: "Morning breathing exercises in fresh mountain pine air to enhance mental clarity and cognitive stamina.",
    },
    {
      time: "07:15 AM",
      label: "Breakfast",
      title: "High-Protein Breakfast & Dry Fruits",
      description:
        "Sprouted grains, Himachali curd, multigrain rotis/parathas, freshly boiled farm eggs, and seasonal apples.",
    },
    {
      time: "08:30 AM",
      label: "Academics",
      title: "Integrated Academic Lecture Block",
      description: "Intensive Physics, Chemistry, Biology/Maths sessions with IITian and Ex-AIIMS faculty panels.",
    },
    {
      time: "02:00 PM",
      label: "Lunch",
      title: "Balanced Alkaline Homestyle Lunch + 30m Siesta",
      description:
        "Fresh seasonal greens, Himachali Rajma Madra, steamed organic rice, salads, followed by a 30-minute cognitive reset.",
    },
    {
      time: "06:00 PM",
      label: "Recreation",
      title: "Badminton / Table Tennis / Evening Herbal Tea",
      description: "Active physical de-stressing games under physical coach supervision.",
    },
    {
      time: "08:00 PM",
      label: "Night Study",
      title: "The Monitored IITian Study Vault",
      description: "Silent, distraction-free supervised problem solving with subject faculties sitting right inside the hall.",
    },
    {
      time: "11:30 PM",
      label: "Sleep",
      title: "Warm Kesar Almond Milk & Digital Curfew",
      description:
        "Wi-Fi automatically turns off; phones safely deposited in biometric lockers to ensure mandatory 7 hours of restorative sleep.",
    },
  ],
  menuHighlights: [
    {
      name: "Traditional Pahadi Wednesdays",
      detail: "Chana Madra, Pahadi Kadhi with fenugreek, desi ghee parathas, and fresh roasted papad for natural warmth.",
    },
    {
      name: "Brain Fuel Sundays",
      detail: "Paneer butter masala, rich protein dal makhani, jeera rice, walnut halwa, and sweet saffron lassi.",
    },
  ],
  campuses: [
    {
      centreSlug: "shimla",
      note: "Hostels: Boys & Girls (50m walk)",
      wardenPhone: "+91 98166 23676",
      blocks: [
        {
          name: "Boys Hostel",
          available: true,
          distance: "50 m from academic block",
          rooms: "Twin-sharing AC study rooms",
          supervision: "Resident male warden + 24/7 security",
          capacity: "240 beds",
        },
        {
          name: "Girls Residency Sanctum",
          available: true,
          distance: "50 m, separate tower",
          rooms: "Twin-sharing AC study rooms, perimeter isolated",
          supervision: "Resident senior female wardens & caretakers",
          capacity: "160 beds",
        },
      ],
    },
    {
      centreSlug: "hamirpur",
      note: "Dedicated Girls Hostel Wing",
      wardenPhone: "+91 98166 23677",
      blocks: [
        {
          name: "Boys Boarding",
          available: true,
          distance: "On campus",
          rooms: "Triple-sharing study rooms",
          supervision: "Resident warden + night security",
          capacity: "120 beds",
        },
        {
          name: "Girls Hostel Wing",
          available: true,
          distance: "On campus, separate wing",
          rooms: "Twin-sharing rooms",
          supervision: "Resident female warden",
          capacity: "80 beds",
        },
      ],
    },
    {
      centreSlug: "dharamshala",
      note: "Hostel Partner Network",
      wardenPhone: "+91 98166 23678",
      blocks: [
        {
          name: "Partner Hostels (Boys)",
          available: true,
          distance: "Within 1 km",
          rooms: "Twin/triple sharing",
          supervision: "Aspire-verified warden network",
          capacity: "90 beds",
        },
        {
          name: "Partner Hostels (Girls)",
          available: true,
          distance: "Within 800 m",
          rooms: "Twin sharing, female-only building",
          supervision: "Female warden, Parent Portal check-ins",
          capacity: "60 beds",
        },
      ],
    },
    {
      centreSlug: "kullu",
      note: "Monitored Day-Boarding",
      wardenPhone: "+91 98166 23679",
      blocks: [
        {
          name: "Boys Residential Rooms",
          available: true,
          distance: "On campus",
          rooms: "Twin-sharing",
          supervision: "Resident warden",
          capacity: "40 beds",
        },
        {
          name: "Girls Residency",
          available: false,
          distance: "Not on this campus — Shimla BCS / Hamirpur recommended",
          capacity: "Day-boarding only",
        },
      ],
    },
  ],
  status: "placeholder",
  sourceRef: demoRef("/residential-campuses", "/campuses", "/campuses/shimla", "/campuses/hamirpur", "/campuses/dharamshala", "/campuses/kullu"),
};
