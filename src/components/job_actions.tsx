import { Action, ActionPanel, Alert, Color, confirmAlert, Icon, open, showToast, Toast } from "@raycast/api";
import React from "react";
import fs from "fs";
import path from "path";
import { getArtifactDownloadDirectoryPreference, gitlab } from "../common";
import { getErrorMessage, getIdFromGqlId, showErrorToast } from "../utils";
import { Job, JobArtifact } from "./jobs";

function jobNumericId(job: Job): string {
  return getIdFromGqlId(job.id).toString();
}

export function RefreshJobsAction(props: { onRefreshJobs?: () => void }) {
  const handle = () => {
    if (props.onRefreshJobs) {
      props.onRefreshJobs();
    }
  };
  return (
    <Action title="Refresh" icon={{ source: Icon.ArrowClockwise, tintColor: Color.PrimaryText }} onAction={handle} />
  );
}

export function CancelJobAction(props: { job: Job; onRefreshJobs?: () => void }) {
  const job = props.job;
  async function handle() {
    const jobId = jobNumericId(job);
    if (
      !(await confirmAlert({
        title: "Cancel Job?",
        message: `Cancel "${job.name}" (#${jobId})?`,
        primaryAction: { title: "Cancel Job", style: Alert.ActionStyle.Destructive },
      }))
    ) {
      return;
    }
    try {
      await gitlab.post(`projects/${job.projectId}/jobs/${jobId}/cancel`);
      showToast(Toast.Style.Success, "Canceled job");
      props.onRefreshJobs?.();
    } catch (error) {
      showErrorToast(getErrorMessage(error), "Failed to cancel job");
    }
  }
  return (
    <Action
      title="Cancel"
      style={Action.Style.Destructive}
      icon={{ source: Icon.XMarkCircle, tintColor: Color.Red }}
      onAction={handle}
    />
  );
}

export function RunJobAction(props: { job: Job; onRefreshJobs?: () => void }) {
  const job = props.job;
  async function handle() {
    const jobId = jobNumericId(job);
    if (
      !(await confirmAlert({
        title: "Run Job?",
        message: `Run manual job "${job.name}" (#${jobId})?`,
        primaryAction: { title: "Run" },
      }))
    ) {
      return;
    }
    try {
      await gitlab.post(`projects/${job.projectId}/jobs/${jobId}/play`);
      showToast(Toast.Style.Success, "Started job");
      props.onRefreshJobs?.();
    } catch (error) {
      showErrorToast(getErrorMessage(error), "Failed to run job");
    }
  }
  return <Action title="Run" icon={{ source: Icon.Play, tintColor: Color.Green }} onAction={handle} />;
}

export function RetryJobAction(props: { job: Job }) {
  const job = props.job;
  async function handle() {
    const jobId = jobNumericId(job);
    if (
      !(await confirmAlert({
        title: "Retry Job?",
        message: `Restart "${job.name}" (#${jobId})?`,
        primaryAction: { title: "Retry", style: Alert.ActionStyle.Destructive },
      }))
    ) {
      return;
    }
    try {
      await gitlab.post(`projects/${job.projectId}/jobs/${jobId}/retry`);
      showToast(Toast.Style.Success, "Restarted job");
    } catch (error) {
      showErrorToast(getErrorMessage(error), "Failed to restart job");
    }
  }
  return (
    <Action
      title="Retry"
      icon={{ source: Icon.Repeat, tintColor: Color.PrimaryText }}
      shortcut={{ modifiers: ["cmd"], key: "r" }}
      onAction={handle}
    />
  );
}

function formatArtifactSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function jobArtifactActionTitle(artifact: JobArtifact): string {
  const label = artifact.filename || artifact.file_type;
  if (artifact.size !== undefined) {
    return `${label} (${formatArtifactSize(artifact.size)})`;
  }
  return label;
}

function resolveJobArtifactDownload(job: Job, artifact: JobArtifact): { url: string; fileName: string } | undefined {
  const jobId = jobNumericId(job);
  const fileType = artifact.file_type.toLowerCase();
  const fileName =
    artifact.filename || (fileType === "archive" ? "artifacts.zip" : fileType === "trace" ? "job.log" : "");

  if (fileType === "trace") {
    return { url: gitlab.jobTraceDownloadUrl(job.projectId, jobId), fileName: fileName || "job.log" };
  }
  if (fileType === "archive") {
    return {
      url: gitlab.jobArtifactsArchiveDownloadUrl(job.projectId, jobId),
      fileName: fileName || "artifacts.zip",
    };
  }
  if (artifact.filename) {
    return {
      url: gitlab.jobArtifactDownloadUrl(job.projectId, jobId, artifact.filename),
      fileName: artifact.filename,
    };
  }
  return undefined;
}

function localJobArtifactPath(downloadDir: string, job: Job, fileName: string): string {
  const jobId = jobNumericId(job);
  return path.join(downloadDir, `${jobId}-${path.basename(fileName)}`);
}

async function downloadJobArtifact(job: Job, artifact: JobArtifact) {
  const resolved = resolveJobArtifactDownload(job, artifact);
  if (!resolved) {
    showErrorToast("Artifact has no downloadable path", "Download Failed");
    return;
  }
  const downloadDir = getArtifactDownloadDirectoryPreference();
  try {
    fs.mkdirSync(downloadDir, { recursive: true });
    const localFilepath = localJobArtifactPath(downloadDir, job, resolved.fileName);
    await gitlab.downloadFile(resolved.url, { localFilepath });
    await open(localFilepath);
    showToast(Toast.Style.Success, "Downloaded artifact", path.basename(localFilepath));
  } catch (error) {
    showErrorToast(getErrorMessage(error), "Failed to download artifact");
  }
}

export function DownloadJobArtifactsSubmenu(props: { job: Job }): React.ReactElement | null {
  const artifacts = props.job.artifacts;
  if (artifacts.length === 0) {
    return null;
  }
  return (
    <ActionPanel.Submenu
      title="Download Artifact"
      icon={{ source: Icon.Download, tintColor: Color.PrimaryText }}
      shortcut={{ modifiers: ["cmd"], key: "d" }}
    >
      {artifacts.map((artifact, index) => (
        <Action
          key={`${artifact.filename ?? artifact.file_type}-${index}`}
          title={jobArtifactActionTitle(artifact)}
          icon={{ source: Icon.Download, tintColor: Color.PrimaryText }}
          onAction={() => downloadJobArtifact(props.job, artifact)}
        />
      ))}
    </ActionPanel.Submenu>
  );
}
