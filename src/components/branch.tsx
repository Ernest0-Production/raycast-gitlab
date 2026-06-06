import { ActionPanel, List, Image, Color } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useState } from "react";
import { Branch, Project } from "../gitlabapi";
import { gitlab } from "../common";
import { GitLabIcons } from "../icons";
import { CreateMRAction, ShowBranchCommitsAction } from "./branch_actions";
import { GitLabOpenInBrowserAction } from "./actions";
import { useCommitStatus } from "./commits/utils";
import { getCIJobStatusIcon, getMRPipelineStatusTooltip } from "./jobs";
import { showErrorToast } from "../utils";

function getIcon(merged: boolean): Image {
  if (merged) {
    return { source: GitLabIcons.merged, tintColor: Color.Purple };
  } else {
    return { source: GitLabIcons.mropen, tintColor: Color.Green };
  }
}

export function BranchListItem(props: { branch: Branch; project: Project }) {
  const branch = props.branch;
  const icon = getIcon(branch.merged === true);
  const isMergedStatus = branch.merged === true ? "Merged" : "Open";
  const project = props.project;
  const states = [];
  if (branch.default) {
    states.push("[default]");
  }
  if (branch.protected) {
    states.push("[protected]");
  }
  const { commitStatus } = useCommitStatus(project.id, branch?.commit?.id);
  const statusIcon = commitStatus ? getCIJobStatusIcon(commitStatus.status, commitStatus.allow_failure) : undefined;

  return (
    <List.Item
      id={branch.id}
      title={branch.name}
      subtitle={states.join(" ")}
      icon={{ value: icon, tooltip: `Status: ${isMergedStatus}` }}
      accessories={[
        {
          icon: statusIcon,
          tooltip: commitStatus?.status ? getMRPipelineStatusTooltip(commitStatus.status) : undefined,
        },
      ]}
      actions={
        <ActionPanel>
          <ShowBranchCommitsAction projectID={project.id} branch={branch} />
          <CreateMRAction project={project} branch={branch} />
          <GitLabOpenInBrowserAction url={branch.web_url} />
        </ActionPanel>
      }
    />
  );
}

export function BranchList(props: { project: Project; navigationTitle?: string }) {
  const [query, setQuery] = useState<string>("");
  const { branches, error, isLoading } = useSearch(query, props.project);
  if (error) {
    showErrorToast(error, "Cannot search Branches");
  }

  return (
    <List isLoading={isLoading} onSearchTextChange={setQuery} throttle={true} navigationTitle={props.navigationTitle}>
      <List.Section title="Branches">
        {branches?.map((branch, index) => (
          <BranchListItem key={index} branch={branch} project={props.project} />
        ))}
      </List.Section>
    </List>
  );
}

export function useSearch(
  query: string | undefined,
  project: Project,
): {
  branches: Branch[];
  error?: string;
  isLoading: boolean;
} {
  const { data, error, isLoading } = usePromise(
    async (searchQuery: string, projectId: number): Promise<Branch[]> => {
      return (await gitlab.fetch(`projects/${projectId}/repository/branches`, { search: searchQuery })) || [];
    },
    [query ?? "", project.id],
    // The error is surfaced via `error` and toasted by the caller in render.
    { onError: () => undefined },
  );
  return { branches: data ?? [], error: error?.message, isLoading };
}
