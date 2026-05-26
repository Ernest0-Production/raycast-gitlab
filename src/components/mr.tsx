import { ActionPanel, List, Color, Detail, Action, Image, Icon, Keyboard } from "@raycast/api";
import { getMRHeadPipelineStatus, Group, MergeRequest, Project } from "../gitlabapi";
import { GitLabIcons } from "../icons";
import { getGitLabGQL, gitlab } from "../common";
import { useCallback, useEffect, useState } from "react";
import {
  getErrorMessage,
  now,
  optimizeMarkdownText,
  Query,
  showErrorToast,
  tokenizeQueryText,
} from "../utils";
import { getMRDiscussionMetadataLabel, useMRDiscussionStats } from "./mr_discussions";
import { getMRStateListIcon } from "./mr_status";
import { gql } from "@apollo/client";
import { MRItemActions, MRTodoAndCopySection, ShowMRCommitsAction, ShowMRPipelinesAction } from "./mr_actions";
import { GitLabOpenInBrowserAction } from "./actions";
import { getCIJobStatusIcon, getMRPipelineStatusTooltip } from "./jobs";
import { MRDetailMetadata, MRListDetailMetadata } from "./mr_metadata";
import { useCachedState } from "@raycast/utils";
import { CacheActionPanelSection } from "./cache_actions";

/* eslint-disable @typescript-eslint/no-explicit-any */

export enum MRScope {
  created_by_me = "created_by_me",
  assigned_to_me = "assigned_to_me",
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

export const mrSearchBarPlaceholder = "Search by title, description, author, id";

export function useMRListDetails(): { isShowingDetail: boolean; toggleListDetails: () => void } {
  const [isShowingDetail, setIsShowingDetail] = useCachedState("mr-list-details", false);
  const toggleListDetails = useCallback(() => setIsShowingDetail((current) => !current), [setIsShowingDetail]);
  return {
    isShowingDetail,
    toggleListDetails,
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

const GET_MR_DETAIL = gql`
  query GetMRDetail($id: MergeRequestID!) {
    mergeRequest(id: $id) {
      description
      project {
        webUrl
      }
    }
  }
`;

export function MRDetailFetch(props: { project: Project; mrId: number }) {
  const { mr, isLoading, error } = useMR(props.project.id, props.mrId);
  if (error) {
    showErrorToast(error, "Could not fetch Merge Request Details");
  }
  if (isLoading || !mr) {
    return <Detail isLoading={isLoading} />;
  } else {
    return <MRDetail mr={mr} />;
  }
}

interface MRDetailData {
  description: string;
  projectWebUrl: string;
}

export function MRDetail(props: { mr: MergeRequest }) {
  const mr = props.mr;
  const { mrdetail, error, isLoading } = useDetail(props.mr.id);
  const { stats: discussionStats } = useMRDiscussionStats(mr);
  if (error) {
    showErrorToast(error, "Could not get Merge Request Details");
  }

  const discussionLabel = getMRDiscussionMetadataLabel(mr, discussionStats);

  const desc = (mrdetail?.description ? mrdetail.description : props.mr.description) || "";

  const lines: string[] = [];
  if (mr) {
    lines.push(`# ${mr.title}`);
    lines.push(optimizeMarkdownText(desc, mrdetail?.projectWebUrl));
  }

  const md = lines.join("  \n");

  return (
    <Detail
      markdown={md}
      isLoading={isLoading}
      navigationTitle={`${props.mr.reference_full}`}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <GitLabOpenInBrowserAction url={props.mr.web_url} />
            <ShowMRCommitsAction mr={props.mr} />
            <ShowMRPipelinesAction mr={props.mr} />
          </ActionPanel.Section>
          <MRTodoAndCopySection mr={props.mr} />
          <MRItemActions mr={props.mr} />
        </ActionPanel>
      }
      metadata={<MRDetailMetadata mr={mr} discussionLabel={discussionLabel} />}
    />
  );
}

export function MRListDetail(props: { mr: MergeRequest }) {
  const mr = props.mr;
  const { mrdetail, error, isLoading } = useDetail(props.mr.id);
  const { stats: discussionStats } = useMRDiscussionStats(mr);
  if (error) {
    showErrorToast(error, "Could not get Merge Request Details");
  }

  const discussionLabel = getMRDiscussionMetadataLabel(mr, discussionStats);

  const lines: string[] = [];
  lines.push(`# ${mr.title}`);

  const desc = mrdetail?.description ?? props.mr.description ?? "";
  lines.push(optimizeMarkdownText(desc, mrdetail?.projectWebUrl));

  return (
    <List.Item.Detail
      markdown={lines.join("\n")}
      isLoading={isLoading}
      metadata={<MRListDetailMetadata mr={mr} discussionLabel={discussionLabel} />}
    />
  );
}

function useDetail(issueID: number): {
  mrdetail?: MRDetailData;
  error?: string;
  isLoading: boolean;
} {
  const [mrdetail, setMRDetail] = useState<MRDetailData>();
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // FIXME In the future version, we don't need didUnmount checking
    // https://github.com/facebook/react/pull/22114
    let didUnmount = false;

    async function fetchData() {
      if (issueID <= 0 || didUnmount) {
        return;
      }

      setIsLoading(true);
      setError(undefined);

      try {
        const data = await getGitLabGQL().client.query({
          query: GET_MR_DETAIL,
          variables: { id: `gid://gitlab/MergeRequest/${issueID}` },
        });
        const desc = data.data.mergeRequest.description || "<no description>";
        const projectWebUrl = data.data.mergeRequest.project.webUrl;
        if (!didUnmount) {
          setMRDetail({
            projectWebUrl: projectWebUrl,
            description: desc,
          });
        }
      } catch (e) {
        if (!didUnmount) {
          setError(getErrorMessage(e));
        }
      } finally {
        if (!didUnmount) {
          setIsLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      didUnmount = true;
    };
  }, [issueID]);

  return { mrdetail, error, isLoading };
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
  const { mrs, error, isLoading, refresh } = useSearch(searchText, scope, state, project, group);

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
      throttle={true}
      searchBarAccessory={searchBarAccessory}
      navigationTitle={navTitle(project, group)}
      isShowingDetail={isShowingDetail}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <MRListDetailsToggleAction isShowingDetail={isShowingDetail} onToggle={toggleListDetails} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    >
      <List.Section title={title} subtitle={mrs.length.toString() || "0"}>
        {mrs.map((mr) => (
          <MRListItem
            key={mr.id}
            mr={mr}
            refreshData={refresh}
            isShowingDetail={isShowingDetail}
            onToggleListDetails={toggleListDetails}
          />
        ))}
      </List.Section>
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
  const pipelineStatus = showCIStatus && !mr.has_conflicts ? getMRHeadPipelineStatus(mr) : undefined;
  const accessories: List.Item.Accessory[] = [];
  if (!isShowingDetail) {
    if (pipelineStatus) {
      accessories.push({
        icon: getCIJobStatusIcon(pipelineStatus, false),
        tooltip: getMRPipelineStatusTooltip(pipelineStatus),
      });
    }

    accessories.push(
      {
        icon: mr.merge_when_pipeline_succeeds && mr.state === "opened" ? Icon.Rewind : undefined,
        tooltip: mr.merge_when_pipeline_succeeds && mr.state === "opened" ? "Auto Merge" : undefined,
      },
      ...(mr.has_conflicts
        ? [
            {
              tag: { value: "Conflicts", color: Color.Red },
              icon: { source: Icon.Warning, tintColor: Color.Red },
              tooltip: "You should resolve merge conflict before merge",
            },
          ]
        : []),
      ...(mr.milestone?.title ? [{ tag: mr.milestone.title, tooltip: "Milestone" }] : []),
    );
  }
  if (showAuthor && accessoryIcon) {
    accessories.push({ icon: accessoryIcon, tooltip: mr.author?.name });
  }

  const showDetailsIcon = { source: Icon.ArrowRight, tintColor: Color.PrimaryText };

  return (
    <List.Item
      id={mr.id.toString()}
      title={mr.title}
      subtitle={showAuthor && !isShowingDetail ? mr.author?.name : undefined}
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
          </ActionPanel.Section>
          <MRTodoAndCopySection shortcut={{ modifiers: ["cmd"], key: "t" }} mr={mr} finished={props.refreshData} />
          <MRItemActions mr={mr} onDataChange={props.refreshData} />
          {props.filterAction || props.sortAction || props.refreshAction ? (
            <ActionPanel.Section>
              {props.filterAction}
              {props.sortAction}
              {props.refreshAction}
            </ActionPanel.Section>
          ) : null}
          <CacheActionPanelSection />
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

export function useSearch(
  query: string | undefined,
  scope: MRScope,
  state: MRState,
  project?: Project,
  group?: Group,
): {
  mrs: MergeRequest[];
  error?: string;
  isLoading: boolean;
  refresh: () => void;
} {
  const [mrs, setMRs] = useState<MergeRequest[]>([]);
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [timestamp, setTimestamp] = useState<Date>(now());

  const refresh = () => {
    setTimestamp(now());
  };

  useEffect(() => {
    // FIXME In the future version, we don't need didUnmount checking
    // https://github.com/facebook/react/pull/22114
    let didUnmount = false;

    async function fetchData() {
      if (query === null || didUnmount) {
        return;
      }

      setIsLoading(true);
      setError(undefined);

      try {
        const qd = getMRQuery(query);
        query = qd.query;
        const params: Record<string, any> = {
          state: state,
          scope: scope,
          search: query || "",
          in: "title",
        };
        injectMRQueryNamedParameters(params, qd, scope, false);
        injectMRQueryNamedParameters(params, qd, scope, true);
        if (group) {
          const glMRs = await gitlab.getGroupMergeRequests(params, group);
          if (!didUnmount) {
            setMRs(glMRs);
          }
        } else {
          const glMRs = await gitlab.getMergeRequests(params, project);
          if (!didUnmount) {
            setMRs(glMRs);
          }
        }
      } catch (e) {
        if (!didUnmount) {
          setError(getErrorMessage(e));
        }
      } finally {
        if (!didUnmount) {
          setIsLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      didUnmount = true;
    };
  }, [query, project, timestamp]);

  return { mrs, error, isLoading, refresh };
}

export function useMR(
  projectID: number,
  mrID: number,
): {
  mr?: MergeRequest;
  error?: string;
  isLoading: boolean;
} {
  const [mr, setMR] = useState<MergeRequest>();
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // FIXME In the future version, we don't need didUnmount checking
    // https://github.com/facebook/react/pull/22114
    let didUnmount = false;

    async function fetchData() {
      if (didUnmount) {
        return;
      }

      setIsLoading(true);
      setError(undefined);

      try {
        const glMr = await gitlab.getMergeRequest(projectID, mrID, {});
        if (!didUnmount) {
          setMR(glMr);
        }
      } catch (e) {
        if (!didUnmount) {
          setError(getErrorMessage(e));
        }
      } finally {
        if (!didUnmount) {
          setIsLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      didUnmount = true;
    };
  }, [projectID, mrID]);

  return { mr, error, isLoading };
}
