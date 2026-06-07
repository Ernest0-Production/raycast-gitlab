import { Action, ActionPanel, Color, Icon, Image, List } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { gitlab } from "../common";
import { Project, searchData } from "../gitlabapi";
import { getErrorMessage, getFirstChar, projectIconUrl, showErrorToast } from "../utils";
import {
  CloneProjectInGitPod,
  CloneProjectInVSCodeAction,
  CopyCloneUrlToClipboardAction,
  OpenProjectBranchesPushAction,
  OpenProjectIssuesPushAction,
  OpenProjectLabelsInBrowserAction,
  OpenProjectMergeRequestsPushAction,
  OpenProjectMilestonesPushAction,
  OpenProjectPipelinesPushAction,
  OpenProjectSecurityComplianceInBrowserAction,
  OpenProjectSettingsInBrowserAction,
  OpenProjectWikiInBrowserAction,
  ProjectDefaultActions,
  ShowProjectLabels,
  CreateNewProjectIssuePushAction,
  ShowProjectReadmeAction,
} from "./project_actions";
import { GitLabIcons, getTextIcon, useImage } from "../icons";

export enum ProjectScope {
  membership = "membership",
  all = "all",
}

function getProjectTextIcon(project: Project): Image.ImageLike | undefined {
  return getTextIcon((project.name ? getFirstChar(project.name) : "?").toUpperCase());
}

export function ProjectListItem(props: { project: Project; nameOnly?: boolean }) {
  const project = props.project;
  const { localFilepath: localImageFilepath } = useImage(projectIconUrl(project));
  const accessories = [];
  if (project.archived) {
    accessories.push({ tooltip: "Archived", icon: { source: Icon.ExclamationMark, tintColor: Color.Yellow } });
  }
  accessories.push({
    text: project.star_count.toString(),
    icon: {
      source: Icon.Star,
      tintColor: project.star_count > 0 ? Color.Yellow : null,
    },
    tooltip: `Number of stars: ${project.star_count}`,
  });
  return (
    <List.Item
      title={props.nameOnly === true ? project.name : project.name_with_namespace}
      accessories={accessories}
      icon={localImageFilepath ? { source: localImageFilepath } : getProjectTextIcon(project)}
      actions={
        <ActionPanel>
          <ActionPanel.Section title={project.name_with_namespace}>
            <ProjectDefaultActions project={project} />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action.CopyToClipboard title="Copy Project ID" content={project.id} />
            <Action.CopyToClipboard title="Copy Project URL" content={project.web_url} />
            <CopyCloneUrlToClipboardAction shortcut={{ modifiers: ["cmd"], key: "u" }} project={project} />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <ShowProjectReadmeAction project={project} />
            <OpenProjectIssuesPushAction project={project} />
            <OpenProjectMergeRequestsPushAction project={project} />
            <OpenProjectBranchesPushAction project={project} />
            <OpenProjectPipelinesPushAction project={project} />
            <OpenProjectMilestonesPushAction project={project} />
            <OpenProjectWikiInBrowserAction project={project} />
            <ShowProjectLabels project={props.project} shortcut={{ modifiers: ["cmd"], key: "l" }} />
          </ActionPanel.Section>
          <ActionPanel.Section title="Open in Browser">
            <CreateNewProjectIssuePushAction project={project} />
            <OpenProjectLabelsInBrowserAction project={project} />
            <OpenProjectSecurityComplianceInBrowserAction project={project} />
            <OpenProjectSettingsInBrowserAction project={project} />
          </ActionPanel.Section>
          <ActionPanel.Section title="IDE">
            <CloneProjectInVSCodeAction shortcut={{ modifiers: ["cmd", "shift"], key: "c" }} project={project} />
            <CloneProjectInGitPod shortcut={{ modifiers: ["cmd", "shift"], key: "g" }} project={project} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

interface ProjectListProps {
  membership?: boolean;
  starred?: boolean;
}

export function ProjectListEmptyView() {
  return <List.EmptyView title="No Projects" icon={{ source: GitLabIcons.project, tintColor: Color.PrimaryText }} />;
}

export function ProjectList({ membership = true, starred = false }: ProjectListProps) {
  const [searchText, setSearchText] = useState<string>();
  const { data, error, isLoading } = useCachedPromise(
    async (isStarred: boolean, isMembership: boolean): Promise<Project[]> => {
      if (isStarred) {
        return gitlab.getStarredProjects({ searchText: "", searchIn: "name" }, true);
      }
      if (isMembership) {
        return gitlab.getUserProjects({ search: "" }, true);
      }
      return [];
    },
    [starred, membership],
    { onError: () => undefined },
  );

  if (error) {
    showErrorToast(getErrorMessage(error), "Cannot search Project");
  }

  const projects: Project[] = searchData<Project[]>(data ?? [], {
    search: searchText || "",
    keys: ["name_with_namespace"],
    limit: 50,
  });

  return (
    <List
      searchBarPlaceholder="Filter Projects by Name..."
      onSearchTextChange={setSearchText}
      isLoading={isLoading}
      throttle={true}
    >
      <List.Section
        title={searchText && searchText.length > 0 ? "Search Results" : "Projects"}
        subtitle={`${projects.length}`}
      >
        {projects.map((project) => (
          <ProjectListItem key={project.id} project={project} />
        ))}
      </List.Section>
      <ProjectListEmptyView />
    </List>
  );
}

async function fetchMyProjects(): Promise<Project[]> {
  return gitlab.getUserProjects({ search: "" }, true);
}

export function useMyProjects(options?: { onError?: (error: Error) => void }): {
  projects: Project[] | undefined;
  error?: string;
  isLoading?: boolean;
} {
  const { data, error, isLoading } = useCachedPromise(fetchMyProjects, [], { onError: options?.onError });
  return {
    projects: data,
    error: error ? getErrorMessage(error) : undefined,
    isLoading,
  };
}

function MyProjectsDropdownItem(props: { project: Project }) {
  const project = props.project;
  const { localFilepath } = useImage(projectIconUrl(project));
  return (
    <List.Dropdown.Item
      title={project.name_with_namespace}
      icon={localFilepath ? { source: localFilepath } : getProjectTextIcon(project)}
      value={`${project.id}`}
    />
  );
}

export function MyProjectsDropdown(props: {
  onChange: (project: Project | undefined) => void;
  projects?: Project[];
  value?: string;
  storeValue?: boolean;
  includeAllItem?: boolean;
}): React.ReactNode | null {
  const { projects: hookProjects } = useMyProjects();
  const myprojects = props.projects ?? hookProjects;
  const includeAllItem = props.includeAllItem !== false;
  if (myprojects) {
    return (
      <List.Dropdown
        tooltip="Select Project"
        value={props.value}
        storeValue={props.storeValue}
        onChange={(newValue) => {
          if (includeAllItem && newValue === "-") {
            props.onChange(undefined);
            return;
          }
          const selectedProject = myprojects.find((project) => `${project.id}` === newValue);
          props.onChange(selectedProject);
        }}
      >
        {includeAllItem ? (
          <List.Dropdown.Section>
            <List.Dropdown.Item title="All Projects" value="-" />
          </List.Dropdown.Section>
        ) : null}
        <List.Dropdown.Section>
          {myprojects.map((project) => (
            <MyProjectsDropdownItem key={`${project.id}`} project={project} />
          ))}
        </List.Dropdown.Section>
      </List.Dropdown>
    );
  }
  return null;
}
