import { Action, ActionPanel, List, Icon, Color } from "@raycast/api";
import { getCIRefreshInterval } from "../common";
import { copyShortcut, formatDate, formatDateTime, showErrorToast } from "../utils";
import { getCIJobStatusIcon, getMRPipelineStatusTooltip, JobList } from "./jobs";
import {
  CancelPipelineAction,
  isCancelablePipeline,
  PipelineItemActions,
  RetryPipelineAction,
  RunPipelineAction,
} from "./pipeline_actions";
import useInterval from "use-interval";
import { GitLabOpenInBrowserAction } from "./actions";
import { Pipeline } from "../gitlabapi";
import { usePaginatedProjectPipelines } from "./pipelines_data";
export { normalizePipelineForList } from "./pipelines_gql";

function pipelineTimestamp(pipeline: Pipeline, field: "finished" | "started" | "created"): string | undefined {
  if (field === "finished") {
    return pipeline.finished_at || (pipeline as { finishedAt?: string }).finishedAt;
  }
  if (field === "started") {
    return pipeline.started_at || (pipeline as { startedAt?: string }).startedAt;
  }
  return pipeline.created_at || (pipeline as { createdAt?: string }).createdAt;
}

function getPipelineListAccessory(pipeline: Pipeline): List.Item.Accessory | undefined {
  const finishedAt = pipelineTimestamp(pipeline, "finished");
  const startedAt = pipelineTimestamp(pipeline, "started");
  const createdAt = pipelineTimestamp(pipeline, "created");
  const iso = finishedAt ?? startedAt ?? createdAt;
  if (!iso) {
    return undefined;
  }
  const timestamp = new Date(iso);
  const durationSuffix = finishedAt && pipeline.duration ? ` · ${pipeline.duration}s` : "";
  const tooltip = finishedAt
    ? `Finished ${formatDateTime(timestamp)}${durationSuffix}`
    : startedAt
      ? `Started ${formatDateTime(timestamp)}`
      : `Created ${formatDateTime(timestamp)}`;
  return { text: formatDate(timestamp), tooltip };
}

export function PipelineListItem(props: {
  pipeline: Pipeline;
  projectFullPath: string;
  onRefreshPipelines: () => void;
  navigationTitle?: string;
  runRefFallback?: string;
}) {
  const pipeline = props.pipeline;
  const dateAccessory = getPipelineListAccessory(pipeline);
  return (
    <List.Item
      id={`${pipeline.id}`}
      title={pipeline.id.toString()}
      icon={{
        value: getCIJobStatusIcon(pipeline.status, false),
        tooltip: pipeline.status ? getMRPipelineStatusTooltip(pipeline.status) : "",
      }}
      subtitle={pipeline.commit_title || pipeline.ref}
      accessories={dateAccessory ? [dateAccessory] : []}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action.Push
              title="Show Jobs"
              target={
                <JobList
                  projectFullPath={props.projectFullPath}
                  pipelineID={pipeline.id}
                  pipelineIID={pipeline.iid}
                  navigationTitle={props.navigationTitle}
                />
              }
              icon={{ source: Icon.Terminal, tintColor: Color.PrimaryText }}
            />
            <GitLabOpenInBrowserAction url={pipeline.webUrl} />
            <Action.CopyToClipboard title="Copy URL" content={pipeline.webUrl} shortcut={copyShortcut} />
            <RetryPipelineAction pipeline={props.pipeline} onRetryFinished={props.onRefreshPipelines} />
            {isCancelablePipeline(pipeline) ? (
              <CancelPipelineAction pipeline={props.pipeline} onRefreshPipelines={props.onRefreshPipelines} />
            ) : null}
          </ActionPanel.Section>
          <ActionPanel.Section>
            <PipelineItemActions
              pipeline={props.pipeline}
              runRefFallback={props.runRefFallback}
              onRefreshPipelines={props.onRefreshPipelines}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

export function PipelineList(props: {
  projectFullPath: string;
  projectId: number | string;
  defaultBranch?: string;
  navigationTitle?: string;
}) {
  const cacheKey = `project_pipelines_${props.projectFullPath}`;
  const { pipelines, error, isLoading, performRefetch, pagination } = usePaginatedProjectPipelines({
    cacheKey,
    projectFullPath: props.projectFullPath,
  });
  const defaultBranch = props.defaultBranch ?? "";
  const runRef = pipelines?.[0]?.ref || defaultBranch;
  const runProjectId = pipelines?.[0]?.projectId || `${props.projectId}`;

  useInterval(() => {
    performRefetch();
  }, getCIRefreshInterval());
  if (error) {
    showErrorToast(error, "Cannot search Pipelines");
  }
  return (
    <List
      isLoading={isLoading}
      pagination={pagination}
      navigationTitle={props.navigationTitle || "Pipelines"}
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
      <List.Section title="Pipelines">
        {(pipelines ?? []).map((pipeline) => (
          <PipelineListItem
            key={pipeline.id}
            pipeline={pipeline}
            projectFullPath={props.projectFullPath}
            onRefreshPipelines={performRefetch}
            navigationTitle={props.navigationTitle}
            runRefFallback={defaultBranch}
          />
        ))}
      </List.Section>
    </List>
  );
}
