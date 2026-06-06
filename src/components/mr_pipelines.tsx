import { ActionPanel, List } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { getCIRefreshInterval, gitlab } from "../common";
import { MergeRequest, Project } from "../gitlabapi";
import { getErrorMessage, showErrorToast } from "../utils";
import { PipelineListItem } from "./pipelines";
import { RunPipelineAction } from "./pipeline_actions";
import { usePaginatedMRPipelines } from "./pipelines_data";
import useInterval from "use-interval";

function useMRProject(mr: MergeRequest): {
  project: Project | undefined;
  isLoading: boolean | undefined;
  error: string | undefined;
} {
  const { data, isLoading, error } = useCachedPromise(
    (projectID: number) => gitlab.getProject(projectID),
    [mr.project_id],
    { onError: () => undefined },
  );
  return { project: data, isLoading, error: error ? getErrorMessage(error) : undefined };
}

export function MRPipelineList(props: { mr: MergeRequest }) {
  const { mr } = props;
  const navigationTitle = `Pipelines · ${mr.reference_full}`;
  const cacheKey = `mr_pipelines_${mr.project_id}_${mr.iid}`;
  const { pipelines, isLoading, error, performRefetch, pagination } = usePaginatedMRPipelines({
    cacheKey,
    projectID: mr.project_id,
    mrIID: mr.iid,
  });
  const { project, isLoading: projectLoading, error: projectError } = useMRProject(mr);

  useInterval(() => {
    performRefetch();
  }, getCIRefreshInterval());

  if (error) {
    showErrorToast(error, "Could not fetch Pipelines");
  }
  if (projectError) {
    showErrorToast(projectError, "Could not fetch Project");
  }

  const projectFullPath = project?.fullPath ?? "";

  const listLoading = isLoading || projectLoading === undefined || projectLoading;
  const runRef = pipelines?.[0]?.ref || mr.source_branch;
  const runProjectId = pipelines?.[0]?.projectId || `${mr.project_id}`;

  return (
    <List
      isLoading={listLoading}
      pagination={pagination}
      navigationTitle={navigationTitle}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <RunPipelineAction
              projectId={runProjectId}
              ref={runRef}
              onFinished={performRefetch}
              shortcut={{ modifiers: ["cmd"], key: "n" }}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    >
      <List.Section title="Pipelines" subtitle={pipelines?.length ? `${pipelines.length}` : undefined}>
        {(pipelines ?? []).map((pipeline) => (
          <PipelineListItem
            key={pipeline.id}
            pipeline={pipeline}
            projectFullPath={projectFullPath}
            onRefreshPipelines={performRefetch}
            navigationTitle={navigationTitle}
            runRefFallback={mr.source_branch}
          />
        ))}
      </List.Section>
      {!listLoading && (!pipelines || pipelines.length === 0) ? (
        <List.EmptyView title="No Pipelines" description="This merge request has no pipelines yet." />
      ) : null}
    </List>
  );
}
