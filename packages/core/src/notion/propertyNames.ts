// Every Notion property name, verified against the live schemas on 2026-08-18
// (ported from the iOS app's PropertyName).
export const PropertyName = {
  // Titles. Each database names its title property differently; reads find
  // the title by type, but writes have to name it.
  name: "Name", // People
  summary: "Summary", // Interactions

  // People
  phone: "Phone",
  phone2: "Phone 2",
  email: "Email",
  occupation: "Occupation",
  employer: "Employer",
  howIKnowThem: "How I Know Them",
  birthday: "Birthday",
  birthYearUnknown: "Birth Year Unknown",
  favorite: "Favorite",
  closeFriend: "Close Friend",
  hideFromList: "Hide From List",
  website: "Website",
  linkedIn: "LinkedIn",
  facebook: "Facebook",
  instagram: "Instagram",
  relationshipSummary: "Relationship Summary",
  summaryUpdated: "Summary Updated",
  address: "Address",
  householdAddress: "Household Address",
  household: "Household",
  groups: "Groups",

  // Groups
  description: "Description",

  // Relationships
  people: "People",
  connectionType: "Connection Type",

  // Interactions
  person: "Person",
  date: "Date",
  notes: "Notes",
  type: "Type",
} as const;
