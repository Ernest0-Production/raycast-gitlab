import { ActionPanel, Color, List } from "@raycast/api";
import { MergeRequest, Project } from "../gitlabapi";
import { showErrorToast } from "../utils";
import { useState } from "react";
import { MyProjectsDropdown } from "./project";
import {
  MRListDetailsToggleAction,
  MRListMetadataToggleAction,
  MRListItem,
  MRScope,
  MRState,
  useMRListDetails,
} from "./mr";
import { GitLabIcons } from "../icons";
import { ListPagination, usePaginatedMergeRequests } from "./mr_data";

function ReviewListEmptyView() {
  return <List.EmptyView title="No Reviews" icon={{ source: GitLabIcons.review, tintColor: Color.PrimaryText }} />;
}

export function ReviewList() {
  const [project, setProject] = useState<Project>();
  const { mrs, error, isLoading, performRefetch, pagination } = useMyReviews(project);
  const { isShowingDetail, toggleListDetails } = useMRListDetails();

  if (error) {
    showErrorToast(error, "Cannot search Reviews");
  }

  if (isLoading && mrs === undefined) {
    return <List isLoading={true} searchBarPlaceholder="" />;
  }

  return (
    <List
      searchBarPlaceholder="Filter Reviews by name..."
      isLoading={isLoading}
      pagination={pagination}
      searchBarAccessory={<MyProjectsDropdown onChange={setProject} storeValue={true} />}
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
      {mrs?.map((mr) => (
        <MRListItem
          key={mr.id}
          mr={mr}
          refreshData={performRefetch}
          isShowingDetail={isShowingDetail}
          onToggleListDetails={toggleListDetails}
        />
      ))}
      <ReviewListEmptyView />
    </List>
  );
}

export function useMyReviews(
  project?: Project | undefined,
  labels: string[] | undefined = undefined,
): {
  mrs: MergeRequest[] | undefined;
  isLoading: boolean;
  error: string | undefined;
  performRefetch: () => void;
  pagination: ListPagination;
} {
  const {
    mrs: raw,
    isLoading,
    error,
    performRefetch,
    pagination,
  } = usePaginatedMergeRequests({
    cacheKey: `reviews_${project?.id ?? "all"}_${labels ? labels.join(",") : "[]"}`,
    buildParams: () => ({
      state: MRState.opened,
      scope: MRScope.reviews_for_me,
      ...(labels && { labels }),
    }),
  });
  const mrs = project ? raw?.filter((mr) => mr.project_id === project.id) : raw;
  return { mrs, isLoading, error, performRefetch, pagination };
}
