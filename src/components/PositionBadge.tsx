import { Position } from '@/lib/formations';

const COLOR: Partial<Record<Position, string>> = {
  GK:  'bg-amber-500 text-black',
  LB:  'bg-blue-600 text-white',
  CB:  'bg-blue-600 text-white',
  RB:  'bg-blue-600 text-white',
  LWB: 'bg-blue-500 text-white',
  RWB: 'bg-blue-500 text-white',
  CDM: 'bg-[#00c896] text-black',
  CM:  'bg-[#00c896] text-black',
  CAM: 'bg-[#00c896] text-black',
  LM:  'bg-[#00c896] text-black',
  RM:  'bg-[#00c896] text-black',
  LW:  'bg-[#00c896] text-black',
  RW:  'bg-[#00c896] text-black',
  ST:  'bg-red-500 text-white',
  CF:  'bg-red-500 text-white',
};

export default function PositionBadge({ pos, size = 'sm' }: { pos: Position; size?: 'xs' | 'sm' }) {
  const cls = COLOR[pos] ?? 'bg-gray-600 text-white';
  const sz = size === 'xs' ? 'text-[9px] px-1 py-0' : 'text-[10px] px-1.5 py-0.5';
  return (
    <span className={`rounded font-bold uppercase ${cls} ${sz}`}>{pos}</span>
  );
}
