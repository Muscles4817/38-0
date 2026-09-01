export type Position =
  | 'GK' | 'LB' | 'CB' | 'RB' | 'LWB' | 'RWB'
  | 'CDM' | 'CM' | 'CAM'
  | 'LM' | 'RM' | 'LW' | 'RW'
  | 'ST' | 'CF';

export interface FormationSlot {
  position: Position;
  label: string;
  x: number; // 0–100, left→right
  y: number; // 0–100, top (ST end) → bottom (GK end)
}

export interface Formation {
  name: string;
  description: string;
  slots: FormationSlot[];
}

export const FORMATIONS: Record<string, Formation> = {
  '4-4-2': {
    name: '4-4-2',
    description: 'The classic. Balanced, reliable, and compact.',
    slots: [
      { position: 'ST',  label: 'Striker',   x: 35,  y: 16 },
      { position: 'ST',  label: 'Striker',   x: 65,  y: 16 },
      { position: 'LM',  label: 'Left',      x: 10,  y: 40 },
      { position: 'CDM', label: 'Defensive', x: 36,  y: 44 },
      { position: 'CM',  label: 'Central',   x: 62,  y: 40 },
      { position: 'RM',  label: 'Right',     x: 88,  y: 40 },
      { position: 'LB',  label: 'Left',      x: 10,  y: 65 },
      { position: 'CB',  label: 'Centre',    x: 34,  y: 65 },
      { position: 'CB',  label: 'Centre',    x: 62,  y: 65 },
      { position: 'RB',  label: 'Right',     x: 88,  y: 65 },
      { position: 'GK',  label: 'Goalkeeper',x: 50,  y: 85 },
    ],
  },
  '4-3-3': {
    name: '4-3-3',
    description: 'Attack-minded. Three forwards to unlock defences.',
    slots: [
      { position: 'LW',  label: 'Left',      x: 18,  y: 16 },
      { position: 'ST',  label: 'Striker',   x: 50,  y: 14 },
      { position: 'RW',  label: 'Right',     x: 82,  y: 16 },
      { position: 'CM',  label: 'Left CM',   x: 22,  y: 42 },
      { position: 'CM',  label: 'Central',   x: 50,  y: 38 },
      { position: 'CM',  label: 'Right CM',  x: 78,  y: 42 },
      { position: 'LB',  label: 'Left',      x: 10,  y: 65 },
      { position: 'CB',  label: 'Centre',    x: 34,  y: 65 },
      { position: 'CB',  label: 'Centre',    x: 62,  y: 65 },
      { position: 'RB',  label: 'Right',     x: 88,  y: 65 },
      { position: 'GK',  label: 'Goalkeeper',x: 50,  y: 85 },
    ],
  },
  '4-2-3-1': {
    name: '4-2-3-1',
    description: 'Modern and structured. Dominant in transition.',
    slots: [
      { position: 'ST',  label: 'Striker',   x: 50,  y: 14 },
      { position: 'LM',  label: 'Left',      x: 16,  y: 33 },
      { position: 'CAM', label: 'Attacking', x: 50,  y: 30 },
      { position: 'RM',  label: 'Right',     x: 84,  y: 33 },
      { position: 'CDM', label: 'Def. Mid',  x: 34,  y: 52 },
      { position: 'CDM', label: 'Def. Mid',  x: 66,  y: 52 },
      { position: 'LB',  label: 'Left',      x: 10,  y: 67 },
      { position: 'CB',  label: 'Centre',    x: 34,  y: 67 },
      { position: 'CB',  label: 'Centre',    x: 62,  y: 67 },
      { position: 'RB',  label: 'Right',     x: 88,  y: 67 },
      { position: 'GK',  label: 'Goalkeeper',x: 50,  y: 85 },
    ],
  },
  '4-5-1': {
    name: '4-5-1',
    description: 'Midfield control with a lone striker up top.',
    slots: [
      { position: 'ST',  label: 'Striker',   x: 50,  y: 14 },
      { position: 'LM',  label: 'Left',      x: 10,  y: 38 },
      { position: 'CM',  label: 'Left CM',   x: 28,  y: 38 },
      { position: 'CM',  label: 'Central',   x: 50,  y: 34 },
      { position: 'CM',  label: 'Right CM',  x: 72,  y: 38 },
      { position: 'RM',  label: 'Right',     x: 88,  y: 38 },
      { position: 'LB',  label: 'Left',      x: 10,  y: 65 },
      { position: 'CB',  label: 'Centre',    x: 34,  y: 65 },
      { position: 'CB',  label: 'Centre',    x: 62,  y: 65 },
      { position: 'RB',  label: 'Right',     x: 88,  y: 65 },
      { position: 'GK',  label: 'Goalkeeper',x: 50,  y: 85 },
    ],
  },
  '3-4-3': {
    name: '3-4-3',
    description: 'High-risk, high-reward. Wing play is key.',
    slots: [
      { position: 'LW',  label: 'Left',      x: 18,  y: 16 },
      { position: 'ST',  label: 'Striker',   x: 50,  y: 14 },
      { position: 'RW',  label: 'Right',     x: 82,  y: 16 },
      { position: 'LM',  label: 'Left',      x: 14,  y: 42 },
      { position: 'CM',  label: 'Left CM',   x: 38,  y: 42 },
      { position: 'CM',  label: 'Right CM',  x: 62,  y: 42 },
      { position: 'RM',  label: 'Right',     x: 86,  y: 42 },
      { position: 'CB',  label: 'Left CB',   x: 22,  y: 65 },
      { position: 'CB',  label: 'Centre',    x: 50,  y: 65 },
      { position: 'CB',  label: 'Right CB',  x: 78,  y: 65 },
      { position: 'GK',  label: 'Goalkeeper',x: 50,  y: 85 },
    ],
  },
  '3-5-2': {
    name: '3-5-2',
    description: 'Physical and direct. Wide players crucial.',
    slots: [
      { position: 'ST',  label: 'Striker',   x: 32,  y: 16 },
      { position: 'ST',  label: 'Striker',   x: 68,  y: 16 },
      { position: 'LWB', label: 'Left WB',   x: 8,   y: 42 },
      { position: 'CM',  label: 'Left CM',   x: 30,  y: 40 },
      { position: 'CDM', label: 'Defensive', x: 50,  y: 37 },
      { position: 'CM',  label: 'Right CM',  x: 70,  y: 40 },
      { position: 'RWB', label: 'Right WB',  x: 92,  y: 42 },
      { position: 'CB',  label: 'Left CB',   x: 22,  y: 65 },
      { position: 'CB',  label: 'Centre',    x: 50,  y: 65 },
      { position: 'CB',  label: 'Right CB',  x: 78,  y: 65 },
      { position: 'GK',  label: 'Goalkeeper',x: 50,  y: 85 },
    ],
  },
  '5-4-1': {
    name: '5-4-1',
    description: 'Solid and hard to beat. Counter-attacking weapon.',
    slots: [
      { position: 'ST',  label: 'Striker',   x: 50,  y: 14 },
      { position: 'LM',  label: 'Left',      x: 10,  y: 40 },
      { position: 'CM',  label: 'Left CM',   x: 32,  y: 40 },
      { position: 'CM',  label: 'Right CM',  x: 62,  y: 40 },
      { position: 'RM',  label: 'Right',     x: 88,  y: 40 },
      { position: 'LB',  label: 'Left',      x: 6,   y: 65 },
      { position: 'CB',  label: 'Left CB',   x: 24,  y: 65 },
      { position: 'CB',  label: 'Centre',    x: 45,  y: 65 },
      { position: 'CB',  label: 'Right CB',  x: 66,  y: 65 },
      { position: 'RB',  label: 'Right',     x: 84,  y: 65 },
      { position: 'GK',  label: 'Goalkeeper',x: 50,  y: 85 },
    ],
  },
  '4-3-3 (CDM)': {
    name: '4-3-3 (CDM)',
    description: 'A 4-3-3 with a holding midfielder anchoring the centre.',
    slots: [
      { position: 'LW',  label: 'Left',      x: 18,  y: 16 },
      { position: 'ST',  label: 'Striker',   x: 50,  y: 14 },
      { position: 'RW',  label: 'Right',     x: 82,  y: 16 },
      { position: 'CM',  label: 'Left CM',   x: 22,  y: 40 },
      { position: 'CDM', label: 'Holding',   x: 50,  y: 46 },
      { position: 'CM',  label: 'Right CM',  x: 78,  y: 40 },
      { position: 'LB',  label: 'Left',      x: 10,  y: 65 },
      { position: 'CB',  label: 'Centre',    x: 34,  y: 65 },
      { position: 'CB',  label: 'Centre',    x: 62,  y: 65 },
      { position: 'RB',  label: 'Right',     x: 88,  y: 65 },
      { position: 'GK',  label: 'Goalkeeper',x: 50,  y: 85 },
    ],
  },
  '4-3-3 (CDM-CAM)': {
    name: '4-3-3 (CDM-CAM)',
    description: 'Unbalanced midfield trio — a destroyer, a box-to-box, and an enganche.',
    slots: [
      { position: 'LW',  label: 'Left',      x: 18,  y: 16 },
      { position: 'ST',  label: 'Striker',   x: 50,  y: 14 },
      { position: 'RW',  label: 'Right',     x: 82,  y: 16 },
      { position: 'CAM', label: 'Attacking', x: 22,  y: 36 },
      { position: 'CDM', label: 'Holding',   x: 50,  y: 48 },
      { position: 'CM',  label: 'Box-to-Box',x: 78,  y: 40 },
      { position: 'LB',  label: 'Left',      x: 10,  y: 65 },
      { position: 'CB',  label: 'Centre',    x: 34,  y: 65 },
      { position: 'CB',  label: 'Centre',    x: 62,  y: 65 },
      { position: 'RB',  label: 'Right',     x: 88,  y: 65 },
      { position: 'GK',  label: 'Goalkeeper',x: 50,  y: 85 },
    ],
  },
  '3-4-3 (WB)': {
    name: '3-4-3 (WB)',
    description: 'Three at the back with wing backs providing width and a high press.',
    slots: [
      { position: 'LW',  label: 'Left',      x: 18,  y: 16 },
      { position: 'ST',  label: 'Striker',   x: 50,  y: 14 },
      { position: 'RW',  label: 'Right',     x: 82,  y: 16 },
      { position: 'LWB', label: 'Left WB',   x: 8,   y: 44 },
      { position: 'CM',  label: 'Left CM',   x: 34,  y: 40 },
      { position: 'CM',  label: 'Right CM',  x: 66,  y: 40 },
      { position: 'RWB', label: 'Right WB',  x: 92,  y: 44 },
      { position: 'CB',  label: 'Left CB',   x: 22,  y: 65 },
      { position: 'CB',  label: 'Centre',    x: 50,  y: 65 },
      { position: 'CB',  label: 'Right CB',  x: 78,  y: 65 },
      { position: 'GK',  label: 'Goalkeeper',x: 50,  y: 85 },
    ],
  },
  '4-2-2-2': {
    name: '4-2-2-2',
    description: 'Rigid double pivot with two attacking mids in the half-spaces.',
    slots: [
      { position: 'ST',  label: 'Striker',   x: 32,  y: 14 },
      { position: 'ST',  label: 'Striker',   x: 68,  y: 14 },
      { position: 'CAM', label: 'Left CAM',  x: 22,  y: 34 },
      { position: 'CAM', label: 'Right CAM', x: 78,  y: 34 },
      { position: 'CDM', label: 'Def. Mid',  x: 34,  y: 52 },
      { position: 'CDM', label: 'Def. Mid',  x: 66,  y: 52 },
      { position: 'LB',  label: 'Left',      x: 10,  y: 67 },
      { position: 'CB',  label: 'Centre',    x: 34,  y: 67 },
      { position: 'CB',  label: 'Centre',    x: 66,  y: 67 },
      { position: 'RB',  label: 'Right',     x: 88,  y: 67 },
      { position: 'GK',  label: 'Goalkeeper',x: 50,  y: 85 },
    ],
  },
  '4-4-2 Diamond (WB)': {
    name: '4-4-2 Diamond (WB)',
    description: 'Diamond midfield with wing backs pushing beyond the defensive line.',
    slots: [
      { position: 'ST',  label: 'Striker',   x: 32,  y: 14 },
      { position: 'ST',  label: 'Striker',   x: 68,  y: 14 },
      { position: 'CAM', label: 'Attacking', x: 50,  y: 30 },
      { position: 'CM',  label: 'Left CM',   x: 16,  y: 44 },
      { position: 'CM',  label: 'Right CM',  x: 84,  y: 44 },
      { position: 'CDM', label: 'Holding',   x: 50,  y: 54 },
      { position: 'LWB', label: 'Left WB',   x: 8,   y: 66 },
      { position: 'CB',  label: 'Centre',    x: 32,  y: 65 },
      { position: 'CB',  label: 'Centre',    x: 68,  y: 65 },
      { position: 'RWB', label: 'Right WB',  x: 92,  y: 66 },
      { position: 'GK',  label: 'Goalkeeper',x: 50,  y: 85 },
    ],
  },
  '4-4-1-1 (CAM)': {
    name: '4-4-1-1 (CAM)',
    description: 'A flat four midfield with an attacking mid linking play behind a lone striker.',
    slots: [
      { position: 'ST',  label: 'Striker',    x: 50,  y: 14 },
      { position: 'CAM', label: 'Attacking',  x: 50,  y: 28 },
      { position: 'LM',  label: 'Left',       x: 10,  y: 44 },
      { position: 'CM',  label: 'Left CM',    x: 34,  y: 44 },
      { position: 'CM',  label: 'Right CM',   x: 66,  y: 44 },
      { position: 'RM',  label: 'Right',      x: 88,  y: 44 },
      { position: 'LB',  label: 'Left',       x: 10,  y: 65 },
      { position: 'CB',  label: 'Centre',     x: 34,  y: 65 },
      { position: 'CB',  label: 'Centre',     x: 62,  y: 65 },
      { position: 'RB',  label: 'Right',      x: 88,  y: 65 },
      { position: 'GK',  label: 'Goalkeeper', x: 50,  y: 85 },
    ],
  },
  '4-4-1-1 (CF)': {
    name: '4-4-1-1 (CF)',
    description: 'A flat four midfield with a centre forward dropping deep to support the striker.',
    slots: [
      { position: 'ST',  label: 'Striker',    x: 50,  y: 14 },
      { position: 'CF',  label: 'Centre Fwd', x: 50,  y: 28 },
      { position: 'LM',  label: 'Left',       x: 10,  y: 44 },
      { position: 'CM',  label: 'Left CM',    x: 34,  y: 44 },
      { position: 'CM',  label: 'Right CM',   x: 66,  y: 44 },
      { position: 'RM',  label: 'Right',      x: 88,  y: 44 },
      { position: 'LB',  label: 'Left',       x: 10,  y: 65 },
      { position: 'CB',  label: 'Centre',     x: 34,  y: 65 },
      { position: 'CB',  label: 'Centre',     x: 62,  y: 65 },
      { position: 'RB',  label: 'Right',      x: 88,  y: 65 },
      { position: 'GK',  label: 'Goalkeeper', x: 50,  y: 85 },
    ],
  },
  '4-3-2-1': {
    name: '4-3-2-1',
    description: 'The Christmas tree. Three hardworking mids supply two tens behind a lone striker.',
    slots: [
      { position: 'ST',  label: 'Striker',   x: 50,  y: 14 },
      { position: 'CAM', label: 'Left CAM',  x: 28,  y: 30 },
      { position: 'CAM', label: 'Right CAM', x: 72,  y: 30 },
      { position: 'CM',  label: 'Left CM',   x: 18,  y: 47 },
      { position: 'CM',  label: 'Central',   x: 50,  y: 43 },
      { position: 'CM',  label: 'Right CM',  x: 82,  y: 47 },
      { position: 'LB',  label: 'Left',      x: 10,  y: 65 },
      { position: 'CB',  label: 'Centre',    x: 34,  y: 65 },
      { position: 'CB',  label: 'Centre',    x: 62,  y: 65 },
      { position: 'RB',  label: 'Right',     x: 88,  y: 65 },
      { position: 'GK',  label: 'Goalkeeper',x: 50,  y: 85 },
    ],
  },
};

export function getFormation(name: string): Formation {
  return FORMATIONS[name] ?? FORMATIONS['4-4-2'];
}

/** Returns true if the player (with given positions) can fill this slot */
export function canFillSlot(playerPositions: Position[], slotPosition: Position): boolean {
  return playerPositions.includes(slotPosition);
}

/** Initials for a player name used on the pitch badge */
export function playerInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
