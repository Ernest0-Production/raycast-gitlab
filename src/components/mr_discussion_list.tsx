import {
  Action,
  ActionPanel,
  Color,
  confirmAlert,
  Form,
  Icon,
  Image,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { showFailureToast, useCachedPromise } from "@raycast/utils";
import { useEffect, useState } from "react";
import { MRDiscussion, MRDiscussionNote, MergeRequest } from "../gitlabapi";
import { formatDate, optimizeMarkdownText, shortify } from "../utils";
import { GitLabOpenInBrowserAction } from "./actions";
import { isDiscussionResolved } from "./mr_discussions";
import {
  createMRDiscussionNoteGql,
  fetchMRDiscussionDiffGql,
  fetchMRDiscussionsGqlPage,
  resolveAvatarUrl,
  toggleMRDiscussionResolveGql,
} from "./mr_discussions_gql";

function discussionNotes(discussion: MRDiscussion): MRDiscussionNote[] {
  return (discussion.notes ?? []).filter((note) => !note.system);
}

function firstDiscussionNote(discussion: MRDiscussion): MRDiscussionNote | undefined {
  return discussionNotes(discussion)[0];
}

function discussionUrl(discussion: MRDiscussion, mr: MergeRequest): string {
  return firstDiscussionNote(discussion)?.web_url || mr.web_url;
}

function discussionTitle(discussion: MRDiscussion): string {
  const body = firstDiscussionNote(discussion)?.body.replace(/\s+/g, " ").trim() || "Discussion";
  return shortify(body.replace(/\\(.)/g, "$1"), 100);
}

function discussionPositionMarkdown(note: MRDiscussionNote, mr: MergeRequest): string | undefined {
  if (!note.position?.file_path) {
    return undefined;
  }
  const label = note.position.line ? `${note.position.file_path}:${note.position.line}` : note.position.file_path;
  const url = note.web_url || mr.web_url;
  return `[${label}](${url})`;
}

function diffMarkdown(diff: string | undefined): string | undefined {
  if (!diff) {
    return undefined;
  }
  return ["```diff", diff, "```"].join("\n");
}

function discussionMarkdown(
  discussion: MRDiscussion,
  mr: MergeRequest,
  diff: string | undefined,
  isLoadingDiff?: boolean,
): string {
  const notes = discussionNotes(discussion);
  const blocks: string[] = [];
  const hasPosition = notes[0]?.position !== undefined;
  const positionLine = notes[0] ? discussionPositionMarkdown(notes[0], mr) : undefined;
  if (positionLine) {
    blocks.push(positionLine);
  }
  const diffBlock = diffMarkdown(diff);
  if (diffBlock) {
    blocks.push(diffBlock);
  } else if (isLoadingDiff) {
    blocks.push("_Loading diff..._");
  } else if (hasPosition) {
    blocks.push("_Diff is unavailable for this position._");
  }
  blocks.push(
    notes
      .map((note) => {
        const authorName = note.author?.name ?? "Unknown";
        const avatarUrl = resolveAvatarUrl(note.author?.avatar_url);
        let avatar: string | undefined;
        if (avatarUrl) {
          const url = new URL(avatarUrl);
          url.searchParams.set("raycast-width", "20");
          url.searchParams.set("raycast-height", "20");
          avatar = `![](${url.href}) `;
        }
        return `${avatar ?? ""}**${authorName}** (*${formatDate(note.created_at)}*):  \n${optimizeMarkdownText(note.body, mr.project_web_url)}`;
      })
      .join("\n\n---\n\n"),
  );
  return blocks.join("\n\n");
}

function MRDiscussionReplyForm(props: { mr: MergeRequest; discussion: MRDiscussion; onReply: () => void }) {
  const { pop } = useNavigation();

  async function submit(values: { body: string }) {
    if (!values.body.trim()) {
      throw Error("Please enter a reply");
    }
    try {
      await showToast({ style: Toast.Style.Animated, title: "Adding reply..." });
      if (!props.mr.gql_id) {
        throw Error("Merge request ID is missing");
      }
      await createMRDiscussionNoteGql({
        noteableId: props.mr.gql_id,
        discussionId: props.discussion.id,
        body: values.body,
      });
      showToast(Toast.Style.Success, "Reply added");
      props.onReply();
      pop();
    } catch (error) {
      showFailureToast(error, { title: "Failed to add reply" });
    }
  }

  return (
    <Form
      navigationTitle="Reply to Discussion"
      enableDrafts
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Reply" onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.TextArea id="body" title="Reply" placeholder="Enter reply" enableMarkdown />
    </Form>
  );
}

function MRDiscussionListItem(props: {
  mr: MergeRequest;
  discussion: MRDiscussion;
  isFocused: boolean;
  onReply: () => void;
}) {
  const firstNote = firstDiscussionNote(props.discussion);
  const position = firstNote?.position;
  const { data: diff, isLoading: isLoadingDiff } = useCachedPromise(
    async (projectFullPath: string, position: MRDiscussionNote["position"]) => {
      if (!position) {
        return undefined;
      }
      return fetchMRDiscussionDiffGql({ projectFullPath, position });
    },
    [props.mr.project_full_path, position],
    {
      execute: props.isFocused && position?.head_sha !== undefined,
    },
  );
  const isResolved = isDiscussionResolved(props.discussion);

  async function toggleResolved() {
    if (
      !(await confirmAlert({
        title: isResolved ? "Unresolve Discussion?" : "Resolve Discussion?",
        message: `${isResolved ? "Unresolve" : "Resolve"} this discussion in !${props.mr.iid}?`,
        primaryAction: {
          title: isResolved ? "Unresolve" : "Resolve",
        },
      }))
    ) {
      return;
    }
    try {
      await showToast({
        style: Toast.Style.Animated,
        title: isResolved ? "Unresolving discussion..." : "Resolving discussion...",
      });
      await toggleMRDiscussionResolveGql({ discussionId: props.discussion.id, resolve: !isResolved });
      showToast(Toast.Style.Success, isResolved ? "Discussion unresolved" : "Discussion resolved");
      props.onReply();
    } catch (error) {
      showFailureToast(error, {
        title: isResolved ? "Failed to unresolve discussion" : "Failed to resolve discussion",
      });
    }
  }

  return (
    <List.Item
      id={props.discussion.id}
      title={discussionTitle(props.discussion)}
      icon={{
        value: {
          source: resolveAvatarUrl(firstNote?.author?.avatar_url) || Icon.SpeechBubble,
          mask: Image.Mask.Circle,
        },
        tooltip: firstNote?.author?.name,
      }}
      accessories={
        isResolved ? [{ icon: { source: Icon.CheckCircle, tintColor: Color.Green }, tooltip: "Resolved" }] : []
      }
      detail={<List.Item.Detail markdown={discussionMarkdown(props.discussion, props.mr, diff, isLoadingDiff)} />}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action.Push
              title="Reply"
              icon={{ source: Icon.Message, tintColor: Color.PrimaryText }}
              target={<MRDiscussionReplyForm mr={props.mr} discussion={props.discussion} onReply={props.onReply} />}
            />
            <GitLabOpenInBrowserAction url={discussionUrl(props.discussion, props.mr)} />
            {props.discussion.resolvable && (
              <Action
                title={isResolved ? "Reopen thread" : "Resolve thread"}
                icon={{
                  source: isResolved ? Icon.XmarkCircle : Icon.Checkmark,
                  tintColor: isResolved ? Color.Red : Color.Green,
                }}
                onAction={toggleResolved}
              />
            )}
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

export function MRDiscussionList(props: { mr: MergeRequest }) {
  const [selectedDiscussionId, setSelectedDiscussionId] = useState<string>();
  const { data, isLoading, revalidate, pagination } = useCachedPromise(
    (projectFullPath: string, mrIID: number) => async (options: { page: number }) => {
      const { discussions, hasMore } = await fetchMRDiscussionsGqlPage({
        cacheKey: `mr_discussions_${projectFullPath}_${mrIID}`,
        page: options.page,
        projectFullPath,
        mrIID,
      });
      return { data: discussions, hasMore };
    },
    [props.mr.project_full_path, props.mr.iid],
    {
      initialData: [],
    },
  );
  const discussions = data.filter((discussion) => discussionNotes(discussion).length > 0);
  useEffect(() => {
    if (!selectedDiscussionId && discussions[0]) {
      setSelectedDiscussionId(discussions[0].id);
    }
  }, [discussions, selectedDiscussionId]);

  return (
    <List
      isLoading={isLoading}
      isShowingDetail
      selectedItemId={selectedDiscussionId}
      onSelectionChange={(id) => setSelectedDiscussionId(id ?? undefined)}
      pagination={pagination}
      navigationTitle={`Discussions ${props.mr.reference_full}`}
    >
      {discussions.map((discussion) => (
        <MRDiscussionListItem
          key={discussion.id}
          mr={props.mr}
          discussion={discussion}
          isFocused={discussion.id === selectedDiscussionId}
          onReply={revalidate}
        />
      ))}
      <List.EmptyView title="No Discussions" />
    </List>
  );
}
