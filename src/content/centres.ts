import type { Centre } from "@/lib/types";
import { demoRef } from "./demo-source";

// PLACEHOLDER — Aspire's four campuses as listed on its demo site
// (docs/demo-data-import.md). Addresses come from the campuses page (the footer
// gives different ones — logged as conflicts); phone, email and hours from each
// campus page. `programs` stays empty because no page says which programs each
// campus runs. Map pins and directions links are not imported. No campus photos
// (D-018). Nothing here is verified (docs/content-verification.md).
export const centres: Centre[] = [
  {
    id: "centre-shimla",
    slug: "shimla",
    name: "Shimla BCS Head Campus",
    district: "Shimla",
    label: "Flagship Campus",
    isHeadquarters: true,
    summary:
      "Our flagship residential campus in New Shimla: amphitheatre classrooms capped at 35 students, resident IITian doubt pods every evening and boys & girls hostels a 50-metre walk from the academic block.",
    address: "Near HDFC Bank Phase 3, BCS Chowk, New Shimla - 171009",
    phone: "+91 98166 23676",
    email: "shimla@aspireiit.in",
    openingHours: "Mon–Sat 8:00 AM – 8:00 PM · Sun 9:00 AM – 1:00 PM (Counselling desk)",
    programs: [],
    head: { honorific: "Er.", name: "Raman Sharma", title: "Director", facultySlug: "er-raman-sharma" },
    hostelNote: "Hostels: Boys & Girls (50m walk)",
    transportNote: "Direct inter-state Volvo stop at BCS Chowk; weekend pickup for outstation parents.",
    travelTimes: ["2.5 hrs from Solan", "3.5 hrs from Chandigarh"],
    highlights: [
      "Amphitheatre Classrooms",
      "Bioscience Practical Lab",
      "CBT Mock Test Lab",
      "24/7 Reading Library",
      "Evening Doubt Pods",
      "HRTC Volvo Connectivity",
    ],
    facilities: [
      {
        name: "Amphitheatre Classrooms",
        description: "Tiered 35-seat halls with direct eye contact to faculty — no backbenchers.",
      },
      { name: "Bioscience Practical Lab", description: "NEET-pattern dissection, microscopy and histology stations." },
      { name: "CBT Mock Test Lab", description: "80 computer terminals replicating the NTA / JAB exam interface." },
      {
        name: "24/7 Reading Library",
        description: "Silent floors, reference racks and resident mentor desk till 11:30 PM.",
      },
      {
        name: "Evening Doubt Pods",
        description: "Pod Alpha-1 and Pre-Medical Suite: 1-on-1 slots booked via the student app.",
      },
      {
        name: "HRTC Volvo Connectivity",
        description: "Direct inter-state Volvo stop at BCS Chowk; weekend pickup for outstation parents.",
      },
    ],
    servesDistricts: ["Shimla", "Solan", "Sirmaur", "Kinnaur"],
    status: "placeholder",
    sourceRef: demoRef("/campuses", "/campuses/shimla", "/contact"),
  },
  {
    id: "centre-hamirpur",
    slug: "hamirpur",
    name: "Hamirpur Central Hub",
    district: "Hamirpur",
    label: "Central Hub",
    summary:
      "The central academic hub for Hamirpur, Una and Bilaspur districts: boarding & day-scholastic batches, a dedicated girls hostel wing and the Reaction Mechanism Lab led by Prof. Arun Kaundal.",
    address: "Anu Road, Opposite PWD Colony, Hamirpur - 177005",
    phone: "+91 98166 23677",
    email: "hamirpur@aspireiit.in",
    openingHours: "Mon–Sat 8:00 AM – 8:00 PM · Sun 9:00 AM – 1:00 PM (Counselling desk)",
    programs: [],
    head: { honorific: "Er.", name: "Kapil Dev", title: "Head", credentials: "IITK" },
    hostelNote: "Dedicated Girls Hostel Wing",
    transportNote: "10 Min from Hamirpur Stand. Local buses every 15 minutes; parent parking on campus.",
    travelTimes: ["1.5 hrs from Bilaspur", "2 hrs from Una"],
    highlights: [
      "Reaction Mechanism Lab",
      "Micro-Batch Classrooms",
      "CBT Test Centre",
      "Dedicated Girls Hostel Wing",
      "10 Min from Hamirpur Stand",
    ],
    facilities: [
      {
        name: "Reaction Mechanism Lab",
        description: "Organic chemistry sheet-solving floor, 3rd floor, open till 8:00 PM.",
      },
      { name: "Micro-Batch Classrooms", description: "Four 35-seat smart classrooms with recorded lecture backup." },
      { name: "CBT Test Centre", description: "40-terminal computer lab for bi-weekly AITS mocks." },
      {
        name: "Dedicated Girls Hostel Wing",
        description: "Warden-supervised wing with in-wing evening study hall.",
      },
      {
        name: "10 Min from Hamirpur Stand",
        description: "Local buses every 15 minutes; parent parking on campus.",
      },
    ],
    servesDistricts: ["Hamirpur", "Una", "Bilaspur"],
    status: "placeholder",
    sourceRef: demoRef("/campuses", "/campuses/hamirpur", "/contact"),
  },
  {
    id: "centre-dharamshala",
    slug: "dharamshala",
    name: "Dharamshala Kangra Hub",
    district: "Kangra",
    label: "Kangra Valley",
    summary:
      "A high-altitude study retreat for the Kangra valley: Civil Lines classrooms, a partner-hostel network within 1 km and Er. Vivek Chauhan's physics doubt desk every evening.",
    address: "Civil Lines, Kachhari Road, Dharamshala - 176215",
    phone: "+91 98166 23678",
    email: "dharamshala@aspireiit.in",
    openingHours: "Mon–Sat 8:30 AM – 7:30 PM · Sun closed",
    programs: [],
    head: { honorific: "Dr.", name: "P. K. Thakur", title: "Dean", credentials: "MBBS" },
    hostelNote: "Hostel Partner Network",
    transportNote: "5 minutes from the ISBT; Pathankot rail link 2.5 hrs.",
    travelTimes: ["45 mins from Kangra Mandir", "2.5 hrs from Pathankot"],
    highlights: [
      "High Altitude Study Retreat",
      "Micro-Batch Classrooms",
      "Bioscience Lab",
      "Hostel Partner Network",
      "Near Dharamshala Hub",
    ],
    facilities: [
      {
        name: "High Altitude Study Retreat",
        description: "Quiet Civil Lines block with mountain-facing reading rooms.",
      },
      {
        name: "Micro-Batch Classrooms",
        description: "Three 35-seat classrooms, recorded lecture backup on the LMS.",
      },
      { name: "Bioscience Lab", description: "NEET practical stations shared with the Pre-Medical directorate." },
      {
        name: "Hostel Partner Network",
        description: "Verified PG & hostel partners within 1 km, warden check-ins logged on the Parent Portal.",
      },
      { name: "Near Dharamshala Hub", description: "5 minutes from the ISBT; Pathankot rail link 2.5 hrs." },
    ],
    servesDistricts: ["Kangra", "Chamba"],
    status: "placeholder",
    sourceRef: demoRef("/campuses", "/campuses/dharamshala", "/contact"),
  },
  {
    id: "centre-kullu",
    slug: "kullu",
    name: "Kullu Valley Center",
    district: "Kullu",
    label: "Kullu & Mandi",
    summary:
      "Monitored day-boarding centre on Dhalpur Green Avenue serving Kullu, Mandi and Manali students, with residential rooms for outstation scholars and Dr. Arvind Swaminathan's chemistry directorate.",
    address: "Dhalpur Green Avenue, Near Bus Stand, Kullu - 175101",
    phone: "+91 98166 23679",
    email: "kullu@aspireiit.in",
    openingHours: "Mon–Sat 8:00 AM – 8:00 PM · Sun 10:00 AM – 1:00 PM (Doubt clinic)",
    programs: [],
    head: { honorific: "Er.", name: "Mohit Sen", title: "Mentor" },
    hostelNote: "Monitored Day-Boarding",
    transportNote: "Two minutes from the Dhalpur bus stand on a pedestrian avenue.",
    travelTimes: ["1.5 hrs from Mandi", "1 hr from Manali"],
    highlights: [
      "Monitored Day-Boarding",
      "Micro-Batch Classrooms",
      "Chemistry Practical Lab",
      "Central Kullu Walkway",
      "Residential Rooms",
    ],
    facilities: [
      {
        name: "Monitored Day-Boarding",
        description: "8:00 AM – 8:00 PM supervised study with meals and attendance SMS.",
      },
      { name: "Micro-Batch Classrooms", description: "Two 35-seat classrooms plus Math Olympiad Room 104." },
      {
        name: "Chemistry Practical Lab",
        description: "Inorganic & coordination chemistry demonstrations every Saturday.",
      },
      { name: "Central Kullu Walkway", description: "Two minutes from the Dhalpur bus stand on a pedestrian avenue." },
      { name: "Residential Rooms", description: "Limited twin-sharing rooms for Manali / Lahaul students." },
    ],
    servesDistricts: ["Kullu", "Mandi", "Lahaul"],
    status: "placeholder",
    sourceRef: demoRef("/campuses", "/campuses/kullu", "/contact"),
  },
];
