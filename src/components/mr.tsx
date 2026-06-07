import { ActionPanel, List, Color, Detail, Action, Image, Icon, Keyboard } from "@raycast/api";
import { Group, MergeRequest, Project } from "../gitlabapi";
import { GitLabIcons } from "../icons";
import { useCallback, useMemo, useState } from "react";
import { getErrorMessage, hashRecord, optimizeMarkdownText, Query, showErrorToast, tokenizeQueryText } from "../utils";
import { getMRDiscussionMetadataLabel, discussionStatsFromMergeRequest, useMRDiscussionStats } from "./mr_discussions";
import { getMRStateListIcon } from "./mr_status";
import { MRCopySection, MRItemActions, ShowMRCommitsAction, ShowMRPipelinesAction } from "./mr_actions";
import { GitLabOpenInBrowserAction } from "./actions";
import { getCIJobStatusIcon, getMRPipelineStatusTooltip } from "./jobs";
import { MRDetailMetadata, MRListDetailMetadata } from "./mr_metadata";
import { useCachedState, usePromise } from "@raycast/utils";
import { fetchMergeRequestGqlByProjectIid } from "./mr_gql";
import { usePaginatedMergeRequests } from "./mr_data";

/* eslint-disable @typescript-eslint/no-explicit-any */

export enum MRScope {
  created_by_me = "created_by_me",
  assigned_to_me = "assigned_to_me",
  reviews_for_me = "reviews_for_me",
  all = "all",
}

export enum MRState {
  opened = "opened",
  closed = "closed",
  locked = "locked",
  merged = "merged",
  all = "all",
}

export const mrListDetailsShortcut: Keyboard.Shortcut = { modifiers: ["cmd", "shift"], key: "d" };
export const mrListMetadataShortcut: Keyboard.Shortcut = { modifiers: ["cmd", "shift"], key: "i" };

export const mrSearchBarPlaceholder = "Search by title, description, author, id";

export function useMRListDetails(): { isShowingDetail: boolean; toggleListDetails: () => void } {
  const [isShowingDetail, setIsShowingDetail] = useCachedState("mr-list-details", false);
  const toggleListDetails = useCallback(() => setIsShowingDetail((current) => !current), [setIsShowingDetail]);
  return {
    isShowingDetail,
    toggleListDetails,
  };
}

export function useMRListMetadata(): { isShowingMetadata: boolean; toggleListMetadata: () => void } {
  const [isShowingMetadata, setIsShowingMetadata] = useCachedState("mr-list-metadata", true);
  const toggleListMetadata = useCallback(() => setIsShowingMetadata((current) => !current), [setIsShowingMetadata]);
  return {
    isShowingMetadata,
    toggleListMetadata,
  };
}

export function MRListDetailsToggleAction(props: { isShowingDetail: boolean; onToggle: () => void }) {
  const detailsIcon = { source: GitLabIcons.show_details, tintColor: Color.PrimaryText };
  return (
    <Action
      title={props.isShowingDetail ? "Hide Side Panel" : "Show Side Panel"}
      shortcut={mrListDetailsShortcut}
      icon={detailsIcon}
      onAction={props.onToggle}
    />
  );
}

export function MRListMetadataToggleAction(props: { isShowingDetail: boolean }) {
  const { isShowingMetadata, toggleListMetadata } = useMRListMetadata();
  if (!props.isShowingDetail) {
    return null;
  }
  return (
    <Action
      title={isShowingMetadata ? "Hide Metadata" : "Show Metadata"}
      shortcut={mrListMetadataShortcut}
      icon={isShowingMetadata ? Icon.EyeDisabled : Icon.AppWindowList}
      onAction={toggleListMetadata}
    />
  );
}

export function MRDetailFetch(props: { project: Project; mrId: number }) {
  const { mr, isLoading, error } = useMR(props.project, props.mrId);
  if (error) {
    showErrorToast(error, "Could not fetch Merge Request Details");
  }
  if (isLoading || !mr) {
    return <Detail isLoading={isLoading} />;
  } else {
    return <MRDetail mr={mr} />;
  }
}

function mrDescriptionMarkdown(mr: MergeRequest, lineBreak = "  \n"): string {
  const desc = mr.description || "<no description>";
  const lines = [`# ${mr.title}`, optimizeMarkdownText(desc, mr.project_web_url)];
  return lines.join(lineBreak);
}

export function MRDetail(props: { mr: MergeRequest }) {
  const mr = props.mr;
  const { stats: discussionStats, isLoading: discussionsLoading } = useMRDiscussionStats(mr);

  const discussionLabel = getMRDiscussionMetadataLabel(mr, discussionStats, discussionsLoading);

  return (
    <Detail
      markdown={mrDescriptionMarkdown(mr)}
      navigationTitle={`${props.mr.reference_full}`}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <GitLabOpenInBrowserAction url={props.mr.web_url} />
            <ShowMRCommitsAction mr={props.mr} />
            <ShowMRPipelinesAction mr={props.mr} />
          </ActionPanel.Section>
          <MRCopySection mr={props.mr} />
          <MRItemActions mr={props.mr} />
        </ActionPanel>
      }
      metadata={<MRDetailMetadata mr={mr} discussionLabel={discussionLabel} />}
    />
  );
}

export function MRListDetail(props: { mr: MergeRequest }) {
  const mr = props.mr;
  const { stats: discussionStats, isLoading: discussionsLoading } = useMRDiscussionStats(mr);
  const { isShowingMetadata } = useMRListMetadata();

  const discussionLabel = getMRDiscussionMetadataLabel(mr, discussionStats, discussionsLoading);

  return (
    <List.Item.Detail
      markdown={mrDescriptionMarkdown(mr, "\n")}
      metadata={isShowingMetadata ? <MRListDetailMetadata mr={mr} discussionLabel={discussionLabel} /> : undefined}
    />
  );
}

export function buildMRListParams(query: string | undefined, scope: MRScope, state: MRState): Record<string, any> {
  const parsedQuery = getMRQuery(query);
  const params: Record<string, any> = {
    state,
    scope,
    search: parsedQuery.query || "",
    in: "title",
  };
  injectMRQueryNamedParameters(params, parsedQuery, scope, false);
  injectMRQueryNamedParameters(params, parsedQuery, scope, true);
  return params;
}

interface MRListProps {
  scope: MRScope;
  state?: MRState;
  project?: Project;
  group?: Group;
  searchBarAccessory?:
    | React.ReactElement<List.Dropdown.Props, string | React.JSXElementConstructor<any>>
    | null
    | undefined;
}

function navTitle(project?: Project, group?: Group): string | undefined {
  if (group) {
    return `Group MRs ${group.full_path}`;
  }
  if (project) {
    return `MRs ${project.name_with_namespace}`;
  }
  return undefined;
}

export function MRList({
  scope = MRScope.created_by_me,
  state = MRState.all,
  project = undefined,
  group = undefined,
  searchBarAccessory = undefined,
}: MRListProps) {
  const [searchText, setSearchText] = useState<string>();
  const params = useMemo(() => buildMRListParams(searchText, scope, state), [searchText, scope, state]);
  const paramsHash = useMemo(() => hashRecord(params), [params]);
  const { mrs, error, isLoading, performRefetch, pagination } = usePaginatedMergeRequests({
    cacheKey: `mrlist_${project?.id ?? "none"}_${group?.id ?? "none"}_${paramsHash}`,
    buildParams: () => params,
    project,
    group,
    onError: () => undefined,
  });

  if (error) {
    showErrorToast(error, "Cannot search Merge Requests");
  }

  const title = scope == MRScope.assigned_to_me ? "Your Merge Requests" : "Created Recently";
  const { isShowingDetail, toggleListDetails } = useMRListDetails();

  return (
    <List
      searchBarPlaceholder={mrSearchBarPlaceholder}
      onSearchTextChange={setSearchText}
      isLoading={isLoading}
      pagination={pagination}
      throttle={true}
      searchBarAccessory={searchBarAccessory}
      navigationTitle={navTitle(project, group)}
      isShowingDetail={isShowingDetail}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <MRListDetailsToggleAction isShowingDetail={isShowingDetail} onToggle={toggleListDetails} />
            <MRListMetadataToggleAction isShowingDetail={isShowingDetail} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    >
      <List.Section title={title} subtitle={mrs?.length.toString() || "0"}>
        {mrs?.map((mr) => (
          <MRListItem
            key={mr.id}
            mr={mr}
            refreshData={performRefetch}
            isShowingDetail={isShowingDetail}
            onToggleListDetails={toggleListDetails}
          />
        ))}
      </List.Section>
      <MRListEmptyView />
    </List>
  );
}

export function MRListEmptyView() {
  return <List.EmptyView title="No Merge Requests" />;
}

export function MRListItem(props: {
  mr: MergeRequest;
  refreshData: () => void;
  isShowingDetail: boolean;
  onToggleListDetails: () => void;
  showCIStatus?: boolean;
  showAuthor?: boolean;
  filterAction?: React.ReactNode;
  scopeAction?: React.ReactNode;
  sortAction?: React.ReactNode;
  refreshAction?: React.ReactNode;
}) {
  const mr = props.mr;
  if (!mr) {
    return null;
  }
  const { isShowingDetail, onToggleListDetails: toggleListDetails } = props;

  const icon = getMRStateListIcon(mr.state);
  const showAuthor = props.showAuthor !== false;
  const accessoryIcon: Image.ImageLike | undefined = showAuthor
    ? { source: mr.author?.avatar_url || "", mask: Image.Mask.Circle }
    : undefined;

  const showCIStatus = props.showCIStatus === undefined || props.showCIStatus === true;
  const pipelineStatus = showCIStatus ? mr.head_pipeline?.status : undefined;
  const discussionStats = discussionStatsFromMergeRequest(mr);
  const discussionAccessoryLabel = discussionStats
    ? `${discussionStats.resolved}/${discussionStats.resolvableTotal}`
    : undefined;
  const accessories: List.Item.Accessory[] = [];
  if (!isShowingDetail) {
    accessories.push(
      ...(mr.has_conflicts
        ? [
            {
              tag: { value: "Conflicts", color: Color.Red },
              icon: { source: Icon.Warning, tintColor: Color.Red },
              tooltip: "You should resolve merge conflict before merge",
            },
          ]
        : []),
      ...(discussionAccessoryLabel
        ? [
            {
              text: discussionAccessoryLabel,
              icon: { source: Icon.SpeechBubble, tintColor: Color.PrimaryText },
              tooltip: "Resolved discussions",
            },
          ]
        : []),
    );
  }
  if (pipelineStatus) {
    accessories.push({
      icon: getCIJobStatusIcon(pipelineStatus, false),
      tooltip: getMRPipelineStatusTooltip(pipelineStatus),
    });
  }
  if (showAuthor && accessoryIcon) {
    accessories.push({ icon: accessoryIcon, tooltip: mr.author?.name });
  }
  if (!isShowingDetail) {
    accessories.push(
      {
        icon: mr.merge_when_pipeline_succeeds && mr.state === "opened" ? Icon.Rewind : undefined,
        tooltip: mr.merge_when_pipeline_succeeds && mr.state === "opened" ? "Auto Merge" : undefined,
      },
      ...(mr.milestone?.title ? [{ tag: mr.milestone.title, tooltip: "Milestone" }] : []),
    );
  }

  const showDetailsIcon = { source: Icon.ArrowRight, tintColor: Color.PrimaryText };

  return (
    <List.Item
      id={mr.id.toString()}
      title={mr.title}
      icon={icon}
      accessories={accessories}
      detail={isShowingDetail && <MRListDetail mr={mr} />}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action.Push icon={showDetailsIcon} title="Show Details" target={<MRDetail mr={mr} />} />
            <GitLabOpenInBrowserAction url={mr.web_url} />
            <ShowMRCommitsAction mr={mr} />
            <ShowMRPipelinesAction mr={mr} />
            <MRListDetailsToggleAction isShowingDetail={isShowingDetail} onToggle={toggleListDetails} />
            <MRListMetadataToggleAction isShowingDetail={isShowingDetail} />
          </ActionPanel.Section>
          <MRCopySection mr={mr} showCopyMarkdown />
          <MRItemActions mr={mr} onDataChange={props.refreshData} todoShortcut={{ modifiers: ["cmd"], key: "t" }} />
          {props.filterAction || props.scopeAction || props.sortAction ? (
            <ActionPanel.Section title="Filters">
              {props.filterAction}
              {props.scopeAction}
              {props.sortAction}
            </ActionPanel.Section>
          ) : null}
          {props.refreshAction ? <ActionPanel.Section>{props.refreshAction}</ActionPanel.Section> : null}
        </ActionPanel>
      }
    />
  );
}

export function getMRQuery(query: string | undefined) {
  return tokenizeQueryText(query, [
    "label",
    "author",
    "milestone",
    "assignee",
    "draft",
    "target-branch",
    "reviewer",
    "state",
  ]);
}

function isValidMRState(texts: string[] | undefined) {
  if (!texts) {
    return false;
  }
  for (const v of texts) {
    if (
      ![
        MRState.closed.valueOf(),
        MRState.opened.valueOf(),
        MRState.locked.valueOf,
        MRState.merged.valueOf,
        MRState.all.valueOf(),
      ].includes(v)
    ) {
      return false;
    }
  }
  return true;
}

export function injectMRQueryNamedParameters(
  requestParams: Record<string, any>,
  query: Query,
  scope: MRScope,
  isNegative: boolean,
) {
  const namedParams = isNegative ? query.negativeNamed : query.named;
  for (const extraParam of Object.keys(namedParams)) {
    const extraParamVal = namedParams[extraParam];
    const prefixed = (text: string): string => {
      return isNegative ? `not[${text}]` : text;
    };
    if (extraParamVal) {
      switch (extraParam) {
        case "label":
          {
            requestParams[prefixed("labels")] = extraParamVal.join(",");
          }
          break;
        case "author":
          {
            if (scope === MRScope.all) {
              requestParams[prefixed("author_username")] = extraParamVal.join(",");
            }
          }
          break;
        case "milestone":
          {
            requestParams[prefixed("milestone")] = extraParamVal.join(",");
          }
          break;
        case "assignee":
          {
            if (scope === MRScope.all) {
              requestParams[prefixed("assignee_username")] = extraParamVal.join(",");
            }
          }
          break;
        case "draft":
          {
            requestParams[prefixed("wip")] = extraParamVal.join(",").toLocaleLowerCase();
          }
          break;
        case "target-branch":
          {
            requestParams[prefixed("target_branch")] = extraParamVal.join(",");
          }
          break;
        case "reviewer":
          {
            requestParams[prefixed("reviewer_username")] = extraParamVal.join(",");
          }
          break;
        case "state":
          {
            if (isValidMRState(extraParamVal)) {
              requestParams[prefixed("state")] = extraParamVal.join(",");
            }
          }
          break;
      }
    }
  }
}

export function useMR(
  project: Project,
  mrIID: number,
): {
  mr?: MergeRequest;
  error?: string;
  isLoading: boolean;
} {
  const { data, error, isLoading } = usePromise(
    (proj: Project, iid: number) => fetchMergeRequestGqlByProjectIid(proj, iid),
    [project, mrIID],
    // The error is surfaced via `error` and toasted by the caller in render.
    { onError: () => undefined },
  );

  return { mr: data, error: error ? getErrorMessage(error) : undefined, isLoading };
}
