import { useCache } from "../cache";
import { gitlab } from "../common";
import { MRDiscussion, MergeRequest } from "../gitlabapi";
import { daysInSeconds } from "../utils";

interface MRDiscussionStats {
  resolved: number;
  resolvableTotal: number;
}

function isDiscussionResolvable(discussion: MRDiscussion): boolean {
  if (discussion.resolvable === true) {
    return true;
  }
  return discussion.notes?.some((n) => n.resolvable && !n.system) ?? false;
}

function isDiscussionResolved(discussion: MRDiscussion): boolean {
  if (discussion.resolved === true) {
    return true;
  }
  const resolvableNotes = discussion.notes?.filter((n) => n.resolvable && !n.system) ?? [];
  if (resolvableNotes.length === 0) {
    return false;
  }
  return resolvableNotes.every((n) => n.resolved);
}

function countMRDiscussionStats(discussions: MRDiscussion[]): MRDiscussionStats {
  let resolved = 0;
  let resolvableTotal = 0;
  for (const discussion of discussions) {
    if (!isDiscussionResolvable(discussion)) {
      continue;
    }
    resolvableTotal++;
    if (isDiscussionResolved(discussion)) {
      resolved++;
    }
  }
  return { resolved, resolvableTotal };
}

export function formatMRDiscussionStatsLabel(stats: MRDiscussionStats): string {
  return `${stats.resolved}/${stats.resolvableTotal}`;
}

export function getMRDiscussionMetadataLabel(
  mr: MergeRequest,
  stats: MRDiscussionStats | undefined,
): string | undefined {
  const notesCount = mr.user_notes_count ?? 0;
  if (stats && stats.resolvableTotal > 0) {
    return formatMRDiscussionStatsLabel(stats);
  }
  if (notesCount > 0) {
    return `${notesCount}`;
  }
  return undefined;
}

export function useMRDiscussionStats(mr: MergeRequest): {
  stats: MRDiscussionStats | undefined;
  isLoading: boolean | undefined;
} {
  const notesCount = mr.user_notes_count ?? 0;
  const { data, isLoading } = useCache<MRDiscussionStats | undefined>(
    `mrdiscussions_${mr.project_id}_${mr.iid}`,
    async (): Promise<MRDiscussionStats | undefined> => {
      if (notesCount <= 0) {
        return undefined;
      }
      const discussions = await gitlab.getMergeRequestDiscussions(mr.project_id, mr.iid);
      const stats = countMRDiscussionStats(discussions);
      if (stats.resolvableTotal <= 0) {
        return undefined;
      }
      return stats;
    },
    {
      deps: [mr.project_id, mr.iid, notesCount],
      secondsToRefetch: 30,
      secondsToInvalid: daysInSeconds(7),
    },
  );
  return { stats: data, isLoading };
}
