// ── Traits for the sides seeded from code ───────────────────────────────────
//
// Most squads reach the database from a staging file in data/squads/. A few
// club-seasons are still seeded by db.ts itself, and that seed wrote every
// player with no traits; the traits they ship with were added in the editor
// afterwards and existed only in one local database. A database rebuilt from
// scratch lost them, the same failure docs/roles.md records for
// NoNonsenseDefender. This is them, copied from the shipped snapshot, so the
// seed writes them — and any trait added since to a code-seeded side goes here
// as well as into the snapshot, or the next rebuild drops it.
//
// Read only when a squad is first seeded: an existing database, and anything
// changed in the editor since, is never touched.

export const SEED_ROLES: Record<string, Record<string, string[]>> = {
  'AC Milan 1994/95': {
    'Paolo Maldini': ['BallPlayingDefender'],
  },
  'AC Milan 2002/03': {
    'Clarence Seedorf': ['Carrier', 'LongShot'],
  },
  'AC Milan 2004/05': {
    'Paolo Maldini': ['BallPlayingDefender'],
  },
  'AC Milan 2006/07': {
    'Alessandro Nesta': ['Sweeper'],
  },
  'Arsenal 2024/25': {
    'Bukayo Saka': ['InsideForward', 'SetPieceDeliverer', 'Dribbler', 'PenaltyTaker'],
    'William Saliba': ['BallPlayingDefender', 'Sweeper'],
    'Martin Ødegaard': ['ChanceCreator', 'SetPieceDeliverer', 'Lightweight'],
    'Declan Rice': ['BoxToBox', 'Enforcer', 'SetPieceDeliverer', 'Carrier'],
  },
  'Aston Villa 2024/25': {
    'Emiliano Martínez': ['ShotStopper', 'CommandingKeeper'],
  },
  'Chelsea 2013/14': {
    'Eden Hazard': ['Trequartista', 'Dribbler'],
    'John Terry': ['AerialThreat'],
    'Petr Čech': ['ShotStopper', 'CommandingKeeper'],
  },
  'Chelsea 2014/15': {
    'Eden Hazard': ['Trequartista', 'Dribbler'],
    'Diego Costa': ['TargetMan'],
    'Cesc Fàbregas': ['DeepLyingPlaymaker', 'ChanceCreator'],
    'Nemanja Matic': ['Anchor', 'DeepLyingPlaymaker'],
    'Branislav Ivanovic': ['AerialThreat'],
    'Willian': ['Winger'],
    'Oscar': ['LateRunner'],
    'Ramires': ['BoxToBox'],
    'Loic Remy': ['Poacher', 'InsideForward'],
    'Thibaut Courtois': ['ShotStopper'],
    'John Terry': ['AerialThreat'],
    'Petr Čech': ['ShotStopper', 'CommandingKeeper'],
  },
  'Chelsea 2016/17': {
    "N'Golo Kante": ['Enforcer', 'Workhorse'],
    'Eden Hazard': ['Trequartista', 'Dribbler'],
    'Thibaut Courtois': ['ShotStopper'],
    'John Terry': ['AerialThreat'],
    'Cesc Fàbregas': ['DeepLyingPlaymaker', 'ChanceCreator'],
  },
  'Chelsea 2024/25': {
    'Cole Palmer': ['ChanceCreator', 'LongShot', 'PenaltyTaker'],
  },
  'Leicester City 2015/16': {
    "N'Golo Kante": ['Enforcer', 'Workhorse'],
    'Riyad Mahrez': ['InsideForward', 'Dribbler'],
    'Jamie Vardy': ['Poacher', 'Pacey'],
  },
  'Liverpool 2013/14': {
    'Luis Suarez': ['CompleteForward'],
    'Daniel Sturridge': ['Poacher'],
    'Steven Gerrard': ['SetPieceDeliverer', 'Regista'],
    'Philippe Coutinho': ['ChanceCreator', 'Mezzala'],
    'Martin Skrtel': ['AerialThreat', 'NoNonsenseDefender'],
    'Raheem Sterling': ['LateRunner', 'Pacey'],
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
    'Mohamed Salah': ['InsideForward', 'Pacey'],
    'Alisson': ['SweeperKeeper'],
    'Sadio Mane': ['InsideForward', 'Pacey'],
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
  'Liverpool 2024/25': {
    'Mohamed Salah': ['InsideForward', 'Pacey'],
    'Alisson': ['SweeperKeeper'],
    'Virgil van Dijk': ['AerialThreat'],
    'Trent Alexander-Arnold': ['ChanceCreator', 'CrossingSpecialist'],
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
    'Raheem Sterling': ['InsideForward', 'Pacey'],
    'Bernardo Silva': ['Mezzala', 'BoxToBox'],
    'Vincent Kompany': ['BallPlayingDefender'],
    'İlkay Gündoğan': ['DeepLyingPlaymaker'],
    'Benjamin Mendy': ['AttackingFullback', 'CrossingSpecialist'],
    'John Stones': ['BallPlayingDefender'],
    'Fabian Delph': ['BoxToBox', 'InvertedWingback'],
    'Claudio Bravo': ['SweeperKeeper'],
  },
  'Newcastle United 2022/23': {
    'Callum Wilson': ['Poacher'],
    'Alexander Isak': ['CompleteForward'],
  },
  'Tottenham Hotspur 2018/19': {
    'Harry Kane': ['DeepLyingForward'],
    'Christian Eriksen': ['ChanceCreator', 'Mezzala'],
    'Son Heung-min': ['InsideForward', 'Pacey'],
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
    'Hugo Lloris': ['SweeperKeeper', 'Reflexes'],
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
