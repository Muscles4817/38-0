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
    'Paolo Maldini': ['BallPlayingDefender', 'Pacey'],
  },
  'AC Milan 2002/03': {
    'Clarence Seedorf': ['Mezzala', 'Carrier', 'LongShot'],
  },
  'AC Milan 2004/05': {
    'Paolo Maldini': ['BallPlayingDefender', 'Sweeper'],
  },
  'AC Milan 2006/07': {
    'Alessandro Nesta': ['Sweeper'],
    'Kaká': ['LateRunner', 'Carrier', 'ChanceCreator', 'Pacey'],
    'Clarence Seedorf': ['Mezzala', 'Carrier', 'LongShot'],
    'Paolo Maldini': ['BallPlayingDefender', 'Sweeper'],
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
    'John Terry': ['AerialThreat', 'Ponderous'],
    'Petr Čech': ['ShotStopper', 'CommandingKeeper'],
    'Frank Lampard': ['LateRunner', 'LongShot', 'PenaltyTaker'],
    'Ashley Cole': ['AttackingFullback'],
  },
  'Chelsea 2014/15': {
    'Eden Hazard': ['Trequartista', 'Dribbler'],
    'Diego Costa': ['TargetMan', 'PressingForward', 'RashInTheTackle'],
    'Cesc Fàbregas': ['DeepLyingPlaymaker', 'ChanceCreator'],
    'Nemanja Matic': ['Anchor', 'DeepLyingPlaymaker'],
    'Branislav Ivanovic': ['AerialThreat'],
    'Willian': ['Winger'],
    'Oscar': ['LateRunner'],
    'Ramires': ['BoxToBox'],
    'Loic Remy': ['Poacher', 'InsideForward'],
    'Thibaut Courtois': ['ShotStopper'],
    'John Terry': ['AerialThreat', 'Ponderous'],
    'Petr Čech': ['ShotStopper', 'CommandingKeeper'],
  },
  'Chelsea 2016/17': {
    "N'Golo Kante": ['Enforcer', 'Workhorse'],
    'Eden Hazard': ['Trequartista', 'Dribbler'],
    'Thibaut Courtois': ['ShotStopper'],
    'John Terry': ['AerialThreat', 'Ponderous'],
    'Cesc Fàbregas': ['DeepLyingPlaymaker', 'ChanceCreator'],
    'Diego Costa': ['TargetMan', 'PressingForward', 'RashInTheTackle'],
  },
  'Chelsea 2024/25': {
    'Cole Palmer': ['ChanceCreator', 'LongShot', 'PenaltyTaker'],
  },
  'Leicester City 2015/16': {
    "N'Golo Kante": ['Enforcer', 'Workhorse'],
    'Riyad Mahrez': ['InsideForward', 'Dribbler'],
    'Jamie Vardy': ['Poacher', 'Pacey', 'PressingForward'],
  },
  'Liverpool 2013/14': {
    'Luis Suarez': ['CompleteForward', 'Dribbler'],
    'Daniel Sturridge': ['Poacher', 'Pacey'],
    'Steven Gerrard': ['Regista', 'SetPieceDeliverer', 'PenaltyTaker'],
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
    'Andy Robertson': ['CrossingSpecialist', 'AttackingFullback'],
    'Fabinho': ['Anchor', 'DeepLyingPlaymaker'],
    'Trent Alexander-Arnold': ['ChanceCreator', 'CrossingSpecialist', 'SetPieceDeliverer'],
    'Roberto Firmino': ['ChanceCreator'],
    'Joel Matip': ['BallPlayingDefender'],
    'Jordan Henderson': ['BoxToBox'],
    'Georginio Wijnaldum': ['BoxToBox', 'LateRunner'],
    'Alex Oxlade-Chamberlain': ['BoxToBox'],
    'Xherdan Shaqiri': ['Winger'],
    'Divock Origi': ['Poacher', 'InsideForward'],
  },
  'Liverpool 2024/25': {
    'Mohamed Salah': ['InsideForward', 'Pacey', 'PenaltyTaker'],
    'Alisson': ['SweeperKeeper'],
    'Virgil van Dijk': ['AerialThreat'],
    'Trent Alexander-Arnold': ['ChanceCreator', 'CrossingSpecialist', 'SetPieceDeliverer'],
    'Andy Robertson': ['CrossingSpecialist', 'AttackingFullback'],
  },
  'Manchester City 2011/12': {
    'David Silva': ['ChanceCreator', 'Carrier', 'Mezzala'],
    'Sergio Aguero': ['Poacher'],
    'Yaya Touré': ['BoxToBox', 'Carrier', 'LongShot'],
    'Carlos Tevez': ['CompleteForward', 'PressingForward'],
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
    'Kevin De Bruyne': ['CrossingSpecialist', 'ChanceCreator', 'Mezzala', 'LongShot'],
    'Sergio Aguero': ['Poacher'],
    'Ederson': ['SweeperKeeper'],
    'David Silva': ['ChanceCreator', 'Carrier', 'Mezzala'],
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
    'Harry Kane': ['DeepLyingForward', 'PenaltyTaker', 'LongShot'],
    'Christian Eriksen': ['ChanceCreator', 'Mezzala', 'SetPieceDeliverer'],
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
