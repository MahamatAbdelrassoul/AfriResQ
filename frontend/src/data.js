export const universities = [
  { id: "mak", name: "Makerere University", city: "Kampala", domain: "mak.ac.ug", live: true },
  { id: "isbat", name: "ISBAT University", city: "Kampala", domain: "isbat.ac.ug", live: false },
  { id: "kyu", name: "Kyambogo University", city: "Kampala", domain: "kyu.ac.ug", live: false },
  { id: "ucu", name: "Uganda Christian University", city: "Mukono", domain: "ucu.ac.ug", live: false },
  { id: "must", name: "Mbarara University of Science and Technology", city: "Mbarara", domain: "must.ac.ug", live: false },
  { id: "gu", name: "Gulu University", city: "Gulu", domain: "gu.ac.ug", live: false },
];

export const places = [
  {
    id: "mak",
    name: "Makerere University Hospital",
    short: "Makerere",
    connected: true,
    university: true,
    km: 1.2,
    drive: 4,
    ambulance: 6,
    phone: "+256414542922",
  },
  {
    id: "mul",
    name: "Mulago National Referral Hospital",
    short: "Mulago",
    connected: false,
    university: false,
    km: 3.4,
    drive: 11,
    phone: "+256414554001",
  },
  {
    id: "nsa",
    name: "Nsambya Hospital",
    short: "Nsambya",
    connected: false,
    university: false,
    km: 5.1,
    drive: 16,
    phone: "+256414267012",
  },
];

export const happening = [
  "Not breathing",
  "Unconscious",
  "Severe bleeding",
  "Injury or fall",
  "Chest pain",
  "Pregnancy",
  "Seizure",
  "Other medical",
];

export const awakeOptions = ["Yes", "No", "Not sure"];
export const whoOptions = ["Me", "Someone with me"];
export const whereOptions = ["Live GPS", "Saved home", "Write it"];
export const otherTypes = ["Road accident", "Fire", "Security", "Missing person", "Disaster", "Other"];
export const languages = ["English", "Luganda", "Runyankole", "Kiswahili"];
export const bloodGroups = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];
export const kinRelations = ["Mother", "Father", "Sibling", "Guardian"];
export const walkTimes = ["10 min", "20 min", "30 min", "45 min"];

export const caseSteps = [
  { id: "sent", title: "Sent", detail: "The desk has your report and location" },
  { id: "accepted", title: "Accepted", detail: "A crew has taken the case" },
  { id: "onway", title: "On the way", detail: "The ambulance is moving" },
  { id: "arrived", title: "Arrived", detail: "The crew is with you" },
];

export const DEMO_CODE = "482917";

export function nearestPlaces() {
  return [...places].sort((a, b) => a.km - b.km);
}
