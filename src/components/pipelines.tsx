import { Action, ActionPanel, List, Icon, Image, Color } from "@raycast/api";
import { useEffect, useState } from "react";
import { getCIRefreshInterval, getGitLabGQL } from "../common";
import { gql } from "@apollo/client";
import { capitalizeFirstLetter, getErrorMessage, getIdFromGqlId, now, showErrorToast } from "../utils";
import { JobList } from "./jobs";
import { PipelineItemActions } from "./pipeline_actions";
import useInterval from "use-interval";
import { GitLabOpenInBrowserAction } from "./actions";
import { GitLabIcons } from "../icons";
import { Pipeline } from "../gitlabapi";

/* eslint-disable @typescript-eslint/no-explicit-any */

const GET_PIPELINES = gql`
  query GetProjectPipeplines($fullPath: ID!) {
    project(fullPath: $fullPath) {
      pipelines {
        nodes {
          id
          iid
          project {
            id
          }
          status
          active
          path
          ref
          startedAt
          duration
          createdAt
          updatedAt
          finishedAt
        }
      }
    }
  }
`;

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

export function normalizePipelineForList(data: Record<string, any>): Pipeline {
  const pipeline = new Pipeline();
  pipeline.id = data.id;
  pipeline.iid = `${data.iid}`;
  pipeline.projectId = `${data.project_id}`;
  pipeline.status = data.status ?? "";
  pipeline.ref = data.ref ?? "";
  pipeline.sha = data.sha ?? "";
  pipeline.webUrl = data.web_url ?? data.webUrl ?? "";
  pipeline.created_at = data.created_at ?? data.createdAt ?? "";
  pipeline.updated_at = data.updated_at ?? data.updatedAt ?? "";
  pipeline.started_at = data.started_at ?? data.startedAt ?? "";
  pipeline.finished_at = data.finished_at ?? data.finishedAt ?? "";
  pipeline.duration = data.duration ?? 0;
  return pipeline;
}

function getDateStatus(pipeline: Pipeline): {
  icon: Image.ImageLike | undefined;
  tooltip: string | undefined;
  date: Date | undefined;
} {
  const finishedAt = pipelineTimestamp(pipeline, "finished");
  if (finishedAt) {
    const d = new Date(finishedAt);
    const durationText = pipeline.duration ? `\nDuration: ${pipeline.duration} seconds` : "";
    return { icon: Icon.Calendar, tooltip: `Finished at ${d.toLocaleString()}${durationText}`, date: d };
  }
  const startedAt = pipelineTimestamp(pipeline, "started");
  if (startedAt) {
    const d = new Date(startedAt);
    return { icon: Icon.WristWatch, tooltip: `Started at ${d.toLocaleString()}`, date: d };
  }
  const createdAt = pipelineTimestamp(pipeline, "created");
  if (createdAt) {
    const d = new Date(createdAt);
    return { icon: Icon.Stop, tooltip: `Created at ${d.toLocaleString()}`, date: d };
  }
  return { icon: undefined, tooltip: undefined, date: undefined };
}

export function PipelineListItem(props: {
  pipeline: Pipeline;
  projectFullPath: string;
  onRefreshPipelines: () => void;
  navigationTitle?: string;
}) {
  const pipeline = props.pipeline;
  const icon = getIcon(pipeline.status);
  const dateStatus = getDateStatus(pipeline);
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
      subtitle={pipeline.ref || ""}
      accessories={[
        {
          tooltip: dateStatus.tooltip,
          icon: dateStatus.icon,
          date: dateStatus.date,
        },
      ]}
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
          </ActionPanel.Section>
          <ActionPanel.Section>
            <PipelineItemActions pipeline={props.pipeline} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

export function PipelineList(props: { projectFullPath: string; navigationTitle?: string }) {
  const { pipelines, error, isLoading, refresh } = useSearch("", props.projectFullPath);
  useInterval(() => {
    refresh();
  }, getCIRefreshInterval());
  if (error) {
    showErrorToast(error, "Cannot search Pipelines");
  }
  return (
    <List isLoading={isLoading} navigationTitle={props.navigationTitle || "Pipelines"}>
      <List.Section title="Pipelines">
        {pipelines?.map((pipeline) => (
          <PipelineListItem
            key={pipeline.id}
            pipeline={pipeline}
            projectFullPath={props.projectFullPath}
            onRefreshPipelines={refresh}
            navigationTitle={props.navigationTitle}
          />
        ))}
      </List.Section>
    </List>
  );
}

export function useSearch(
  query: string | undefined,
  projectFullPath: string,
): {
  pipelines: Pipeline[];
  error?: string;
  isLoading: boolean;
  refresh: () => void;
} {
  const [pipelines, setPipelines] = useState<any[]>([]);
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
        const data = await getGitLabGQL().client.query({
          query: GET_PIPELINES,
          variables: { fullPath: projectFullPath },
          fetchPolicy: "network-only",
        });
        const glData: Pipeline[] = data.data.project.pipelines.nodes.map((p: any) =>
          normalizePipelineForList({
            id: getIdFromGqlId(p.id),
            iid: p.iid,
            project_id: getIdFromGqlId(p.project.id),
            status: p.status,
            web_url: `${getGitLabGQL().url}${p.path}`,
            created_at: p.createdAt,
            updated_at: p.updatedAt,
            started_at: p.startedAt,
            duration: p.duration,
            finished_at: p.finishedAt,
            ref: p.ref,
          }),
        );
        if (!didUnmount) {
          setPipelines(glData);
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
  }, [query, projectFullPath, timestamp]);

  return { pipelines, error, isLoading, refresh };
}
