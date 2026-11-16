import { NextResponse } from 'next/server';
import type Database from 'better-sqlite3';
import { loadRoleRows } from './db';
import { blocksSave, checkTraits, traitDefinitions } from './traitRules';

/**
 * The editor API's check before it writes a player's traits: a response
 * refusing the save when a rule blocks it, or null when it may go ahead.
 * The editor pages run the same rules first and do not offer Save, so this
 * only answers a request that bypassed them.
 */
export function refuseBlockedTraits(
  db: Database.Database,
  roles: unknown,
  positions: unknown,
): NextResponse | null {
  if (!Array.isArray(roles) || roles.length === 0) return null;
  const issues = checkTraits(
    roles.map(String),
    Array.isArray(positions) ? positions.map(String) : [],
    traitDefinitions(loadRoleRows(db)),
  );
  if (!blocksSave(issues)) return null;
  return NextResponse.json(
    { error: issues.filter(i => i.level === 'block').map(i => i.message).join(' '), issues },
    { status: 400 },
  );
}
