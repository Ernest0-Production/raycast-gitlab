import { Action, ActionPanel, Color, Icon, List } from "@raycast/api";
import { useCachedState } from "@raycast/utils";
import { useEffect, useMemo, useState } from "react";
import { GitLabIcons } from "../icons";
import { getErrorMessage, hashRecord, showErrorToast } from "../utils";
import {
  MRScope,
  MRState,
  MRListItem,
  MRListDetailsToggleAction,
  MRListMetadataToggleAction,
  mrSearchBarPlaceholder,
  buildMRListParams,
  useMRListDetails,
} from "./mr";
import { RefreshMergeRequestsAction } from "./mr_actions";
import { usePaginatedMergeRequests } from "./mr_data";
import { appendMROrderByParams, MergeRequestSortSubmenu, MR_DEFAULT_ORDER_BY, MRSearchOrderBy } from "./mr_sort";
import { MergeRequestScopeSubmenu } from "./mr_scope";
import { mrStateFilterIcon } from "./mr_status";
import { MyProjectsDropdown, useMyProjects } from "./project";

const MR_STATE_FILTERS: { state: MRState; title: string }[] = [
  { state: MRState.opened, title: "Open" },
  { state: MRState.merged, title: "Merged" },
  { state: MRState.closed, title: "Closed" },
];

const MR_SCOPE_LABELS: Record<Exclude<MRScope, MRScope.all>, string> = {
  [MRScope.created_by_me]: "created by me",
  [MRScope.assigned_to_me]: "assigned to me",
  [MRScope.reviews_for_me]: "reviews for me",
};

const MR_SORT_LABELS: Record<Exclude<MRSearchOrderBy, "default">, string> = {
  created_at: "created",
  updated_at: "updated",
  merged_at: "merged",
  title: "title",
  priority: "priority",
  label_priority: "label priority",
  milestone_due: "milestone due",
  popularity: "popularity",
};

function formatMRSearchSectionTitle(mrState: MRState, scope: MRScope, orderBy: MRSearchOrderBy): string {
  const parts: string[] = [];

  if (mrState !== MRState.all) {
    const stateTitle = MR_STATE_FILTERS.find((filter) => filter.state === mrState)?.title ?? mrState;
    parts.push(`Only ${stateTitle}`);
  }

  if (scope !== MRScope.all) {
    parts.push(MR_SCOPE_LABELS[scope]);
  }

  if (orderBy !== MR_DEFAULT_ORDER_BY) {
    parts.push(`sorted by ${MR_SORT_LABELS[orderBy as Exclude<MRSearchOrderBy, "default">]}`);
  }

  return parts.join(", ");
}

function MergeRequestStateFilterSubmenu(props: { state: MRState; onSelect: (state: MRState) => void }) {
  return (
    <ActionPanel.Submenu title="Filter Status" icon={Icon.Filter}>
      <ActionPanel.Section>
        <Action
          title="All"
          icon={mrStateFilterIcon(MRState.all, props.state === MRState.all)}
          autoFocus={props.state === MRState.all}
          onAction={() => props.onSelect(MRState.all)}
        />
      </ActionPanel.Section>
      <ActionPanel.Section>
        {MR_STATE_FILTERS.map(({ state, title }) => (
          <Action
            key={state}
            title={title}
            icon={mrStateFilterIcon(state, props.state === state)}
            autoFocus={props.state === state}
            onAction={() => props.onSelect(state)}
          />
        ))}
      </ActionPanel.Section>
    </ActionPanel.Submenu>
  );
}

function MergeRequestFilterActions(props: {
  mrState: MRState;
  onSelectState: (state: MRState) => void;
  scope: MRScope;
  onSelectScope: (scope: MRScope) => void;
  orderBy: MRSearchOrderBy;
  onSelectOrderBy: (orderBy: MRSearchOrderBy) => void;
  onRefresh: () => void;
}) {
  return (
    <>
      <ActionPanel.Section title="Filters">
        <MergeRequestScopeSubmenu scope={props.scope} onSelect={props.onSelectScope} />
        <MergeRequestStateFilterSubmenu state={props.mrState} onSelect={props.onSelectState} />
        <MergeRequestSortSubmenu orderBy={props.orderBy} onSelect={props.onSelectOrderBy} />
      </ActionPanel.Section>
      <ActionPanel.Section>
        <RefreshMergeRequestsAction onRefresh={props.onRefresh} />
      </ActionPanel.Section>
    </>
  );
}

function SearchMergeRequestsEmptyView(props: {
  mrState: MRState;
  onSelectState: (state: MRState) => void;
  scope: MRScope;
  onSelectScope: (scope: MRScope) => void;
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
            <MRListMetadataToggleAction isShowingDetail={props.isShowingDetail} />
          </ActionPanel.Section>
          <MergeRequestFilterActions
            mrState={props.mrState}
            onSelectState={props.onSelectState}
            scope={props.scope}
            onSelectScope={props.onSelectScope}
            orderBy={props.orderBy}
            onSelectOrderBy={props.onSelectOrderBy}
            onRefresh={props.onRefresh}
          />
        </ActionPanel>
      }
    />
  );
}

export function SearchMyMergeRequests() {
  const [projectId, setProjectId] = useCachedState<string | undefined>("mr-search-project-id", undefined);
  const { projects: myprojects, isLoading: projectsLoading } = useMyProjects({
    onError: (error) => showErrorToast(getErrorMessage(error), "Could not fetch Projects"),
  });
  const [mrState, setMrState] = useCachedState<MRState>("mr-search-state", MRState.opened);
  const [scope, setScope] = useCachedState<MRScope>("mr-search-scope", MRScope.all);
  const [orderBy, setOrderBy] = useCachedState<MRSearchOrderBy>("mr-search-order-by", MR_DEFAULT_ORDER_BY);
  const [search, setSearch] = useState<string>("");
  const { isShowingDetail, toggleListDetails } = useMRListDetails();

  const project = useMemo(() => myprojects?.find((proj) => `${proj.id}` === projectId), [myprojects, projectId]);

  useEffect(() => {
    if (!myprojects?.length || projectId !== undefined) {
      return;
    }
    setProjectId(`${myprojects[0].id}`);
  }, [myprojects, projectId, setProjectId]);

  const params = useMemo(() => {
    const requestParams = buildMRListParams(search, scope, mrState);
    appendMROrderByParams(requestParams, orderBy);
    return requestParams;
  }, [mrState, scope, orderBy, search]);
  const paramsHash = useMemo(() => hashRecord(params), [params]);
  const sectionTitle = useMemo(() => formatMRSearchSectionTitle(mrState, scope, orderBy), [mrState, scope, orderBy]);
  const {
    mrs: data,
    isLoading,
    performRefetch,
    pagination,
  } = usePaginatedMergeRequests({
    cacheKey: `mymrssearch_${project?.id ?? "none"}_${paramsHash}`,
    buildParams: () => params,
    project,
    execute: !!project,
    keepPreviousData: true,
    onError: (error) => showErrorToast(getErrorMessage(error), "Could not fetch Merge Requests"),
  });

  const hasProjects = !!myprojects && myprojects.length > 0;

  return (
    <List
      isLoading={projectsLoading || isLoading || (hasProjects && !project)}
      pagination={pagination}
      searchText={search}
      onSearchTextChange={setSearch}
      searchBarPlaceholder={mrSearchBarPlaceholder}
      isShowingDetail={isShowingDetail}
      throttle
      searchBarAccessory={
        <MyProjectsDropdown
          projects={myprojects}
          value={projectId}
          includeAllItem={false}
          onChange={(project) => {
            const nextId = project ? `${project.id}` : undefined;
            setProjectId((current) => (current === nextId ? current : nextId));
          }}
          storeValue
        />
      }
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <MRListDetailsToggleAction isShowingDetail={isShowingDetail} onToggle={toggleListDetails} />
            <MRListMetadataToggleAction isShowingDetail={isShowingDetail} />
          </ActionPanel.Section>
          <MergeRequestFilterActions
            mrState={mrState}
            onSelectState={setMrState}
            scope={scope}
            onSelectScope={setScope}
            orderBy={orderBy}
            onSelectOrderBy={setOrderBy}
            onRefresh={performRefetch}
          />
        </ActionPanel>
      }
    >
      {!projectsLoading && !hasProjects ? (
        <List.EmptyView
          title="No Projects"
          description="You have no GitLab projects with membership."
          icon={{ source: GitLabIcons.project, tintColor: Color.PrimaryText }}
        />
      ) : (
        <>
          <List.Section title={sectionTitle || undefined}>
            {(data ?? []).map((mr) => (
              <MRListItem
                key={mr.id}
                mr={mr}
                refreshData={performRefetch}
                showCIStatus={true}
                isShowingDetail={isShowingDetail}
                onToggleListDetails={toggleListDetails}
                filterAction={<MergeRequestStateFilterSubmenu state={mrState} onSelect={setMrState} />}
                scopeAction={<MergeRequestScopeSubmenu scope={scope} onSelect={setScope} />}
                sortAction={<MergeRequestSortSubmenu orderBy={orderBy} onSelect={setOrderBy} />}
                refreshAction={<RefreshMergeRequestsAction onRefresh={performRefetch} />}
              />
            ))}
          </List.Section>
          <SearchMergeRequestsEmptyView
            mrState={mrState}
            onSelectState={setMrState}
            scope={scope}
            onSelectScope={setScope}
            orderBy={orderBy}
            onSelectOrderBy={setOrderBy}
            onRefresh={performRefetch}
            isShowingDetail={isShowingDetail}
            onToggleListDetails={toggleListDetails}
          />
        </>
      )}
    </List>
  );
}
