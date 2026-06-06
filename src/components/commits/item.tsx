import { Action, ActionPanel, Color, Icon, Image, List } from "@raycast/api";
import { GitLabIcons } from "../../icons";
import { copySecondaryShortcut, copyShortcut, formatDate, formatDateTime } from "../../utils";
import { GitLabOpenInBrowserAction } from "../actions";
import { getCIJobStatusIcon, getMRPipelineStatusTooltip } from "../jobs";
import { Commit } from "./types";

export function CommitListItem(props: { commit: Commit }) {
  const commit = props.commit;
  const statusIcon = commit.pipeline_status ? getCIJobStatusIcon(commit.pipeline_status, false) : undefined;

  const icon: Image.ImageLike = commit.author_avatar_url
    ? { source: commit.author_avatar_url, mask: Image.Mask.Circle }
    : { source: GitLabIcons.commit, tintColor: Color.SecondaryText };

  return (
    <List.Item
      key={commit.id}
      title={commit.title}
      icon={{ value: icon, tooltip: commit.author_name }}
      accessories={[
        {
          icon: statusIcon,
          tooltip: commit.pipeline_status ? getMRPipelineStatusTooltip(commit.pipeline_status) : undefined,
        },
        {
          text: formatDate(commit.created_at),
          tooltip: `Created: ${formatDateTime(commit.created_at)}`,
        },
      ]}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <GitLabOpenInBrowserAction url={commit.web_url} />
            <Action.CopyToClipboard
              title="Copy URL"
              content={commit.web_url}
              shortcut={copyShortcut}
              icon={{ source: Icon.Link, tintColor: Color.PrimaryText }}
            />
            <Action.CopyToClipboard
              // eslint-disable-next-line @raycast/prefer-title-case
              title="Copy SHA"
              content={commit.id}
              shortcut={copySecondaryShortcut}
              icon={{ source: Icon.Hashtag, tintColor: Color.PrimaryText }}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
