import { Color, Detail, Icon, List } from "@raycast/api";
import { MergeRequest, User } from "../gitlabapi";
import { capitalizeFirstLetter, formatDate, toLongDateString } from "../utils";
import { getMRStateMetadataIcon } from "./mr_status";
import { userIcon, userTagOnAction } from "./users";

function stateColor(state: string): Color.ColorLike {
  switch (state) {
    case "closed":
      return Color.Red;
    case "merged":
      return Color.Purple;
    default:
      return Color.Green;
  }
}

const authorAssigneeMergedTitle = "Author & Assignee";

function isAuthorOnlyAssignee(mr: MergeRequest): boolean {
  const author = mr.author;
  return author !== undefined && mr.assignees.length === 1 && mr.assignees[0].id === author.id;
}

function mergeOptionItems(mr: MergeRequest): string[] {
  const items: string[] = [];
  if (mr.force_remove_source_branch === true) {
    items.push("Delete after Merge");
  }
  if (mr.squash_on_merge === true) {
    items.push("Squash before Merge");
  }
  if (mr.merge_when_pipeline_succeeds === true) {
    items.push("Auto Merge");
  }
  return items;
}

function UserDetailTagList(props: { title: string; users: User[] }) {
  if (props.users.length <= 0) {
    return null;
  }
  return (
    <Detail.Metadata.TagList title={props.title}>
      {props.users.map((user) => (
        <Detail.Metadata.TagList.Item
          key={user.id}
          text={user.name}
          icon={userIcon(user)}
          onAction={userTagOnAction(user)}
        />
      ))}
    </Detail.Metadata.TagList>
  );
}

function AuthorDetailMetadata({ mr }: { mr: MergeRequest }) {
  const author = mr.author;
  if (!author) {
    return null;
  }
  const title = isAuthorOnlyAssignee(mr) ? authorAssigneeMergedTitle : "Author";
  return (
    <Detail.Metadata.TagList title={title}>
      <Detail.Metadata.TagList.Item text={author.name} icon={userIcon(author)} onAction={userTagOnAction(author)} />
    </Detail.Metadata.TagList>
  );
}

function AuthorListDetailMetadata({ mr }: { mr: MergeRequest }) {
  const author = mr.author;
  if (!author) {
    return null;
  }
  const title = isAuthorOnlyAssignee(mr) ? authorAssigneeMergedTitle : "Author";
  return (
    <List.Item.Detail.Metadata.TagList title={title}>
      <List.Item.Detail.Metadata.TagList.Item
        text={author.name}
        icon={userIcon(author)}
        onAction={userTagOnAction(author)}
      />
    </List.Item.Detail.Metadata.TagList>
  );
}

function assigneesForPeopleSection(mr: MergeRequest): User[] {
  if (isAuthorOnlyAssignee(mr)) {
    return [];
  }
  return mr.assignees;
}

function UserListDetailTagList(props: { title: string; users: User[] }) {
  if (props.users.length <= 0) {
    return null;
  }
  return (
    <List.Item.Detail.Metadata.TagList title={props.title}>
      {props.users.map((user) => (
        <List.Item.Detail.Metadata.TagList.Item
          key={user.id}
          text={user.name}
          icon={userIcon(user)}
          onAction={userTagOnAction(user)}
        />
      ))}
    </List.Item.Detail.Metadata.TagList>
  );
}

function DetailMergeOptions({ mr }: { mr: MergeRequest }) {
  const options = mergeOptionItems(mr);
  if (options.length <= 0) {
    return null;
  }
  return (
    <Detail.Metadata.TagList title="Merge Options">
      {options.map((text) => (
        <Detail.Metadata.TagList.Item key={text} text={text} />
      ))}
    </Detail.Metadata.TagList>
  );
}

function ListDetailMergeOptions({ mr }: { mr: MergeRequest }) {
  const options = mergeOptionItems(mr);
  if (options.length <= 0) {
    return null;
  }
  return (
    <List.Item.Detail.Metadata.TagList title="Merge Options">
      {options.map((text) => (
        <List.Item.Detail.Metadata.TagList.Item key={text} text={text} />
      ))}
    </List.Item.Detail.Metadata.TagList>
  );
}

function MRDateLabel(props: {
  title: string;
  isoDate: string;
  Label: typeof Detail.Metadata.Label | typeof List.Item.Detail.Metadata.Label;
}) {
  const Label = props.Label;
  return <Label title={props.title} text={formatDate(props.isoDate)} tooltip={toLongDateString(props.isoDate)} />;
}

function MRDateLabels(props: {
  mr: MergeRequest;
  Label: typeof Detail.Metadata.Label | typeof List.Item.Detail.Metadata.Label;
}) {
  return (
    <>
      {props.mr.created_at ? <MRDateLabel title="Created" isoDate={props.mr.created_at} Label={props.Label} /> : null}
      {props.mr.updated_at ? <MRDateLabel title="Updated" isoDate={props.mr.updated_at} Label={props.Label} /> : null}
      {props.mr.merged_at ? <MRDateLabel title="Merged" isoDate={props.mr.merged_at} Label={props.Label} /> : null}
      {props.mr.closed_at ? <MRDateLabel title="Closed" isoDate={props.mr.closed_at} Label={props.Label} /> : null}
    </>
  );
}

function DiscussionsMetadataLabel(props: {
  discussionLabel?: string;
  Label: typeof Detail.Metadata.Label | typeof List.Item.Detail.Metadata.Label;
}) {
  if (!props.discussionLabel) {
    return null;
  }
  const Label = props.Label;
  return (
    <Label
      title="Discussions"
      text={props.discussionLabel}
      icon={{ source: Icon.SpeechBubble, tintColor: Color.PrimaryText }}
    />
  );
}

export function MRDetailMetadata(props: { mr: MergeRequest; discussionLabel?: string }) {
  const mr = props.mr;
  return (
    <Detail.Metadata>
      <Detail.Metadata.TagList title="Status">
        <Detail.Metadata.TagList.Item
          text={capitalizeFirstLetter(mr.state)}
          color={stateColor(mr.state)}
          icon={getMRStateMetadataIcon(mr.state)}
        />
      </Detail.Metadata.TagList>
      <AuthorDetailMetadata mr={mr} />
      {mr.labels.length > 0 ? (
        <Detail.Metadata.TagList title="Labels">
          {mr.labels.map((label) => (
            <Detail.Metadata.TagList.Item key={label.id} text={label.name} color={label.color} />
          ))}
        </Detail.Metadata.TagList>
      ) : null}
      {mr.milestone ? <Detail.Metadata.Label title="Milestone" text={mr.milestone.title} /> : null}
      <Detail.Metadata.Separator />
      <Detail.Metadata.Label title="From" text={mr.source_branch} />
      <Detail.Metadata.Label title="Into" text={mr.target_branch} />
      <Detail.Metadata.Separator />
      <UserDetailTagList
        title={assigneesForPeopleSection(mr).length === 1 ? "Assignee" : "Assignees"}
        users={assigneesForPeopleSection(mr)}
      />
      <DiscussionsMetadataLabel discussionLabel={props.discussionLabel} Label={Detail.Metadata.Label} />
      <UserDetailTagList title={mr.reviewers.length === 1 ? "Reviewer" : "Reviewers"} users={mr.reviewers} />
      <DetailMergeOptions mr={mr} />
      <Detail.Metadata.Separator />
      <MRDateLabels mr={mr} Label={Detail.Metadata.Label} />
    </Detail.Metadata>
  );
}

export function MRListDetailMetadata(props: { mr: MergeRequest; discussionLabel?: string }) {
  const mr = props.mr;
  return (
    <List.Item.Detail.Metadata>
      <AuthorListDetailMetadata mr={mr} />
      {mr.labels.length > 0 ? (
        <List.Item.Detail.Metadata.TagList title="Labels">
          {mr.labels.map((label) => (
            <List.Item.Detail.Metadata.TagList.Item key={label.id} text={label.name} color={label.color} />
          ))}
        </List.Item.Detail.Metadata.TagList>
      ) : null}
      {mr.milestone ? <List.Item.Detail.Metadata.Label title="Milestone" text={mr.milestone.title} /> : null}
      <List.Item.Detail.Metadata.Separator />
      <List.Item.Detail.Metadata.Label title="From" text={mr.source_branch} />
      <List.Item.Detail.Metadata.Label title="Into" text={mr.target_branch} />
      <List.Item.Detail.Metadata.Separator />
      <UserListDetailTagList
        title={assigneesForPeopleSection(mr).length === 1 ? "Assignee" : "Assignees"}
        users={assigneesForPeopleSection(mr)}
      />
      <DiscussionsMetadataLabel discussionLabel={props.discussionLabel} Label={List.Item.Detail.Metadata.Label} />
      <UserListDetailTagList title={mr.reviewers.length === 1 ? "Reviewer" : "Reviewers"} users={mr.reviewers} />
      <ListDetailMergeOptions mr={mr} />
      <List.Item.Detail.Metadata.Separator />
      <MRDateLabels mr={mr} Label={List.Item.Detail.Metadata.Label} />
    </List.Item.Detail.Metadata>
  );
}
