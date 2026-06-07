import { Action, Alert, Color, confirmAlert, Icon, Keyboard, showToast, Toast } from "@raycast/api";
import React from "react";
import { gitlab } from "../common";
import { Pipeline } from "../gitlabapi";
import { getErrorMessage, showErrorToast } from "../utils";

export function RefreshPipelinesAction(props: {
  onRefreshPipelines?: () => void;
  pipeline: Pipeline;
  shortcut?: Keyboard.Shortcut;
}) {
  const handle = () => {
    if (props.onRefreshPipelines) {
      props.onRefreshPipelines();
    }
  };
  return (
    <Action
      title="Refresh"
      icon={{ source: Icon.ArrowClockwise, tintColor: Color.PrimaryText }}
      shortcut={props.shortcut}
      onAction={handle}
    />
  );
}

export function isCancelablePipeline(pipeline: Pipeline): boolean {
  switch (pipeline.status.toLowerCase()) {
    case "created":
    case "pending":
    case "running":
    case "preparing":
    case "waiting_for_resource":
    case "scheduled":
      return true;
    default:
      return false;
  }
}

export function CancelPipelineAction(props: { pipeline: Pipeline; onRefreshPipelines?: () => void }) {
  const pipeline = props.pipeline;
  async function handle() {
    if (
      !(await confirmAlert({
        title: "Cancel Pipeline?",
        message: `Cancel all jobs in pipeline #${pipeline.iid}?`,
        primaryAction: { title: "Cancel Pipeline", style: Alert.ActionStyle.Destructive },
      }))
    ) {
      return;
    }
    try {
      await gitlab.post(`projects/${pipeline.projectId}/pipelines/${pipeline.id}/cancel`);
      showToast(Toast.Style.Success, "Canceled pipeline");
      props.onRefreshPipelines?.();
    } catch (error) {
      showErrorToast(getErrorMessage(error), "Failed to cancel pipeline");
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

export function RetryPipelineAction(props: { pipeline: Pipeline; onRetryFinished?: () => void }) {
  const pipeline = props.pipeline;
  async function handle() {
    if (
      !(await confirmAlert({
        title: "Retry Pipeline?",
        message: `Restart failed jobs in pipeline #${pipeline.iid}?`,
        primaryAction: { title: "Retry", style: Alert.ActionStyle.Destructive },
      }))
    ) {
      return;
    }
    try {
      await gitlab.post(`projects/${pipeline.projectId}/pipelines/${pipeline.id}/retry`);
      showToast(Toast.Style.Success, "Restarted jobs");
      props.onRetryFinished?.();
    } catch (error) {
      showErrorToast(getErrorMessage(error), "Failed to restart jobs");
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

export function RunPipelineAction(props: {
  projectId: string | number;
  ref: string;
  onFinished?: () => void;
  shortcut?: Keyboard.Shortcut;
}): React.ReactElement | null {
  const ref = props.ref.trim();
  if (!ref) {
    return null;
  }
  async function handle() {
    if (
      !(await confirmAlert({
        title: "Run Pipeline?",
        message: `Create a new pipeline for ref "${ref}"?`,
        primaryAction: { title: "Run Pipeline" },
      }))
    ) {
      return;
    }
    try {
      const created = await gitlab.post(`projects/${props.projectId}/pipeline`, { ref });
      const pipelineId = created?.id ? `#${created.id}` : "";
      showToast(Toast.Style.Success, "Started pipeline", pipelineId);
      props.onFinished?.();
    } catch (error) {
      showErrorToast(getErrorMessage(error), "Failed to run pipeline");
    }
  }
  return (
    <Action
      title="Run Pipeline"
      icon={{ source: Icon.Play, tintColor: Color.Green }}
      shortcut={props.shortcut ?? { modifiers: ["cmd"], key: "n" }}
      onAction={handle}
    />
  );
}

export function PipelineItemActions(props: {
  pipeline: Pipeline;
  runRefFallback?: string;
  onRefreshPipelines?: () => void;
  onDataChange?: () => void;
}) {
  const pipeline = props.pipeline;
  const runRef = pipeline.ref || props.runRefFallback || "";
  return (
    <React.Fragment>
      <RunPipelineAction
        projectId={pipeline.projectId}
        ref={runRef}
        onFinished={props.onRefreshPipelines ?? props.onDataChange}
        shortcut={{ modifiers: ["cmd"], key: "n" }}
      />
      <RefreshPipelinesAction pipeline={pipeline} onRefreshPipelines={props.onRefreshPipelines ?? props.onDataChange} />
    </React.Fragment>
  );
}
