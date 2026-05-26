import { List } from "@raycast/api";
import { useEffect } from "react";
import { useCache } from "../cache";
import { getCIRefreshInterval, gitlab } from "../common";
import { MergeRequest, Pipeline, Project } from "../gitlabapi";
import { daysInSeconds, getErrorMessage, showErrorToast } from "../utils";
import { normalizePipelineForList, PipelineListItem } from "./pipelines";
import useInterval from "use-interval";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function useMRPipelines(
  mr: MergeRequest,
  enabled = true,
): {
  pipelines: Pipeline[] | undefined;
  isLoading: boolean | undefined;
  error: string | undefined;
  performRefetch: () => void;
} {
  const { data, isLoading, error, performRefetch } = useCache<Pipeline[] | undefined>(
    `mrpipelines_${mr.project_id}_${mr.iid}`,
    async (): Promise<Pipeline[] | undefined> => {
      if (!enabled) {
        return undefined;
      }
      const result: Record<string, any>[] | undefined = await gitlab.fetch(
        `projects/${mr.project_id}/merge_requests/${mr.iid}/pipelines`,
      );
      return result?.map((entry) => normalizePipelineForList(entry));
    },
    {
      deps: [mr.project_id, mr.iid, enabled],
      secondsToRefetch: 10,
      secondsToInvalid: daysInSeconds(7),
    },
  );
  return { pipelines: data, isLoading, error, performRefetch };
}

function useMRProject(mr: MergeRequest): {
  project: Project | undefined;
  isLoading: boolean | undefined;
  error: string | undefined;
} {
  const { data, isLoading, error } = useCache<Project | undefined>(
    `mrproject_${mr.project_id}`,
    async () => gitlab.getProject(mr.project_id),
    {
      deps: [mr.project_id],
      secondsToInvalid: daysInSeconds(7),
    },
  );
  return { project: data, isLoading, error };
}

export function MRPipelineList(props: { mr: MergeRequest }) {
  const { mr } = props;
  const navigationTitle = `Pipelines · ${mr.reference_full}`;
  const { pipelines, isLoading, error, performRefetch } = useMRPipelines(mr);
  const { project, isLoading: projectLoading, error: projectError } = useMRProject(mr);

  useInterval(() => {
    performRefetch();
  }, getCIRefreshInterval());

  useEffect(() => {
    if (!error) {
      return;
    }
    showErrorToast(getErrorMessage(error), "Could not fetch Pipelines");
  }, [error]);

  useEffect(() => {
    if (!projectError) {
      return;
    }
    showErrorToast(getErrorMessage(projectError), "Could not fetch Project");
  }, [projectError]);

  const projectFullPath = project?.fullPath ?? "";

  const listLoading = isLoading === undefined || projectLoading === undefined || isLoading || projectLoading;

  return (
    <List isLoading={listLoading} navigationTitle={navigationTitle}>
      <List.Section title="Pipelines" subtitle={pipelines?.length ? `${pipelines.length}` : undefined}>
        {pipelines?.map((pipeline) => (
          <PipelineListItem
            key={pipeline.id}
            pipeline={pipeline}
            projectFullPath={projectFullPath}
            onRefreshPipelines={performRefetch}
            navigationTitle={navigationTitle}
          />
        ))}
      </List.Section>
      {!listLoading && (!pipelines || pipelines.length === 0) ? (
        <List.EmptyView title="No Pipelines" description="This merge request has no pipelines yet." />
      ) : null}
    </List>
  );
}
