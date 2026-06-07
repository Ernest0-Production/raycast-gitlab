import { ActionPanel, List } from "@raycast/api";
import { getCIRefreshInterval } from "../common";
import { MergeRequest } from "../gitlabapi";
import { showErrorToast } from "../utils";
import { PipelineListItem } from "./pipelines";
import { RunPipelineAction } from "./pipeline_actions";
import { usePaginatedMRPipelines } from "./pipelines_data";
import useInterval from "use-interval";

export function MRPipelineList(props: { mr: MergeRequest }) {
  const { mr } = props;
  const navigationTitle = `Pipelines · ${mr.reference_full}`;
  const cacheKey = `mr_pipelines_${mr.project_id}_${mr.iid}`;
  const projectFullPath = mr.project_full_path;
  const { pipelines, isLoading, error, performRefetch, pagination } = usePaginatedMRPipelines({
    cacheKey,
    projectFullPath,
    mrIID: mr.iid,
  });

  useInterval(() => {
    performRefetch();
  }, getCIRefreshInterval());

  if (error) {
    showErrorToast(error, "Could not fetch Pipelines");
  }

  const runRef = pipelines?.[0]?.ref ?? mr.source_branch;
  const runProjectId = pipelines?.[0]?.projectId ?? `${mr.project_id}`;

  return (
    <List
      isLoading={isLoading}
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
          />
        ))}
      </List.Section>
      {!isLoading && (!pipelines || pipelines.length === 0) ? (
        <List.EmptyView title="No Pipelines" description="This merge request has no pipelines yet." />
      ) : null}
    </List>
  );
}
