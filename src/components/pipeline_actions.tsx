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

export function PipelineItemActions(props: {
  pipeline: Pipeline;
  onRefreshPipelines?: () => void;
  onDataChange?: () => void;
}) {
  const pipeline = props.pipeline;
  return (
    <React.Fragment>
      <RefreshPipelinesAction pipeline={pipeline} onRefreshPipelines={props.onRefreshPipelines ?? props.onDataChange} />
    </React.Fragment>
  );
}
