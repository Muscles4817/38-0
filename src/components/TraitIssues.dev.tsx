'use client';

import type { TraitIssue } from '@/lib/traitRules';

/**
 * What the trait rules say about the traits being edited: blocks first, which
 * stop the save, then warnings, which do not. Renders nothing when there are
 * none. See src/lib/traitRules.ts.
 */
export default function TraitIssues({ issues }: { issues: TraitIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1" aria-label="Trait checks">
      {issues.map((issue, i) => (
        <li
          key={`${issue.rule}-${i}`}
          className={`text-xs rounded px-2 py-1.5 ${issue.level === 'block'
            ? 'bg-[#ef4444]/15 text-[#fca5a5]'
            : 'bg-[#f59e0b]/15 text-[#fcd34d]'}`}
        >
          <span className="font-bold mr-1">{issue.level === 'block' ? "Can't save" : 'Check'} · {issue.rule}</span>
          {issue.message}
        </li>
      ))}
    </ul>
  );
}
