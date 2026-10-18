export type Group = "gk" | "def" | "mid" | "fwd" | "unknown";

/** One player as it appears in a grid card. */
export type CardPlayer = {
  id: string;
  name: string;
  grp: Group;
  pos: string | null;
  positions: string[];
  iso: string | null;
  country: string | null;
  img: string | null;
  num: number | null;
  dob: string | null;
  birthYear: number | null;
  height: number | null;
  weight: number | null;
  clubQ: string | null;
  club: string | null;
  natQ: string | null;
  natTeam: string | null;
  apps: number | null;
  goals: number | null;
  natCaps: number | null;
  natGoals: number | null;
  firstYear: number | null;
  lastYear: number | null;
  open: boolean;
  clubCount: number;
  stints: number;
  wiki: string | null;
};

export type CareerStint = {
  q: string;
  team: string;
  start: number | null;
  end: number | null;
  apps: number | null;
  goals: number | null;
  national: boolean;
  iso: string | null;
  kind: string | null;
};

export type PlayerDetail = CardPlayer & {
  birthplace: string | null;
  extra: { iso: string; name: string | null }[];
  career: CareerStint[];
};

export type Team = {
  q: string;
  name: string;
  countryQ: string | null;
  country: string | null;
  iso: string | null;
  national: boolean;
  kind: string;
  logo: string | null;
  inception: number | null;
  players: number;
  apps: number | null;
  goals: number | null;
};

export type Country = {
  q: string;
  name: string | null;
  iso: string | null;
  iso3: string | null;
  players: number;
};

export type PositionFacet = { name: string; grp: Group; players: number };

export type Stats = Record<string, number | string>;

export type Facets = {
  stats: Stats;
  positions: PositionFacet[];
  countries: Country[];
  decades: { decade: number; count: number }[];
  groups: { key: Group; count: number }[];
};

export type PlayerFilters = {
  q: string;
  grp: Group[];
  pos: string[];
  ctry: string[];
  team: string[];
  decade: number[];
  gen: ("m" | "f")[];
  active: boolean;
  photo: boolean;
  nat: boolean;
};

export const EMPTY_FILTERS: PlayerFilters = {
  q: "",
  grp: [],
  pos: [],
  ctry: [],
  team: [],
  decade: [],
  gen: [],
  active: false,
  photo: false,
  nat: false,
};

export type SortKey =
  | "name"
  | "born"
  | "height"
  | "weight"
  | "apps"
  | "goals"
  | "caps"
  | "debut"
  | "clubs"
  | "last";

export type Sort = { key: SortKey; dir: "asc" | "desc" };

export type PlayerPage = {
  total: number;
  page: number;
  per: number;
  pages: number;
  sort: Sort;
  players: CardPlayer[];
  dbMissing?: boolean;
};
