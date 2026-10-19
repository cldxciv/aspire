import type { Stat } from "@/lib/types";
import { demoRef } from "./demo-source";

// PLACEHOLDER — headline figures as stated on Aspire's demo site
// (docs/demo-data-import.md). Values are copied exactly; none is verified and
// several are inconsistent with each other (e.g. "5,000+ Doctors & IITians" vs
// 715 listed rankers). "100% Audited Registry" and ratings are NOT imported.
const placeholder = { status: "placeholder" } as const;

export const stats: Stat[] = [
  // Headline (home hero, why-aspire)
  {
    id: "stat-igmc-2025",
    value: "14+",
    label: "IGMC Shimla '25",
    context: "IGMC 2025 MBBS allotments",
    group: "headline",
    ...placeholder,
    sourceRef: demoRef("/", "/why-aspire"),
  },
  {
    id: "stat-doctors-iitians",
    value: "5,000+",
    label: "Doctors & IITians",
    group: "headline",
    ...placeholder,
    sourceRef: demoRef("/"),
  },
  {
    id: "stat-student-mentor-ratio",
    value: "3.8 : 1",
    label: "Student-Mentor Ratio",
    group: "headline",
    ...placeholder,
    sourceRef: demoRef("/", "/why-aspire"),
  },
  {
    id: "stat-years",
    value: "13+",
    label: "Years",
    context: "Founded in Shimla in 2013",
    group: "headline",
    ...placeholder,
    sourceRef: demoRef("/", "/about"),
  },
  {
    id: "stat-campuses",
    value: "4",
    label: "Regional campuses",
    context: "Shimla BCS, Hamirpur, Dharamshala and Kullu",
    group: "headline",
    ...placeholder,
    sourceRef: demoRef("/campuses", "/about"),
  },
  // Results
  {
    id: "stat-verified-rankers",
    value: "715",
    label: "Verified rankers",
    context: "Rankers list on the results page",
    group: "results",
    ...placeholder,
    sourceRef: demoRef("/results"),
  },
  {
    id: "stat-state-selections",
    value: "152+",
    label: "State selections",
    context: "Annual merit conclave",
    group: "results",
    ...placeholder,
    sourceRef: demoRef("/why-aspire"),
  },
  // Pedagogy
  {
    id: "stat-batch-cap",
    value: "35",
    label: "Students max / batch",
    context: "Every cohort is capped at 35 students (30 for the Dropper Apex and Foundation batches).",
    group: "pedagogy",
    ...placeholder,
    sourceRef: demoRef("/", "/courses/jee-neet-pinnacle-2027"),
  },
  {
    id: "stat-doubt-desk",
    value: "90 min",
    label: "Daily doubt desk",
    context: "1-on-1 evening doubt clinic with resident faculty",
    group: "pedagogy",
    ...placeholder,
    sourceRef: demoRef("/"),
  },
  {
    id: "stat-faculty-till",
    value: "7:30 PM",
    label: "Faculty on campus till",
    group: "pedagogy",
    ...placeholder,
    sourceRef: demoRef("/"),
  },
  // Faculty
  {
    id: "stat-fly-in-lecturers",
    value: "0%",
    label: "Fly-in guest lecturers",
    context: "Full-time resident educators present 6 days a week.",
    group: "faculty",
    ...placeholder,
    sourceRef: demoRef("/about", "/faculty"),
  },
  {
    id: "stat-faculty-tenure",
    value: "8.4 Yrs",
    label: "Average faculty tenure",
    context: "Zero batch teacher turnover midway through academic years.",
    group: "faculty",
    ...placeholder,
    sourceRef: demoRef("/about", "/faculty"),
  },
  {
    id: "stat-senior-leads",
    value: "6",
    label: "Senior resident leads",
    group: "faculty",
    ...placeholder,
    sourceRef: demoRef("/faculty"),
  },
  // Residential
  {
    id: "stat-boarders",
    value: "1,450+",
    label: "Boarders prepared in HP",
    group: "residential",
    ...placeholder,
    sourceRef: demoRef("/residential-campuses"),
  },
  {
    id: "stat-boarder-selection-rate",
    value: "94.8%",
    label: "Boarder NEET & JEE selection rate",
    group: "residential",
    ...placeholder,
    sourceRef: demoRef("/residential-campuses"),
  },
  {
    id: "stat-faculty-hostel-ratio",
    value: "1:12",
    label: "Faculty-to-hostel ratio",
    group: "residential",
    ...placeholder,
    sourceRef: demoRef("/residential-campuses"),
  },
];
