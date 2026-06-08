import { Action, ActionPanel, Color, List } from "@raycast/api";
import { useState } from "react";
import { useCachedPromise } from "@raycast/utils";
import urljoin from "url-join";
import { Project } from "../../gitlabapi";
import { GitLabIcons } from "../../icons";
import { GitLabOpenInBrowserAction } from "../actions";
import { Event } from "../event";
import { fetchPushEventsWithProjects } from "../events_data";
import { PipelineJobsListByCommit } from "../jobs";
import { MyProjectsDropdown } from "../project";
import { RefreshCommitsAction } from "./actions";
import { usePaginatedMergeRequestCommits, usePaginatedProjectCommits } from "./data";
import { CommitListItem } from "./item";

export const commitSearchBarPlaceholder = "Search commits by title, message, or author...";

function EventCommitListItem(props: { event: Event; onRefresh?: () => void }) {
  return (
    <List.Item
      title={props.event.push_data?.commit_title || "no title"}
      subtitle={props.event.push_data?.ref || props.event.push_data?.commit_to}
      accessories={[{ text: props.event.project?.name_with_namespace }]}
      icon={{ source: GitLabIcons.commit, tintColor: Color.SecondaryText }}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            {props.event.project && props.event.push_data?.commit_to && (
              <Action.Push
                title="Open Pipeline"
                icon={{ source: GitLabIcons.ci, tintColor: Color.PrimaryText }}
                target={
                  <PipelineJobsListByCommit
                    project={props.event.project}
                    sha={props.event.push_data.commit_to}
                  />
                }
              />
            )}
            {props.event.project?.web_url && props.event.push_data?.commit_to && (
              <GitLabOpenInBrowserAction
                url={urljoin(props.event.project.web_url, `-/commit/${props.event.push_data.commit_to}`)}
              />
            )}
          </ActionPanel.Section>
          <ActionPanel.Section>
            <RefreshCommitsAction onRefreshJobs={props.onRefresh} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

function RecentCommitsListEmptyView() {
  return <List.EmptyView title="No Commits" icon={{ source: GitLabIcons.commit, tintColor: Color.PrimaryText }} />;
}

export function RecentCommitsList() {
  const [project, setProject] = useState<Project>();
  const { data, isLoading, revalidate } = useCachedPromise(
    async (): Promise<Event[]> => fetchPushEventsWithProjects(),
    [],
    { initialData: [] },
  );
  return (
    <List isLoading={isLoading} searchBarAccessory={<MyProjectsDropdown onChange={setProject} />}>
      {(project ? data.filter((event) => event.project_id === project.id) : data).map((event) => (
        <EventCommitListItem event={event} key={`${event.id}`} onRefresh={revalidate} />
      ))}
      <RecentCommitsListEmptyView />
    </List>
  );
}

export type { Commit, CommitStatus } from "./types";

function ProjectCommitListEmptyView() {
  return <List.EmptyView title="No Commits" icon={{ source: GitLabIcons.commit, tintColor: Color.PrimaryText }} />;
}

export function MRCommitList(props: { projectID: number; mrIID: number; navigationTitle?: string }) {
  const { commits, isLoading, pagination } = usePaginatedMergeRequestCommits({
    cacheKey: `mr_commits_${props.projectID}_${props.mrIID}`,
    projectID: props.projectID,
    mrIID: props.mrIID });

  return (
    <List
      isLoading={isLoading}
      pagination={pagination}
      navigationTitle={props.navigationTitle}
      searchBarPlaceholder={commitSearchBarPlaceholder}
    >
      {commits.map((commit) => (
        <CommitListItem key={commit.id} commit={commit} />
      ))}
      <ProjectCommitListEmptyView />
    </List>
  );
}

export function ProjectCommitList(props: { projectID: number; refName?: string; navigationTitle?: string }) {
  const { commits, isLoading, pagination } = usePaginatedProjectCommits({
    cacheKey: props.refName
      ? `project_commits_${props.projectID}_${props.refName}`
      : `project_commits_${props.projectID}`,
    projectID: props.projectID,
    refName: props.refName });

  return (
    <List
      isLoading={isLoading}
      pagination={pagination}
      navigationTitle={props.navigationTitle}
      searchBarPlaceholder={commitSearchBarPlaceholder}
    >
      {commits.map((commit) => (
        <CommitListItem key={commit.id} commit={commit} />
      ))}
      <ProjectCommitListEmptyView />
    </List>
  );
}
