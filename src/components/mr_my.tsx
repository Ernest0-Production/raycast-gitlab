import { ActionPanel, List } from "@raycast/api";
import { useMemo, useState } from "react";
import { useCache } from "../cache";
import { gitlab } from "../common";
import { MergeRequest, Project } from "../gitlabapi";
import { daysInSeconds, showErrorToast } from "../utils";
import {
  MRListDetailsToggleAction,
  MRListEmptyView,
  MRListItem,
  MRScope,
  MRState,
  mrSearchBarPlaceholder,
  useMRListDetails,
} from "./mr";
import { RefreshMergeRequestsAction } from "./mr_actions";
import { MyProjectsDropdown } from "./project";

/* eslint-disable @typescript-eslint/no-explicit-any */

function MyMRList(props: {
  mrs: MergeRequest[] | undefined;
  isLoading: boolean;
  title?: string;
  performRefetch: () => void;
  searchText?: string | undefined;
  onSearchTextChange?: (text: string) => void;
  searchBarAccessory?:
    | React.ReactElement<List.Dropdown.Props, string | React.JSXElementConstructor<any>>
    | null
    | undefined;
}) {
  const mrs = props.mrs;

  const refresh = () => {
    props.performRefetch();
  };

  const { isShowingDetail, toggleListDetails } = useMRListDetails();
  const refreshAction = useMemo(
    () => <RefreshMergeRequestsAction onRefresh={props.performRefetch} />,
    [props.performRefetch],
  );

  return (
    <List
      searchBarPlaceholder={mrSearchBarPlaceholder}
      isLoading={props.isLoading}
      searchText={props.searchText}
      onSearchTextChange={props.onSearchTextChange}
      searchBarAccessory={props.searchBarAccessory}
      isShowingDetail={isShowingDetail}
      throttle
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <MRListDetailsToggleAction isShowingDetail={isShowingDetail} onToggle={toggleListDetails} />
          </ActionPanel.Section>
          <ActionPanel.Section>{refreshAction}</ActionPanel.Section>
        </ActionPanel>
      }
    >
      <List.Section title={props.title} subtitle={mrs?.length.toString() || ""}>
        {mrs?.map((mr) => (
          <MRListItem
            key={mr.id}
            mr={mr}
            refreshData={refresh}
            showCIStatus={true}
            showAuthor={false}
            isShowingDetail={isShowingDetail}
            onToggleListDetails={toggleListDetails}
            refreshAction={refreshAction}
          />
        ))}
      </List.Section>
      <MRListEmptyView />
    </List>
  );
}

export function MyMergeRequests(props: {
  scope: MRScope;
  state: MRState;
  searchText?: string | undefined;
  onSearchTextChange?: (text: string) => void;
}) {
  const scope = props.scope;
  const state = props.state;
  const [project, setProject] = useState<Project>();
  const { mrs: raw, isLoading, error, performRefetch } = useMyMergeRequests(scope, state, project);
  if (error) {
    showErrorToast(error, "Cannot search Merge Requests");
  }
  const mrs: MergeRequest[] | undefined = project ? raw?.filter((m) => m.project_id === project.id) : raw;
  const title =
    scope == MRScope.assigned_to_me ? "Your assigned Merge Requests" : "Your Recently Created Merge Requests";
  return (
    <MyMRList
      isLoading={isLoading}
      mrs={mrs}
      title={title}
      performRefetch={performRefetch}
      searchText={props.searchText}
      onSearchTextChange={props.onSearchTextChange}
      searchBarAccessory={<MyProjectsDropdown onChange={setProject} />}
    />
  );
}

export function useMyMergeRequests(
  scope: MRScope,
  state: MRState,
  project: Project | undefined,
  labels: string[] | undefined = undefined,
): {
  mrs: MergeRequest[] | undefined;
  isLoading: boolean;
  error: string | undefined;
  performRefetch: () => void;
} {
  const {
    data: mrs,
    isLoading,
    error,
    performRefetch,
  } = useCache<MergeRequest[] | undefined>(
    `mymrs_${scope}_${state}_${labels ? labels.join(",") : "[]"}`,
    async (): Promise<MergeRequest[] | undefined> => {
      return await gitlab.getMergeRequests({ state, scope, ...(labels && { labels }) });
    },
    {
      deps: [project, scope, state, labels],
      secondsToRefetch: 10,
      secondsToInvalid: daysInSeconds(7),
    },
  );
  return { mrs, isLoading, error, performRefetch };
}
