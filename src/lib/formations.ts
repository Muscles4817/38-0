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
  '4-1-4-1': {
    name: '4-1-4-1',
    description: 'A screen in front of the back four, four across the middle.',
    slots: [
      { position: 'ST',  label: 'Striker',   x: 50,  y: 14 },
      { position: 'LM',  label: 'Left',      x: 10,  y: 38 },
      { position: 'CM',  label: 'Left CM',   x: 37,  y: 36 },
      { position: 'CM',  label: 'Right CM',  x: 63,  y: 36 },
      { position: 'RM',  label: 'Right',     x: 90,  y: 38 },
      { position: 'CDM', label: 'Anchor',    x: 50,  y: 54 },
      { position: 'LB',  label: 'Left',      x: 10,  y: 67 },
      { position: 'CB',  label: 'Centre',    x: 34,  y: 67 },
      { position: 'CB',  label: 'Centre',    x: 62,  y: 67 },
      { position: 'RB',  label: 'Right',     x: 88,  y: 67 },
      { position: 'GK',  label: 'Goalkeeper',x: 50,  y: 85 },
    ],
  },
  '5-3-2': {
    name: '5-3-2',
    description: 'Back five with wing-backs, three in the middle, two up top.',
    slots: [
      { position: 'ST',  label: 'Striker',   x: 36,  y: 16 },
      { position: 'ST',  label: 'Striker',   x: 64,  y: 16 },
      { position: 'CM',  label: 'Left CM',   x: 28,  y: 42 },
      { position: 'CM',  label: 'Central',   x: 50,  y: 38 },
      { position: 'CM',  label: 'Right CM',  x: 72,  y: 42 },
      { position: 'LWB', label: 'Left WB',   x: 8,   y: 58 },
      { position: 'CB',  label: 'Left CB',   x: 28,  y: 68 },
      { position: 'CB',  label: 'Centre',    x: 50,  y: 70 },
      { position: 'CB',  label: 'Right CB',  x: 72,  y: 68 },
      { position: 'RWB', label: 'Right WB',  x: 92,  y: 58 },
      { position: 'GK',  label: 'Goalkeeper',x: 50,  y: 86 },
    ],
  },
  '3-4-2-1': {
    name: '3-4-2-1',
    description: 'Back three, two tens feeding a lone striker.',
    slots: [
      { position: 'ST',  label: 'Striker',   x: 50,  y: 13 },
      { position: 'CAM', label: 'Left Ten',  x: 32,  y: 30 },
      { position: 'CAM', label: 'Right Ten', x: 68,  y: 30 },
      { position: 'LWB', label: 'Left WB',   x: 8,   y: 46 },
      { position: 'CM',  label: 'Left CM',   x: 36,  y: 48 },
      { position: 'CM',  label: 'Right CM',  x: 64,  y: 48 },
      { position: 'RWB', label: 'Right WB',  x: 92,  y: 46 },
      { position: 'CB',  label: 'Left CB',   x: 24,  y: 68 },
      { position: 'CB',  label: 'Centre',    x: 50,  y: 70 },
      { position: 'CB',  label: 'Right CB',  x: 76,  y: 68 },
      { position: 'GK',  label: 'Goalkeeper',x: 50,  y: 86 },
    ],
  },
  '4-4-2 Diamond': {
    name: '4-4-2 Diamond',
    description: 'Flat back four, diamond midfield, a strike partnership.',
    slots: [
      { position: 'ST',  label: 'Striker',   x: 36,  y: 15 },
      { position: 'ST',  label: 'Striker',   x: 64,  y: 15 },
      { position: 'CAM', label: 'Attacking', x: 50,  y: 32 },
      { position: 'LM',  label: 'Left',      x: 18,  y: 44 },
      { position: 'RM',  label: 'Right',     x: 82,  y: 44 },
      { position: 'CDM', label: 'Anchor',    x: 50,  y: 54 },
      { position: 'LB',  label: 'Left',      x: 10,  y: 68 },
      { position: 'CB',  label: 'Centre',    x: 34,  y: 68 },
      { position: 'CB',  label: 'Centre',    x: 62,  y: 68 },
      { position: 'RB',  label: 'Right',     x: 88,  y: 68 },
      { position: 'GK',  label: 'Goalkeeper',x: 50,  y: 85 },
    ],
  },
  '4-2-4': {
    name: '4-2-4',
    description: 'Old-fashioned and reckless. Two in midfield, four attackers.',
    slots: [
      { position: 'LW',  label: 'Left',      x: 14,  y: 18 },
      { position: 'ST',  label: 'Striker',   x: 38,  y: 13 },
      { position: 'ST',  label: 'Striker',   x: 62,  y: 13 },
      { position: 'RW',  label: 'Right',     x: 86,  y: 18 },
      { position: 'CM',  label: 'Left CM',   x: 36,  y: 45 },
      { position: 'CM',  label: 'Right CM',  x: 64,  y: 45 },
      { position: 'LB',  label: 'Left',      x: 10,  y: 67 },
      { position: 'CB',  label: 'Centre',    x: 34,  y: 67 },
      { position: 'CB',  label: 'Centre',    x: 62,  y: 67 },
      { position: 'RB',  label: 'Right',     x: 88,  y: 67 },
      { position: 'GK',  label: 'Goalkeeper',x: 50,  y: 85 },
    ],
  },
  '5-2-3': {
    name: '5-2-3',
    description: 'Back five that breaks forward into a front three.',
    slots: [
      { position: 'LW',  label: 'Left',      x: 18,  y: 17 },
      { position: 'ST',  label: 'Striker',   x: 50,  y: 14 },
      { position: 'RW',  label: 'Right',     x: 82,  y: 17 },
      { position: 'CM',  label: 'Left CM',   x: 36,  y: 44 },
      { position: 'CM',  label: 'Right CM',  x: 64,  y: 44 },
      { position: 'LWB', label: 'Left WB',   x: 8,   y: 58 },
      { position: 'CB',  label: 'Left CB',   x: 28,  y: 68 },
      { position: 'CB',  label: 'Centre',    x: 50,  y: 70 },
      { position: 'CB',  label: 'Right CB',  x: 72,  y: 68 },
      { position: 'RWB', label: 'Right WB',  x: 92,  y: 58 },
      { position: 'GK',  label: 'Goalkeeper',x: 50,  y: 86 },
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
// ── Position compatibility ───────────────────────────────────────────────────
//
// Positions are places on a pitch, not strings. A left-back covers left
// wing-back, a central midfielder covers holding or attacking midfield, a
// striker drops to centre-forward. Requiring an exact match made half the
// formations unfillable and forced the position lookup to be far more precise
// than the real world is.
//
// Each position gets a lane (how wide) and a depth (how far forward). Two
// positions are compatible when they are adjacent in that space: same lane one
// step apart, or the same depth one lane apart. Left and right never cover each
// other — a player who genuinely played both flanks lists both.

type Lane = 'L' | 'C' | 'R';

const LANE: Record<Position, Lane> = {
  GK: 'C', CB: 'C', CDM: 'C', CM: 'C', CAM: 'C', CF: 'C', ST: 'C',
  LB: 'L', LWB: 'L', LM: 'L', LW: 'L',
  RB: 'R', RWB: 'R', RM: 'R', RW: 'R',
};

/** 0 is your own goal, 5 is theirs. */
const DEPTH: Record<Position, number> = {
  GK: 0,
  CB: 1, LB: 1, RB: 1,
  CDM: 2, LWB: 2, RWB: 2,
  CM: 3, LM: 3, RM: 3,
  CAM: 4, LW: 4, RW: 4,
  CF: 4, ST: 5,
};

const LANE_ORDER: Lane[] = ['L', 'C', 'R'];
const laneGap = (a: Lane, b: Lane) =>
  Math.abs(LANE_ORDER.indexOf(a) - LANE_ORDER.indexOf(b));

export type SlotFit = 'exact' | 'adjacent' | 'none';

/**
 * How well one position covers another.
 *
 * Goalkeeper is absolute: nobody else goes in goal, and a keeper plays nowhere
 * else. Everywhere else, one step of drift is allowed.
 */
export function positionFit(playerPosition: Position, slotPosition: Position): SlotFit {
  if (playerPosition === slotPosition) return 'exact';
  if (playerPosition === 'GK' || slotPosition === 'GK') return 'none';

  const gapLane = laneGap(LANE[playerPosition], LANE[slotPosition]);
  const gapDepth = Math.abs(DEPTH[playerPosition] - DEPTH[slotPosition]);

  // Straight up or down the same channel, or sideways at the same height.
  if (gapLane === 0 && gapDepth <= 1) return 'adjacent';
  if (gapLane === 1 && gapDepth === 0) return 'adjacent';
  return 'none';
}

/** The best fit any of the player's positions gives for this slot. */
export function slotFit(playerPositions: Position[], slotPosition: Position): SlotFit {
  let best: SlotFit = 'none';
  for (const p of playerPositions) {
    const fit = positionFit(p, slotPosition);
    if (fit === 'exact') return 'exact';
    if (fit === 'adjacent') best = 'adjacent';
  }
  return best;
}

/** Returns true if the player can fill this slot at all, in or out of position. */
export function canFillSlot(playerPositions: Position[], slotPosition: Position): boolean {
  return slotFit(playerPositions, slotPosition) !== 'none';
}

/** Returns true only for a natural fit. Used where drift should not count. */
export function fillsSlotNaturally(playerPositions: Position[], slotPosition: Position): boolean {
  return slotFit(playerPositions, slotPosition) === 'exact';
}

/**
 * Rating points deducted for playing out of position. Enough to make a natural
 * fit preferable without making a good player useless one slot over.
 */
export const OUT_OF_POSITION_PENALTY = 4;

/** A player's effective rating in a given slot. */
export function effectiveRating(
  rating: number, playerPositions: Position[], slotPosition: Position,
): number {
  return slotFit(playerPositions, slotPosition) === 'exact'
    ? rating
    : Math.max(1, rating - OUT_OF_POSITION_PENALTY);
}

/** Initials for a player name used on the pitch badge */
export function playerInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
