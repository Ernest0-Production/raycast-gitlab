import { Action, ActionPanel, Color, Icon, List } from "@raycast/api";
import { useCachedState } from "@raycast/utils";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCache } from "../cache";
import { gitlab } from "../common";
import { MergeRequest, Project } from "../gitlabapi";
import { GitLabIcons } from "../icons";
import { daysInSeconds, getErrorMessage, hashRecord, showErrorToast } from "../utils";
import {
  MRScope,
  MRState,
  MRListItem,
  MRListDetailsToggleAction,
  mrSearchBarPlaceholder,
  getMRQuery,
  injectMRQueryNamedParameters,
  useMRListDetails,
} from "./mr";
import { RefreshMergeRequestsAction } from "./mr_actions";
import { appendMROrderByParams, mergeRequestSortSubmenu, MR_DEFAULT_ORDER_BY, MRSearchOrderBy } from "./mr_sort";
import { mrStateFilterIcon } from "./mr_status";
import { MyProjectsDropdown, useMyProjects } from "./project";

/* eslint-disable @typescript-eslint/no-explicit-any */

function partitionSearchMrs(mrs: MergeRequest[], userId: number) {
  const createdByMe: MergeRequest[] = [];
  const assignedToReview: MergeRequest[] = [];
  const other: MergeRequest[] = [];
  for (const m of mrs) {
    if (m.author?.id === userId) {
      createdByMe.push(m);
    } else if (m.reviewers?.some((reviewer) => reviewer.id === userId)) {
      assignedToReview.push(m);
    } else {
      other.push(m);
    }
  }
  return { createdByMe, assignedToReview, other };
}

function mergeRequestFilterAndSortSection(
  mrState: MRState,
  onSelectState: (state: MRState) => void,
  orderBy: MRSearchOrderBy,
  onSelectOrderBy: (orderBy: MRSearchOrderBy) => void,
  onRefresh: () => void,
) {
  return (
    <ActionPanel.Section>
      {mergeRequestStateFilterSubmenu(mrState, onSelectState)}
      {mergeRequestSortSubmenu(orderBy, onSelectOrderBy)}
      <RefreshMergeRequestsAction onRefresh={onRefresh} />
    </ActionPanel.Section>
  );
}

function mergeRequestStateFilterSubmenu(mrState: MRState, onSelectState: (state: MRState) => void) {
  const stateFilters: { state: MRState; title: string }[] = [
    { state: MRState.opened, title: "Open" },
    { state: MRState.merged, title: "Merged" },
    { state: MRState.closed, title: "Closed" },
  ];

  return (
    <ActionPanel.Submenu title="Filter by" shortcut={{ modifiers: ["cmd"], key: "f" }} icon={Icon.Filter}>
      <ActionPanel.Section>
        <Action
          title="All"
          icon={mrStateFilterIcon(MRState.all, mrState === MRState.all)}
          autoFocus={mrState === MRState.all}
          onAction={() => onSelectState(MRState.all)}
        />
      </ActionPanel.Section>
      <ActionPanel.Section>
        {stateFilters.map(({ state, title }) => (
          <Action
            key={state}
            title={title}
            icon={mrStateFilterIcon(state, mrState === state)}
            autoFocus={mrState === state}
            onAction={() => onSelectState(state)}
          />
        ))}
      </ActionPanel.Section>
    </ActionPanel.Submenu>
  );
}

function SearchMergeRequestsEmptyView(props: {
  mrState: MRState;
  onSelectState: (state: MRState) => void;
  orderBy: MRSearchOrderBy;
  onSelectOrderBy: (orderBy: MRSearchOrderBy) => void;
  onRefresh: () => void;
  isShowingDetail: boolean;
  onToggleListDetails: () => void;
}) {
  return (
    <List.EmptyView
      title="No Merge Requests"
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <MRListDetailsToggleAction isShowingDetail={props.isShowingDetail} onToggle={props.onToggleListDetails} />
          </ActionPanel.Section>
          {mergeRequestFilterAndSortSection(
            props.mrState,
            props.onSelectState,
            props.orderBy,
            props.onSelectOrderBy,
            props.onRefresh,
          )}
        </ActionPanel>
      }
    />
  );
}

export function SearchMyMergeRequests() {
  const [projectId, setProjectId] = useCachedState<string | undefined>("mr-search-project-id", undefined);
  const { projects: myprojects, isLoading: projectsLoading, error: projectsError } = useMyProjects();
  const [mrState, setMrState] = useCachedState<MRState>("mr-search-state", MRState.opened);
  const [orderBy, setOrderBy] = useCachedState<MRSearchOrderBy>("mr-search-order-by", MR_DEFAULT_ORDER_BY);
  const scope = MRScope.all;
  const [search, setSearch] = useState<string>();
  const [userId, setUserId] = useState<number | undefined>();
  const { isShowingDetail, toggleListDetails } = useMRListDetails();

  const project = useMemo(() => myprojects?.find((p) => `${p.id}` === projectId), [myprojects, projectId]);

  useEffect(() => {
    gitlab.getMyself().then((u) => setUserId(u.id));
  }, []);

  useEffect(() => {
    if (!myprojects?.length || projectId !== undefined) {
      return;
    }
    setProjectId(`${myprojects[0].id}`);
  }, [myprojects, projectId, setProjectId]);

  useEffect(() => {
    if (!projectsError) {
      return;
    }
    showErrorToast(getErrorMessage(projectsError), "Could not fetch Projects");
  }, [projectsError]);

  const params = useMemo(() => {
    const requestParams: Record<string, any> = { state: mrState, scope };
    appendMROrderByParams(requestParams, orderBy);
    const qd = getMRQuery(search);
    requestParams.search = qd.query || "";
    injectMRQueryNamedParameters(requestParams, qd, scope, false);
    injectMRQueryNamedParameters(requestParams, qd, scope, true);
    return requestParams;
  }, [mrState, scope, orderBy, search]);
  const paramsHash = useMemo(() => hashRecord(params), [params]);
  const { data, isLoading, error, performRefetch } = useCache<MergeRequest[] | undefined>(
    project ? `mymrssearch_${project.id}_${paramsHash}` : "mymrssearch_no_project",
    async (): Promise<MergeRequest[] | undefined> => {
      if (!project) {
        return undefined;
      }
      return await gitlab.getMergeRequests(params, project);
    },
    {
      deps: [project?.id, search, mrState, orderBy],
      secondsToRefetch: 60,
      secondsToInvalid: daysInSeconds(7),
    },
  );

  useEffect(() => {
    if (!error) {
      return;
    }
    showErrorToast(getErrorMessage(error), "Could not fetch Merge Requests");
  }, [error]);

  const { createdByMe, assignedToReview, other } = useMemo(() => {
    if (!data || userId === undefined) {
      return { createdByMe: [], assignedToReview: [], other: [] };
    }
    return partitionSearchMrs(data, userId);
  }, [data, userId]);

  const filterAction = useMemo(() => mergeRequestStateFilterSubmenu(mrState, setMrState), [mrState, setMrState]);
  const sortAction = useMemo(() => mergeRequestSortSubmenu(orderBy, setOrderBy), [orderBy, setOrderBy]);
  const refreshAction = useMemo(() => <RefreshMergeRequestsAction onRefresh={performRefetch} />, [performRefetch]);
  const filterSortSection = useMemo(
    () => mergeRequestFilterAndSortSection(mrState, setMrState, orderBy, setOrderBy, performRefetch),
    [mrState, setMrState, orderBy, setOrderBy, performRefetch],
  );

  const listFilterActions = useMemo(
    () => (
      <ActionPanel>
        <ActionPanel.Section>
          <MRListDetailsToggleAction isShowingDetail={isShowingDetail} onToggle={toggleListDetails} />
        </ActionPanel.Section>
        {filterSortSection}
      </ActionPanel>
    ),
    [isShowingDetail, toggleListDetails, filterSortSection],
  );

  const onProjectChange = useCallback(
    (pro: Project | undefined) => {
      const nextId = pro ? `${pro.id}` : undefined;
      setProjectId((current) => (current === nextId ? current : nextId));
    },
    [setProjectId],
  );

  const searchBarAccessory = useMemo(
    () => (
      <MyProjectsDropdown
        projects={myprojects}
        value={projectId}
        includeAllItem={false}
        onChange={onProjectChange}
        storeValue
      />
    ),
    [myprojects, projectId, onProjectChange],
  );

  if (projectsLoading || isLoading === undefined) {
    return <List isLoading={true} searchBarPlaceholder={mrSearchBarPlaceholder} />;
  }

  if (!myprojects || myprojects.length === 0) {
    return (
      <List searchBarPlaceholder={mrSearchBarPlaceholder}>
        <List.EmptyView
          title="No Projects"
          description="You have no GitLab projects with membership."
          icon={{ source: GitLabIcons.project, tintColor: Color.PrimaryText }}
        />
      </List>
    );
  }

  if (!project) {
    return <List isLoading={true} searchBarPlaceholder={mrSearchBarPlaceholder} />;
  }

  const renderMrs = (mrs: MergeRequest[]) =>
    mrs.map((m) => (
      <MRListItem
        key={m.id}
        mr={m}
        refreshData={performRefetch}
        showCIStatus={true}
        isShowingDetail={isShowingDetail}
        onToggleListDetails={toggleListDetails}
        filterAction={filterAction}
        sortAction={sortAction}
        refreshAction={refreshAction}
      />
    ));

  return (
    <List
      isLoading={isLoading}
      searchText={search}
      onSearchTextChange={setSearch}
      searchBarPlaceholder={mrSearchBarPlaceholder}
      isShowingDetail={isShowingDetail}
      throttle
      searchBarAccessory={searchBarAccessory}
      actions={listFilterActions}
    >
      {createdByMe.length > 0 ? (
        <List.Section title="Created by me" subtitle={`${createdByMe.length}`}>
          {renderMrs(createdByMe)}
        </List.Section>
      ) : null}
      {assignedToReview.length > 0 ? (
        <List.Section title="Assigned to Review" subtitle={`${assignedToReview.length}`}>
          {renderMrs(assignedToReview)}
        </List.Section>
      ) : null}
      <List.Section title="Other" subtitle={`${other.length}`}>
        {renderMrs(other)}
      </List.Section>
      <SearchMergeRequestsEmptyView
        mrState={mrState}
        onSelectState={setMrState}
        orderBy={orderBy}
        onSelectOrderBy={setOrderBy}
        onRefresh={performRefetch}
        isShowingDetail={isShowingDetail}
        onToggleListDetails={toggleListDetails}
      />
    </List>
  );
}
