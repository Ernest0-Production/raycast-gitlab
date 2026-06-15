import { Action, ActionPanel, List, Icon, Image, Color } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { getGitLabGQL, gitlab } from "../common";
import { gql } from "@apollo/client";
import { copyShortcut, formatDuration, formatDurationHuman, getIdFromGqlId } from "../utils";
import {
  CancelJobAction,
  DownloadJobArtifactsSubmenu,
  RefreshJobsAction,
  RetryJobAction,
  RunJobAction,
} from "./job_actions";
import { GitLabOpenInBrowserAction } from "./actions";
import { Project } from "../gitlabapi";
import { GitLabIcons } from "../icons";

export interface JobArtifact {
  file_type: string;
  size?: number;
  filename?: string;
  file_format?: string;
}

export interface Job {
  id: string;
  projectId: number;
  name: string;
  status: string;
  allowFailure: boolean;
  duration?: number;
  artifacts: JobArtifact[];
}

function gqlCiJobStatus(status: string): string {
  return status.toLowerCase();
}

const GET_PIPELINE_JOBS = gql`
  query GetProjectPipelines($fullPath: ID!, $pipelineIID: ID!) {
    project(fullPath: $fullPath) {
      pipeline(iid: $pipelineIID) {
        stages {
          nodes {
            name
            jobs {
              nodes {
                id
                name
                status
                allowFailure
                duration
                pipeline {
                  project {
                    id
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export function getCIJobStatusIcon(status: string, allowFailure: boolean): Image {
  switch (status) {
    case "success": {
      return { source: GitLabIcons.status_success, tintColor: Color.Green };
    }
    case "created": {
      return { source: GitLabIcons.status_created, tintColor: Color.Yellow };
    }
    case "pending": {
      return { source: GitLabIcons.status_pending, tintColor: Color.Yellow };
    }
    case "preparing": {
      return { source: GitLabIcons.status_running, tintColor: Color.Blue };
    }
    case "waiting_for_resource": {
      return { source: GitLabIcons.status_pending, tintColor: Color.Yellow };
    }
    case "waiting_for_callback": {
      return { source: Icon.Clock, tintColor: Color.Blue };
    }
    case "running": {
      return { source: GitLabIcons.status_running, tintColor: Color.Blue };
    }
    case "failed": {
      return allowFailure
        ? { source: Icon.Warning, tintColor: Color.Yellow }
        : { source: GitLabIcons.status_failed, tintColor: Color.Red };
    }
    case "canceling": {
      return { source: GitLabIcons.status_canceled, tintColor: Color.Orange };
    }
    case "canceled": {
      return { source: GitLabIcons.status_canceled, tintColor: Color.PrimaryText };
    }
    case "skipped": {
      return { source: GitLabIcons.status_skipped, tintColor: "#868686" };
    }
    case "scheduled": {
      return { source: GitLabIcons.status_scheduled, tintColor: Color.Blue };
    }
    case "manual": {
      return { source: Icon.Gear, tintColor: Color.Blue };
    }
    default:
      return { source: GitLabIcons.status_notfound, tintColor: Color.Magenta };
  }
}

export function isManualJob(job: Job): boolean {
  return job.status === "manual";
}

export function isCancelableJob(job: Job): boolean {
  switch (job.status) {
    case "created":
    case "pending":
    case "running":
    case "preparing":
    case "waiting_for_resource":
    case "waiting_for_callback":
    case "scheduled":
    case "manual":
      return true;
    default:
      return false;
  }
}

const CI_JOB_STATUS_LABELS: Record<string, string> = {
  success: "passed",
  failed: "failed",
  created: "created",
  pending: "pending",
  preparing: "preparing",
  waiting_for_resource: "waiting for resource",
  waiting_for_callback: "waiting for callback",
  running: "running",
  canceling: "canceling",
  canceled: "canceled",
  skipped: "skipped",
  scheduled: "scheduled",
  manual: "manual",
};

const MR_PIPELINE_STATUS_LABELS: Record<string, string> = {
  success: "Pipeline Passed",
  failed: "Pipeline Failed",
  running: "Pipeline Running",
  pending: "Pipeline Pending",
  created: "Pipeline Created",
  preparing: "Pipeline Preparing",
  waiting_for_resource: "Pipeline Waiting for Resource",
  waiting_for_callback: "Pipeline Waiting for Callback",
  canceling: "Pipeline Canceling",
  canceled: "Pipeline Canceled",
  skipped: "Pipeline Skipped",
  scheduled: "Pipeline Scheduled",
  manual: "Pipeline Manual",
};

export function getMRPipelineStatusTooltip(status: string): string {
  return MR_PIPELINE_STATUS_LABELS[status] ?? "Pipeline Status Unknown";
}

export function getCIJobStatusTooltip(status: string, allowFailure: boolean): string {
  if (status === "failed" && allowFailure) {
    return "Passed with warnings";
  }
  return CI_JOB_STATUS_LABELS[status] ?? status;
}

export function JobListItem(props: { job: Job; projectFullPath: string; onRefreshJobs: () => void }) {
  const jobUrl = getGitLabGQL().urlJoin(`${props.projectFullPath}/-/jobs/${getIdFromGqlId(props.job.id)}`);
  return (
    <List.Item
      id={props.job.id}
      icon={{
        value: getCIJobStatusIcon(props.job.status, props.job.allowFailure),
        tooltip: getCIJobStatusTooltip(props.job.status, props.job.allowFailure),
      }}
      title={props.job.name}
      subtitle={"#" + getIdFromGqlId(props.job.id)}
      accessories={
        props.job.duration !== undefined && props.job.duration > 0
          ? [{ icon: Icon.Clock, text: formatDuration(props.job.duration), tooltip: formatDurationHuman(props.job.duration) }]
          : []
      }
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <GitLabOpenInBrowserAction url={jobUrl} />
            <Action.CopyToClipboard title="Copy URL" content={jobUrl} shortcut={copyShortcut} />
            <RetryJobAction job={props.job} />
            {isManualJob(props.job) && <RunJobAction job={props.job} onRefreshJobs={props.onRefreshJobs} />}
            {isCancelableJob(props.job) && <CancelJobAction job={props.job} onRefreshJobs={props.onRefreshJobs} />}
            {props.job.artifacts.length > 0 && <DownloadJobArtifactsSubmenu job={props.job} />}
          </ActionPanel.Section>
          <ActionPanel.Section>
            <RefreshJobsAction onRefreshJobs={props.onRefreshJobs} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

export function JobList(props: {
  projectFullPath: string;
  pipelineID: number;
  pipelineIID?: string | undefined;
  navigationTitle?: string;
}) {
  const { stages, isLoading, refresh } = useSearch(props.projectFullPath, props.pipelineID, props.pipelineIID);
  if (!stages) {
    return <List isLoading={isLoading} navigationTitle={props.navigationTitle || "Jobs"} />;
  }
  return (
    <List isLoading={isLoading} navigationTitle={props.navigationTitle || "Jobs"}>
      {Object.keys(stages).map((stagekey) => (
        <List.Section key={stagekey} title={stagekey}>
          {stages[stagekey].map((job) => (
            <JobListItem job={job} projectFullPath={props.projectFullPath} onRefreshJobs={refresh} key={job.id} />
          ))}
        </List.Section>
      ))}
    </List>
  );
}

interface RESTJob {
  id: number;
  pipeline: Pipeline;
  status: string;
  stage: string;
  name: string;
  allow_failure: boolean;
  duration?: number;
  artifacts?: JobArtifact[];
}

export function useSearch(
  projectFullPath: string,
  pipelineID: number,
  pipelineIID?: string | undefined,
): {
  stages?: Record<string, Job[]>;
  isLoading: boolean;
  refresh: () => void;
} {
  const { data, isLoading, revalidate } = usePromise(
    async (fullPath: string, pid: number, piid?: string): Promise<Record<string, Job[]> | undefined> => {
      if (pid) {
        const jobs: RESTJob[] = await gitlab
          .fetch(`projects/${encodeURIComponent(fullPath)}/pipelines/${pid}/jobs`)
          .then((data) => data as RESTJob[]);
        jobs.sort((firstJob, secondJob) => firstJob.id - secondJob.id);
        const stages: Record<string, Job[]> = {};
        for (const job of jobs) {
          if (!stages[job.stage]) {
            stages[job.stage] = [];
          }
          stages[job.stage].push({
            id: `${job.id}`,
            projectId: job.pipeline.project_id,
            name: job.name,
            status: job.status,
            allowFailure: job.allow_failure,
            duration: job.duration,
            artifacts: job.artifacts?.length
              ? job.artifacts.map((artifact) => ({
                  file_type: artifact.file_type,
                  size: artifact.size,
                  filename: artifact.filename,
                  file_format: artifact.file_format,
                }))
              : [],
          });
        }
        return stages;
      }
      if (piid) {
        const data = await getGitLabGQL().client.query({
          query: GET_PIPELINE_JOBS,
          variables: { fullPath, pipelineIID: piid },
        });
        const stages: Record<string, Job[]> = {};
        for (const stage of data.data.project.pipeline.stages.nodes) {
          if (!stages[stage.name]) {
            stages[stage.name] = [];
          }
          for (const job of stage.jobs.nodes) {
            stages[stage.name].push({
              id: job.id,
              projectId: getIdFromGqlId(job.pipeline.project.id),
              name: job.name,
              status: gqlCiJobStatus(job.status),
              allowFailure: job.allowFailure === true,
              duration: job.duration ?? undefined,
              artifacts: [],
            });
          }
        }
        return stages;
      }
      return undefined;
    },
    [projectFullPath, pipelineID, pipelineIID],
  );

  return { stages: data, isLoading, refresh: revalidate };
}

interface Pipeline {
  id: number;
  iid: number;
  project_id: number;
  sha: string;
  ref: string;
  status: string;
  source: string;
}

interface Commit {
  id: string;
  short_id: string;
  title: string;
  message: string;
  author_name: string;
  author_email: string;
  status?: string;
  project_id: number;
  last_pipeline?: Pipeline;
}

export function PipelineJobsListByCommit(props: { project: Project; sha: string }) {
  const { commit, isLoading } = useCommit(props.project.id, props.sha);
  if (isLoading || !commit) {
    return <List isLoading={isLoading} />;
  }
  if (commit.last_pipeline) {
    return (
      <JobList
        projectFullPath={props.project.fullPath}
        pipelineID={commit.last_pipeline.id}
        pipelineIID={commit.last_pipeline.iid ? `${commit.last_pipeline.iid}` : undefined}
      />
    );
  }
  return (
    <List>
      <List.Item title="No pipelines attached" />
    </List>
  );
}

function useCommit(
  projectID: number,
  sha: string,
): {
  commit?: Commit;
  isLoading: boolean;
} {
  const { data, isLoading } = usePromise(
    (projectId: number, commitSha: string) =>
      gitlab.fetch(`projects/${projectId}/repository/commits/${commitSha}`).then((data) => data as Commit),
    [projectID, sha],
  );

  return { commit: data, isLoading };
}
