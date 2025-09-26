export enum Section {
  Home = 'home',
  About = 'about',
  Scanning = 'scanning',
  SavedData = 'saved data',
}

export interface OrganismResult {
  count: number;
  accuracy: number; // A value between 0 and 1
}

export interface ScanResults {
  plankton: OrganismResult;
  algae: OrganismResult;
  bacteria: OrganismResult;
  protozoa: OrganismResult;
}

export interface SavedScan {
  results: ScanResults;
  image: string; // Base64 encoded image
  timestamp: Date;
}
