// ── Traits for the sides seeded from code ───────────────────────────────────
//
// Most squads reach the database from a staging file in data/squads/. A few
// club-seasons are still seeded by db.ts itself, and that seed wrote every
// player with no traits; the traits they ship with were added in the editor
// afterwards and existed only in one local database. A database rebuilt from
// scratch lost them, the same failure docs/roles.md records for
// NoNonsenseDefender. This is them, copied from the shipped snapshot, so the
// seed writes them.
//
// Read only when a squad is first seeded: an existing database, and anything
// changed in the editor since, is never touched.

export const SEED_ROLES: Record<string, Record<string, string[]>> = {
  'Chelsea 2014/15': {
    'Eden Hazard': ['Trequartista'],
    'Diego Costa': ['TargetMan'],
    'Cesc Fàbregas': ['DeepLyingPlaymaker', 'ChanceCreator'],
    'Nemanja Matic': ['Anchor', 'DeepLyingPlaymaker'],
    'Branislav Ivanovic': ['AerialThreat'],
    'Willian': ['Winger'],
    'Oscar': ['LateRunner'],
    'Ramires': ['BoxToBox'],
    'Loic Remy': ['Poacher', 'InsideForward'],
  },
  'Manchester City 2011/12': {
    'David Silva': ['Mezzala', 'ChanceCreator'],
    'Sergio Aguero': ['Poacher'],
    'Yaya Touré': ['BoxToBox', 'DeepLyingPlaymaker'],
    'Carlos Tevez': ['CompleteForward'],
    'Vincent Kompany': ['BallPlayingDefender'],
    'Samir Nasri': ['ChanceCreator'],
    'Mario Balotelli': ['CompleteForward'],
    'Edin Dzeko': ['TargetMan'],
    'Gareth Barry': ['Anchor', 'InvertedWingback'],
    'James Milner': ['BoxToBox', 'AttackingFullback', 'Mezzala'],
    'Adam Johnson': ['InsideForward'],
    'Nigel De Jong': ['Enforcer'],
  },
  'Manchester City 2017/18': {
    'Kevin De Bruyne': ['CrossingSpecialist', 'ChanceCreator', 'Mezzala'],
    'Sergio Aguero': ['CompleteForward'],
    'Ederson': ['SweeperKeeper'],
    'David Silva': ['Mezzala', 'DeepLyingPlaymaker'],
    'Leroy Sane': ['Winger'],
    'Aymeric Laporte': ['BallPlayingDefender'],
    'Fernandinho': ['Enforcer', 'Anchor'],
    'Raheem Sterling': ['InsideForward'],
    'Bernardo Silva': ['Mezzala', 'BoxToBox'],
    'Vincent Kompany': ['BallPlayingDefender'],
    'İlkay Gündoğan': ['DeepLyingPlaymaker'],
    'Benjamin Mendy': ['AttackingFullback', 'CrossingSpecialist'],
    'John Stones': ['BallPlayingDefender'],
    'Fabian Delph': ['BoxToBox', 'InvertedWingback'],
    'Claudio Bravo': ['SweeperKeeper'],
  },
  'Liverpool 2013/14': {
    'Luis Suarez': ['CompleteForward'],
    'Daniel Sturridge': ['Poacher'],
    'Steven Gerrard': ['SetPieceDeliverer', 'Regista'],
    'Philippe Coutinho': ['ChanceCreator', 'Mezzala'],
    'Martin Skrtel': ['AerialThreat', 'NoNonsenseDefender'],
    'Raheem Sterling': ['LateRunner'],
    'Glen Johnson': ['AttackingFullback'],
    'Mamadou Sakho': ['BallPlayingDefender'],
    'Jordan Henderson': ['BoxToBox'],
    'Jose Enrique': ['AttackingFullback'],
    'Victor Moses': ['Winger'],
    'Lucas Leiva': ['Anchor'],
    'Joe Allen': ['DeepLyingPlaymaker'],
  },
  'Liverpool 2019/20': {
    'Virgil van Dijk': ['AerialThreat'],
    'Mohamed Salah': ['InsideForward'],
    'Alisson': ['SweeperKeeper'],
    'Sadio Mane': ['InsideForward'],
    'Andy Robertson': ['CrossingSpecialist'],
    'Fabinho': ['Anchor', 'DeepLyingPlaymaker'],
    'Trent Alexander-Arnold': ['ChanceCreator', 'CrossingSpecialist'],
    'Roberto Firmino': ['ChanceCreator'],
    'Joel Matip': ['BallPlayingDefender'],
    'Jordan Henderson': ['BoxToBox'],
    'Georginio Wijnaldum': ['BoxToBox', 'LateRunner'],
    'Alex Oxlade-Chamberlain': ['BoxToBox'],
    'Xherdan Shaqiri': ['Winger'],
    'Divock Origi': ['Poacher', 'InsideForward'],
  },
  'Tottenham Hotspur 2018/19': {
    'Harry Kane': ['DeepLyingForward'],
    'Christian Eriksen': ['ChanceCreator', 'Mezzala'],
    'Son Heung-min': ['InsideForward'],
    'Toby Alderweireld': ['BallPlayingDefender'],
    'Dele Alli': ['LateRunner'],
    'Kieran Trippier': ['AttackingFullback'],
    'Davinson Sánchez': ['NoNonsenseDefender'],
    'Moussa Dembélé': ['DeepLyingPlaymaker'],
    'Danny Rose': ['AttackingFullback'],
    'Lucas Moura': ['InsideForward'],
    'Moussa Sissoko': ['BoxToBox'],
    'Victor Wanyama': ['Anchor'],
    'Fernando Llorente': ['TargetMan'],
  },
  'Newcastle United 2022/23': {
    'Callum Wilson': ['Poacher'],
  },
};

/** A name with accents and case taken out: the seed writes "Fabregas", the editor "Fàbregas". */
function plain(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** The traits a code-seeded player starts with, as the JSON the database stores. */
export function seedRoles(club: string, season: string, player: string): string {
  const squad = SEED_ROLES[`${club} ${season}`] ?? {};
  const found = Object.entries(squad).find(([name]) => plain(name) === plain(player));
  return JSON.stringify(found?.[1] ?? []);
}
