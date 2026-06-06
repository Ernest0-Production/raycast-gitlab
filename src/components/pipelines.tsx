import { Action, ActionPanel, List, Icon, Image, Color } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { getCIRefreshInterval, gitlab } from "../common";
import { capitalizeFirstLetter, copyShortcut, formatDate, formatDateTime, showErrorToast } from "../utils";
import { JobList } from "./jobs";
import {
  CancelPipelineAction,
  isCancelablePipeline,
  PipelineItemActions,
  RetryPipelineAction,
  RunPipelineAction,
} from "./pipeline_actions";
import useInterval from "use-interval";
import { GitLabOpenInBrowserAction } from "./actions";
import { GitLabIcons } from "../icons";
import { Pipeline } from "../gitlabapi";
import { usePaginatedProjectPipelines } from "./pipelines_data";
export { normalizePipelineForList } from "./pipelines_gql";

function getIcon(status: string): Image {
  switch (status.toLowerCase()) {
    case "success": {
      return { source: GitLabIcons.status_success, tintColor: Color.Green };
    }
    case "created": {
      return { source: GitLabIcons.status_created, tintColor: Color.Yellow };
    }
    case "pending": {
      return { source: GitLabIcons.status_pending, tintColor: Color.Yellow };
    }
    case "running": {
      return { source: GitLabIcons.status_running, tintColor: Color.Blue };
    }
    case "failed": {
      return { source: GitLabIcons.status_failed, tintColor: Color.Red };
    }
    case "canceled": {
      return { source: GitLabIcons.status_canceled, tintColor: Color.PrimaryText };
    }
    default:
      return { source: GitLabIcons.status_notfound, tintColor: Color.Magenta };
  }
}

function getStatusText(status: string) {
  if (status == "success") {
    return "passed";
  } else {
    return status;
  }
}

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
  const icon = getIcon(pipeline.status);
  const dateAccessory = getPipelineListAccessory(pipeline);
  return (
    <List.Item
      id={`${pipeline.id}`}
      title={pipeline.id.toString()}
      icon={{
        value: icon,
        tooltip: pipeline?.status
          ? `Status: ${capitalizeFirstLetter(getStatusText(pipeline.status.toLowerCase()))}`
          : "",
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

function useProjectPipelineRunContext(projectFullPath: string): {
  projectId: string;
  defaultBranch: string;
} {
  const { data } = usePromise(
    async (fullPath: string) => {
      const project = await gitlab.fetch(`projects/${encodeURIComponent(fullPath)}`);
      return { projectId: `${project.id}`, defaultBranch: (project.default_branch as string) ?? "" };
    },
    [projectFullPath],
    // Failure falls back to empty context below; no toast (matches the previous silent catch).
    { onError: () => undefined },
  );

  return { projectId: data?.projectId ?? "", defaultBranch: data?.defaultBranch ?? "" };
}

export function PipelineList(props: { projectFullPath: string; navigationTitle?: string }) {
  const cacheKey = `project_pipelines_${props.projectFullPath}`;
  const { pipelines, error, isLoading, performRefetch, pagination } = usePaginatedProjectPipelines({
    cacheKey,
    projectFullPath: props.projectFullPath,
  });
  const { projectId, defaultBranch } = useProjectPipelineRunContext(props.projectFullPath);
  const runRef = pipelines?.[0]?.ref || defaultBranch;
  const runProjectId = pipelines?.[0]?.projectId || projectId;

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
